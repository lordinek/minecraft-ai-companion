import pf from 'mineflayer-pathfinder'
import { Vec3 } from 'vec3'
import { say } from './toplama.js'
import { uret, tahtaHazirla, cubukHazirla } from './uretim.js'
import { yerdenTopla } from './yemek.js'
import { alanEkle } from './alan.js'

const log = (m) => console.log('[tarla]', m)

const { goals } = pf

// Ekin bloğu → olgun yaşı, ektiği tohum, verdiği ürün
const EKINLER = {
  wheat: { olgun: 7, tohum: 'wheat_seeds', urun: 'wheat' },
  carrots: { olgun: 7, tohum: 'carrot', urun: 'carrot' },
  potatoes: { olgun: 7, tohum: 'potato', urun: 'potato' },
  beetroots: { olgun: 3, tohum: 'beetroot_seeds', urun: 'beetroot' },
}
const TOPRAK = ['grass_block', 'dirt']
// Çapalamadan önce üstünden temizlenebilecek otlar (kırınca tohum da düşebilir)
const OTLAR = ['short_grass', 'grass', 'tall_grass', 'fern', 'large_fern']
const urunMu = (ad) => Object.values(EKINLER).some((e) => e.urun === ad)

function idler(bot, adlar) {
  return adlar.map((a) => bot.registry.blocksByName[a]?.id).filter((id) => id !== undefined)
}

async function yaklas(bot, p, mesafe = 2) {
  if (bot.entity.position.distanceTo(p.offset(0.5, 0.5, 0.5)) <= mesafe + 1) return
  await bot.pathfinder.goto(new goals.GoalNear(p.x, p.y + 1, p.z, mesafe))
}

async function bekleBlok(bot, p, adMi) {
  for (let i = 0; i < 20; i++) {
    if (adMi(bot.blockAt(p)?.name)) return true
    await bot.waitForTicks(1)
  }
  return false
}

export async function capaHazirla(bot, soyle = () => {}) {
  if (bot.inventory.items().some((i) => i.name.endsWith('_hoe'))) return
  soyle('Çapa yapıyorum.')
  await tahtaHazirla(bot, 2 + 2) // 2 kafa + 2'si çubuğa
  await cubukHazirla(bot, 2)
  await uret(bot, 'wooden_hoe')
}

// Ot yolarak buğday tohumu toplar (her otta ~%12 şans). Ot anında kırılır, en yakından başlar.
export async function tohumHazirla(bot, adet, soyle = () => {}) {
  const tohum = () => say(bot, (a) => a === 'wheat_seeds')
  if (tohum() >= adet) return
  soyle('Tohum için ot yoluyorum.')
  const otIdler = idler(bot, OTLAR)
  let yolunan = 0
  const atla = new Set() // ulaşılamayanlar
  while (tohum() < adet) {
    if (bot.kole?.iptal) throw new Error('İptal edildi')
    if (yolunan >= adet * 25) throw new Error(`${yolunan} ot yoldum, yeterli tohum çıkmadı`)
    const p = bot.findBlocks({ matching: otIdler, maxDistance: 32, count: 64 }).find((q) => !atla.has(q.toString()))
    if (!p) {
      if (tohum() > 0) return // olanla eker
      throw new Error('Etrafta ot yok, tohum bulamadım')
    }
    try {
      await yaklas(bot, p, 3)
      const ot = bot.blockAt(p)
      if (OTLAR.includes(ot?.name)) { await bot.dig(ot); yolunan++ }
    } catch (hata) {
      if (bot.kole?.iptal) throw hata
      atla.add(p.toString())
      yolunan++
    }
    if (yolunan % 6 === 0) await yerdenTopla(bot, 6)
  }
  await yerdenTopla(bot, 6)
}

// Tarlanın yerini seçer: önce yakındaki suyun kenarı (sulanır, hızlı büyür); orada toprak yoksa
// efendinin dibi, o da olmazsa daha geniş bir alan. Döner: { yerler, su }
function yerSec(bot, merkez, boyut) {
  const suId = bot.registry.blocksByName.water.id
  const havaMi = (p) => {
    const ust = bot.blockAt(p.offset(0, 1, 0))?.name
    return ust === 'air' || OTLAR.includes(ust)
  }
  const ara = (odak, yaricap, dy) => bot.findBlocks({ matching: idler(bot, TOPRAK), point: odak, maxDistance: yaricap * 2, count: 600 })
    .filter((p) => Math.abs(p.x - odak.x) <= yaricap && Math.abs(p.z - odak.z) <= yaricap && Math.abs(p.y - odak.y) <= dy)
    .filter(havaMi)
    .sort((a, b) => a.distanceTo(odak) - b.distanceTo(odak))
    .slice(0, boyut)
  const sular = bot.findBlocks({ matching: suId, point: merkez, maxDistance: 20, count: 64 })
    .filter((p) => bot.blockAt(p.offset(0, 1, 0))?.name === 'air')
    .slice(0, 6)
  for (const su of sular) {
    const yerler = ara(su, 4, 1)
    if (yerler.length >= Math.min(boyut, 4)) return { yerler, su: true }
  }
  for (const [odak, r, dy] of [[merkez, 4, 1], [merkez, 8, 2], [bot.entity.position.floored().offset(0, -1, 0), 12, 3]]) {
    const yerler = ara(odak, r, dy)
    if (yerler.length) return { yerler, su: false }
  }
  return { yerler: [], su: false }
}

const havaUstu = (bot, p) => {
  const ust = bot.blockAt(p.offset(0, 1, 0))?.name
  return ust === 'air' || OTLAR.includes(ust)
}

// Efendinin yakınında s×s düz toprak kare arar (ortası su olacak). Döner: merkez ya da null
function kareBul(bot, merkez, s) {
  const r = (s - 1) / 2
  const topraklar = idler(bot, TOPRAK)
  const uygun = (p) => topraklar.includes(bot.blockAt(p)?.type) && havaUstu(bot, p)
  const adaylar = bot.findBlocks({ matching: topraklar, point: merkez, maxDistance: 12, count: 800 })
    .filter((p) => Math.abs(p.y - merkez.y) <= 2)
    .sort((a, b) => a.distanceTo(merkez) - b.distanceTo(merkez))
  for (const c of adaylar) {
    let tamam = true
    for (let dx = -r; dx <= r && tamam; dx++) for (let dz = -r; dz <= r && tamam; dz++) tamam = uygun(c.offset(dx, 0, dz))
    if (tamam) return c
  }
  return null
}

// Ortayı kazıp kovayla su döker. Su kovası yoksa ya da dökemezse su olmadan devam (hilesiz).
async function suKoy(bot, c) {
  await yaklas(bot, c, 2)
  const ust = bot.blockAt(c.offset(0, 1, 0))
  if (OTLAR.includes(ust?.name)) await bot.dig(ust).catch(() => {})
  if (bot.blockAt(c)?.name !== 'air') await bot.dig(bot.blockAt(c)).catch(() => {})
  const kova = () => bot.inventory.items().find((i) => i.name === 'water_bucket')
  if (kova()) {
    await bot.equip(kova(), 'hand')
    await bot.lookAt(c.offset(0.5, 0.05, 0.5), true) // çukurun dibine bak
    bot.activateItem()
    await bekleBlok(bot, c, (a) => a === 'water')
  }
  return bot.blockAt(c)?.name === 'water'
}

// Efendinin yanında `boyut` karelik buğday tarlası: çapa yapar, tohum toplar, sürer, eker.
// Tek su kaynağı yatayda 4 blok sular: en büyük tarla 9x9 (ortası su, 80 ekin).
const KARELER = [9, 7, 5, 3]
const KENDI_TOPLADIGI_TOHUM = 24 // en çok bu kadar tohum için ot yolar; tohumu yetmeyen kareler sürülür ama boş kalır

export async function tarlaKur(bot, sahip, boyut = 80, soyle = () => {}) {
  const efendi = bot.players[sahip]?.entity
  const merkez = (efendi ?? bot.entity).position.floored().offset(0, -1, 0)

  await capaHazirla(bot, soyle)

  // Bulabildiği en büyük düz kare; ortasına su. Hiç kare yoksa eski usul (su kenarı / kuru).
  let c = null
  let s = 0
  for (const k of KARELER) if ((c = kareBul(bot, merkez, k))) { s = k; break }
  let yerler, su
  if (c) {
    const r = (s - 1) / 2
    yerler = []
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (dx || dz) yerler.push(c.offset(dx, 0, dz))
    yerler.sort((a, b) => a.distanceTo(c) - b.distanceTo(c)) // sudan dışa doğru halka halka
    su = true
    log(`${s}x${s} tarla @ ${c} (${yerler.length} ekin)`)
  } else ({ yerler, su } = yerSec(bot, merkez, Math.min(boyut, 24)))
  if (!yerler.length) throw new Error('Sürülecek toprak bulamadım')
  // Tarla (su ve ekin katı dahil) korunur: odun/taş ararken sürülmüş toprağı kazmasın
  const kutu = [...yerler, ...(c ? [c] : [])]
  const uc = (f, k) => f(...kutu.map((p) => p[k]))
  alanEkle(`tarla ${uc(Math.min, 'x')},${uc(Math.min, 'z')}`,
    new Vec3(uc(Math.min, 'x'), uc(Math.min, 'y'), uc(Math.min, 'z')),
    new Vec3(uc(Math.max, 'x'), uc(Math.max, 'y') + 1, uc(Math.max, 'z')))

  await tohumHazirla(bot, Math.min(yerler.length, KENDI_TOPLADIGI_TOHUM), soyle)
  if (c && !(await suKoy(bot, c))) su = false
  soyle(su ? 'Suyun kenarını sürüyorum.' : 'Yakında su yok, kuru tarım yapıyorum. Yavaş büyür.')

  const capa = () => bot.inventory.items().find((i) => i.name.endsWith('_hoe'))
  let ekilen = 0
  for (const p of yerler) {
    if (bot.kole?.iptal) throw new Error('İptal edildi')
    try {
      await yaklas(bot, p)
      const ust = bot.blockAt(p.offset(0, 1, 0))
      if (OTLAR.includes(ust?.name)) await bot.dig(ust)
      if (bot.blockAt(p).name !== 'farmland') {
        await bot.equip(capa(), 'hand')
        await bot.lookAt(p.offset(0.5, 1, 0.5), true)
        await bot.activateBlock(bot.blockAt(p))
        if (!(await bekleBlok(bot, p, (a) => a === 'farmland'))) continue
      }
      const tohum = bot.inventory.items().find((i) => i.name === 'wheat_seeds')
      if (!tohum) continue // tohum bitse de kareyi sürmeye devam: tarla tam görünsün
      await bot.equip(tohum, 'hand')
      await bot.placeBlock(bot.blockAt(p), new Vec3(0, 1, 0)).catch(() => {})
      if (await bekleBlok(bot, p.offset(0, 1, 0), (a) => a === 'wheat')) ekilen++
    } catch (hata) {
      if (bot.kole?.iptal) throw hata
      console.log('[tarla] atladım:', hata.message)
    }
  }
  await yerdenTopla(bot, 6) // yolunan otlardan düşen tohumlar
  if (!ekilen) throw new Error('Hiçbir şey ekemedim')
  return ekilen
}

// Etraftaki olgun ekinleri biçer, yerine aynısını eker. Döner: toplanan ürün sayısı.
export async function hasatEt(bot, miktar = 64) {
  const olgunMu = (b) => EKINLER[b.name] && b.getProperties().age >= EKINLER[b.name].olgun
  const yerler = bot.findBlocks({ matching: olgunMu, maxDistance: 32, count: miktar })
  if (!yerler.length) throw new Error('Olgun ekin yok, daha büyümedi')
  const baslangic = say(bot, urunMu)
  for (const p of yerler) {
    if (bot.kole?.iptal) throw new Error('İptal edildi')
    const blok = bot.blockAt(p)
    const ekin = EKINLER[blok?.name]
    if (!ekin) continue
    try {
      await yaklas(bot, p)
      await bot.dig(bot.blockAt(p))
      await yerdenTopla(bot, 4)
      // Yeniden ek
      const tarla = bot.blockAt(p.offset(0, -1, 0))
      const tohum = bot.inventory.items().find((i) => i.name === ekin.tohum)
      if (tarla?.name === 'farmland' && tohum && bot.blockAt(p).name === 'air') {
        await bot.equip(tohum, 'hand')
        await bot.placeBlock(tarla, new Vec3(0, 1, 0)).catch(() => {})
      }
    } catch (hata) {
      if (bot.kole?.iptal) throw hata
      console.log('[hasat] atladım:', hata.message)
    }
  }
  await yerdenTopla(bot, 8)
  return say(bot, urunMu) - baslangic
}
