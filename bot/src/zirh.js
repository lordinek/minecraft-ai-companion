import { say } from './toplama.js'
import { uret, erit } from './uretim.js'
import { madenAra } from './maden.js'

// İyiden kötüye. Kask yuvasına kaplumbağa kabuğu da girer (demir kask kadar korur).
const MALZEME_SIRA = ['netherite', 'diamond', 'iron', 'chainmail', 'turtle', 'copper', 'golden', 'leather']
const PARCALAR = [
  { ek: 'helmet', yuva: 'head', slot: 5, demir: 5 },
  { ek: 'chestplate', yuva: 'torso', slot: 6, demir: 8 },
  { ek: 'leggings', yuva: 'legs', slot: 7, demir: 7 },
  { ek: 'boots', yuva: 'feet', slot: 8, demir: 4 },
]
const bekle = (ms) => new Promise((r) => setTimeout(r, ms))

const derece = (ad, ek) => {
  if (!ad?.endsWith('_' + ek)) return Infinity
  const i = MALZEME_SIRA.indexOf(ad.slice(0, -ek.length - 1))
  return i === -1 ? Infinity : i
}

// Her yuvaya envanterdeki en iyi parçayı giyer. Döner: giyilen parça adları.
export async function enIyisiniGiy(bot) {
  const giyilen = []
  for (const { ek, yuva, slot } of PARCALAR) {
    const ustteki = bot.inventory.slots[slot]
    const aday = bot.inventory.items()
      .filter((i) => derece(i.name, ek) < derece(ustteki?.name, ek))
      .sort((a, b) => derece(a.name, ek) - derece(b.name, ek))[0]
    if (!aday) continue
    try {
      await bot.equip(aday, yuva)
      giyilen.push(aday.name)
    } catch (hata) { console.log('[zırh] giyemedim', aday.name, hata.message) }
  }
  return giyilen
}

// Envanterine zırh düşünce (efendi attı, sandıktan aldı) kendiliğinden giyer
export function otoZirhKur(bot) {
  let zamanlayici = null
  let giyiyor = false
  const dene = () => {
    clearTimeout(zamanlayici)
    zamanlayici = setTimeout(async () => {
      if (bot.kole?.zirhTut) return // efendiye zırh yapıyor: kendisi giymesin
      if (giyiyor || bot.currentWindow) return dene() // craft/fırın penceresi açıkken dokunma
      giyiyor = true
      try {
        const g = await enIyisiniGiy(bot)
        if (g.length) console.log('[zırh] giydim:', g.join(', '))
      } finally { giyiyor = false }
    }, 800)
  }
  bot.once('spawn', () => {
    bot.inventory.on('updateSlot', (slot) => { if (slot > 8) dene() }) // 5-8 zırh yuvaları: kendi giyişi
    dene()
  })
}

// Eksik parçaları demirden yapar (gerekirse demir kazar, eritir) ve giyer.
export async function zirhYap(bot, soyle = () => {}) {
  const eksik = PARCALAR.filter(({ ek, slot }) =>
    derece(bot.inventory.slots[slot]?.name, ek) > derece('iron_' + ek, ek) &&
    !bot.inventory.items().some((i) => derece(i.name, ek) <= derece('iron_' + ek, ek)))
  if (eksik.length) {
    const lazim = eksik.reduce((t, p) => t + p.demir, 0)
    const kulce = say(bot, (a) => a === 'iron_ingot')
    if (kulce < lazim) {
      const ham = lazim - kulce - say(bot, (a) => a === 'raw_iron')
      if (ham > 0) { soyle(`Zırh için ${ham} demir kazıyorum.`); await madenAra(bot, 'demir', ham, soyle) }
      await erit(bot, 'raw_iron', lazim - kulce)
    }
    for (const { ek } of eksik) {
      if (bot.kole?.iptal) throw new Error('İptal edildi')
      await uret(bot, 'iron_' + ek, 1)
      await bekle(200)
    }
  }
  const giyilen = await enIyisiniGiy(bot)
  return { yapilan: eksik.map((p) => 'iron_' + p.ek), giyilen }
}

// Efendi için tam takım (demir: 24 külçe; elmas: 24 elmas). Giymez, envanterde bırakır.
// Çağıran bot.kole.zirhTut'u açık tutmalı ki otomatik giyme kapmasın. Döner: takımın parça adları.
export async function efendiZirhiYap(bot, soyle = () => {}, tur = 'demir') {
  const on = tur === 'elmas' ? 'diamond_' : 'iron_'
  // Hazır parçalar sayılır: çantadaysa olduğu gibi, üstündeyse çıkarılır (iş savaşla kesilip yeniden başlarsa
  // ya da elle verildiyse baştan kazmasın)
  const eksik = []
  for (const p of PARCALAR) {
    const ad = on + p.ek
    if (bot.inventory.items().some((i) => i.name === ad)) continue
    if (bot.inventory.slots[p.slot]?.name === ad) { await bot.unequip(p.yuva).catch(() => {}); continue }
    eksik.push(p)
  }
  const lazim = eksik.reduce((t, p) => t + p.demir, 0) // elmas tarifi de aynı adet
  if (tur === 'elmas') {
    const var_ = say(bot, (a) => a === 'diamond')
    if (lazim > var_) { soyle(`Zırh için ${lazim - var_} elmas arıyorum.`); await madenAra(bot, 'elmas', lazim - var_, soyle) }
  } else {
    const kulce = say(bot, (a) => a === 'iron_ingot')
    if (lazim && kulce < lazim) {
      const ham = lazim - kulce - say(bot, (a) => a === 'raw_iron')
      if (ham > 0) { soyle(`Zırh için ${ham} demir kazıyorum.`); await madenAra(bot, 'demir', ham, soyle) }
      await erit(bot, 'raw_iron', lazim - kulce)
    }
  }
  for (const { ek } of eksik) {
    if (bot.kole?.iptal) throw new Error('İptal edildi')
    await uret(bot, on + ek, 1)
    await bekle(200)
  }
  return PARCALAR.map((p) => on + p.ek)
}
