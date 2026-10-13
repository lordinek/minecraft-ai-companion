import { yanimaGel, takipEt, dur } from './hareket.js'
import { odunTopla, toplamaSifirla } from './toplama.js'
import { madenAra } from './maden.js'
import { erit, araUrunluUret } from './uretim.js'
import { avlan, pisir, ye, yemekler } from './yemek.js'
import { tarlaKur, hasatEt } from './tarim.js'
import { koru, savasBitsin } from './koruma.js'
import { evYap } from './insa.js'
import { zirhYap, efendiZirhiYap } from './zirh.js'
import pf from 'mineflayer-pathfinder'

const { goals } = pf

// Ara adımlar ("tahta kazma yapıyorum", "malzeme topluyorum") chat'i kirletmesin: sadece terminale
const log = (m) => console.log('[iş]', m)

// Botun yapabildiği işler. Beyin (LLM) bunları isimleriyle çağırır.
// Her biri { mesaj, adet } döndürür ya da hata fırlatır. adet ruh sayaçlarına gider.
export const ISLER = {
  odunTopla: async (bot, { miktar = 5 }) => {
    const n = await odunTopla(bot, miktar)
    return { mesaj: `${n} kütük kestim.`, adet: n }
  },
  madenAra: async (bot, { tur, miktar = 1 }) => {
    const n = await madenAra(bot, tur, miktar, log)
    return { mesaj: `${n} ${tur} buldum.`, adet: n }
  },
  erit: async (bot, { esya = 'raw_iron', miktar }) => ({ mesaj: `${await erit(bot, esya, miktar)} tane erittim.` }),
  avlan: async (bot, { hayvan = 'herhangi', miktar = 3 }) => {
    const n = await avlan(bot, hayvan, miktar, log)
    return { mesaj: `${n} çiğ et topladım.`, adet: n }
  },
  pisir: async (bot, { esya = 'hepsi', miktar = 64 }) => ({ mesaj: `${await pisir(bot, esya, miktar)} tane pişirdim.` }),
  tarlaKur: async (bot, _, ctx) => {
    const n = await tarlaKur(bot, ctx.sahip, 80, log)
    return { mesaj: `${n} kare buğday ektim. Büyüyünce hasat edin deyin.`, adet: n }
  },
  hasatEt: async (bot, { miktar = 128 }) => {
    const n = await hasatEt(bot, miktar)
    return { mesaj: `Hasat bitti, ${n} ürün topladım, yerine yenisini ektim.`, adet: n }
  },
  esyaYap: async (bot, { esya, miktar = 1 }) => {
    await araUrunluUret(bot, esya, miktar)
    return { mesaj: `${miktar} ${esya} yaptım.` }
  },
  yemekYe: async (bot) => {
    if (bot.food >= 20) return { mesaj: 'Tokum, yemedim.' } // oyun tokken yedirmiyor
    const yenen = await ye(bot, true)
    if (!yenen) throw new Error('Yiyecek bir şeyim yok')
    return { mesaj: `${yenen} yedim, açlığım ${bot.food}/20.` }
  },
  zirhYap: async (bot) => {
    const { yapilan, giyilen } = await zirhYap(bot, log)
    log(`zırh: yaptım ${yapilan.join(', ') || '-'}, giydim ${giyilen.join(', ') || '-'}`)
    const z = yapilan.length || giyilen.length ? 'Zırhımı kuşandım efendim.' : 'Zaten zırhlıyım efendim.'
    return { mesaj: z, sohbet: z }
  },
  yanimaGel: async (bot, _, ctx) => { await yanimaGel(bot, ctx.sahip); return { mesaj: 'Geldim.' } },
  takipEt: async (bot, _, ctx) => { takipEt(bot, ctx.sahip); return { mesaj: 'Peşindeyim.' } },
  // Süreklidir: dur denene ya da yeni bir iş gelene kadar sürer
  koru: async (bot, _, ctx) => {
    const n = await koru(bot, ctx.sahip, {
      durmaliMi: () => bot.kole.iptal || bot.kole.koruBitir,
      olduruldu: (mob) => { const s = ctx.ruh?.mobOldu(mob); if (s) bot.chat(s) },
      soyle: log,
    })
    return { mesaj: n ? `Korumayı bırakıyorum, ${n} düşman temizledim.` : 'Korumayı bırakıyorum.', adet: n }
  },
  evYap: async (bot, { ev = 'basit' }, ctx) => {
    const s = await evYap(bot, ctx.sahip, ev, log)
    log(`${s.tur} ev bitti: ${s.konan}/${s.toplam} blok, eşya: ${s.esyalar.join(', ') || 'yok'}`)
    return { mesaj: 'Eviniz hazır efendim.', sohbet: 'Eviniz hazır efendim.', adet: 1 }
  },
  // Efendiye demir zırh takımı: yapar, giymeden getirip atar
  zirhVer: async (bot, { tur = 'demir' }, ctx) => {
    bot.kole.zirhTut = true
    try {
      const parcalar = await efendiZirhiYap(bot, log, tur)
      for (const esya of parcalar) await ISLER.esyaVer(bot, { esya, miktar: 1 }, ctx)
      return { mesaj: `Efendiye zırh verdim: ${parcalar.join(', ')}`, sohbet: 'Zırhınız hazır efendim, buyurun.', adet: parcalar.length }
    } finally {
      // Savaş kestiyse iş yeniden kuyruğa girecek: o arada yaptığı parçaları kendisi giymesin.
      // Bittiyse de 8 sn bekle: alınmayan parçayı yerden geri toplayıp giyiyordu (botlar ayağında kaldı)
      if (!bot.kole.kesildi) setTimeout(() => { bot.kole.zirhTut = false }, 8000)
    }
  },
  esyaVer: async (bot, { esya, miktar = 1 }, ctx) => {
    // "yemek" = elindeki yiyecekler, en doyurucudan başlayarak (birden çok tür olabilir)
    const yemekMi = esya === 'yemek'
    // "oak_log" istenip huş/ladin kesildiyse onlar da sayılır (odunTopla her kütüğü keser); taş da öyle
    const uyar = aile(esya)
    const kalemlerAl = () => (yemekMi ? yemekler(bot) : bot.inventory.items().filter((i) => uyar(i.name)))
    if (!kalemlerAl().length) throw new Error(yemekMi ? 'Bende yemek yok' : `Bende ${esya} yok`)
    await yanimaGel(bot, ctx.sahip)
    const hedef = bot.players[ctx.sahip]?.entity
    if (hedef) await bot.lookAt(hedef.position.offset(0, 1.6, 0), true)
    // Envanter yürürken değişebilir: atmadan hemen önce yeniden say
    const kalemler = kalemlerAl()
    const var_ = kalemler.reduce((t, i) => t + i.count, 0)
    const n = Math.min(var_, miktar)
    const ad = yemekMi ? 'yemek' : esya
    let kalan = n
    for (const i of kalemler) {
      if (kalan <= 0) break
      const at = Math.min(kalan, i.count)
      await bot.toss(i.type, null, at)
      kalan -= at
    }
    // Işınlama hilesi yok (eskisi yerdeki başka eşyaları da efendiye çekiyordu): attıktan sonra geri çekil ki
    // 2 sn sonra kendi attığını geri toplamasın; efendi almadıysa eşya yerde kalır
    if (hedef) {
      const { x, y, z } = hedef.position
      await Promise.race([bot.pathfinder.goto(new goals.GoalInvert(new goals.GoalNear(x, y, z, 4))), bot.waitForTicks(60)])
        .catch(() => {})
      bot.pathfinder.stop()
    }
    return {
      mesaj: n < miktar ? `Sadece ${n} ${ad} vardı, verdim.` : `${n} ${ad} verdim.`,
      sohbet: n < miktar ? 'Buyurun efendim, elimde bu kadar vardı.' : 'Buyurun efendim.',
    }
  },
}

// İstenen eşyanın ailesi: herhangi kütük / herhangi tahta / taş (parke ya da derin)
function aile(esya) {
  if (esya.endsWith('_log')) return (a) => a.endsWith('_log')
  if (esya.endsWith('_planks')) return (a) => a.endsWith('_planks')
  if (esya === 'cobblestone' || esya === 'cobbled_deepslate') return (a) => a === 'cobblestone' || a === 'cobbled_deepslate'
  return (a) => a === esya
}

// Sırayla çalışan görev kuyruğu: "kütük kes ve gel" → iki görev.
export function kuyrukKur(bot, sahip, ruh) {
  const kuyruk = []
  let calisiyor = false
  bot.kole = { iptal: false, simdiki: null }

  async function isle() {
    if (calisiyor) return
    calisiyor = true
    while (kuyruk.length) {
      const g = kuyruk.shift()
      bot.kole.simdiki = g
      bot.kole.iptal = false
      bot.kole.koruBitir = false
      bot.kole.kesildi = false
      try {
        const sonuc = await ISLER[g.ad](bot, g.girdi, { sahip, ruh })
        if (bot.kole.iptal) continue
        // "10 oak_log verdim" gibi sayılı raporlar sadece terminale (sahibin isteği: chat'e yazmasın);
        // chat'e işin kendi sözü (ör. "Buyurun efendim.") ve ara sıra şikayet düşer
        console.log(`[iş bitti] ${sonuc.mesaj}`)
        if (!ruh) { if (sonuc.sohbet) bot.chat(sonuc.sohbet); continue }
        const { sikayet } = ruh.isBitti(g.ad, sonuc.mesaj, sonuc.adet)
        const soz = [sonuc.sohbet, sikayet].filter(Boolean).join(' ')
        if (soz) bot.chat(soz)
      } catch (hata) {
        // Nefsi müdafaa işi kestiyse savaş bitince aynı işi baştan al
        if (bot.kole.kesildi && !bot.kole.iptal && (g.kesinti ?? 0) < 3) {
          bot.kole.kesildi = false
          await savasBitsin(bot)
          g.kesinti = (g.kesinti ?? 0) + 1
          console.log(`[görev] ${g.ad} savaş yüzünden kesildi, devam ediyorum`)
          kuyruk.unshift(g)
          continue
        }
        if (bot.kole.iptal || hata.name === 'GoalChanged' || /goal was changed/i.test(hata.message)) continue
        console.error(`[görev] ${g.ad} hata:`, hata.message)
        bot.chat('Kusura bakmayın efendim, olmadı.') // ham hata (İngilizce) terminalde kalır
        // Sohbet zincirinin kalanı muhtemelen buna bağlıydı; menüden sıraya eklenen işler bağımsız, devam
        if (!g.bagimsiz) kuyruk.length = 0
      }
    }
    bot.kole.simdiki = null
    calisiyor = false
  }

  return {
    ekle(ad, girdi = {}, { bagimsiz = false } = {}) {
      if (!ISLER[ad]) throw new Error(`Bilinmeyen iş: ${ad}`)
      // Koruma süreklidir; yeni iş gelince bitsin ki sıra ilerlesin
      if (bot.kole.simdiki?.ad === 'koru') bot.kole.koruBitir = true
      kuyruk.push({ ad, girdi, bagimsiz })
      isle()
    },
    durdur() {
      kuyruk.length = 0
      bot.kole.iptal = true
      toplamaSifirla(bot) // cancelTask takılı collect'te asılır; bu her durumda temizler
      dur(bot)
      bot.pathfinder.setGoal(null)
    },
    ozet() {
      const s = bot.kole.simdiki
      const yapiyor = s ? `${s.ad}(${JSON.stringify(s.girdi)})` : 'boşta'
      return kuyruk.length ? `${yapiyor}; sırada: ${kuyruk.map((g) => g.ad).join(', ')}` : yapiyor
    },
  }
}
