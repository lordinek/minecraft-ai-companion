// Komut zincirini chat'siz, doğrudan dener. Kullanım: node --env-file=.env scripts/test-zincir.js
import mineflayer from 'mineflayer'
import { hareketKur } from '../src/hareket.js'
import { toplamaKur } from '../src/toplama.js'
import { kazmaHazirla, madenAra } from '../src/maden.js'
import { erit } from '../src/uretim.js'

const bot = mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: process.env.BOT_ADI, version: process.env.MC_VERSION, auth: 'offline' })
hareketKur(bot); toplamaKur(bot)
const t0 = Date.now()
const log = (...a) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s`, ...a)
const env = () => bot.inventory.items().map((i) => `${i.name}x${i.count}`).join(' ')
bot.on('chat', (o, m) => o === bot.username && log('chat:', m))
bot.on('death', () => log('ÖLDÜ'))
bot.on('kicked', (r) => log('ATILDI', JSON.stringify(r)))
setInterval(() => log('poz', bot.entity?.position.floored().toString(), '|', env()), 15000)
bot.once('spawn', async () => {
  await bot.waitForTicks(40)
  const adim = async (ad, f) => { const s = Date.now(); try { log('▶', ad, '→', await f(), `(${((Date.now() - s) / 1000).toFixed(0)}s)`) } catch (e) { log('✖', ad, e.message, e.stack.split('\n').slice(1, 3).join(' | ')); throw e } }
  try {
    await adim('taş kazma', () => kazmaHazirla(bot, 1, (m) => log('söyle:', m)))
    await adim('3 demir', () => madenAra(bot, 'demir', 3, (m) => log('söyle:', m), (n, t) => log('demir', n, t)))
    await adim('erit', () => erit(bot, 'raw_iron', 3, (n, t) => log('erit', n, t)))
    log('BİTTİ', env())
  } catch {}
  bot.quit(); process.exit()
})
