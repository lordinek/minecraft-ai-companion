import { say, topla } from './toplama.js'
import { erit } from './uretim.js'
import { silahHazirla, savas } from './koruma.js'

const bekle = (ms) => new Promise((r) => setTimeout(r, ms))

// Hayvan → düşürdüğü çiğ et
export const HAYVANLAR = {
  inek: { mob: 'cow', et: 'beef' },
  domuz: { mob: 'pig', et: 'porkchop' },
  tavuk: { mob: 'chicken', et: 'chicken' },
  koyun: { mob: 'sheep', et: 'mutton' },
  tavşan: { mob: 'rabbit', et: 'rabbit' },
}
const CIG = ['beef', 'porkchop', 'chicken', 'mutton', 'rabbit', 'cod', 'salmon', 'potato']
const cigMi = (ad) => CIG.includes(ad)
const etMi = (ad) => Object.values(HAYVANLAR).some((h) => h.et === ad)
// Aç değilken dokunmadığı, zehirli ya da çiğ yemekler
const KOTU = new Set(['rotten_flesh', 'spider_eye', 'poisonous_potato', 'pufferfish', 'chicken', 'suspicious_stew', 'chorus_fruit'])

// Yerdeki eşyaları (düşen et vb.) toplar
export async function yerdenTopla(bot, mesafe = 8) {
  const esyalar = Object.values(bot.entities).filter((e) =>
    e.name === 'item' && e.position.distanceTo(bot.entity.position) < mesafe)
  if (!esyalar.length) return
  await topla(bot, esyalar.slice(0, 6), { ignoreNoPath: true }).catch(() => {})
}

// `miktar` çiğ et olana kadar hayvan keser. hayvan: HAYVANLAR anahtarı ya da 'herhangi'
export async function avlan(bot, hayvan = 'herhangi', miktar = 3, soyle = () => {}) {
  const hedefler = HAYVANLAR[hayvan] ? [HAYVANLAR[hayvan].mob] : Object.values(HAYVANLAR).map((h) => h.mob)
  await silahHazirla(bot, soyle)
  const baslangic = say(bot, etMi)
  let bos = 0
  while (say(bot, etMi) - baslangic < miktar) {
    if (bot.kole?.iptal) throw new Error('İptal edildi')
    const av = bot.nearestEntity((e) => hedefler.includes(e.name) && e.position.distanceTo(bot.entity.position) < 64)
    if (!av) {
      const n = say(bot, etMi) - baslangic
      if (n > 0) return n
      throw new Error(`Etrafta ${HAYVANLAR[hayvan] ? hayvan : 'hayvan'} yok`)
    }
    const once = say(bot, etMi)
    await savas(bot, av, () => bot.kole?.iptal)
    await bekle(400)
    await yerdenTopla(bot)
    // Yavru hayvan et düşürmez: art arda boş dönerse vazgeç
    if (say(bot, etMi) === once) {
      if (++bos >= 4) throw new Error('Kesiyorum ama et düşmüyor')
    } else bos = 0
  }
  return say(bot, etMi) - baslangic
}

// Çiğ yemeği pişirir. esya = 'hepsi' ise envanterdeki tüm çiğ yiyecekler.
export async function pisir(bot, esya = 'hepsi', miktar = 64) {
  const turler = esya === 'hepsi' ? CIG.filter((a) => say(bot, (b) => b === a) > 0) : [esya]
  if (!turler.length) throw new Error('Pişirecek çiğ yemeğim yok')
  let toplam = 0
  for (const ad of turler) {
    const n = Math.min(say(bot, (b) => b === ad), miktar - toplam)
    if (n <= 0) break
    toplam += await erit(bot, ad, n)
  }
  return toplam
}

// Elindeki yiyecekler, en doyurucu önce. `hepsi` = kötüler dahil (açlıktan ölürken)
export function yemekler(bot, hepsi = false) {
  const foods = bot.registry.foodsByName
  return bot.inventory.items()
    .filter((i) => foods[i.name] && (hepsi || (!KOTU.has(i.name) && !cigMi(i.name))))
    .sort((a, b) => foods[b.name].foodPoints - foods[a.name].foodPoints)
}

let yiyor = false
export async function ye(bot, zorla = false) {
  if (yiyor) return false
  const yemek = yemekler(bot)[0] ?? (zorla || bot.food <= 6 ? yemekler(bot, true)[0] : null)
  if (!yemek) return false
  yiyor = true
  try {
    await bot.equip(yemek, 'hand')
    await bot.consume()
    return yemek.name
  } catch {
    return false // vurulunca / el değişince yarıda kalır, sonra tekrar dener
  } finally {
    yiyor = false
  }
}

const ACIM = [
  'Efendim karnım zil çalıyor. Yemek de mi kendim bulayım?',
  'Açlıktan gözüm kararıyor. Köleye ekmek verilmez mi bu memlekette?',
  'Midem kendini yiyor efendim. Bir lokma bir şey?',
]

// Acıkınca kendiliğinden yer. İş yaparken sadece çok açsa (elindeki aleti bozmasın).
export function otoYemekKur(bot, sonra = async () => {}) {
  let sonSikayet = 0
  bot.once('spawn', () => setInterval(async () => {
    if (yiyor || bot.pvp?.target || bot.food >= 18) return
    const bosta = !bot.kole?.simdiki
    if (!bosta && bot.food > 6) return
    if (bosta && bot.food > 14) return
    const yenen = await ye(bot)
    if (yenen) {
      console.log(`[yemek] ${yenen} yedim, açlık ${bot.food}/20`)
      await sonra()
    } else if (bot.food <= 6 && Date.now() - sonSikayet > 120_000) {
      sonSikayet = Date.now()
      bot.chat(ACIM[Math.floor(Math.random() * ACIM.length)])
    }
  }, 3000))
}
