import { MADENLER } from './maden.js'

const MADEN_RE = new RegExp(`(\\d+)?\\s*(${Object.keys(MADENLER).join('|')})`, 'i')
const sayi = (mesaj, varsayilan) => Number(mesaj.match(/(\d+)/)?.[1] ?? varsayilan)

// "dur" her modda çalışır (güvenlik). Kısa ve içinde dur/yeter geçen her mesaj.
const DUR_RE = /^(\S+\s+){0,2}(dur|yeter|stop|bekle)(\s+\S+){0,2}$/i
const kisa = (m) => m.split(/\s+/).length <= 4

// LLM'e gitmeden yakalanan sabit komutlar (bedava).
const SABIT = [
  { re: /^(koru|koru beni|beni koru)$/i, calis: (k) => { k.durdur(); k.ekle('koru') } },
  { re: /^(takip et|peşimden gel|beni takip et)$/i, calis: (k) => { k.durdur(); k.ekle('takipEt') } },
  {
    re: /^(gel|buraya gel|yanıma gel|gel buraya|gel yanıma)( bak[ıi]y?[ıi]m| hadi)?$/i,
    calis: (k, bot) => { k.durdur(); bot.chat('Geliyorum.'); k.ekle('yanimaGel') },
  },
]

// API key yokken test için. Key varsa bu cümleleri beyin anlıyor.
const YEDEK = [
  { re: /(odun|kütük)/i, calis: (k, bot, m) => k.ekle('odunTopla', { miktar: sayi(m, 5) }) },
  { re: /demir(i)? erit/i, calis: (k, bot, m) => k.ekle('erit', { esya: 'raw_iron', miktar: sayi(m, 1) }) },
  {
    re: MADEN_RE,
    calis: (k, bot, m) => {
      const [, n, tur] = m.match(MADEN_RE)
      bot.chat(`${n ?? 1} ${tur} arıyorum.`)
      k.ekle('madenAra', { tur: tur.toLowerCase(), miktar: Number(n ?? 1) })
    },
  },
]

export function sabitKomut(kuyruk, bot, mesaj, { yedekDahil }) {
  const m = mesaj.trim()
  if (kisa(m) && DUR_RE.test(m)) {
    kuyruk.durdur()
    bot.chat('Durdum.')
    return true
  }
  const k = SABIT.find((k) => k.re.test(m)) ?? (yedekDahil ? YEDEK.find((k) => k.re.test(m)) : null)
  if (!k) return false
  k.calis(kuyruk, bot, m)
  return true
}
