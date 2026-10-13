import pf from 'mineflayer-pathfinder'
import { korumaUygula } from './alan.js'

const { pathfinder, Movements, goals } = pf

export function hareketKur(bot) {
  bot.loadPlugin(pathfinder)
  bot.once('spawn', () => {
    const m = new Movements(bot)
    // Yolu kazarak açmasın; tek istisna yaprak: ağaç tepesinde kalınca inebilsin
    m.canDig = true
    m.blocksCantBreak = new Set(bot.registry.blocksArray.filter((b) => !b.name.endsWith('_leaves')).map((b) => b.id))
    korumaUygula(m)
    // İskele yalnız toprak: varsayılan taşı da yakıyordu, efendiye getirilen taş yolda harcanıyordu
    m.scafoldingBlocks = [bot.registry.itemsByName.dirt.id]
    bot.normalHareket = m // collectBlock kendi ayarını yükler; toplama bitince buna dönülür
    // Kaçış ayarı: kazdığı çukurda kalınca merdiven kazarak çıkar (korunan alanlar yine kırılmaz)
    const k = new Movements(bot)
    k.canDig = true
    korumaUygula(k)
    k.scafoldingBlocks = [bot.registry.itemsByName.dirt.id]
    bot.kaziciHareket = k
    bot.pathfinder.setMovements(m)
    bot.pathfinder.thinkTimeout = 10_000 // sık ormanda 5 sn yetmiyordu ("Took to long to decide path")
  })
}

function oyuncuBul(bot, ad) {
  const e = bot.players[ad]?.entity
  if (!e) throw new Error(`${ad} görünmüyor`)
  return e
}

// Yol bulamazsa ya da 45 sn'de varamazsa vazgeçer (ışınlanma hilesi yok; efendi /kole cagir ile çağırabilir)
export async function yanimaGel(bot, oyuncu, sure = 45_000) {
  let saat
  const yol = yuru(bot, oyuncu)
  yol.catch(() => {}) // zaman aşımında yarış biter; geç gelen ret yakalanmamış kalmasın
  const zaman = new Promise((_, red) => { saat = setTimeout(() => red(new Error('yol zaman aşımı')), sure) })
  try {
    await Promise.race([yol, zaman])
  } catch (hata) {
    if (!/no path|took to long|zaman aşımı/i.test(hata.message) || bot.kole?.iptal) throw hata
    bot.pathfinder.stop()
    throw new Error(`Yanına yürüyemedim (${hata.message}); /kole cagir ile çağır`)
  } finally {
    clearTimeout(saat)
  }
}

async function yuru(bot, oyuncu) {
  const e = oyuncuBul(bot, oyuncu)
  const hedef = () => new goals.GoalNear(e.position.x, e.position.y, e.position.z, 2)
  // Pathfinder hiç adım atamayacağı kapalı yerde boş yolla "vardım" diye çözülüyor: gerçekten vardık mı bak
  const git = async () => {
    await bot.pathfinder.goto(hedef())
    if (bot.entity.position.distanceTo(e.position) > 4) throw new Error('No path: hedefe varamadım')
  }
  try {
    await git()
  } catch (hata) {
    // Kazmadan yol yok (taş/maden çukurunda kaldı): kazarak çık
    if (!/no path|took to long/i.test(hata.message) || !bot.kaziciHareket) throw hata
    console.log('[hareket] yol yok, kazarak geliyorum')
    bot.pathfinder.setMovements(bot.kaziciHareket)
    try {
      await git()
    } finally {
      bot.pathfinder.setMovements(bot.normalHareket)
    }
  }
}

export function takipEt(bot, oyuncu) {
  const e = oyuncuBul(bot, oyuncu)
  bot.pathfinder.setGoal(new goals.GoalFollow(e, 2), true)
}

export function dur(bot) {
  bot.pathfinder.stop()
  bot.clearControlStates()
}
