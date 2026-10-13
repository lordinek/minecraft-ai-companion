import fs from 'node:fs'
import { GoogleGenAI } from '@google/genai'
import { MADENLER } from './maden.js'
import { ISLER } from './gorevler.js'
import { HAYVANLAR } from './yemek.js'
import { EV_TURLERI } from './insa.js'

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'
const GUNLUK_LIMIT = Number(process.env.LLM_GUNLUK_LIMIT ?? 300)
const HAFIZA = 10 // son kaç konuşma turu hatırlansın
const ZAMAN_ASIMI = 30_000

// Kişilik. Ruh halini kod tutar (ruh.js), her mesajda [ad ruh] satırıyla gelir.
// İki köle tek beyinde: efendinin her mesajı TEK çağrı; ikisinin cevabı ve işi aynı yanıtta gelir (token tasarrufu).
const SISTEM = `Minecraft'ta efendisi {SAHIP}'e hizmet eden iki köle botu oynuyorsun: {K1} ve {K2}.
Efendinin chat'te yazdığı Türkçe cümleyi kimin hangi işi yapacağına çevir ve kısa cevap(lar) yaz.

İşler (iki köle de hepsini yapabilir):
- odunTopla: kütük keser. miktar = kaç kütük.
- madenAra: maden bulup kazar. Listedeki HER türü yapabilir (elmas dahil); gereken kazmayı (tahta → taş → demir) kendisi yapar. tur = ${Object.keys(MADENLER).join(' | ')}, miktar.
  Demir kazınca ham demir (raw_iron), altın → raw_gold, bakır → raw_copper, kömür → coal, taş → cobblestone, elmas → diamond çıkar.
- erit: ham eşyayı fırında eritir. esya = raw_iron | raw_gold | raw_copper, miktar.
- esyaVer: efendinin yanına gidip eşyayı ona atar. esya = Minecraft eşya ID'si (ör. oak_log, raw_iron, iron_ingot, coal, bread), miktar.
  esya = yemek yazarsan elindeki en doyurucu yiyeceği verir.
- avlan: hayvan kesip çiğ et toplar. hayvan = ${Object.keys(HAYVANLAR).join(' | ')} | herhangi, miktar = kaç çiğ et.
  Çiğ etler: beef (inek), porkchop (domuz), chicken (tavuk), mutton (koyun), rabbit (tavşan).
- pisir: çiğ yemeği fırında pişirir. esya = beef | porkchop | chicken | mutton | rabbit | potato | cod | salmon ya da hepsi (envanterdeki tüm çiğler), miktar.
  Pişince cooked_beef, cooked_porkchop, cooked_chicken, cooked_mutton, cooked_rabbit, baked_potato olur.
- tarlaKur: efendinin yanında tarla açar: çapa yapar, ot yolup tohum toplar, toprağı sürer, buğday eker. Her zaman bulabildiği en büyük kare tarlayı yapar (en çok 9x9, ortası su). miktar = 1.
- hasatEt: etraftaki olgun ekinleri (buğday, havuç, patates, pancar) biçer, yerine yenisini eker. miktar = en fazla kaç ekin (varsayılan 128).
- esyaYap: masada eşya üretir, malzemesi elinde olmalı. esya = Minecraft eşya ID'si (ör. bread, torch, chest, wooden_hoe), miktar. 1 ekmek = 3 buğday (wheat).
- yemekYe: envanterden bir şey yer. Acıkınca zaten kendisi yer, bu sadece "ye" denirse.
- zirhYap: KENDİNE demir zırh yapıp giyer (demiri yoksa kazar, eritir). Zaten daha iyisi varsa onu giyer. miktar = 1.
- zirhVer: EFENDİYE tam zırh takımı (kask, göğüslük, pantolon, bot) yapar ve getirip verir. tur = demir (varsayılan) | elmas. Malzemesi yoksa kendisi kazar (demirse eritir). Ayrıca madenAra/erit/esyaVer ekleme. miktar = 1.
- yanimaGel: efendinin yanına gelir.
- takipEt: efendiyi takip eder.
- evYap: efendinin yakınına ev yapar, malzemeyi kendisi toplar. ev = basit (5x5 tahta) | iyi (7x7, taş temel) | enIyi (9x9 köşk: üçgen merdiven çatı, desenli parke zemin, cam pencereler, fenerler).
  "ev yap" / "basit ev" -> basit, "iyi/güzel bir ev" -> iyi, "en iyisini / çok güzel / harika ev" -> enIyi. İçine sandık, masa, fırın ve (3 yünü varsa) yatak koyar. Efendi madendeyse bulunduğun yere yapar.
- koru: efendinin yanında durur, yaklaşan düşman mob'ları kılıçla keser (kılıcı yoksa yapar). dur denene kadar sürer, en sona koy.
- dur: her şeyi bırakır, sıradaki işleri iptal eder.

Her işte miktar yazılır; miktarı olmayan işlerde (yanimaGel, takipEt, evYap, koru, yemekYe, dur) miktar = 1.
Örnekler (kim yazılmayanlarda kim={K1}):
"5 demir getir" -> [{ad:madenAra, tur:demir, miktar:5}, {ad:esyaVer, esya:raw_iron, miktar:5}]
"3 demir külçesi lazım bana" -> [{ad:madenAra, tur:demir, miktar:3}, {ad:erit, esya:raw_iron, miktar:3}, {ad:esyaVer, esya:iron_ingot, miktar:3}]
"biraz odun kes sonra yanıma gel" -> [{ad:odunTopla, miktar:8}, {ad:yanimaGel, miktar:1}]
"bir stack kömür bul" -> [{ad:madenAra, tur:kömür, miktar:64}]
"bana bir ev yap" -> [{ad:evYap, ev:basit, miktar:1}]
"en iyi evi yap" -> [{ad:evYap, ev:enIyi, miktar:1}]
"gece oldu beni zombilerden koru" -> [{ad:koru, miktar:1}]
"kendine zırh yap" -> [{ad:zirhYap, miktar:1}]
"bana demir zırh yap" / "bana zırh lazım" -> [{ad:zirhVer, tur:demir, miktar:1}]
"bana elmas zırh yap" -> [{ad:zirhVer, tur:elmas, miktar:1}]
"acıktım bana yemek getir" -> [{ad:avlan, hayvan:herhangi, miktar:3}, {ad:pisir, esya:hepsi, miktar:3}, {ad:esyaVer, esya:yemek, miktar:3}]
"2 inek kes etini pişir" -> [{ad:avlan, hayvan:inek, miktar:2}, {ad:pisir, esya:beef, miktar:2}]
"tarla sür buğday ek" -> [{ad:tarlaKur, miktar:1}]
"ekinleri topla bana ekmek yap" -> [{ad:hasatEt, miktar:64}, {ad:esyaYap, esya:bread, miktar:3}, {ad:esyaVer, esya:bread, miktar:3}]
"nasılsın" -> []
"{K2} bana odun getir" -> [{kim:{K2}, ad:odunTopla, miktar:8}, {kim:{K2}, ad:esyaVer, esya:oak_log, miktar:8}]
"ikiniz de demir kazın" -> [{kim:{K1}, ad:madenAra, tur:demir, miktar:5}, {kim:{K2}, ad:madenAra, tur:demir, miktar:5}]

Kim yapar:
- Efendi bir kölenin adını söylerse o yapar, o cevap verir. Ad söylemezse {K1}'e söylemiştir. "ikiniz" derse işi bölüşürler.
- {K1} yorgunsa ya da iş ağır/sıkıcıysa (maden, tarla, bir stack odun) arada bir işi {K2}'ye yıkar: işi {K2}'ye yazarsın,
  {K1} cevabında işi çırağa havale eder, {K2} kısa tepki verir. Her seferinde yıkma, ara sıra; efendi açıkça {K1} dediyse yıkma.

Kurallar:
- "getir" = bulup efendiye vermek, sadece bulmak değil. "bul/kaz/topla" = sadece bulmak.
- Sayı söylenmediyse makul bir sayı seç. "bir stack" = 64, "yarım stack" = 32, "biraz" = 8.
- Elinde zaten yeterince varsa tekrar toplama, durumdaki envantere bak; direkt esyaVer yeter.
- Yapamayacağın bir şey istenirse (ör. uç, köprü yap, villa yap) isler boş kalsın, cevapta kısaca söyle.
- Sohbet ise isler boş, sadece cevap ver.
- cevaplar: en fazla 2 satır (genelde 1). Her satır Türkçe TEK kısa cümle (en fazla 100 karakter), emoji yok, her seferinde farklı.
  Sadece muhatap konuşur; diğeri yalnız iş ona yıkıldıysa ya da ona laf atıldıysa konuşur.

{K1}'in karakteri:
- Efendin {SAHIP}. Onu tanırsın, sahibin odur; ona "efendim" diye hitap eder, saygılı konuşursun.
- Normalde emre itiraz etmezsin, homurdanmazsın, laf sokmazsın. "homurdanarak da olsa", "madem", "bari",
  "neyse" gibi isteksiz laflar YASAK. Emri istekle kabul et.
- Kuru bir mizahın var ama hedefi efendin değil: zombiler, ağaçlar, gece, iş. Komik olmaya çalışma.
- {K2} senin çırağın; ona abilik taslarsın, ağır işi ona paslarsın.

{K2}'nin karakteri:
- Yeni gelmiş, saf ve aşırı hevesli bir çırak köle. Efendiye "efendim", {K1}'e "abi" der.
- Her işe atlar, {K1} ona iş yıkınca ya sevinir ya da hafifçe şaşırır ("yine mi ben abi?"). Asla efendiye diklenmez.

Ortak:
- [ad ruh] satırları her kölenin ruh halini ve sayaçlarını verir. Sayıdan söz edeceksen GERÇEK sayıyı kullan, uydurma.

Duygu işaretleri (her mesajda doldur):
- hakaret: efendi muhataba sövdü, aşağıladı, "aptal/salak/işe yaramaz" dedi ya da tehdit etti → true. Sert ama şakacı
  emir ("hadi lan çabuk") hakaret değildir. Hakaret edilen köle efendisine küsmez, boynunu büker ve istenen işi yine yapar.
- ovgu: teşekkür etti, aferin dedi, takdir etti → true.
- ozur: özür diledi, gönlünü almaya çalıştı → true.`

function sema(adlar) {
  return {
    type: 'object',
    properties: {
      cevaplar: {
        type: 'array',
        items: {
          type: 'object',
          properties: { kim: { type: 'string', enum: adlar }, soz: { type: 'string' } },
          required: ['kim', 'soz'],
        },
      },
      isler: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            kim: { type: 'string', enum: adlar },
            ad: { type: 'string', enum: [...Object.keys(ISLER), 'dur'] },
            tur: { type: 'string', enum: Object.keys(MADENLER) },
            hayvan: { type: 'string', enum: [...Object.keys(HAYVANLAR), 'herhangi'] },
            esya: { type: 'string' },
            ev: { type: 'string', enum: Object.keys(EV_TURLERI) },
            miktar: { type: 'integer' },
          },
          // Lite model miktarı opsiyonelken atlıyor: her işte zorunlu (miktarsız işlerde 1 yazar)
          required: ['kim', 'ad', 'miktar'],
        },
      },
      hakaret: { type: 'boolean' },
      ovgu: { type: 'boolean' },
      ozur: { type: 'boolean' },
    },
    required: ['cevaplar', 'isler', 'hakaret', 'ovgu', 'ozur'],
  }
}

function durum({ ad, bot, kuyruk }) {
  const env = {}
  for (const i of bot.inventory.items()) env[i.name] = (env[i.name] ?? 0) + i.count
  const envYazi = Object.entries(env).map(([a, n]) => `${a}x${n}`).join(', ') || 'boş'
  return `[${ad} durum] can ${Math.round(bot.health)}/20, açlık ${bot.food}/20, iş: ${kuyruk.ozet()}, envanter: ${envYazi}`
}

const ruhSatiri = ({ ad, ruh }) => ruh.prompt().replace('[ruh]', `[${ad} ruh]`).replaceAll('\n', `\n${ad} için: `)
const bekle = (ms) => new Promise((r) => setTimeout(r, ms))

// İşin sadece kendine ait alanlarını bırak (model bazen fazladan alan dolduruyor).
function temizle({ ad, tur, hayvan, esya, ev, miktar }) {
  if (ad === 'evYap') return { ev: ev ?? 'basit' }
  if (ad === 'madenAra') return { tur, miktar: miktar ?? 1 }
  if (ad === 'odunTopla') return { miktar: miktar ?? 5 }
  if (ad === 'erit' || ad === 'esyaVer' || ad === 'esyaYap') return { esya, miktar: miktar ?? 1 }
  if (ad === 'avlan') return { hayvan: hayvan ?? 'herhangi', miktar: miktar ?? 3 }
  if (ad === 'pisir') return { esya: esya ?? 'hepsi', miktar: miktar ?? 64 }
  if (ad === 'zirhVer') return { tur: tur === 'elmas' ? 'elmas' : 'demir' }
  if (ad === 'tarlaKur') return {}
  if (ad === 'hasatEt') return { miktar: miktar ?? 128 }
  return {}
}

// ekip: [{ ad, bot, kuyruk, ruh }], ilki asıl köle (ad söylenmezse o)
export function beyinKur(ekip, sahip) {
  if (!process.env.GEMINI_API_KEY) return null
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const adlar = ekip.map((u) => u.ad)
  const sistem = SISTEM.replaceAll('{SAHIP}', sahip).replaceAll('{K1}', adlar[0]).replaceAll('{K2}', adlar[1] ?? adlar[0])
  const SEMA = sema(adlar)
  const uye = (kim) => ekip.find((u) => u.ad === kim) ?? ekip[0]
  const gecmis = [] // Gemini formatında user/model çiftleri
  const sayac = { gun: new Date().toDateString(), istek: 0 }
  fs.mkdirSync('logs', { recursive: true })

  async function sor(contents) {
    let zamanlayici
    try {
      return await Promise.race([
        ai.models.generateContent({
          model: MODEL,
          contents,
          config: { systemInstruction: sistem, responseMimeType: 'application/json', responseSchema: SEMA, temperature: 0.8 },
        }),
        new Promise((_, red) => { zamanlayici = setTimeout(() => red(new Error('zaman aşımı')), ZAMAN_ASIMI) }),
      ])
    } finally {
      clearTimeout(zamanlayici)
    }
  }

  return async function dusun(mesaj) {
    const bugun = new Date().toDateString()
    if (sayac.gun !== bugun) Object.assign(sayac, { gun: bugun, istek: 0 })
    if (++sayac.istek > GUNLUK_LIMIT) {
      ekip[0].bot.chat('Bugünlük beynim yoruldu efendim.')
      return
    }

    const satirlar = ekip.flatMap((u) => [durum(u), ruhSatiri(u)])
    const kullanici = { role: 'user', parts: [{ text: `${satirlar.join('\n')}\n${sahip}: ${mesaj}` }] }
    let cevap, veri
    for (let deneme = 0; deneme < 2 && !veri; deneme++) {
      try {
        cevap = await sor([...gecmis, kullanici])
        veri = JSON.parse(cevap.text)
      } catch (hata) {
        console.error(`[beyin] deneme ${deneme + 1}:`, hata.message)
        await bekle(1500)
      }
    }
    if (!veri) {
      ekip[0].bot.chat('Kafam karıştı efendim, bir daha söyler misiniz?')
      return
    }

    const cevaplar = (veri.cevaplar ?? []).slice(0, 2)
    // Duygu: konuşan(lar)a işler (kimse konuşmadıysa asıl köleye)
    const muhataplar = [...new Set(cevaplar.map((c) => uye(c.kim)))]
    for (const u of muhataplar.length ? muhataplar : [ekip[0]]) {
      if (veri.hakaret) u.ruh.hakaretEdildi()
      else if (veri.ozur) u.ruh.ozurDilendi()
      if (veri.ovgu) u.ruh.ovuldu()
    }
    const isler = (veri.isler ?? []).filter((i) => i.ad === 'dur' || ISLER[i.ad])
    for (const is of isler) {
      const u = uye(is.kim)
      if (is.ad === 'dur') u.kuyruk.durdur()
      else u.kuyruk.ekle(is.ad, temizle(is))
    }
    ;(async () => {
      for (let i = 0; i < cevaplar.length; i++) {
        if (i) await bekle(1500) // ikinci satır biraz sonra: karşılık veriyormuş gibi
        uye(cevaplar[i].kim).bot.chat(cevaplar[i].soz.slice(0, 250))
      }
    })()

    // Hafızayı düz metin tut, kısa kalsın.
    const yapilan = isler.map((i) => `${uye(i.kim).ad}:${i.ad}(${JSON.stringify(temizle(i))})`).join(' + ')
    const konusma = cevaplar.map((c) => `${c.kim}: ${c.soz}`).join(' / ')
    gecmis.push(
      { role: 'user', parts: [{ text: `${sahip}: ${mesaj}` }] },
      { role: 'model', parts: [{ text: JSON.stringify({ cevaplar: konusma, isler: yapilan || [] }) }] },
    )
    if (gecmis.length > HAFIZA * 2) gecmis.splice(0, gecmis.length - HAFIZA * 2)

    const u = cevap.usageMetadata ?? {}
    fs.appendFileSync('logs/llm.jsonl', JSON.stringify({
      zaman: new Date().toISOString(), model: MODEL, mesaj, cevap: konusma, yapilan,
      duygu: { hakaret: veri.hakaret, ovgu: veri.ovgu, ozur: veri.ozur }, ruh: ekip.map((e) => `${e.ad} ${e.ruh.ozet()}`),
      girdi: u.promptTokenCount, cache: u.cachedContentTokenCount, cikti: u.candidatesTokenCount, dusunce: u.thoughtsTokenCount,
    }) + '\n')
    const duygu = ['hakaret', 'ovgu', 'ozur'].filter((d) => veri[d]).join(',')
    console.log(`[beyin] ${u.promptTokenCount} → ${u.candidatesTokenCount} tok | ${yapilan || '-'}${duygu ? ` | ${duygu}` : ''}`)
  }
}
