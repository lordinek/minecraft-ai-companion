import fs from 'node:fs'
import pf from 'mineflayer-pathfinder'
import { Vec3 } from 'vec3'
import { rconKomut } from './rcon.js'
import { say, kutukMu, odunTopla } from './toplama.js'
import { uret, tahtaHazirla, tahtaMu, parkeTasHazirla, parkeTasMu } from './uretim.js'
import { kazmaHazirla } from './maden.js'
import { alanEkle, korunuyor } from './alan.js'

const { goals, Movements } = pf
const bekle = (ms) => new Promise((r) => setTimeout(r, ms))
const SIVI = new Set(['water', 'lava'])

// ---- Planlar: { en, boy, yukseklik, bloklar: [{ p: Vec3 (göreli), malzeme: 'tahta'|'tas' }], kapi, aciklik } ----

function halka(en, boy, y) {
  const h = []
  for (let x = 0; x < en; x++) for (let z = 0; z < boy; z++) {
    if (x === 0 || z === 0 || x === en - 1 || z === boy - 1) h.push(new Vec3(x, y, z))
  }
  return h
}

// Çatı: kenardan içe doğru sıralı (her blok önceden konmuş bir komşuya yaslansın)
function cati(en, boy, y) {
  const c = []
  for (let x = 0; x < en; x++) for (let z = 0; z < boy; z++) c.push(new Vec3(x, y, z))
  const icDerinlik = (p) => Math.min(p.x, p.z, en - 1 - p.x, boy - 1 - p.z)
  return c.sort((a, b) => icDerinlik(a) - icDerinlik(b))
}

// Efendi hangisini isterse: "basit ev" / "iyi ev" / "en iyi ev"
export const EV_TURLERI = {
  basit: { en: 5, tasSira: 0, kutukKose: false }, // tahta kutu, kapı + 2 yan pencere
  iyi: { en: 7, tasSira: 1, kutukKose: false }, // alt sıra taş, arkada da pencere
  enIyi: { en: 9, tasSira: 2, kutukKose: true }, // 2 sıra taş temel, kütük köşe direkleri, her duvarda pencere
}

export function evPlani(tur = 'basit') {
  if (tur === 'enIyi') return { en: 9, boy: 9, yukseklik: 8, bloklar: [], kapi: null, sablon: enIyiSablon() }
  const t = EV_TURLERI[tur] ?? EV_TURLERI.basit
  const en = t.en
  const yuk = 3
  const orta = Math.floor(en / 2)
  const kapi = new Vec3(orta, 0, 0)
  const ac = (p) => {
    if (p.x === kapi.x && p.z === 0 && p.y < 2) return true // kapı boşluğu
    if (p.y !== 1) return false
    const yan = p.x === 0 || p.x === en - 1
    if (tur === 'basit') return yan && p.z === orta
    if (tur === 'iyi') return (yan && p.z === orta) || (p.z === en - 1 && (p.x === 2 || p.x === en - 3))
    // en iyi: yanlarda ikişer, arkada ikişer, önde kapının iki yanında
    return (yan && (p.z === 2 || p.z === en - 3)) ||
      ((p.z === en - 1 || p.z === 0) && (p.x === 2 || p.x === en - 3))
  }
  const koseMi = (p) => (p.x === 0 || p.x === en - 1) && (p.z === 0 || p.z === en - 1)
  const bloklar = []
  for (let y = 0; y < yuk; y++) {
    for (const p of halka(en, en, y)) {
      if (ac(p)) continue
      const malzeme = t.kutukKose && koseMi(p) ? 'kutuk' : y < t.tasSira ? 'tas' : 'tahta'
      bloklar.push({ p, malzeme })
    }
  }
  for (const p of cati(en, en, yuk)) bloklar.push({ p, malzeme: 'tahta' })
  return { en, boy: en, yukseklik: yuk, bloklar, kapi }
}

// ---- En iyi ev: şablon. Kole başına gidip bakar ve kolunu sallar, bloğu RCON koyar ----
// (merdiven yönü, kapı, yatak gibi durumlu bloklar mineflayer'la güvenilir konmuyor; kamerada fark edilmez)

// 9x9 gövde (x,z 0..8), y=-1 temel/zemin, y=0..3 duvar, üçgen çatı y=3..8 (sırt z boyunca, 1 blok saçak)
export function enIyiSablon() {
  const L = []
  const N = 9
  const S = N - 1
  const O = Math.floor(N / 2)
  const ekle = (x, y, z, blok, esya = blok.split('[')[0]) => L.push({ p: new Vec3(x, y, z), blok, esya })

  // Temel + zemin: kenarı soyulmuş kütük çerçeve, ortası huş/ladin dama
  for (let x = 0; x < N; x++) for (let z = 0; z < N; z++) {
    if (x === 0 || z === 0 || x === S || z === S) ekle(x, -1, z, 'cobblestone')
    else if (x === 1 || z === 1 || x === S - 1 || z === S - 1) {
      ekle(x, -1, z, `stripped_oak_log[axis=${z === 1 || z === S - 1 ? 'x' : 'z'}]`)
    } else ekle(x, -1, z, (x + z) % 2 ? 'birch_planks' : 'spruce_planks')
  }

  // Duvar: kütük köşe direkleri, taş alt sıra, iki blok boy cam pencereler, kapı boşluğu
  const pencere = (x, y, z) => (y === 1 || y === 2) &&
    (((x === 0 || x === S) && (z === 2 || z === S - 2)) || ((z === 0 || z === S) && (x === 2 || x === S - 2)))
  for (let y = 0; y < 4; y++) {
    for (const { x, z } of halka(N, N, y)) {
      if (z === 0 && x === O && y < 2) continue
      if ((x === 0 || x === S) && (z === 0 || z === S)) ekle(x, y, z, 'oak_log[axis=y]')
      else if (pencere(x, y, z)) ekle(x, y, z, x === 0 || x === S ? 'glass_pane[north=true,south=true]' : 'glass_pane[east=true,west=true]')
      else ekle(x, y, z, y === 0 ? 'cobblestone' : 'oak_planks')
    }
  }

  // Çatı: iki yandan içe yükselen koyu meşe merdiven, ön/arka üçgen alınlık (ortasında küçük cam)
  for (let k = 0; k <= O; k++) {
    const y = 3 + k
    for (let z = -1; z <= N; z++) {
      ekle(-1 + k, y, z, 'dark_oak_stairs[facing=east,half=bottom]')
      ekle(N - k, y, z, 'dark_oak_stairs[facing=west,half=bottom]')
    }
    if (k >= 1) {
      for (const z of [0, S]) for (let x = k; x <= S - k; x++) {
        ekle(x, y, z, k === 2 && x === O ? 'glass_pane[east=true,west=true]' : 'oak_planks')
      }
    }
  }
  for (let z = -1; z <= N; z++) ekle(O, 4 + O, z, 'dark_oak_slab[type=bottom]')

  // İç: yatak sol önde, arka duvarda sandık/masa/fırın, köşelerde ve tavanda fener
  ekle(1, 0, 2, 'white_bed[facing=north,part=foot]', 'white_bed')
  ekle(1, 0, 1, 'white_bed[facing=north,part=head]', null)
  ekle(O - 1, 0, S - 1, 'chest[facing=north]')
  ekle(O, 0, S - 1, 'crafting_table')
  ekle(O + 1, 0, S - 1, 'furnace[facing=north]')
  ekle(S - 1, 0, 1, 'lantern[hanging=false]')
  ekle(S - 1, 0, S - 1, 'lantern[hanging=false]')
  ekle(O, 3 + O, O, 'lantern[hanging=true]')

  // Dışarı çık, kapının iki yanına fener, en son kapı
  L.push({ git: new Vec3(O, 0, -3) })
  ekle(O - 1, 0, -1, 'lantern[hanging=false]')
  ekle(O + 1, 0, -1, 'lantern[hanging=false]')
  ekle(O, 0, 0, 'dark_oak_door[facing=south,half=lower,hinge=left]')
  ekle(O, 1, 0, 'dark_oak_door[facing=south,half=upper,hinge=left]', null)
  return L
}

async function zamanli(bot, goal, ms) {
  let zaman
  try {
    await Promise.race([
      bot.pathfinder.goto(goal),
      new Promise((_, red) => { zaman = setTimeout(() => red(new Error('zaman aşımı')), ms) }),
    ])
  } catch { /* olduğu yerden devam */ } finally {
    clearTimeout(zaman)
    bot.pathfinder.setGoal(null)
  }
}

async function sablonInsa(bot, o, sablon) {
  let konan = 0
  for (const adim of sablon) {
    if (bot.kole?.iptal) throw new Error('İptal edildi')
    while (bot.kole?.savasta) await bekle(250)
    if (adim.git) {
      const g = o.plus(adim.git)
      await zamanli(bot, new goals.GoalNear(g.x, g.y, g.z, 1), 10_000)
      continue
    }
    const hedef = o.plus(adim.p)
    if (bot.blockAt(hedef)?.name === adim.blok.split('[')[0]) continue // yarım evde zaten var
    const ayak = bot.entity.position
    if (Math.hypot(ayak.x - hedef.x - 0.5, ayak.z - hedef.z - 0.5) > 4) {
      await zamanli(bot, new goals.GoalNearXZ(hedef.x, hedef.z, 3), 8000)
    }
    // Bloğun içinde duruyorsa kenara çekil, yoksa içine gömülür
    const a = bot.entity.position.floored()
    if (a.equals(hedef) || a.offset(0, 1, 0).equals(hedef)) {
      await zamanli(bot, new goals.GoalInvert(new goals.GoalNear(hedef.x, hedef.y, hedef.z, 2)), 4000)
    }
    const el = adim.esya && bot.inventory.items().find((i) => i.name === adim.esya)
    // Hilesiz: elinde olmayan bloğu koymaz (şablon ev menüden kaldırıldı, 2026-10-10)
    if (!el) throw new Error(`Şablon ev için ${adim.esya ?? adim.blok} yok`)
    if (bot.heldItem?.name !== el.name) await bot.equip(el, 'hand').catch(() => {})
    await bot.lookAt(hedef.offset(0.5, 0.5, 0.5), true)
    bot.swingArm('right')
    await rconKomut(`setblock ${hedef.x} ${hedef.y} ${hedef.z} minecraft:${adim.blok}`)
    await rconKomut(`clear ${bot.username} minecraft:${adim.esya} 1`)
    konan++
    await bot.waitForTicks(3)
  }
  return konan
}

// ---- Yer seçimi: efendinin yakınında düz, boş bir alan ----

const bosMu = (b) => b && b.boundingBox === 'empty' && !SIVI.has(b.name)
const zeminMi = (b) => b && b.boundingBox === 'block' && !SIVI.has(b.name) && !b.name.includes('leaves')

// En az iş isteyen yeri seçer: üstteki yaprak/çalı/tümsek kazılır, 1 blokluk çukur doldurulur.
// Dönüş: { o, temizle: Vec3[], doldur: Vec3[] } ya da null
const MAX_IS = 40
const KAZILMAZ = new Set(['bedrock', 'chest', 'furnace', 'crafting_table'])
// Oyuncu yapımı olabilecekler: bunları kazmak gerekiyorsa o yer reddedilir (başkasının evini yıkmasın)
const YAPI_MI = (ad) => /_planks|_door|_stairs|_slab|_fence|glass|cobblestone|bricks|_wool|torch|bed$/.test(ad)

export function yerBul(bot, merkez, plan, kacin) {
  const m = merkez.floored()
  const adaylar = []
  const R = 10 + plan.en // büyük ev için daha geniş ara
  for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) adaylar.push([dx, dz])
  adaylar.sort((a, b) => Math.hypot(...a) - Math.hypot(...b))
  let enIyi = null
  for (const [dx, dz] of adaylar) {
    if (Math.hypot(dx, dz) < 3) continue // efendinin dibine yapma
    for (let dy = 8; dy >= -6; dy--) { // çukurdaysa yüzeye kadar bak
      const o = m.offset(dx, dy, dz)
      if (!zeminMi(bot.blockAt(o.offset(0, -1, 0))) || !bosMu(bot.blockAt(o))) continue
      const is = hazirlik(bot, o, plan, kacin)
      if (is) {
        const puan = is.temizle.length + is.doldur.length * 2 + Math.hypot(dx, dz) * 0.3
        if (!enIyi || puan < enIyi.puan) enIyi = { o, ...is, puan }
        if (is.temizle.length + is.doldur.length === 0) return enIyi // tertemiz yer, daha arama
      }
      break
    }
  }
  return enIyi
}

function hazirlik(bot, o, plan, kacin) {
  const temizle = []
  const doldur = []
  for (let x = 0; x < plan.en; x++) for (let z = 0; z < plan.boy; z++) {
    if (kacin && kacin.floored().equals(o.offset(x, 0, z))) return null
    // Kendi yaptığı ev/tarla: üstüne ya da içine kurma (temizlerken kırardı)
    if ([-1, 0, plan.yukseklik].some((y) => korunuyor(o.offset(x, y, z)))) return null
    const zemin = bot.blockAt(o.offset(x, -1, z))
    if (zemin && YAPI_MI(zemin.name)) return null // başka bir evin çatısı/zemini: üstüne kurma
    if (!zeminMi(zemin)) {
      if (zemin?.name?.includes('leaves')) return null
      if (!bosMu(zemin) || !zeminMi(bot.blockAt(o.offset(x, -2, z)))) return null // derin çukur ya da su
      doldur.push(o.offset(x, -1, z))
    }
    for (let y = 0; y <= plan.yukseklik; y++) {
      const b = bot.blockAt(o.offset(x, y, z))
      if (bosMu(b)) continue // hava, çimen, çiçek: koyarken zaten kırılır
      if (!b || SIVI.has(b.name) || KAZILMAZ.has(b.name) || YAPI_MI(b.name)) return null
      temizle.push(b.position)
    }
    if (temizle.length + doldur.length > MAX_IS) return null
  }
  return { temizle, doldur }
}

// ---- Blok koyma ----

const YONLER = [new Vec3(0, -1, 0), new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1), new Vec3(0, 1, 0)]

function referansBul(bot, hedef) {
  for (const d of YONLER) {
    const ref = bot.blockAt(hedef.plus(d))
    if (zeminMi(ref)) return { ref, yuz: d.scaled(-1) }
  }
  return null
}

const MALZEME_MI = { tas: parkeTasMu, kutuk: kutukMu, tahta: tahtaMu }
const BITTI = { tas: 'Taşım bitti', kutuk: 'Kütüğüm bitti', tahta: 'Tahtam bitti' }

function malzemeSec(bot, tur) {
  const uyan = bot.inventory.items().filter((i) => MALZEME_MI[tur](i.name))
  return uyan.sort((a, b) => b.count - a.count)[0]
}

const icindeMi = (bot, p) => {
  const ayak = bot.entity.position.floored()
  return ayak.equals(p) || ayak.offset(0, 1, 0).equals(p)
}

async function koy(bot, hedef, tur, { yurumeden = false } = {}) {
  const mevcut = bot.blockAt(hedef)
  if (zeminMi(mevcut)) return true // zaten dolu
  if (mevcut && mevcut.name !== 'air' && mevcut.name !== 'cave_air') await bot.dig(mevcut).catch(() => {}) // çimen, çiçek
  for (let deneme = 0; deneme < 3; deneme++) {
    const r = referansBul(bot, hedef)
    if (!r) return false
    const goz = bot.entity.position.offset(0, bot.entity.eyeHeight ?? 1.62, 0)
    if (!yurumeden && (goz.distanceTo(hedef.offset(0.5, 0.5, 0.5)) > 4.2 || icindeMi(bot, hedef))) {
      try {
        await bot.pathfinder.goto(new goals.GoalPlaceBlock(hedef, bot.world, { range: 4 }))
      } catch { /* olduğu yerden dene */ }
    }
    const esya = malzemeSec(bot, tur)
    if (!esya) throw new Error(BITTI[tur])
    try {
      await bot.equip(esya, 'hand')
      await bot.placeBlock(r.ref, r.yuz)
      return true
    } catch {
      if (zeminMi(bot.blockAt(hedef))) return true // sunucu koymuş ama olay gelmemiş
      await bekle(300)
    }
  }
  return false
}

// ---- Ev eşyaları: sandık, masa, fırın, yatak (yün varsa) ----

// Evin içi x,z = 1..en-2, kapı (orta,0,0). Yatak sol önde boylamasına: ayak (1,0,2), baş (1,0,1).
// Arka duvar boyunca ortada sandık, masa, fırın. Kapının önü boş kalır.
const YATAK_AYAK = new Vec3(1, 0, 2)
const YATAK_DURUS = new Vec3(1, 0, 3) // buradan -z'ye bakarak koyar, baş (1,0,1)'e düşer
function dizilis(en) {
  const orta = Math.floor(en / 2)
  return [
    { ad: 'chest', p: new Vec3(orta - 1, 0, en - 2) },
    { ad: 'crafting_table', p: new Vec3(orta, 0, en - 2) },
    { ad: 'furnace', p: new Vec3(orta + 1, 0, en - 2) },
  ]
}
const esyaDurus = (en) => new Vec3(Math.floor(en / 2), 0, en - 3)

// Aynı renkten en az 3 yün → o rengin yatağı
function yatakAdi(bot) {
  const yun = bot.inventory.items().find((i) => i.name.endsWith('_wool') && i.count >= 3)
  return yun?.name.replace('_wool', '_bed')
}

// İnşaattan önce: eşyaları üretir (masa en son, yoksa üretim için yere koyulup harcanır)
async function esyalariUret(bot, soyle) {
  const yatak = yatakAdi(bot)
  const istek = ['chest', 'furnace', ...(yatak ? [yatak] : []), 'crafting_table']
  const eksik = istek.filter((ad) => !say(bot, (a) => a === ad))
  if (!eksik.length) return
  soyle(`Ev eşyası yapıyorum: ${eksik.join(', ')}.`)
  const tahta = { chest: 8, crafting_table: 4 }
  await tahtaHazirla(bot, eksik.reduce((t, ad) => t + (tahta[ad] ?? (ad.endsWith('_bed') ? 3 : 0)), 0) + 4)
  if (eksik.includes('furnace') && say(bot, parkeTasMu) < 8) {
    await kazmaHazirla(bot, 0, soyle)
    await parkeTasHazirla(bot, 8)
  }
  for (const ad of eksik) {
    try {
      await uret(bot, ad, 1)
    } catch (hata) {
      console.log(`[insa] ${ad} yapamadım:`, hata.message)
      soyle(`${ad} yapamadım, onsuz devam.`)
    }
  }
}

async function zemineKoy(bot, ad, hedef) {
  const esya = bot.inventory.items().find((i) => (ad === 'bed' ? i.name.endsWith('_bed') : i.name === ad))
  if (!esya) return false
  const b = bot.blockAt(hedef)
  if (b && b.name !== 'air' && bosMu(b)) await bot.dig(b).catch(() => {}) // çimen
  await bot.equip(esya, 'hand')
  await bot.placeBlock(bot.blockAt(hedef.offset(0, -1, 0)), new Vec3(0, 1, 0)).catch(() => {})
  await bot.waitForTicks(4)
  return bot.blockAt(hedef)?.name === esya.name
}

// Kapı takılmadan önce, kapı boşluğundan içeri girip yerleştirir
async function esyalariYerlestir(bot, o, en) {
  const konan = []
  const git = (p) => bot.pathfinder.goto(new goals.GoalBlock(p.x, p.y, p.z)).catch(() => {})
  if (bot.inventory.items().some((i) => i.name.endsWith('_bed'))) {
    await git(o.plus(YATAK_DURUS))
    await bot.waitForTicks(5)
    if (await zemineKoy(bot, 'bed', o.plus(YATAK_AYAK))) konan.push('yatak')
  }
  await git(o.plus(esyaDurus(en)))
  const AD = { chest: 'sandık', crafting_table: 'masa', furnace: 'fırın' }
  for (const { ad, p } of dizilis(en)) {
    if (await zemineKoy(bot, ad, o.plus(p))) konan.push(AD[ad])
  }
  return konan
}

// ---- Yarım kalan ev: bir sonraki "ev yap" aynı yerden devam etsin ----

const YARIM_DOSYA = 'data/yarim-ev.json'
function yarimEvOku(bot) {
  try {
    const y = JSON.parse(fs.readFileSync(YARIM_DOSYA, 'utf8'))
    const o = new Vec3(y.x, y.y, y.z)
    return o.distanceTo(bot.entity.position) < 64 && EV_TURLERI[y.tur] ? { o, tur: y.tur } : null
  } catch { return null }
}
const yarimEvYaz = (o, tur) => fs.writeFileSync(YARIM_DOSYA, JSON.stringify({ x: o.x, y: o.y, z: o.z, tur }))
const yarimEvSil = () => fs.rmSync(YARIM_DOSYA, { force: true })

// ---- Ana iş ----

export async function evYap(bot, sahip, tur = 'basit', soyle = () => {}) {
  if (!EV_TURLERI[tur]) tur = 'basit'
  const yarim = yarimEvOku(bot)
  if (yarim) tur = yarim.tur
  const plan = evPlani(tur)
  // Yeri malzemeden önce seç: çukur doldurmak da tahta ister.
  // Efendi madendeyse (çok aşağıda) onun yanına değil, botun olduğu yere yapar.
  let efendi = bot.players[sahip]?.entity
  if (efendi && Math.abs(efendi.position.y - bot.entity.position.y) > 5) efendi = null
  const yer = yarim
    ? { o: yarim.o, temizle: [], doldur: [] }
    : (efendi && yerBul(bot, efendi.position, plan, efendi.position)) || yerBul(bot, bot.entity.position, plan, efendi?.position)
  if (!yer) throw new Error('Yakında ev kuracak yer bulamadım')
  const o = yer.o
  if (yarim) soyle('Yarım kalan evin başına dönüyorum.')
  yarimEvYaz(o, tur)
  // Ev (çatı taşması ve temel dahil) korunur: malzeme için de yol için de kırılmaz
  alanEkle(`ev ${o.x},${o.y},${o.z}`, o.offset(-1, -1, -1), o.offset(plan.en, plan.yukseklik + 1, plan.boy))
  console.log(`[insa] ${tur} ev @ ${o} (${plan.bloklar.length} blok, ${yer.temizle.length} temizlik, ${yer.doldur.length} dolgu)`)
  // Zaten konmuş bloklar sayılmaz (yarım ev); kapı tarifi 6 tahta ister
  const eksikBlok = plan.bloklar.filter((b) => !zeminMi(bot.blockAt(o.plus(b.p))))
  const kapiLazim = plan.kapi && !say(bot, (a) => a.endsWith('_door')) ? 6 : 0
  const tahtaLazim = eksikBlok.filter((b) => b.malzeme === 'tahta').length + kapiLazim + yer.doldur.length
  const tasLazim = eksikBlok.filter((b) => b.malzeme === 'tas').length
  const kutukLazim = eksikBlok.filter((b) => b.malzeme === 'kutuk').length

  // Şablon evde malzeme toplama/eşya üretme yok: elindekinden düşer, yoksa çaktırmadan konur
  if (!plan.sablon) await esyalariUret(bot, soyle)
  if (!plan.sablon) soyle(`Malzeme topluyorum: ${tahtaLazim} tahta${tasLazim ? `, ${tasLazim} taş` : ''}${kutukLazim ? `, ${kutukLazim} kütük` : ''}.`)
  if (!plan.sablon) await tahtaHazirla(bot, tahtaLazim)
  // Direk kütükleri tahtadan sonra: yoksa tahtaya çevrilip harcanır
  if (!plan.sablon && kutukLazim > say(bot, kutukMu)) await odunTopla(bot, kutukLazim - say(bot, kutukMu))
  if (!plan.sablon && tasLazim > say(bot, parkeTasMu)) {
    await kazmaHazirla(bot, 0, soyle)
    await parkeTasHazirla(bot, tasLazim)
  }
  let kapiEsya = null
  if (plan.kapi) {
    const tahta = malzemeSec(bot, 'tahta').name
    kapiEsya = tahta.replace('_planks', '_door')
    if (!say(bot, (a) => a.endsWith('_door'))) await uret(bot, kapiEsya, 1)
    kapiEsya = bot.inventory.items().find((i) => i.name.endsWith('_door'))?.name
  }


  // İnşaatta kazmasın, iskele için tahta harcamasın
  const eski = bot.pathfinder.movements
  const m = new Movements(bot)
  m.canDig = false
  m.scafoldingBlocks = []
  bot.pathfinder.setMovements(m)
  try {
    let konan = 0
    if (yer.temizle.length || yer.doldur.length) soyle('Önce arsayı düzlüyorum.')
    // Yukarıdan aşağı kaz ki üstteki düşüp yolu kapatmasın
    for (const p of [...yer.temizle].sort((a, b) => b.y - a.y)) {
      if (bot.kole?.iptal) throw new Error('İptal edildi')
      const b = bot.blockAt(p)
      if (!b || bosMu(b) && b.name === 'air') continue
      try {
        await bot.pathfinder.goto(new goals.GoalLookAtBlock(p, bot.world, { reach: 4 }))
        await bot.tool.equipForBlock(b).catch(() => {})
        await bot.dig(bot.blockAt(p))
      } catch (hata) { console.log('[insa] kazamadım', p.toString(), hata.message) }
    }
    if (plan.sablon) {
      const n = await sablonInsa(bot, o, plan.sablon)
      yarimEvSil()
      return { konan: n, toplam: plan.sablon.length, merkez: o, esyalar: ['yatak', 'sandık', 'masa', 'fırın'], tur }
    }
    for (const p of yer.doldur) await koy(bot, p, 'tahta')
    if (plan.icerdenYap) {
      await bot.pathfinder.goto(new goals.GoalBlock(o.x + 1, o.y, o.z + 1))
      soyle('Bu sefer içeriden yapacağım, daha sağlam olur.')
    }
    let ikmal = 0
    for (let i = 0; i < plan.bloklar.length; i++) {
      const b = plan.bloklar[i]
      if (bot.kole?.iptal) throw new Error('İptal edildi')
      try {
        if (await koy(bot, o.plus(b.p), b.malzeme, { yurumeden: plan.icerdenYap })) konan++
      } catch (hata) {
        // Malzeme bitti: pes etme, git topla, kaldığın bloktan devam et
        if (!/bitti/.test(hata.message) || ++ikmal > 5) throw hata
        const kalan = plan.bloklar.slice(i)
          .filter((x) => x.malzeme === b.malzeme && !zeminMi(bot.blockAt(o.plus(x.p)))).length
        soyle(`${BITTI[b.malzeme]}, ${kalan} tane daha topluyorum.`)
        bot.pathfinder.setMovements(eski)
        try {
          if (b.malzeme === 'tas') await parkeTasHazirla(bot, kalan + 2)
          else if (b.malzeme === 'kutuk') await odunTopla(bot, kalan)
          else await tahtaHazirla(bot, kalan + 4)
        } finally {
          bot.pathfinder.setMovements(m)
        }
        i--
      }
    }
    soyle('İçini döşüyorum.')
    const esyalar = await esyalariYerlestir(bot, o, plan.en)
    if (plan.kapi && kapiEsya) {
      const kp = o.plus(plan.kapi)
      await bot.pathfinder.goto(new goals.GoalBlock(kp.x, kp.y, kp.z - 2)).catch(() => {})
      const esya = bot.inventory.items().find((i) => i.name === kapiEsya)
      if (esya) {
        await bot.equip(esya, 'hand')
        await bot.placeBlock(bot.blockAt(kp.offset(0, -1, 0)), new Vec3(0, 1, 0)).catch(() => {})
      }
    }
    yarimEvSil()
    return { konan, toplam: plan.bloklar.length, merkez: o, esyalar, tur }
  } finally {
    bot.pathfinder.setMovements(eski)
  }
}
