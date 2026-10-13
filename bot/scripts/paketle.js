// Dağıtım paketi: ../../cikti/KoleBot klasörünü ve KoleBot.zip'i üretir.
// Kullanım (bot/ içinden): node scripts/paketle.js
// İçerik: dagitim/ şablonları + Fabric başlatıcısı (Minecraft sunucusunu ilk açılışta Mojang'dan kendisi indirir)
// + /kole komut modu + bot kodu (yapay zekasız: beyin.js ve Gemini yok) ve sadece 26.1 verisi bırakılmış node_modules. Java/Node paketlenmez, BASLAT ilk açılışta bulur/indirir.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const BOT = path.resolve(import.meta.dirname, '..')
const KOK = path.resolve(BOT, '..')
const CIKTI = path.join(KOK, 'cikti')
const PAKET = path.join(CIKTI, 'KoleBot')
const SURUM = '26.1'

fs.rmSync(CIKTI, { recursive: true, force: true })
fs.mkdirSync(PAKET, { recursive: true })

// Şablonlar: Windows satır sonu; .ps1 BOM'lu (Windows PowerShell 5.1 BOM'suz dosyayı ANSI okuyor, Türkçe bozuluyor)
function sablonKopyala(kaynak, hedef) {
  for (const ad of fs.readdirSync(kaynak)) {
    const k = path.join(kaynak, ad)
    const h = path.join(hedef, ad)
    if (fs.statSync(k).isDirectory()) { fs.mkdirSync(h, { recursive: true }); sablonKopyala(k, h); continue }
    let metin = fs.readFileSync(k, 'utf8').replace(/\r?\n/g, '\r\n')
    if (/\.(ps1|txt)$/.test(ad)) metin = '\uFEFF' + metin
    fs.writeFileSync(h, metin)
  }
}
sablonKopyala(path.join(KOK, 'dagitim'), PAKET)
fs.copyFileSync(path.join(KOK, 'server', 'fabric-server.jar'), path.join(PAKET, 'server', 'fabric-server.jar'))
// /kole cagir komutu (mod/derle.sh ile derlenir)
fs.mkdirSync(path.join(PAKET, 'server', 'mods'), { recursive: true })
fs.copyFileSync(path.join(KOK, 'mod', 'kole-komut.jar'), path.join(PAKET, 'server', 'mods', 'kole-komut.jar'))

const pbot = path.join(PAKET, 'bot')
// Saf bot: Gemini sohbeti pakete girmez (index.js beyin.js'i sadece key varsa yükler)
fs.cpSync(path.join(BOT, 'src'), path.join(pbot, 'src'), { recursive: true, filter: (k) => path.basename(k) !== 'beyin.js' })
fs.mkdirSync(path.join(pbot, 'scripts'), { recursive: true })
for (const s of ['bekci.js', 'rcon.js']) fs.copyFileSync(path.join(BOT, 'scripts', s), path.join(pbot, 'scripts', s))
fs.mkdirSync(path.join(pbot, 'data'), { recursive: true })
fs.copyFileSync(path.join(BOT, 'data', 'ikonlar.json'), path.join(pbot, 'data', 'ikonlar.json'))
fs.copyFileSync(path.join(BOT, 'package-lock.json'), path.join(pbot, 'package-lock.json'))
const pj = JSON.parse(fs.readFileSync(path.join(BOT, 'package.json'), 'utf8'))
delete pj.dependencies['@google/genai']
fs.writeFileSync(path.join(pbot, 'package.json'), JSON.stringify(pj, null, 2) + '\n')

// Lock'ta genai duruyor: ci değil install (lock'u pakete göre budar)
console.log('[paketle] npm install --omit=dev ...')
execFileSync('npm install --omit=dev --no-audit --no-fund', { cwd: pbot, stdio: 'inherit', shell: true })

// minecraft-data: sadece 26.1'in okuduğu klasörler kalsın (veriler tembel yükleniyor, ~430 MB → birkaç MB)
const md = path.join(pbot, 'node_modules', 'minecraft-data', 'minecraft-data', 'data')
const yollar = JSON.parse(fs.readFileSync(path.join(md, 'dataPaths.json'), 'utf8'))
const lazim = new Set(['common', ...Object.values(yollar.pc[SURUM]).map((p) => p.replace(/^pc\//, ''))])
for (const ad of fs.readdirSync(path.join(md, 'pc'))) if (!lazim.has(ad)) fs.rmSync(path.join(md, 'pc', ad), { recursive: true })
// bedrock/common her sürümde okunuyor (supportsFeature), gerisi gereksiz
for (const ad of fs.readdirSync(path.join(md, 'bedrock'))) if (ad !== 'common') fs.rmSync(path.join(md, 'bedrock', ad), { recursive: true })
console.log(`[paketle] minecraft-data: tutulan pc/ klasörleri: ${[...lazim].join(', ')}`)

const zip = path.join(CIKTI, 'KoleBot.zip')
execFileSync('C:\\Windows\\System32\\tar.exe', ['-a', '-c', '-f', zip, '-C', CIKTI, 'KoleBot'], { stdio: 'inherit' })
console.log(`[paketle] hazır: ${zip} (${(fs.statSync(zip).size / 1048576).toFixed(1)} MB)`)
