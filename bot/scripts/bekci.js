// Botu açar, çökerse (ör. heap dolması) 3 sn sonra sessizce yeniden açar.
// Kullanım (bot/ içinden): node scripts/bekci.js   — terminal satırları (yönetmen) bota geçer.
import { spawn } from 'node:child_process'

const ARGS = ['--max-old-space-size=4096', '--expose-gc', '--report-on-fatalerror', '--report-directory=logs', '--env-file=.env', 'src/index.js']
const PENCERE = 10 * 60_000 // 10 dakikada
const SINIR = 5 // 5'ten fazla çökerse bırak: kalıcı bir hata var demektir
let cokusler = []
let ilk = true

function ac() {
  const env = { ...process.env, BEKCI_YENIDEN: ilk && process.env.BEKCI_YENIDEN !== '1' ? '0' : '1' } // BEKCI_YENIDEN=1: ilk açılışta da merhabasız
  ilk = false
  const cocuk = spawn(process.execPath, ARGS, { stdio: ['pipe', 'inherit', 'inherit'], env })
  const aktar = (satir) => cocuk.stdin.write(satir)
  process.stdin.on('data', aktar)
  cocuk.on('exit', (kod, sinyal) => {
    process.stdin.off('data', aktar)
    if (kod === 0 || sinyal === 'SIGTERM' || sinyal === 'SIGINT') process.exit(0)
    const simdi = Date.now()
    cokusler = cokusler.filter((t) => simdi - t < PENCERE).concat(simdi)
    console.error(`[bekçi] bot çöktü (kod ${kod ?? sinyal}), ${cokusler.length}. kez`)
    if (cokusler.length > SINIR) { console.error('[bekçi] çok sık çöküyor, bırakıyorum'); process.exit(1) }
    setTimeout(ac, 3000)
  })
}
ac()
