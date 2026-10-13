import fs from 'node:fs'

// Korunan alanlar: botların kendi yaptığı ev ve tarlalar. İçindeki bloğu ne malzeme için
// ne yol açmak için kırarlar (collectBlock hedefi seçerken de safeToBreak'e bakar).
const DOSYA = 'data/korunan.json'
let alanlar = []
try { alanlar = JSON.parse(fs.readFileSync(DOSYA, 'utf8')) } catch {}

const yaz = () => fs.writeFileSync(DOSYA, JSON.stringify(alanlar, null, 1))

// Aynı adla tekrar eklenirse (yarım ev, tamir) eskisinin yerine geçer
export function alanEkle(ad, min, max) {
  const a = {
    ad,
    min: { x: Math.min(min.x, max.x), y: Math.min(min.y, max.y), z: Math.min(min.z, max.z) },
    max: { x: Math.max(min.x, max.x), y: Math.max(min.y, max.y), z: Math.max(min.z, max.z) },
  }
  alanlar = alanlar.filter((b) => b.ad !== ad)
  alanlar.push(a)
  yaz()
  console.log(`[alan] korunuyor: ${ad} (${a.min.x},${a.min.y},${a.min.z} → ${a.max.x},${a.max.y},${a.max.z})`)
}

export function korunuyor(p) {
  return alanlar.some((a) => p.x >= a.min.x && p.x <= a.max.x && p.y >= a.min.y && p.y <= a.max.y &&
    p.z >= a.min.z && p.z <= a.max.z)
}

// Pathfinder hareket ayarına: korunan bloğu kırmak 100 = imkânsız
export function korumaUygula(m) {
  m.exclusionAreasBreak.push((b) => (korunuyor(b.position) ? 100 : 0))
}
