import pvpEklenti from 'mineflayer-pvp'
import pf from 'mineflayer-pathfinder'
import { uret, cubukHazirla, parkeTasHazirla, parkeTasMu } from './uretim.js'
import { say, toplamaSifirla } from './toplama.js'
import { kazmaHazirla } from './maden.js'

const { goals } = pf
const bekle = (ms) => new Promise((r) => setTimeout(r, ms))

// Saldırılmayacaklar: tarafsız ya da kışkırtınca bela olanlar
const DOKUNMA = new Set(['enderman', 'zombified_piglin', 'piglin', 'piglin_brute', 'iron_golem', 'snow_golem', 'wolf'])
const KORUMA_MESAFE = 12
const SILAH_SIRA = ['netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'copper_sword', 'golden_sword', 'wooden_sword',
  'netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe']
// Kılıç yokken düşman tepedeyse bunlarla da vurur (yumruktan iyidir)
const YEDEK_SILAH = ['copper_axe', 'golden_axe', 'wooden_axe', 'netherite_pickaxe', 'diamond_pickaxe', 'iron_pickaxe',
  'stone_pickaxe', 'copper_pickaxe', 'golden_pickaxe', 'wooden_pickaxe', 'iron_shovel', 'stone_shovel', 'wooden_shovel']

export const dusmanMi = (e) =>
  e && e.type === 'hostile' && !DOKUNMA.has(e.name) && e.isValid !== false

export function korumaKur(bot) {
  bot.loadPlugin(pvpEklenti.plugin)
  bot.once('spawn', () => {
    bot.pvp.attackRange = 3.2
    bot.pvp.followRange = 2
  })
}

const bul = (bot, liste) => liste.map((ad) => bot.inventory.items().find((i) => i.name === ad)).find(Boolean)

// Craft'a girmeden: elde ne varsa en iyisini kuşan (kılıç > balta > kazma > kürek > yumruk)
export async function eldekiniKusan(bot) {
  const silah = bul(bot, SILAH_SIRA) ?? bul(bot, YEDEK_SILAH)
  if (silah && bot.heldItem?.name !== silah.name) await bot.equip(silah, 'hand').catch(() => {})
  return silah?.name ?? 'yumruk'
}

export const dusmanYakinMi = (bot, mesafe = 10) =>
  !!bot.nearestEntity((e) => dusmanMi(e) && e.position.distanceTo(bot.entity.position) < mesafe)

// Ele en iyi silahı al. Hiç yoksa taş kılıç yap (gerekirse tahta kazma + taş).
// Düşman yakındayken craft'a girmez: o sırada ölüyordu. Eldekiyle yetinir.
export async function silahHazirla(bot, soyle = () => {}) {
  const enIyi = () => bul(bot, SILAH_SIRA)
  if (!enIyi() && dusmanYakinMi(bot)) return eldekiniKusan(bot)
  if (!enIyi()) {
    soyle('Silahım yok, önce kılıç yapıyorum.')
    if (say(bot, parkeTasMu) < 2) {
      await kazmaHazirla(bot, 0, soyle)
      await parkeTasHazirla(bot, 2)
    }
    await cubukHazirla(bot, 1)
    await uret(bot, 'stone_sword')
  }
  const silah = enIyi()
  if (silah && bot.heldItem?.name !== silah.name) await bot.equip(silah, 'hand')
  return silah?.name
}

function enYakinDusman(bot, merkezler) {
  let secilen = null
  let enAz = Infinity
  for (const e of Object.values(bot.entities)) {
    if (!dusmanMi(e)) continue
    for (const m of merkezler) {
      const d = e.position.distanceTo(m)
      if (d < KORUMA_MESAFE && d < enAz) { enAz = d; secilen = e }
    }
  }
  return secilen
}

// Hedef ölene / kaybolana / uzaklaşana kadar saldır. Öldürdüyse true.
export async function savas(bot, hedef, durmaliMi) {
  bot.pvp.attack(hedef)
  const sinir = Date.now() + 30_000
  while (Date.now() < sinir && !durmaliMi()) {
    await bekle(250)
    if (!bot.entities[hedef.id] || hedef.isValid === false || hedef.health === 0) break
    if (!bot.pvp.target) break
  }
  const oldu = !bot.entities[hedef.id] || hedef.isValid === false
  await bot.pvp.stop().catch(() => {})
  return oldu
}

// "koru" görevi: dur denene kadar efendiyi takip eder, yaklaşan düşmanı keser.
// olduruldu(mobAdi) her ölümde çağrılır (ruh sayacı + şikayet).
export async function koru(bot, sahip, { durmaliMi, olduruldu = () => {}, soyle = () => {} }) {
  let kilicDenendi = 0 // kılıç yapamadıysa her turda tekrar denemesin
  const kilicVarMi = () => !!bul(bot, SILAH_SIRA)
  if (dusmanYakinMi(bot, KORUMA_MESAFE)) {
    soyle(kilicVarMi() ? 'Geliyorum!' : `Kılıç yok, ${await eldekiniKusan(bot)} ile dalıyorum!`)
  } else {
    await silahHazirla(bot, soyle)
      .then(() => soyle('Kılıcım hazır, arkanızdayım.'))
      .catch((h) => { kilicDenendi = Date.now(); soyle(`Kılıç yapamadım (${h.message}), eldekiyle koruyorum.`) })
  }
  let oldurulen = 0
  while (!durmaliMi()) {
    const efendi = bot.players[sahip]?.entity
    const hedef = enYakinDusman(bot, [bot.entity.position, efendi?.position].filter(Boolean))
    if (hedef) {
      await eldekiniKusan(bot)
      if (await savas(bot, hedef, durmaliMi)) {
        oldurulen++
        olduruldu(hedef.name)
      }
      continue
    }
    // Ortalık sakin: kılıç yoksa / kırıldıysa şimdi yap
    if (!kilicVarMi() && Date.now() - kilicDenendi > 60_000) {
      kilicDenendi = Date.now()
      bot.pathfinder.setGoal(null)
      await silahHazirla(bot, soyle).catch((h) => console.log('[koru] kılıç olmadı:', h.message))
      continue
    }
    if (efendi && !bot.pathfinder.goal) bot.pathfinder.setGoal(new goals.GoalFollow(efendi, 3), true)
    await bekle(400)
  }
  return oldurulen
}

// Koruma modunda değilken de: vurulursa karşılık ver, can azsa efendiye kaç.
// Bir iş yapıyorsa (odun, maden...) işi bekletir: bot.kole.savasta açıkken işler durur,
// kesilen iş savaş bitince kuyruğa geri girer (gorevler.js).
export function nefsiMudafaaKur(bot, sahip) {
  let sonUyari = 0
  bot.on('entityHurt', async (e) => {
    if (e !== bot.entity) return
    if (bot.kole?.simdiki?.ad === 'koru' || bot.pvp.target || bot.kole?.savasta) return
    const efendi = bot.players[sahip]?.entity
    const efendiYakin = efendi && efendi.position.distanceTo(bot.entity.position) < 32
    if (bot.health <= 6 && Date.now() - sonUyari > 15_000) {
      sonUyari = Date.now()
      bot.chat(`${sahip}! Ölüyorum burada, yardım edin!`)
      if (efendiYakin) {
        bot.kole.savasta = true
        bot.kole.kesildi = !!bot.kole.simdiki
        toplamaSifirla(bot)
        bot.pathfinder.setGoal(new goals.GoalFollow(efendi, 1), true)
        setTimeout(() => { bot.kole.savasta = false }, 6000)
        return
      }
      // Efendi yok: kaçacak yer yok, dövüşür
    }
    const saldirgan = enYakinDusman(bot, [bot.entity.position])
    if (!saldirgan || saldirgan.position.distanceTo(bot.entity.position) >= 6) return
    bot.kole.savasta = true
    bot.kole.kesildi = !!bot.kole.simdiki
    // Emniyet: dövüş ne olursa olsun 45 sn'de biter (savasta takılı kalırsa bütün işler sonsuza bekliyordu)
    const emniyet = setTimeout(() => { bot.kole.savasta = false; bot.pvp.forceStop?.() }, 45_000)
    try {
      toplamaSifirla(bot)
      bot.pathfinder.setGoal(null)
      console.log(`[savunma] ${saldirgan.name} saldırdı, ${await eldekiniKusan(bot)} ile karşılık veriyorum`)
      // Yakında başka düşman kaldıkça devam
      let hedef = saldirgan
      while (hedef) {
        await savas(bot, hedef, () => false)
        hedef = enYakinDusman(bot, [bot.entity.position])
        if (hedef && hedef.position.distanceTo(bot.entity.position) > 6) hedef = null
      }
    } finally {
      clearTimeout(emniyet)
      bot.kole.savasta = false
    }
  })
}

// İşler savaş sürerken bunu bekler
export async function savasBitsin(bot) {
  while (bot.kole?.savasta) await bekle(250)
}
