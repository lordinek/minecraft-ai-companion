import cb from 'mineflayer-collectblock'
import tool from 'mineflayer-tool'
import pf from 'mineflayer-pathfinder'
import { korumaUygula, korunuyor } from './alan.js'

const { Movements, goals } = pf
const YONLER = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]

export function toplamaKur(bot) {
  bot.loadPlugin(tool.plugin)
  bot.loadPlugin(cb.plugin)
  bot.once('spawn', () => {
    const m = new Movements(bot)
    m.canDig = true
    m.allow1by1towers = true // gerekirse altına blok koyarak çıksın
    m.scafoldingBlocks = [bot.registry.itemsByName.dirt.id] // topladığı taşı/kütüğü iskeleye harcamasın
    korumaUygula(m)
    bot.collectBlock.movements = m
  })
  // Işınlanınca (RCON tp, spreadplayers) yarım toplama eski konuma kilitli kalır: hemen sıfırla, iş yeniden dener
  // ('move' yeni konumla forcedMove'dan önce gelir; o yüzden konum yarım saniyede bir örneklenir)
  let onceki = null
  const ornek = setInterval(() => { if (bot.entity) onceki = bot.entity.position.clone() }, 500)
  bot.once('end', () => clearInterval(ornek))
  bot.on('forcedMove', () => {
    const p = bot.entity.position
    // Yalnız toplama sürüyorsa: teslim/yürüme sırasında goal'ı sıfırlamak işi sessizce düşürüyordu
    if (onceki && onceki.distanceTo(p) > 32 && !bot.collectBlock?.targets?.empty) {
      console.log('[topla] ışınlandım, yarım toplamayı sıfırlıyorum')
      toplamaSifirla(bot)
    }
    onceki = p.clone()
  })
}

// collectBlock takılınca (düşen eşya yaprağa/köşeye kalır, entityGone hiç gelmez) iç durumu "iş sürüyor" kalır;
// cancelTask 'collectBlock_finished' bekler ve o hiç gelmez, sonraki her collect() orada asılır.
// Bu, hedefleri boşaltıp bekleyenleri serbest bırakır.
export function toplamaSifirla(bot) {
  bot.collectBlock?.targets?.clear()
  bot.emit('collectBlock_finished')
  bot.stopDigging?.()
  bot.pathfinder?.setGoal(null)
  if (bot.normalHareket) bot.pathfinder?.setMovements(bot.normalHareket)
}

// collectBlock.collect, ama bitince yürüme ayarını eskiye döndürür: yoksa kazma serbest ayar
// kalıcı olur ve bot sonraki her yürüyüşte duvar delerek gider
// İlerleme bekçisi: DONMA_SN boyunca ne yürür ne envanter değişirse işi keser ("timeout" → blokTopla tekrar dener).
const DONMA_SN = 20
export async function topla(bot, hedefler, secenek) {
  const envanter = () => bot.inventory.items().reduce((t, i) => t + i.count, 0)
  let sonIlerleme = Date.now()
  let sonKonum = bot.entity.position.clone()
  let sonEnvanter = envanter()
  let kes
  const donma = new Promise((_, red) => { kes = red })
  const izci = setInterval(() => {
    const p = bot.entity.position
    const e = envanter()
    if (p.distanceTo(sonKonum) > 1 || e !== sonEnvanter || bot.targetDigBlock) {
      sonIlerleme = Date.now(); sonKonum = p.clone(); sonEnvanter = e
    } else if (Date.now() - sonIlerleme > DONMA_SN * 1000) {
      console.log(`[topla] ${DONMA_SN} sn ilerleme yok, toplamayı kesip yeniden deniyorum`)
      toplamaSifirla(bot)
      kes(new Error('timeout: toplama dondu'))
    }
  }, 1000)
  try {
    await Promise.race([bot.collectBlock.collect(hedefler, secenek), donma])
  } finally {
    clearInterval(izci)
    if (bot.normalHareket) bot.pathfinder.setMovements(bot.normalHareket)
  }
}

export function say(bot, filtre) {
  return bot.inventory.items().filter((i) => filtre(i.name)).reduce((t, i) => t + i.count, 0)
}

// `blokMu` eşleşen blokları kırıp `esyaMu` eşleşen eşyadan `miktar` tane daha olana kadar toplar.
export async function blokTopla(bot, { blokMu, esyaMu, miktar, maxMesafe = 64, bosSinir = 3, ilerleme = () => {} }) {
  const baslangic = say(bot, esyaMu)
  const hedef = baslangic + miktar
  let bos = 0
  while (say(bot, esyaMu) < hedef) {
    while (bot.kole?.savasta) await new Promise((r) => setTimeout(r, 250)) // nefsi müdafaa bitsin
    if (bot.kole?.iptal) throw new Error('İptal edildi')
    const hepsi = bot.findBlocks({ matching: (b) => blokMu(b.name), maxDistance: maxMesafe, count: 64 })
      .filter((p) => !korunuyor(p)) // kendi evini/tarlasını malzeme sanmasın
    if (hepsi.length === 0) throw new Error('Etrafta bulamadım')
    // collectBlock bloğu "görünce" varmış sayar. Her yanı taşla kaplı blok hiç görünmez: A* zaman aşımına
    // kadar milyonlarca düğüm açar (yer altında heap'i doldurup botu düşüren buydu). Önce açıkta olanlar.
    const konumlar = hepsi.filter((p) => acikMi(bot, p)).slice(0, 8)
    const once = say(bot, esyaMu)
    const kac = Math.max(1, Math.min(konumlar.length, hedef - once))
    try {
      if (konumlar.length) await topla(bot, konumlar.slice(0, kac).map((p) => bot.blockAt(p)), { ignoreNoPath: true })
      else await kazarakAl(bot, hepsi[0]) // hepsi gömülü (ör. kayanın içindeki maden): yanına kaz, kır
    } catch (hata) {
      // Kazı yarıda kesildi / yol bozuldu: bir tur boşa say, tekrar dene
      if (bot.kole?.iptal || !(bot.kole?.savasta || /abort|path|timeout|interrupt|cancel|goal/i.test(hata.message))) throw hata
      console.log('[topla] tekrar deniyorum:', hata.message)
    }
    const simdi = say(bot, esyaMu)
    if (bot.kole?.savasta) continue // savaş yüzünden kesildi, boşa sayma
    if (simdi === once) {
      if (++bos >= bosSinir) throw new Error('Kırıyorum ama eşya gelmiyor')
    } else bos = 0
    ilerleme(Math.min(simdi - baslangic, miktar), miktar)
  }
  return say(bot, esyaMu) - baslangic
}

// En az bir yüzü havaya/suya bakıyor mu (yani bir yerden görülebilir mi)
function acikMi(bot, p) {
  return YONLER.some(([x, y, z]) => bot.blockAt(p.offset(x, y, z))?.boundingBox === 'empty')
}

// Gömülü bloğa kazarak bitişik kareye gider (mesafe hedefi: kazı adımlarıyla hep ulaşılabilir), kırar, düşeni alır
async function kazarakAl(bot, p) {
  try {
    bot.pathfinder.setMovements(bot.collectBlock.movements)
    await bot.pathfinder.goto(new goals.GoalGetToBlock(p.x, p.y, p.z))
  } finally {
    if (bot.normalHareket) bot.pathfinder.setMovements(bot.normalHareket)
  }
  const b = bot.blockAt(p)
  if (!b || b.boundingBox === 'empty') return
  await bot.tool.equipForBlock(b, {}).catch(() => {})
  await bot.dig(b)
  await new Promise((r) => setTimeout(r, 400))
  const dusen = Object.values(bot.entities).filter((e) => e.name === 'item' && e.position.distanceTo(p) < 3)
  if (dusen.length) await topla(bot, dusen, { ignoreNoPath: true }).catch(() => {})
}

export const kutukMu = (ad) => ad.endsWith('_log')

export function odunTopla(bot, miktar = 5, ilerleme) {
  return blokTopla(bot, { blokMu: kutukMu, esyaMu: kutukMu, miktar, ilerleme })
}
