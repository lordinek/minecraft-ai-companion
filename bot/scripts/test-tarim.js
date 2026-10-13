// Aşama 9 testi: tarla, hasat, ekmek, avlanma, pişirme, yemek. Kullanım: node --env-file=.env scripts/test-tarim.js
import mineflayer from 'mineflayer'
import { Rcon } from 'rcon-client'
import { hareketKur } from '../src/hareket.js'
import { toplamaKur, say } from '../src/toplama.js'
import { korumaKur } from '../src/koruma.js'
import { tarlaKur, hasatEt } from '../src/tarim.js'
import { avlan, pisir, ye } from '../src/yemek.js'
import { uret } from '../src/uretim.js'

const rcon = await Rcon.connect({ host: '127.0.0.1', port: Number(process.env.RCON_PORT), password: process.env.RCON_PASSWORD })
const k = async (c) => { const r = await rcon.send(c); log('rcon', c, '→', r.slice(0, 120)) }
const bot = mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: process.env.BOT_ADI, version: process.env.MC_VERSION, auth: 'offline' })
hareketKur(bot); toplamaKur(bot); korumaKur(bot)
bot.kole = { iptal: false }
const t0 = Date.now()
const log = (...a) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s`, ...a)
const env = () => bot.inventory.items().map((i) => `${i.name}x${i.count}`).join(' ')
bot.on('chat', (o, m) => o === bot.username && log('chat:', m))
bot.on('death', () => log('ÖLDÜ'))
bot.once('spawn', async () => {
  await bot.waitForTicks(40)
  await k('clear Kole'); await bot.waitForTicks(20); await k('time set day'); await k('effect give Kole minecraft:resistance 600 4 true')
  await k('gamerule doDaylightCycle false').catch(() => {})
  const adim = async (ad, f) => { const s = Date.now(); try { log('▶', ad, '→', await f(), `(${((Date.now() - s) / 1000).toFixed(0)}s)`) } catch (e) { log('✖', ad, e.message, e.stack.split('\n').slice(1, 3).join(' | ')) } }
  const soyle = (m) => log('söyle:', m)
  await adim('tarla 9', () => tarlaKur(bot, 'yok', 9, soyle))
  await k('gamerule randomTickSpeed 1000'); await k('gamerule minecraft:random_tick_speed 1000')
  await new Promise((r) => setTimeout(r, 15000))
  await adim('hasat', () => hasatEt(bot, 64))
  await k('gamerule randomTickSpeed 3'); await k('gamerule minecraft:random_tick_speed 3')
  log('buğday', say(bot, (a) => a === 'wheat'))
  await adim('ekmek', () => uret(bot, 'bread', Math.floor(say(bot, (a) => a === 'wheat') / 3)))
  if (process.argv[2] === 'tarla') { log('BİTTİ', env()); await rcon.end(); bot.quit(); process.exit() }
  const p = bot.entity.position.floored()
  for (let i = 0; i < 3; i++) await k(`summon cow ${p.x + 4 + i} ${p.y} ${p.z + 3}`)
  await adim('avlan inek 2', () => avlan(bot, 'inek', 2, soyle))
  await adim('pişir', () => pisir(bot, 'hepsi'))
  await k('effect give Kole minecraft:hunger 20 80 true')
  await new Promise((r) => setTimeout(r, 6000))
  await k('effect clear Kole minecraft:hunger')
  log('açlık', bot.food)
  await adim('ye', () => ye(bot, true))
  log('açlık sonra', bot.food)
  log('BİTTİ', env())
  await rcon.end(); bot.quit(); process.exit()
})
