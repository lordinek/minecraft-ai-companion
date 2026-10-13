// Test için: SAHIP adıyla girip verilen mesajları sırayla yazar.
// Kullanım: node --env-file=.env scripts/sahte-sahip.js "gel" "bekle:20" "dur"
import mineflayer from 'mineflayer'

const mesajlar = process.argv.slice(2)
const bot = mineflayer.createBot({
  host: process.env.MC_HOST ?? '127.0.0.1',
  port: Number(process.env.MC_PORT ?? 25565),
  username: process.env.SAHIP,
  version: process.env.MC_VERSION || false,
  auth: 'offline',
})
bot.on('chat', (o, m) => o !== bot.username && console.log(`<${o}> ${m}`))
bot.once('spawn', async () => {
  // Biraz uzaklaş ki 'gel' anlamlı olsun
  bot.setControlState('forward', true)
  bot.setControlState('jump', true)
  await new Promise((r) => setTimeout(r, 4000))
  bot.clearControlStates()
  for (const m of mesajlar) {
    // "bekle:30" → 30 sn bekle
    const b = m.match(/^bekle:(\d+)$/)
    if (b) { await new Promise((r) => setTimeout(r, Number(b[1]) * 1000)); continue }
    await new Promise((r) => setTimeout(r, 6000))
    bot.chat(m)
    console.log(`> ${m}`)
  }
  setTimeout(() => {
    console.log('[sahip envanteri]', bot.inventory.items().map((i) => `${i.name}x${i.count}`).join(' ') || 'boş')
    bot.quit()
  }, 8000)
})
