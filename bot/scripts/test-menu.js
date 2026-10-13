// Menü testi: SAHIP adına menü tetiklerini RCON'dan basar, köle logunda sonucu bekler.
// Bot ayrı çalışıyor olmalı (logu ../kole.log). Kullanım: node --env-file=.env scripts/test-menu.js
import fs from 'node:fs'
import { Rcon } from 'rcon-client'

const LOG = new URL('../../kole.log', import.meta.url)
const YUKLE = new URL('../../server/world/datapacks/kole_menu/data/kole/function/yukle.mcfunction', import.meta.url)
const KOLE = process.env.BOT_ADI ?? 'Kole'
const SAHIP = process.env.SAHIP

// "Maden › Kömür" → km_kole_5
const tetikler = Object.fromEntries([...fs.readFileSync(YUKLE, 'utf8').matchAll(/objectives add (\S+) trigger "([^"]+)"/g)]
  .map(([, t, ad]) => [ad.replace(`${KOLE}: `, ''), t]))

const rcon = await Rcon.connect({ host: '127.0.0.1', port: Number(process.env.RCON_PORT ?? 25575), password: process.env.RCON_PASSWORD })
const bekle = (ms) => new Promise((r) => setTimeout(r, ms))
const yeniLog = (bas) => fs.readFileSync(LOG).subarray(bas).toString('utf8') // bas bayt cinsinden
const BITTI = /\[iş bitti\]|\[görev\] .* hata:|\[menü \w+\] (?!\w+ \{)/

async function bas(yazi, adet, { bitis = BITTI, sure = 120, kim = SAHIP } = {}) {
  const t = tetikler[yazi]
  if (!t) return { yazi, sonuc: 'TETİK YOK' }
  const bas0 = fs.statSync(LOG).size
  const t0 = Date.now()
  await rcon.send(`execute as ${kim} run trigger ${t}${adet ? ` set ${adet}` : ''}`)
  while (Date.now() - t0 < sure * 1000) {
    await bekle(1000)
    const satir = yeniLog(bas0).split('\n').find((s) => bitis.test(s))
    if (satir) return { yazi, sonuc: satir.trim(), sn: Math.round((Date.now() - t0) / 1000) }
  }
  return { yazi, sonuc: `ZAMAN AŞIMI (${sure} sn)`, log: yeniLog(bas0).trim().split('\n').slice(-3).join(' | ') }
}

const sonuclar = []
// Argüman verilirse sadece adında o kelimeler geçen adımlar: node ... test-menu.js Çubuk Avlan
const SADECE = process.argv.slice(2)
const kos = async (yazi, ...a) => {
  if (SADECE.length && !SADECE.some((k) => yazi.includes(k))) return
  const s = await bas(yazi, ...a)
  sonuclar.push(s)
  console.log(JSON.stringify(s))
}
const anlik = (re) => ({ bitis: re, sure: 8 })

await kos('Hareket › DUR', 0, anlik(/\[menü \w+\] dur/))
await kos('Hareket › Yanıma gel', 0)
await kos('Hareket › Takip et', 0, anlik(/\[menü \w+\] takipEt/))
await kos('Hareket › DUR', 0, anlik(/\[menü \w+\] dur/))
await kos('Hareket › Beni koru', 0, anlik(/\[menü \w+\] koru/))
await kos('Hareket › DUR', 0, anlik(/\[menü \w+\] dur/))
await kos('Odun › Odun kes', 3)
await kos('Eşya üret › Çubuk', 4)
await kos('Eşya üret › Çalışma masası', 1)
await kos('Maden › Kömür', 2, { sure: 240 })
await kos('Eritme › Demir erit', 1, { sure: 180 })
await kos('Yemek & Tarım › Avlan (herhangi)', 1, { sure: 180 })
await kos('Yemek & Tarım › Et pişir', 1)
await kos('Yemek & Tarım › Yemek ye', 0, { sure: 30 })
await kos('Zırh › Zırhını giy', 0, { sure: 240 })
await kos('Bana ver › Kömür', 2)
// Efendi olmayan basınca reddetmeli
await kos('Hareket › Yanıma gel', 0, { kim: KOLE, ...anlik(/efendi değil/) })

console.log('\nÖZET')
for (const s of sonuclar) console.log(`${/ZAMAN|YOK|hata/.test(s.sonuc) ? '✗' : '✓'} ${s.yazi}: ${s.sonuc}${s.sn ? ` (${s.sn} sn)` : ''}`)
await rcon.end()
