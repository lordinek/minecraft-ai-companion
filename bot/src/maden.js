import { say, blokTopla } from './toplama.js'
import { uret, tahtaHazirla, cubukHazirla, parkeTasHazirla, erit } from './uretim.js'

// kazma: 0 tahta, 1 taş, 2 demir
export const MADENLER = {
  kömür: { blok: /^(deepslate_)?coal_ore$/, esya: 'coal', kazma: 0 },
  taş: { blok: /^(stone|deepslate|cobblestone)$/, esya: /^(cobblestone|cobbled_deepslate)$/, kazma: 0 },
  demir: { blok: /^(deepslate_)?iron_ore$/, esya: 'raw_iron', kazma: 1 },
  bakır: { blok: /^(deepslate_)?copper_ore$/, esya: 'raw_copper', kazma: 1 },
  lapis: { blok: /^(deepslate_)?lapis_ore$/, esya: 'lapis_lazuli', kazma: 1 },
  altın: { blok: /^(deepslate_)?gold_ore$/, esya: 'raw_gold', kazma: 2 },
  kızıltaş: { blok: /^(deepslate_)?redstone_ore$/, esya: 'redstone', kazma: 2 },
  elmas: { blok: /^(deepslate_)?diamond_ore$/, esya: 'diamond', kazma: 2 },
}

const KAZMA_SEVIYE = {
  wooden_pickaxe: 0, golden_pickaxe: 0, stone_pickaxe: 1, copper_pickaxe: 1,
  iron_pickaxe: 2, diamond_pickaxe: 3, netherite_pickaxe: 4,
}

export function kazmaSeviyesi(bot) {
  return Math.max(-1, ...bot.inventory.items().map((i) => KAZMA_SEVIYE[i.name] ?? -1))
}

// En az `seviye` kazmayı olana kadar üretim zincirini yürütür.
export async function kazmaHazirla(bot, seviye, soyle = () => {}) {
  if (kazmaSeviyesi(bot) >= seviye) return
  if (seviye >= 1) await kazmaHazirla(bot, seviye - 1, soyle)
  if (seviye === 0) {
    soyle('Tahta kazma yapıyorum.')
    await tahtaHazirla(bot, 3 + 2) // 3 kafa + 2'si çubuğa
    await cubukHazirla(bot, 2)
    return uret(bot, 'wooden_pickaxe')
  }
  if (seviye === 1) {
    soyle('Taş kazma yapıyorum.')
    await parkeTasHazirla(bot, 3)
    await cubukHazirla(bot, 2)
    return uret(bot, 'stone_pickaxe')
  }
  soyle('Demir kazma yapıyorum.')
  const eksik = 3 - say(bot, (a) => a === 'iron_ingot')
  if (eksik > 0) {
    const ham = Math.max(0, eksik - say(bot, (a) => a === 'raw_iron'))
    if (ham > 0) await madenAra(bot, 'demir', ham, soyle)
    await erit(bot, 'raw_iron', eksik)
  }
  await cubukHazirla(bot, 2)
  return uret(bot, 'iron_pickaxe')
}

const eslesir = (desen, ad) => (typeof desen === 'string' ? desen === ad : desen.test(ad))

export async function madenAra(bot, tur, miktar = 1, soyle = () => {}, ilerleme = () => {}) {
  const m = MADENLER[tur]
  if (!m) throw new Error(`${tur} diye bir maden bilmiyorum`)
  await kazmaHazirla(bot, m.kazma, soyle)
  return blokTopla(bot, {
    blokMu: (ad) => m.blok.test(ad),
    esyaMu: (ad) => eslesir(m.esya, ad),
    miktar,
    maxMesafe: 96,
    ilerleme,
  })
}
