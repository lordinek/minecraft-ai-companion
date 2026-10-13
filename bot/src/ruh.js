import fs from 'node:fs'

// Kole'nin ruh hali (keyif, yorgunluk, sayaçlar). Maaş/grev sistemi 2026-10-10'da kaldırıldı.
const DOSYA = 'data/ruh.json'

const MOB_AD = { zombie: 'zombi', skeleton: 'iskelet', spider: 'örümcek', creeper: 'creeper', husk: 'çöl zombisi', drowned: 'boğulmuş', witch: 'cadı', slime: 'balçık', cave_spider: 'mağara örümceği', stray: 'buz iskeleti', zombie_villager: 'zombi köylü' }
const sinirla = (n) => Math.max(0, Math.min(100, Math.round(n)))
const sec = (dizi) => dizi[Math.floor(Math.random() * dizi.length)]
const bugun = () => new Date().toLocaleDateString('sv-SE')

const VARSAYILAN = {
  gun: bugun(),
  memnuniyet: 60, // 0 isyan eşiği, 100 mutlu köle
  yorgunluk: 0,
  sayac: { kutuk: 0, maden: 0, is: 0, mob: 0, hayvan: 0, hasat: 0, hakaret: 0 },
  beceri: { ev: 1 }, // her başarılı evde artar (1 → 3), günlük sıfırlanmaz
}

// Görev bitince kodun kendisi ekler (LLM çağrısı yok). {n} = ilgili sayaç.
const SIKAYET = {
  kutuk: [
    'Bugün kestiğim {n}. kütük bu, bileğim koptu.',
    'Toplam {n} kütük oldu bugün. Ormanda ağaç kalmadı efendim.',
    '{n} kütük... Ben oduncu değilim, köleyim. Gerçi aynı şey.',
  ],
  maden: [
    'Bugün {n}. maden bu. Yüzüm kapkara oldu.',
    '{n} tane kazdım bugün. Güneşi en son ne zaman gördüm hatırlamıyorum.',
    'Madende {n}. seferim. Yarasa arkadaşlarım bile şaşırdı.',
  ],
  mob: [
    'Bir {mob} daha. Bugün {n}. düşmanım bu, köle miyim asker mi karar verin.',
    'Bugün {n} düşman kestim. Bunun tehlike primi yok mu?',
    'Bir {mob} daha gitti, bugün {n} oldu. Kılıcım köreldi.',
  ],
  hayvan: [
    'Bugün {n}. hayvanı kestim. İnekler bana artık başka bakıyor.',
    '{n} hayvan oldu bugün. Köle miyim kasap mı?',
    '{n}. hayvan... Gece rüyamda tavuklar kovalıyor beni.',
  ],
  hasat: [
    'Bugün {n} ekin biçtim. Belim tutuldu.',
    '{n} ekin... Köleydim, maraba oldum. Terfi mi bu?',
    'Toprak ağası gibisiniz efendim. Bugün {n} başak biçtim.',
  ],
  is: [
    'Bugün {n}. işim bu. Mola diye bir şey duydunuz mu?',
    '{n} iş oldu. Sendika kurmayı düşünüyorum.',
  ],
}

export function ruhKur(dosya = DOSYA) {
  let r
  try {
    r = { ...VARSAYILAN, ...JSON.parse(fs.readFileSync(dosya, 'utf8')) }
    // kalkan özellikler (küslük, yalan, maaş/grev) eski kayıttan kalmasın
    for (const a of ['mod', 'kusBitis', 'sonYalan', 'yalanZorla', 'maasSonrasiIs']) delete r[a]
    delete r.sayac?.elmasMaas
  } catch {
    r = structuredClone(VARSAYILAN)
  }
  const kaydet = () => {
    fs.mkdirSync('data', { recursive: true })
    fs.writeFileSync(dosya, JSON.stringify(r, null, 2))
  }
  const gunKontrol = () => {
    if (r.gun === bugun()) return
    r.gun = bugun()
    r.sayac = { ...VARSAYILAN.sayac }
    r.yorgunluk = 0
  }

  // Boşta durdukça dinlenir
  setInterval(() => {
    if (r.yorgunluk > 0) { r.yorgunluk = sinirla(r.yorgunluk - 2); kaydet() }
  }, 30_000).unref()

  const ruh = {
    get memnuniyet() { return r.memnuniyet },

    // Görev bitti: sayaçları işle. Sonuç cümlesine şikayet ekleyebilir.
    isBitti(ad, sonuc, adet = 0) {
      gunKontrol()
      // Teslim/gelme/takip ayrı iş sayılmaz: "odun getir" = kes + ver, tek istek
      if (['esyaVer', 'yanimaGel', 'takipEt', 'yemekYe'].includes(ad)) { kaydet(); return { sikayet: '' } }
      r.sayac.is++
      r.yorgunluk = sinirla(r.yorgunluk + 8)
      r.memnuniyet = sinirla(r.memnuniyet - 3)
      let tur = 'is'
      if (ad === 'odunTopla') { r.sayac.kutuk += adet; tur = 'kutuk' }
      if (ad === 'madenAra') { r.sayac.maden += adet; tur = 'maden' }
      if (ad === 'avlan') { r.sayac.hayvan = (r.sayac.hayvan ?? 0) + adet; tur = 'hayvan' }
      if (ad === 'tarlaKur' || ad === 'hasatEt') { r.sayac.hasat = (r.sayac.hasat ?? 0) + adet; tur = 'hasat' }
      // Yorgunken daha çok söylenir
      const sikayet = Math.random() < 0.1 + r.yorgunluk / 400 ? sec(SIKAYET[tur]).replace('{n}', r.sayac[tur]) : ''
      kaydet()
      return { sikayet }
    },

    evSeviyesi() { return r.beceri?.ev ?? 1 },
    evBitti() {
      r.beceri = { ...(r.beceri ?? {}), ev: Math.min(3, (r.beceri?.ev ?? 1) + 1) }
      kaydet()
      return r.beceri.ev
    },

    // Koruma sırasında her ölümde. Bazen şikayet cümlesi döner.
    mobOldu(mob) {
      gunKontrol()
      r.sayac.mob = (r.sayac.mob ?? 0) + 1
      r.memnuniyet = sinirla(r.memnuniyet - 1)
      kaydet()
      if (Math.random() > 0.4) return null
      const ad = MOB_AD[mob] ?? mob
      return sec(SIKAYET.mob).replace('{n}', r.sayac.mob).replace('{mob}', ad)
    },

    // Gemini'nin işaretlediği duygular
    hakaretEdildi() {
      gunKontrol()
      r.sayac.hakaret++
      r.memnuniyet = sinirla(r.memnuniyet - 20)
      // Köle efendisine küsmez : boynunu büker, işi yine yapar
      kaydet()
    },
    ovuldu() { r.memnuniyet = sinirla(r.memnuniyet + 8); kaydet() },
    ozurDilendi() {
      r.memnuniyet = sinirla(r.memnuniyet + 5)
      kaydet()
    },

    // Yönetmen (çekim) kontrolü: terminalden ya da !komut ile
    yonet(komut) {
      if (komut === 'mutlu') { r.memnuniyet = 90; r.yorgunluk = 0 }
      else if (komut === 'mutsuz') { r.memnuniyet = 15; r.yorgunluk = 80 }
      else if (/^ev[123]$/.test(komut)) r.beceri = { ...(r.beceri ?? {}), ev: Number(komut[2]) }
      else if (komut === 'sifirla') r = structuredClone(VARSAYILAN)
      else if (komut !== 'durum') return `bilinmeyen: ${komut} (mutlu | mutsuz | ev1 | ev2 | ev3 | sifirla | durum)`
      kaydet()
      return ruh.ozet()
    },

    ozet() {
      return `memnuniyet=${r.memnuniyet} yorgunluk=${r.yorgunluk} ` +
        `ev seviyesi=${r.beceri?.ev ?? 1} bugün: ${r.sayac.kutuk} kütük, ${r.sayac.maden} maden, ${r.sayac.is} iş, ${r.sayac.hakaret} hakaret`
    },

    // Gemini'ye giden ruh hali satırı + bu moda özel talimat
    prompt() {
      gunKontrol()
      const s = r.sayac
      // Ruh hali enerjiyi değiştirir, efendiye saygıyı değil 
      const ton = r.memnuniyet >= 70 ? 'keyfin yerinde, hevesli ve şakacısın'
        : r.memnuniyet >= 40 ? 'biraz yorgunsun ama işi saygıyla, itirazsız yaparsın'
          : r.memnuniyet >= 20 ? 'çok yorgunsun, kısa ve sessiz cevap verirsin, yine de saygılısın'
            : 'tükenmişsin, çok kısa konuşursun, yine de efendine saygısızlık etmezsin'
      return `[ruh] memnuniyet ${r.memnuniyet}/100, yorgunluk ${r.yorgunluk}/100, bugün ${s.kutuk} kütük kestin, ` +
        `${s.maden} maden kazdın, ${s.mob ?? 0} düşman öldürdün, ${s.hayvan ?? 0} hayvan kestin, ${s.hasat ?? 0} ekin ektin/biçtin, ${s.is} iş yaptın, ${s.hakaret} kez hakaret yedin. Ruh halin: ${ton}.`
    },
  }
  return ruh
}
