import readline from 'node:readline'
import mineflayer from 'mineflayer'
import { hareketKur } from './hareket.js'
import { toplamaKur, toplamaSifirla } from './toplama.js'
import { sabitKomut } from './komutlar.js'
import { kuyrukKur } from './gorevler.js'
import { ruhKur } from './ruh.js'
import { korumaKur, nefsiMudafaaKur, silahHazirla } from './koruma.js'
import { otoYemekKur } from './yemek.js'
import { otoZirhKur } from './zirh.js'
import { rconKomut } from './rcon.js'
import { menuPaketiKur, menuDinle } from './menu.js'

const SAHIP = process.env.SAHIP
if (!SAHIP) throw new Error('.env içinde SAHIP yok')
// Tek köle. İkinci köle istenirse .env'de BOT2_ADI= ile açılır (çırak 2026-10-10'da kaldırıldı)
const ADLAR = [process.env.BOT_ADI ?? 'Kole', process.env.BOT2_ADI].filter(Boolean)
// Bekçi çöküş sonrası açtıysa oyunda "merhaba" demesin, sessizce geri girsin
const YENIDEN = process.env.BEKCI_YENIDEN === '1'

// Hilesiz varsayılan: köle ölebilir, vurulunca karşılık verir. Video çekimi için DOKUNULMAZ=1 (gizli direnç V vb.)
const DOKUNULMAZ = process.env.DOKUNULMAZ === '1'

// Her doğuşta (ölüm sonrası dahil) gizli sonsuz efektler: direnç V (hiç hasar almaz), ateş, su altı nefes
function dokunulmazKur(bot) {
  bot.on('spawn', () => {
    for (const e of ['resistance infinite 4', 'fire_resistance infinite 0', 'water_breathing infinite 0']) {
      rconKomut(`effect give ${bot.username} minecraft:${e} true`).catch(() => {})
    }
  })
}

// Yakalanmamış bir söz (promise) hatası botu düşürmesin
process.on('unhandledRejection', (hata) => console.error('[yakalanmamış]', hata?.message ?? hata))
// Pathfinder fizik tikinde yüklenmemiş bloğa (null) çarpınca fırlatıyor (ışınlanma/setblock sonrası
// "Cannot read properties of null (reading 'digTime')"): botu düşürmesin, yol aramayı sıfırla
process.on('uncaughtException', (hata) => {
  if (!/mineflayer-pathfinder|mineflayer-collectblock/.test(hata?.stack ?? '')) throw hata
  console.error('[yol hatası yakalandı]', hata.message)
  for (const { bot } of ekip) toplamaSifirla(bot)
})

// Botun sözleri mavi görünsün: oyuncu chat'i renklenemez, o yüzden RCON tellraw ile yazar.
// RCON düşerse normal chat'e döner; "/" ile başlayan komutlar hep normal chat'ten gider.
const CHAT_RENGI = process.env.CHAT_RENGI || 'blue'
const KONUSKAN = process.env.CHAT === '1'
function renkliChatKur(bot, ad) {
  // bot.chat eklentiyle sonradan gelir; login'de hazırdır (spawn'dan önce)
  bot.once('login', () => {
    const duzChat = bot.chat.bind(bot)
    bot.chat = (mesaj) => {
      console.log(`[${ad} der] ${mesaj}`) // tellraw sunucu loguna düşmez; ne dediği buradan izlenir
      if (mesaj.startsWith('/')) return duzChat(mesaj)
      if (!KONUSKAN) return // Sahibin isteği: köle chat'e yazmasın (CHAT=1 ile eski konuşkan hali)
      const json = JSON.stringify([{ text: `<${ad}> ${mesaj}`, color: CHAT_RENGI }])
      rconKomut(`tellraw @a ${json}`).catch(() => duzChat(mesaj))
    }
  })
}

function koleKur(ad, ruhDosyasi) {
  const bot = mineflayer.createBot({
    host: process.env.MC_HOST ?? '127.0.0.1',
    port: Number(process.env.MC_PORT ?? 25565),
    username: ad,
    version: process.env.MC_VERSION || false,
    auth: 'offline',
  })
  renkliChatKur(bot, ad)
  hareketKur(bot)
  toplamaKur(bot)
  korumaKur(bot)
  const ruh = ruhKur(ruhDosyasi)
  const kuyruk = kuyrukKur(bot, SAHIP, ruh)
  console.log(`[ruh ${ad}]`, ruh.ozet())
  // Vurulursa karşılık verir; iş yapıyorsa işi bekletip savaştan sonra devam eder
  // DOKUNULMAZ=1: ölmez, vurulunca dövüşe girip işi bırakmaz (sadece çekim için)
  if (DOKUNULMAZ) dokunulmazKur(bot)
  else nefsiMudafaaKur(bot, SAHIP)
  // Envanterine zırh düşünce en iyisini kendisi giyer
  otoZirhKur(bot)
  // Acıkınca kendi yer; korurken yediyse kılıcı geri alsın
  otoYemekKur(bot, async () => { if (bot.kole.simdiki?.ad === 'koru') await silahHazirla(bot).catch(() => {}) })

  bot.once('spawn', () => {
    console.log(`[${ad}] dünyaya geldi @ ${bot.entity.position.floored()}`)
    if (!YENIDEN) bot.chat('merhaba')
  })
  bot.on('kicked', (sebep) => console.log(`[${ad} atıldı]`, sebep))
  bot.on('error', (hata) => console.error(`[${ad} hata]`, hata.message))
  bot.on('end', () => console.log(`[${ad} bağlantı kapandı]`))
  return { ad, bot, kuyruk, ruh }
}

// İkinci bot biraz sonra girsin: aynı anda bağlanınca sunucu bazen birini atıyor
const ekip = [koleKur(ADLAR[0], 'data/ruh.json')]
if (ADLAR[1]) {
  await new Promise((r) => setTimeout(r, 3000))
  ekip.push(koleKur(ADLAR[1], `data/ruh-${ADLAR[1].toLowerCase()}.json`))
}
// Gemini sohbeti opsiyonel: sadece GEMINI_API_KEY varsa ve beyin.js duruyorsa yüklenir (dağıtım paketinde ikisi de yok)
const dusun = process.env.GEMINI_API_KEY
  ? await import('./beyin.js').then((m) => m.beyinKur(ekip, SAHIP)).catch((h) => (console.error('[beyin] yüklenemedi:', h.message), null))
  : null
console.log(dusun ? `[beyin] Gemini bağlı (${ekip.map((u) => u.ad).join(' + ')}, mesaj başına 1 çağrı)` : '[beyin] yapay zeka yok: sağ tık menüsü + sabit komutlar (dur, gel, koru)')

// Sağ tık menüsü: veri paketini kur, her köle menüden gelen işi yapar (Gemini'siz)
menuPaketiKur(ekip.map((u) => u.ad))
  .then((d) => console.log(`[menü] sağ tık menüsü hazır${d ? ' (paket yenilendi, /reload atıldı)' : ''}`))
  .catch((h) => console.error('[menü] paket kurulamadı:', h.message))
for (const u of ekip) menuDinle(u, ekip.map((e) => e.ad), SAHIP)

// Mesajda adı geçen köleler; kimse geçmiyorsa hepsi
const hedefler = (mesaj) => {
  const adiGecen = ekip.filter((u) => new RegExp(`\\b${u.ad}\\b`, 'i').test(mesaj))
  return adiGecen.length ? adiGecen : ekip
}
const adsiz = (mesaj) => ekip.reduce((m, u) => m.replace(new RegExp(`\\b${u.ad}\\b[,:]?`, 'gi'), ''), mesaj).trim()

// Yönetmen komutu: "durum" → asıl köle, "<ad> durum" → o köle
function yonet(satir) {
  const [ilk, ...kalan] = satir.trim().split(/\s+/)
  const u = ekip.find((e) => e.ad.toLowerCase() === ilk.toLowerCase())
  const hedef = u ?? ekip[0]
  const komut = u ? kalan.join(' ') : satir.trim()
  // Sessiz iş: "is zirhVer" / "is odunTopla {"miktar":5}" → Gemini'siz, chat'e cevapsız kuyruğa girer
  const is = komut.match(/^is\s+(\w+)\s*(\{.*\})?$/)
  if (is) {
    try {
      hedef.kuyruk.ekle(is[1], is[2] ? JSON.parse(is[2]) : {})
      console.log(`[yönetmen ${hedef.ad}] sessiz iş: ${is[1]}`)
    } catch (h) { console.log(`[yönetmen ${hedef.ad}] iş eklenemedi:`, h.message) }
    return
  }
  console.log(`[yönetmen ${hedef.ad}]`, hedef.ruh.yonet(komut || 'durum'))
}

// Efendinin mesajını sadece asıl köle dinler (iki bot iki kez duymasın)
ekip[0].bot.on('chat', async (oyuncu, mesaj) => {
  if (ekip.some((u) => u.bot.username === oyuncu)) return
  console.log(`<${oyuncu}> ${mesaj}`)
  if (oyuncu !== SAHIP) return
  // !durum, !is odunTopla ... : chat'ten yönetmen komutu (oyunda görünür; gizli için terminali kullan)
  if (mesaj.startsWith('!')) return yonet(mesaj.slice(1))
  // dur / gel / koru gibi bedava komutlar: adı geçenlere, ad yoksa hepsine
  const temiz = adsiz(mesaj) || mesaj
  let yakalandi = false
  for (const u of hedefler(mesaj)) {
    if (sabitKomut(u.kuyruk, u.bot, temiz, { yedekDahil: !dusun })) yakalandi = true
  }
  if (yakalandi) return
  if (dusun) await dusun(mesaj)
})

// Yönetmen: terminale yazılır, oyunda görünmez. Ör: mutlu, mutsuz, durum, "is odunTopla {\"miktar\":5}"
readline.createInterface({ input: process.stdin }).on('line', (satir) => {
  if (satir.trim()) yonet(satir)
})

// Hafıza bekçisi: yer altında yol arama (A*) milyonlarca düğüm açıp heap'i doldurabiliyor (4 GB'ta çöktü).
// Sınırı aşınca aramayı keser; iş "yol bulamadım" gibi düşer, bot ayakta kalır.
const BELLEK_SINIR = Number(process.env.BELLEK_SINIR_MB ?? 1500) * 1024 * 1024
let sonKesme = 0
setInterval(() => {
  const kullanilan = process.memoryUsage().heapUsed
  if (kullanilan < BELLEK_SINIR || Date.now() - sonKesme < 3000) return
  sonKesme = Date.now()
  console.log(`[bellek] ${Math.round(kullanilan / 1048576)} MB: yol aramayı kestim`)
  for (const { bot } of ekip) toplamaSifirla(bot)
  if (global.gc) setTimeout(() => global.gc(), 100) // bekçi --expose-gc ile açar
}, 500).unref()
