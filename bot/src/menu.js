import fs from 'node:fs'
import path from 'node:path'
import { MADENLER } from './maden.js'
import { HAYVANLAR } from './yemek.js'
import { rconKomut } from './rcon.js'

// Sağ tık menüsü (Gemini'siz): botun üstünde görünmez bir "interaction" varlığı durur. Efendi sağ tıklayınca
// veri paketi oyunun kendi dialog penceresini açar. Butonlar /trigger çalıştırır (imzasız komut: istemci
// sohbete kopyalamadan direkt yollar). Tik fonksiyonu tetiği görünce köleye gizli tellraw atar:
//   "KMENU <işNo> <adet> <oyuncu>"  →  kuyruk.ekle(iş, girdi)
// "Geri" butonları da tetik (km_<köle>_g): 1 = ana menü, 2+k = k. kategori.
// Ana menünün üstündeki durum/envanter satırlarını köle 2 sn'de bir storage'a yazar (kole:durum), menü
// fonksiyonu makroyla okur. Mod gerekmez: paketi bot açılışta dünya klasörüne yazar, değiştiyse /reload atar.

const SUNUCU = process.env.SUNUCU_DIZINI ?? path.resolve(import.meta.dirname, '../../server')
const PAKET = 'kole_menu'

// İstemcideki ikon dokuları (26.1 client jar'dan çıkarıldı): item/<ad> → items atlası, block/<ad> → blocks atlası
const IKONLAR = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../data/ikonlar.json'), 'utf8'))
const ITEM = new Set(IKONLAR.item)
const BLOK = new Set(IKONLAR.block)
function ikon(ad) {
  if (!ad) return null
  const sprite = ad.includes('/') ? ad
    : ITEM.has(ad) ? `item/${ad}`
      : ['', '_front', '_side', '_top'].map((s) => `block/${ad}${s}`).find((b) => BLOK.has(b.slice(6)))
  if (!sprite) return null
  const [tur, dosya] = sprite.split('/')
  if (!(tur === 'item' ? ITEM : BLOK).has(dosya)) return null
  return { object: 'atlas', atlas: tur === 'item' ? 'minecraft:items' : 'minecraft:blocks', sprite }
}
const metin = (text, renk, ek = {}) => ({ text, ...(renk ? { color: renk } : {}), ...ek })
const etiket = (ikonAd, yazi, renk, ek) => {
  const i = ikon(ikonAd)
  return i ? [i, metin(` ${yazi}`, renk, ek)] : metin(yazi, renk, ek)
}

const MADEN_IKON = { kömür: 'coal', taş: 'cobblestone', demir: 'raw_iron', bakır: 'raw_copper', lapis: 'lapis_lazuli', altın: 'raw_gold', kızıltaş: 'redstone', elmas: 'diamond' }
const HAYVAN_IKON = { inek: 'beef', domuz: 'porkchop', tavuk: 'chicken', koyun: 'mutton', tavşan: 'rabbit' }
const buyuk = (s) => s[0].toLocaleUpperCase('tr') + s.slice(1)

// Kategoriler → işler. adet: [en az, en çok, ilk] varsa kaydırıcı açılır, yoksa basınca direkt yapar.
// ikon: menüde görünen doku; esya: adet penceresinde büyük gösterilen eşya (gerçek item id)
function kategoriler() {
  const is = (yazi, ad, girdi = {}, adet, ikonAd, esya) => ({ yazi, ad, girdi, adet, ikon: ikonAd, esya })
  return [
    { baslik: 'Hareket', ikon: 'leather_boots', renk: 'aqua', ipucu: 'Gel, takip et, koru', isler: [
      is('Yanıma gel', 'yanimaGel', {}, null, 'compass_00'), is('Takip et', 'takipEt', {}, null, 'lead'),
      is('Beni koru', 'koru', {}, null, 'iron_sword'), is('DUR', 'dur', {}, null, 'barrier'),
    ] },
    { baslik: 'Maden', ikon: 'iron_pickaxe', renk: '#9ad0ff', ipucu: 'Cevher kazar', isler: Object.keys(MADENLER).map((tur) =>
      is(buyuk(tur), 'madenAra', { tur }, tur === 'elmas' ? [1, 32, 3] : [1, 64, 8], MADEN_IKON[tur], MADEN_IKON[tur])) },
    { baslik: 'Odun', ikon: 'oak_log', renk: '#c8a165', ipucu: 'Ağaç keser', isler: [is('Odun kes', 'odunTopla', {}, [1, 64, 16], 'oak_log', 'oak_log')] },
    { baslik: 'Yemek & Tarım', ikon: 'cooked_beef', renk: '#ff9c6b', ipucu: 'Avlan, pişir, ek, biç', isler: [
      is('Avlan (herhangi)', 'avlan', { hayvan: 'herhangi' }, [1, 16, 3], 'iron_sword', 'beef'),
      ...Object.keys(HAYVANLAR).map((h) => is(`Avlan: ${h}`, 'avlan', { hayvan: h }, [1, 16, 3], HAYVAN_IKON[h], HAYVAN_IKON[h])),
      is('Et pişir', 'pisir', {}, [1, 64, 16], 'cooked_beef', 'cooked_beef'), is('Yemek ye', 'yemekYe', {}, null, 'bread'),
      is('Tarla kur', 'tarlaKur', {}, null, 'iron_hoe'), is('Hasat et', 'hasatEt', {}, [1, 256, 128], 'wheat', 'wheat'),
    ] },
    { baslik: 'Eritme', ikon: 'furnace', renk: 'gold', ipucu: 'Fırında külçe yapar', isler: [
      is('Demir erit', 'erit', { esya: 'raw_iron' }, [1, 64, 8], 'iron_ingot', 'iron_ingot'),
      is('Altın erit', 'erit', { esya: 'raw_gold' }, [1, 64, 8], 'gold_ingot', 'gold_ingot'),
      is('Bakır erit', 'erit', { esya: 'raw_copper' }, [1, 64, 8], 'copper_ingot', 'copper_ingot'),
    ] },
    { baslik: 'Eşya üret', ikon: 'crafting_table', renk: '#d6d6d6', ipucu: 'Masada üretir', isler: [
      ['Çalışma masası', 'crafting_table'], ['Fırın', 'furnace'], ['Sandık', 'chest'], ['Meşale', 'torch'],
      ['Çubuk', 'stick'], ['Tahta', 'oak_planks'], ['Taş kazma', 'stone_pickaxe'], ['Demir kazma', 'iron_pickaxe'],
      ['Demir kılıç', 'iron_sword'], ['Demir balta', 'iron_axe'], ['Kova', 'bucket'], ['Kalkan', 'shield'], ['Ekmek', 'bread'],
    ].map(([e, esya]) => is(e, 'esyaYap', { esya }, [1, 64, 1], esya === 'chest' ? 'oak_planks' : esya, esya)) },
    { baslik: 'Bana ver', ikon: 'bundle', renk: 'yellow', ipucu: 'Envanterinden sana atar', isler: [
      ['Kütük', 'oak_log'], ['Tahta', 'oak_planks'], ['Taş', 'cobblestone'], ['Kömür', 'coal'], ['Ham demir', 'raw_iron'],
      ['Demir külçe', 'iron_ingot'], ['Altın külçe', 'gold_ingot'], ['Elmas', 'diamond'], ['Yemek', 'yemek'], ['Buğday', 'wheat'],
    ].map(([e, esya]) => is(e, 'esyaVer', { esya }, [1, 64, 16], esya === 'yemek' ? 'bread' : esya, esya === 'yemek' ? 'bread' : esya)) },
    { baslik: 'İnşaat', ikon: 'bricks', renk: '#e07a5f', ipucu: 'Yanına ev diker', isler: [
      is('Basit ev', 'evYap', { ev: 'basit' }, null, 'oak_planks'), is('İyi ev', 'evYap', { ev: 'iyi' }, null, 'cobblestone'),
    ] },
    { baslik: 'Zırh', ikon: 'iron_chestplate', renk: '#a0c4ff', ipucu: 'Kendine giyer ya da sana yapar', isler: [
      is('Zırhını giy', 'zirhYap', {}, null, 'iron_helmet'), is('Bana demir zırh', 'zirhVer', { tur: 'demir' }, null, 'iron_chestplate'),
      is('Bana elmas zırh', 'zirhVer', { tur: 'elmas' }, null, 'diamond_chestplate'),
    ] },
  ]
}

// Köle başına numaralı iş listesi (tetik adları bu numaradan)
function isListesi(ad, adlar) {
  const kat = kategoriler()
  let no = 0
  for (const k of kat) for (const i of k.isler) { i.no = ++no; i.kat = k.baslik }
  return { kat, isler: kat.flatMap((k) => k.isler) }
}
const tetik = (ad, no) => `km_${ad.toLowerCase()}_${no}`
const geriTetik = (ad) => `km_${ad.toLowerCase()}_g`
const geri = (ad, deger) => ({ label: metin('⬅ Geri', 'gray'), action: { type: 'run_command', command: `trigger ${geriTetik(ad)} set ${deger}` } })

function isButonu(ad, i, k, kIndeks) {
  const t = tetik(ad, i.no)
  const renk = i.ad === 'dur' ? 'red' : k.renk
  const label = etiket(i.ikon, i.yazi, renk, i.ad === 'dur' ? { bold: true } : {})
  if (!i.adet) return { label, action: { type: 'run_command', command: `trigger ${t}` } }
  const [start, end, initial] = i.adet
  const govde = i.esya
    ? [{ type: 'minecraft:item', item: { id: `minecraft:${i.esya}` }, show_tooltip: false, show_decorations: false }]
    : []
  return {
    label,
    tooltip: metin('Adet seç'),
    action: {
      type: 'show_dialog',
      dialog: {
        type: 'minecraft:multi_action',
        title: etiket(i.ikon, `${ad}: ${i.yazi}`, renk),
        body: govde,
        inputs: [{ type: 'minecraft:number_range', key: 'adet', label: metin('Adet'), start, end, step: 1, initial, width: 300 }],
        columns: 1,
        actions: [{ label: metin('✔ Başla', 'green', { bold: true }), width: 200, action: { type: 'dynamic/run_command', template: `trigger ${t} set $(adet)` } }],
        exit_action: geri(ad, 2 + kIndeks),
      },
    },
  }
}

function kategoriDialog(ad, k, kIndeks) {
  return {
    type: 'minecraft:multi_action',
    title: etiket(k.ikon, `${ad}: ${k.baslik}`, k.renk, { bold: true }),
    columns: k.isler.length > 8 ? 3 : 2,
    actions: k.isler.map((i) => ({ ...isButonu(ad, i, k, kIndeks), width: k.isler.length > 8 ? 120 : 150 })),
    exit_action: geri(ad, 1),
  }
}

// Ana menü: üstte canlı durum ve envanter (makro), altta kategoriler, en sonda DUR
function anaMenu(ad, kat) {
  const dur = kat[0].isler.find((i) => i.ad === 'dur')
  const dialog = {
    type: 'minecraft:multi_action',
    title: metin(`⚒ ${ad} ⚒`, 'gold', { bold: true }),
    body: '@@GOVDE@@',
    columns: 2,
    actions: [
      ...kat.map((k, n) => ({
        label: etiket(k.ikon, k.baslik, k.renk),
        tooltip: metin(k.ipucu),
        width: 150,
        // Satır içi değil tetikle açılır: makro satırında alt pencerelerin $(adet)'i bozulurdu
        action: { type: 'run_command', command: `trigger ${geriTetik(ad)} set ${n + 2}` },
      })),
      { label: metin('✖ DUR', 'red', { bold: true }), tooltip: metin('Elindeki işi ve sırayı bırakır'), width: 150,
        action: { type: 'run_command', command: `trigger ${tetik(ad, dur.no)}` } },
    ],
    exit_action: { label: metin('Kapat', 'gray') },
  }
  return JSON.stringify(dialog).replace('"@@GOVDE@@"', '[$(durum),$(envanter)]')
}

// Her tik: kutu yoksa bota yapıştır, bot çıktıysa sil. Kutuya vurulursa vuruşu bota geçir (düello/şaka bozulmasın).
function kutuSatirlari(ad) {
  const e = `@e[type=minecraft:interaction,tag=kole_menu_${ad}]`
  return [
    `execute unless entity ${e} at ${ad} run summon minecraft:interaction ~ ~ ~ {Tags:["kole_menu","kole_menu_${ad}"],width:0.7f,height:1.9f,response:1b}`,
    `execute as ${e} at ${ad} run tp @s ~ ~ ~`,
    `execute as ${e} unless entity ${ad} run kill @s`,
    `execute as ${e} if data entity @s attack on attacker run damage ${ad} 2 minecraft:player_attack by @s`,
    `execute as ${e} if data entity @s attack run data remove entity @s attack`,
    `execute as ${e} if data entity @s interaction run data remove entity @s interaction`,
  ]
}
// Tetik basıldıysa köleye gizli haber ver, sıfırla, yeniden aç
function tetikSatirlari(ad, i) {
  const t = tetik(ad, i.no)
  const haber = JSON.stringify([{ text: `KMENU ${i.no} ` }, { score: { name: '@s', objective: t } }, { text: ' ' }, { selector: '@s' }])
  return [
    `execute as @a[scores={${t}=1..}] run tellraw ${ad} ${haber}`,
    `scoreboard players reset @a[scores={${t}=1..}] ${t}`,
    `scoreboard players enable @a ${t}`,
  ]
}
const anaMenuAc = (ad) => `function kole:menu_${ad.toLowerCase()} with storage kole:durum ${ad.toLowerCase()}`
function geriSatirlari(ad, kat) {
  const g = geriTetik(ad)
  const k = ad.toLowerCase()
  return [
    `execute as @a[scores={${g}=1}] run ${anaMenuAc(ad)}`,
    ...kat.map((_, n) => `execute as @a[scores={${g}=${n + 2}}] run function kole:kat_${k}_${n}`),
    `scoreboard players reset @a[scores={${g}=1..}] ${g}`,
    `scoreboard players enable @a ${g}`,
  ]
}

const bosDurum = (yazi) => JSON.stringify({ type: 'minecraft:plain_message', width: 300, contents: metin(yazi, 'gray') })

function paketDosyalari(adlar) {
  const d = {
    'pack.mcmeta': { pack: { description: 'Köle sağ tık menüsü (bot üretir, elle düzenleme)', min_format: 101, max_format: 101 } },
    'data/minecraft/tags/function/tick.json': { values: ['kole:tik'] },
    'data/minecraft/tags/function/load.json': { values: ['kole:yukle'] },
  }
  const tik = []
  const yukle = []
  for (const ad of adlar) {
    const k = ad.toLowerCase()
    const { kat, isler } = isListesi(ad, adlar)
    tik.push(...kutuSatirlari(ad), ...geriSatirlari(ad, kat))
    yukle.push(`scoreboard objectives add ${geriTetik(ad)} trigger ${JSON.stringify(`${ad}: Geri`)}`)
    yukle.push(`execute unless data storage kole:durum ${k}.durum run data modify storage kole:durum ${k} set value {durum:${JSON.stringify(bosDurum(`${ad} bağlı değil`))},envanter:${JSON.stringify(bosDurum(''))}}`)
    for (const i of isler) {
      const gorunen = JSON.stringify(`${ad}: ${i.kat} › ${i.yazi}`)
      yukle.push(`scoreboard objectives add ${tetik(ad, i.no)} trigger ${gorunen}`)
      yukle.push(`scoreboard objectives modify ${tetik(ad, i.no)} displayname ${gorunen}`) // eski adla kalmışsa
      tik.push(...tetikSatirlari(ad, i))
    }
    d[`data/kole/advancement/sag_tik_${k}.json`] = {
      criteria: {
        tik: {
          trigger: 'minecraft:player_interacted_with_entity',
          conditions: { entity: { type: 'minecraft:interaction', nbt: `{Tags:["kole_menu_${ad}"]}` } },
        },
      },
      rewards: { function: `kole:sag_tik_${k}` },
    }
    // Dialoglar satır içi: kayıt defterindeki dialoglar /reload ile yenilenmiyor, sunucu yeniden başlamalı
    d[`data/kole/function/sag_tik_${k}.mcfunction`] = `advancement revoke @s only kole:sag_tik_${k}\n${anaMenuAc(ad)}\n`
    d[`data/kole/function/menu_${k}.mcfunction`] = `$dialog show @s ${anaMenu(ad, kat)}\n`
    kat.forEach((kt, n) => { d[`data/kole/function/kat_${k}_${n}.mcfunction`] = `dialog show @s ${JSON.stringify(kategoriDialog(ad, kt, n))}\n` })
  }
  // /kole cagir (kole-komut modu) ve modsuz yedeği /trigger kole_cagir: köleye gizli "KCAGIR <oyuncu>", efendiyse bot ışınlanır
  const cagir = adlar.flatMap((ad) => [
    `execute unless entity ${ad} run tellraw @s ${JSON.stringify(metin(`${ad} şu an oyunda değil.`, 'red'))}`,
    `execute if entity ${ad} run tellraw ${ad} ${JSON.stringify([{ text: 'KCAGIR ' }, { selector: '@s' }])}`,
  ])
  d['data/kole/function/cagir.mcfunction'] = cagir.join('\n') + '\n'
  d['data/kole/function/menu_ac.mcfunction'] = `${anaMenuAc(adlar[0])}\n` // /kole menu: köleyi bulmadan menü
  yukle.push('scoreboard objectives add kole_cagir trigger "Köleyi çağır"')
  tik.push('execute as @a[scores={kole_cagir=1..}] run function kole:cagir',
    'scoreboard players reset @a[scores={kole_cagir=1..}] kole_cagir', 'scoreboard players enable @a kole_cagir')
  d['data/kole/function/tik.mcfunction'] = tik.join('\n') + '\n'
  d['data/kole/function/yukle.mcfunction'] = yukle.join('\n') + '\n'
  return d
}

// Paketi yazar; içerik değiştiyse sunucuya /reload atar
export async function menuPaketiKur(adlar) {
  const seviye = fs.readFileSync(path.join(SUNUCU, 'server.properties'), 'utf8').match(/^level-name=(.*)$/m)?.[1]?.trim() || 'world'
  const kok = path.join(SUNUCU, seviye, 'datapacks', PAKET)
  const dosyalar = paketDosyalari(adlar)
  let degisti = false
  // Pakette artık olmayan eski dosyaları sil
  for (const f of fs.existsSync(kok) ? fs.readdirSync(kok, { recursive: true }) : []) {
    const ad = f.split(path.sep).join('/')
    if (fs.statSync(path.join(kok, f)).isFile() && !(ad in dosyalar)) { fs.rmSync(path.join(kok, f)); degisti = true }
  }
  for (const [ad, icerik] of Object.entries(dosyalar)) {
    const yol = path.join(kok, ad)
    const yazi = typeof icerik === 'string' ? icerik : JSON.stringify(icerik, null, 2)
    if (fs.existsSync(yol) && fs.readFileSync(yol, 'utf8') === yazi) continue
    fs.mkdirSync(path.dirname(yol), { recursive: true })
    fs.writeFileSync(yol, yazi)
    degisti = true
  }
  if (degisti) {
    await rconKomut('reload')
    await rconKomut(`datapack enable "file/${PAKET}"`).catch(() => {})
  }
  return degisti
}

// Ana menünün üstündeki iki satır: ne yapıyor + can/açlık/keyif, envanter ikonlarla
function durumGovdesi(u, isler) {
  const { bot, ruh } = u
  const s = bot.kole?.simdiki
  const i = s && isler.find((x) => x.ad === s.ad && Object.entries(x.girdi).every(([k, v]) => s.girdi?.[k] === v))
  const sirada = u.kuyruk.ozet().split('sırada: ')[1]?.split(', ').length ?? 0
  const satir1 = s
    ? [...[].concat(etiket(i?.ikon, `Şu an: ${i?.yazi ?? s.ad}${s.girdi?.miktar ? ` ×${s.girdi.miktar}` : ''}`, 'yellow')),
      metin(sirada ? `   (sırada ${sirada} iş)` : '', 'gray')]
    : [metin('☕ Boşta, emir bekliyor', 'gray')]
  const keyif = ruh.memnuniyet
  const satir2 = [
    metin(`❤ ${Math.round(bot.health ?? 0)}/20   `, 'red'),
    metin(`Açlık ${bot.food ?? 0}/20   `, 'gold'),
    metin(`☺ Keyif ${keyif}`, keyif >= 60 ? 'green' : keyif >= 30 ? 'yellow' : 'red'),
  ]
  const durum = { type: 'minecraft:plain_message', width: 300, contents: [...satir1, metin('\n'), ...satir2] }

  const toplam = new Map()
  for (const it of bot.inventory?.items() ?? []) toplam.set(it.name, (toplam.get(it.name) ?? 0) + it.count)
  const sirali = [...toplam].sort((a, b) => b[1] - a[1])
  const envanter = (n) => ({
    type: 'minecraft:plain_message',
    width: 300,
    contents: sirali.length
      ? sirali.slice(0, n).flatMap(([ad, adet]) => [ikon(ad) ?? metin(ad, 'gray'), metin(` ${adet}  `)])
        .concat(sirali.length > n ? [metin(`+${sirali.length - n}`, 'gray')] : [])
      : [metin('Envanter boş', 'gray')],
  })
  return { durum, envanter }
}

// RCON paketi ~1400 bayt: sığmazsa envanterdeki çeşit sayısını azalt
function storageKomutu(k, alan, govde) {
  return `data modify storage kole:durum ${k}.${alan} set value ${JSON.stringify(JSON.stringify(govde))}`
}
function durumYaz(u, isler, onceki) {
  const k = u.ad.toLowerCase()
  const { durum, envanter } = durumGovdesi(u, isler)
  const komutlar = [storageKomutu(k, 'durum', durum)]
  for (let n = 12; n >= 0; n--) {
    const c = storageKomutu(k, 'envanter', envanter(n))
    if (Buffer.byteLength(c) < 1350 || n === 0) { komutlar.push(c); break }
  }
  for (const c of komutlar) {
    if (onceki.get(c.split(' set ')[0]) === c) continue
    onceki.set(c.split(' set ')[0], c)
    rconKomut(c).catch((h) => { onceki.clear(); console.error(`[menü ${u.ad}] durum yazılamadı:`, h.message) })
  }
}

// Köle kendine gelen gizli haberi dinler: "KMENU 5 16 Lordinek". Chat'e hiçbir şey yazmaz.
const SUREKLI = new Set(['yanimaGel', 'takipEt', 'koru']) // eldeki işi bırakıp hemen yapılır
export function menuDinle(u, adlar, sahip) {
  const { isler } = isListesi(u.ad, adlar)
  const onceki = new Map()
  // Köle bu fonksiyondan önce doğmuş olabilir (çırak 3 sn sonra bağlanıyor): spawn beklemeden başla
  setInterval(() => { if (u.bot.entity && u.bot.inventory) durumYaz(u, isler, onceki) }, 2000)
  u.bot.on('messagestr', (mesaj) => {
    const c = mesaj.match(/^KCAGIR (\S+)$/)
    if (c) return cagrildi(u, c[1], sahip)
    const m = mesaj.match(/^KMENU (\d+) (\d+) (\S+)$/)
    if (!m) return
    const [, no, adet, oyuncu] = m
    const i = isler.find((x) => x.no === Number(no))
    if (!i) return
    if (oyuncu !== sahip) return console.log(`[menü ${u.ad}] ${oyuncu} emir verdi, efendi değil: ${i.yazi}`)
    if (i.ad === 'dur') { u.kuyruk.durdur(); return console.log(`[menü ${u.ad}] dur`) }
    const girdi = { ...i.girdi, ...(i.adet ? { miktar: Math.max(1, Number(adet)) } : {}) }
    try {
      if (SUREKLI.has(i.ad)) u.kuyruk.durdur()
      u.kuyruk.ekle(i.ad, girdi, { bagimsiz: true })
      console.log(`[menü ${u.ad}] ${i.ad} ${JSON.stringify(girdi)}`)
    } catch (h) { console.log(`[menü ${u.ad}]`, h.message) }
  })
}

// /kole cagir: köleyi kaybeden efendi. Elindeki işi bırakır, efendinin yanına ışınlanır (başka boyutta olsa da).
function cagrildi(u, oyuncu, sahip) {
  const yaz = (yazi, renk) => rconKomut(`tellraw ${oyuncu} ${JSON.stringify(metin(yazi, renk))}`).catch(() => {})
  if (oyuncu !== sahip) { console.log(`[menü ${u.ad}] ${oyuncu} çağırdı, efendi değil`); return yaz(`${u.ad} sadece efendisini dinler.`, 'red') }
  u.kuyruk.durdur()
  rconKomut(`tp ${u.ad} ${oyuncu}`)
    .then(() => { console.log(`[menü ${u.ad}] çağrıldı, ${oyuncu} yanına ışınlandı`); yaz(`${u.ad} yanına geldi.`, 'gray') })
    .catch((h) => { console.error(`[menü ${u.ad}] çağrı ışınlaması olmadı:`, h.message); yaz(`${u.ad} gelemedi.`, 'red') })
}
