import pf from 'mineflayer-pathfinder'
import { Vec3 } from 'vec3'
import { say, kutukMu, odunTopla, blokTopla } from './toplama.js'

const { goals } = pf

export const tahtaMu = (ad) => ad.endsWith('_planks')
export const parkeTasMu = (ad) => ['cobblestone', 'cobbled_deepslate', 'blackstone'].includes(ad)
const bekle = (ms) => new Promise((r) => setTimeout(r, ms))

// Tarif masa istiyorsa masayı kendisi bulur/koyar. `adet` istenen eşya sayısı, üretim sayısı değil.
export async function uret(bot, ad, adet = 1) {
  const id = bot.registry.itemsByName[ad]?.id
  if (id === undefined) throw new Error(`${ad} diye bir eşya yok`)
  let masa = null
  let tarif = bot.recipesFor(id, null, 1, null)[0]
  if (!tarif) {
    masa = await masaHazirla(bot)
    tarif = bot.recipesFor(id, null, 1, masa)[0]
  }
  if (!tarif) throw new Error(`${ad} için malzemem yok`)
  // Arka arkaya craft'larda sunucu bazılarını sessizce yutuyor: tek tek yap, envantere düştüğünü doğrula.
  const hedef = say(bot, (a) => a === ad) + Math.ceil(adet / tarif.result.count) * tarif.result.count
  let deneme = 0
  while (say(bot, (a) => a === ad) < hedef) {
    if (++deneme > Math.ceil(adet / tarif.result.count) + 3) throw new Error(`${ad} üretemedim`)
    let t = bot.recipesFor(id, null, 1, masa)[0]
    if (!t) {
      // Craft sonrası envanter geç güncellenebiliyor: biraz bekle, bir daha bak
      await bot.waitForTicks(20)
      if (say(bot, (a) => a === ad) >= hedef) break
      t = bot.recipesFor(id, null, 1, masa)[0]
    }
    if (!t) throw new Error(`${ad} için malzemem bitti`)
    const once = say(bot, (a) => a === ad)
    try {
      await bot.craft(t, 1, masa)
    } catch (hata) {
      // 26.1'de ara sıra tıklama yanıtı gelmiyor (updateSlot timeout): pencereyi kapat, tekrar dene
      if (!/did not fire within timeout/i.test(hata.message)) throw hata
      console.log(`[üret] ${ad} takıldı, tekrar deniyorum:`, hata.message)
      if (bot.currentWindow) bot.closeWindow(bot.currentWindow)
      await bot.waitForTicks(10)
      continue
    }
    for (let i = 0; i < 20 && say(bot, (a) => a === ad) === once; i++) await bot.waitForTicks(1)
    await bot.waitForTicks(2)
  }
}

export async function tahtaHazirla(bot, adet) {
  let takilma = 0
  while (say(bot, tahtaMu) < adet) {
    const kutuk = bot.inventory.items().find((i) => kutukMu(i.name))
    if (!kutuk) {
      await odunTopla(bot, Math.ceil((adet - say(bot, tahtaMu)) / 4))
      continue
    }
    const tahta = kutuk.name.replace(/^stripped_/, '').replace(/_log$/, '_planks')
    const lazim = Math.min(kutuk.count, Math.ceil((adet - say(bot, tahtaMu)) / 4))
    try {
      await uret(bot, tahta, lazim * 4)
    } catch (hata) {
      // Kütük sayısı yanlış görünmüş olabilir: döngü envantere yeniden bakar
      if (!/malzemem bitti|üretemedim/.test(hata.message) || ++takilma > 3) throw hata
      console.log('[tahta] takıldı, envantere yeniden bakıyorum:', hata.message)
      await bot.waitForTicks(20)
    }
  }
}

export async function cubukHazirla(bot, adet) {
  const eksik = adet - say(bot, (a) => a === 'stick')
  if (eksik <= 0) return
  await tahtaHazirla(bot, Math.ceil(eksik / 4) * 2)
  await uret(bot, 'stick', eksik)
}

export async function parkeTasHazirla(bot, adet) {
  const eksik = adet - say(bot, parkeTasMu)
  if (eksik <= 0) return
  await blokTopla(bot, {
    blokMu: (a) => a === 'stone' || a === 'deepslate' || a === 'cobblestone',
    esyaMu: parkeTasMu,
    miktar: eksik,
    maxMesafe: 32,
  })
}

// Tarifin tahta/çubuk ihtiyacını önce kütükten hazırlar, sonra üretir (kütük var tahta yok → çubuk yapamıyordu)
export async function araUrunluUret(bot, ad, adet = 1) {
  const id = bot.registry.itemsByName[ad]?.id
  if (id === undefined) throw new Error(`${ad} diye bir eşya yok`)
  const tarif = bot.recipesAll(id, null, true)[0]
  if (tarif) {
    const kez = Math.ceil(adet / tarif.result.count)
    const lazim = (f) => tarif.delta.filter((d) => d.count < 0 && f(bot.registry.items[d.id]?.name ?? ''))
      .reduce((t, d) => t - d.count * kez, 0)
    const cubuk = lazim((a) => a === 'stick')
    const tahta = lazim(tahtaMu)
    if (cubuk && ad !== 'stick') await cubukHazirla(bot, cubuk)
    if (tahta) await tahtaHazirla(bot, tahta)
  }
  await uret(bot, ad, adet)
}

// Üstüne tıklayınca menü açılan bloklar: bunlara blok koyulmaz
const ETKILESIMLI = /table|furnace|chest|barrel|smoker|door|bed|anvil|lectern|loom|grindstone|stonecutter|shulker|hopper|dispenser|dropper|bell|gate|button|lever/
const BITKI = /^(short_grass|grass|tall_grass|fern|large_fern|dandelion|poppy|.*_tulip|cornflower|oxeye_daisy|azure_bluet|allium|blue_orchid|lily_of_the_valley|short_dry_grass|tall_dry_grass|bush|leaf_litter|wildflowers)$/
const bosMu = (b) => b && (b.name === 'air' || BITKI.test(b.name))

// Bot ile yan yana olmayan, altı dolu üstü boş bir yere bloğu koyar.
async function yakinaKoy(bot, ad) {
  const esya = bot.inventory.items().find((i) => i.name === ad)
  if (!esya) throw new Error(`Elimde ${ad} yok`)
  const ayak = bot.entity.position.floored()
  for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 1], [1, 2], [-2, -1], [-1, -2], [2, 2], [-2, 2]]) {
    for (const dy of [0, 1, -1]) {
      const yer = ayak.offset(dx, dy, dz)
      const alt = bot.blockAt(yer.offset(0, -1, 0))
      const bu = bot.blockAt(yer)
      const ust = bot.blockAt(yer.offset(0, 1, 0))
      if (alt?.boundingBox === 'block' && !ETKILESIMLI.test(alt.name) && bosMu(bu) && bosMu(ust)) {
        if (bu.name !== 'air') await bot.dig(bu) // ot/çiçek: önce yol
        await bot.equip(esya, 'hand')
        await bot.lookAt(yer.offset(0.5, 0.5, 0.5), true)
        await bot.placeBlock(alt, new Vec3(0, 1, 0))
        return bot.blockAt(yer)
      }
    }
  }
  // Dar mağara: bitişik bir yeri kazıp aç (korunan/etkileşimli bloklara dokunmaz)
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const yer = ayak.offset(dx, 0, dz)
    const alt = bot.blockAt(yer.offset(0, -1, 0))
    const bloklar = [bot.blockAt(yer), bot.blockAt(yer.offset(0, 1, 0))]
    if (alt?.boundingBox !== 'block' || ETKILESIMLI.test(alt.name)) continue
    if (bloklar.some((b) => !b || (!bosMu(b) && (ETKILESIMLI.test(b.name) || !bot.canDigBlock(b) || b.hardness == null || b.hardness < 0)))) continue
    try {
      for (const b of bloklar) if (b.name !== 'air') await bot.dig(b)
      await bot.equip(esya, 'hand')
      await bot.lookAt(yer.offset(0.5, 0.5, 0.5), true)
      await bot.placeBlock(alt, new Vec3(0, 1, 0))
      return bot.blockAt(yer)
    } catch (hata) {
      console.log(`[koy] ${ad} için yer açamadım:`, hata.message)
    }
  }
  throw new Error(`${ad} koyacak yer bulamadım`)
}

// İstasyonu (masa, fırın) yakında bulur ya da üretip koyar.
async function istasyonHazirla(bot, ad, uretimHazirla) {
  let blok = bot.findBlock({ matching: bot.registry.blocksByName[ad].id, maxDistance: 32 })
  if (blok && bot.entity.position.distanceTo(blok.position) > 4) {
    try {
      await bot.pathfinder.goto(new goals.GoalNear(blok.position.x, blok.position.y, blok.position.z, 2))
    } catch {
      blok = null // ulaşılamıyor: yenisini koy
    }
  }
  if (!blok) {
    if (!say(bot, (a) => a === ad)) {
      await uretimHazirla()
      await uret(bot, ad, 1)
    }
    blok = await yakinaKoy(bot, ad)
  }
  return blok
}

export function masaHazirla(bot) {
  return istasyonHazirla(bot, 'crafting_table', () => tahtaHazirla(bot, 4))
}

export function firinHazirla(bot) {
  return istasyonHazirla(bot, 'furnace', () => parkeTasHazirla(bot, 8))
}

// Ham eşyayı fırında eritir. Yakıt: önce kömür, yoksa tahta.
export async function erit(bot, ham, adet, ilerleme = () => {}) {
  if (say(bot, (a) => a === ham) < adet) throw new Error(`Elimde ${adet} ${ham} yok`)
  const komur = bot.inventory.items().find((i) => i.name === 'coal' || i.name === 'charcoal')
  const komurLazim = Math.ceil(adet / 8)
  const tahtaLazim = Math.ceil(adet / 1.5)
  if (!komur || komur.count < komurLazim) await tahtaHazirla(bot, tahtaLazim)

  const firin = await bot.openFurnace(await firinHazirla(bot))
  try {
    if (komur && komur.count >= komurLazim) {
      await firin.putFuel(komur.type, null, komurLazim)
    } else {
      const tahta = bot.inventory.items().find((i) => tahtaMu(i.name) && i.count >= tahtaLazim)
      if (!tahta) throw new Error('Yakıt bulamadım')
      await firin.putFuel(tahta.type, null, tahtaLazim)
    }
    await firin.putInput(bot.registry.itemsByName[ham].id, null, adet)
    let alinan = 0
    const sinir = Date.now() + adet * 12_000 + 15_000
    while (alinan < adet && Date.now() < sinir) {
      await bekle(2000)
      const cikti = firin.outputItem()
      if (cikti) {
        alinan += cikti.count
        await firin.takeOutput()
        ilerleme(alinan, adet)
      }
    }
    return alinan
  } finally {
    firin.close()
  }
}
