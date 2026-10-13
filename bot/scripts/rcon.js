// Sunucu konsoluna komut gönderir. Kullanıcı: node --env-file=.env scripts/rcon.js "time set day" "tp Kole 0 80 0"
import { Rcon } from 'rcon-client'

const rcon = await Rcon.connect({
  host: process.env.MC_HOST ?? '127.0.0.1',
  port: Number(process.env.RCON_PORT ?? 25575),
  password: process.env.RCON_PASSWORD,
})
for (const komut of process.argv.slice(2)) console.log(`> ${komut}\n${await rcon.send(komut)}`)
await rcon.end()
