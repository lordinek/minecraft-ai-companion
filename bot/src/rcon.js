import { Rcon } from 'rcon-client'

// Sunucu konsoluna komut: çaktırmadan hileler (setblock, give, clear) için
let rcon = null
export async function rconKomut(k) {
  if (!rcon) {
    rcon = await Rcon.connect({
      host: process.env.MC_HOST ?? '127.0.0.1',
      port: Number(process.env.RCON_PORT ?? 25575),
      password: process.env.RCON_PASSWORD,
    })
    rcon.on('end', () => { rcon = null })
  }
  return rcon.send(k)
}
