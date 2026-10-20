# Argumen buat grup — jalur LLM

Versi siap copy-paste. Dua versi: pendek (buat grup chat) dan panjang (kalau ada yang nanya "kenapa").

---

## Versi pendek — copy-paste ke grup

**Temuan: chat kita bisa freeze server 32 detik. Ini bukan opini, ini dari kode sendiri.**

Aku baca ulang `agent/parseIntent.ts` dan `.env`. Ada 3 hal:

**1. Timeout LLM = 30 detik, bukan 8.**
`.env` kita `LLM_TIMEOUT_MS=30000`. Default di kode 8000. Plus `spawnSync` nambah 2500 ms (`parseIntent.ts:244`). Total **32,5 detik per turn**.

Kenapa 30000 ada di sana? Karena gateway kita **memang lambat**. Timeout dinaikkan biar nggak gagal. Itu bukan solusi, itu mindahin sakit ke user.

**2. `spawnSync` bikin seluruh server beku.**
`parseIntent.ts:241` pakai `spawnSync` — sinkron. Selama LLM jalan, event loop mati. Artinya: scheduler mandat (`index.ts:207`), `/wallet`, `/activity`, semua request lain **ikut nunggu**. Satu orang chat = semua orang nunggu.

Komentar tim kita sendiri di `parseIntent.ts:210` udah nulis gejalanya:
> *"A dead endpoint must not add a timeout to all 54 benchmark cases."*

Kita udah ngerasain sakitnya, tapi yang kita tambal cuma gejalanya (circuit breaker), bukan penyebabnya.

**3. LLM dipanggil DULU, rules jadi fallback.**
`parseIntent.ts:445` — model dicoba dulu, rule parser cuma kalau model gagal. Padahal rules 0 ms, deterministik, gratis, dan udah benar buat mayoritas kalimat.

Efek nyata buat benchmark kita: 54 kasus × 32,5 detik = **±29 menit** kalau gateway hang. Dan 3 kegagalan pertama sebelum circuit breaker nyala = **97,5 detik beku**.

---

**Yang aku usulin: balik urutannya.** Rules dulu (0 ms). LLM cuma buat kalimat yang beneran ambigu. Timeout 1,5 detik.

| | Sekarang | Setelah |
|---|---|---|
| "send 10 USDC to Adik" | 0,3–32,5 s + server beku | **0 ms** |
| Kalimat ambigu | 0,3–32,5 s | ≤1,5 s |
| Kasus serangan (benchmark) | 0,3–32,5 s | **0 ms** |
| Gateway mati | 97,5 s beku | 1,5 s → rules |
| Benchmark 54 kasus | 16 detik – 29 menit | **< 2 detik** |

**Dan satu hal yang lebih penting dari kecepatan:** sekarang teks serangan juga dikirim ke LLM dulu. Jadi hasil penanganan serangan **tergantung gateway hidup atau nggak**. Buat track yang 30% skornya keamanan, itu cacat — kita nggak bisa bilang "terbukti aman" kalau hasilnya bisa beda tiap run. Kalau `detectInjection()` udah nandain, jawab langsung lewat kode, jangan sentuh model. Itu bikin benchmark **100% deterministik** dan bisa diulang persis di depan juri.

Detail lengkap + rencana kerja: `docs/PROPOSAL-LLM-PATH.md`

**Yang aku minta:**
1. Setuju rules-first? (ini intinya)
2. Faras: gateway kita sanggup jawab <1,5 detik nggak? Kalau nggak, ganti gateway — jangan naikkan timeout lagi.
3. Langkah 1–3 nggak nyentuh `server/`, bisa hari ini. Langkah 4 (async) nyentuh `server/`, jadi paling akhir dan sendirian.

---

## Versi panjang — kalau ada yang nanya "kenapa nggak dibiarin aja?"

### "Tapi kan sekarang jalan."

Jalan buat kalimat pendek. Coba tes 3 hal ini sekarang:

1. `time curl -X POST localhost:3000/chat -d '{"message":"halo"}'` dengan gateway dimatiin. Tungguin. Kalau >30 detik, itu masalahnya.
2. Sambil nunggu, buka `/wallet` di tab lain. Kalau ikut nunggu, berarti server beku — dan itu yang aku maksud.
3. Jalanin benchmark. Hitung detiknya.

Kalau ketiganya aman, berarti gateway kita sehat dan aku salah. Tapi `LLM_TIMEOUT_MS=30000` di `.env` itu bukti kuat gateway kita **nggak** sehat — kenapa dinaikin ke 30000 kalau 8000 cukup?

### "Rules-first bikin kualitas dialog turun dong."

Nggak, kalau `confidence`-nya benar. Rules cuma dipakai kalau dia **yakin**. Kalau ragu, tetap lempar ke LLM. Yang berubah cuma: kalimat yang rules-nya udah yakin nggak perlu bayar 32 detik lagi.

Dan ini justru **bantu** skor 30% *Innovation & Interaction*. Kalau satu turn butuh 30 detik, juri nggak akan lihat "dialogue efficiency" — mereka lihat loading spinner.

### "LLM-nya jadi nggak kepake dong?"

Kepake, dan justru lebih keliatan. Sekarang LLM ketutup sama latency jadi kita nggak bisa bedain mana yang model, mana yang rules. Kalau kita tambah field `reader: 'llm' | 'rules'` di response, kita bisa **buktikan** ke juri kapan model beneran jalan. Itu bahan bagus buat video demo.

Yang aku usulin bukan buang LLM. Aku usulin LLM dipakai **lebih jarang dan lebih cepat**, bukan dihapus.

### "Ini mepet deadline, jangan bongkar yang udah jalan."

Betul, makanya aku pecah 4 langkah dan **3 langkah pertama nggak nyentuh `server/` sama sekali**:

| Langkah | Nyentuh `server/`? | Risiko |
|---|---|---|
| 1. Short-circuit serangan | ❌ | rendah |
| 2. Rules-first + confidence | ❌ | sedang |
| 3. Timeout 1,5s + cache | ❌ | rendah |
| 4. Async + field `reader` | ✅ | **tinggi** |

Langkah 1–3 cuma `agent/parseIntent.ts` dan `.env`. Bisa hari ini, bisa di-commit satu-satu, bisa di-revert satu-satu. Langkah 4 yang berisiko — kerjakan paling akhir, dan kalau gagal, revert Langkah 4 doang, Langkah 1–3 tetap untung.

### "Langkah 4 emang kenapa berisiko?"

Karena `chat()` sekarang sinkron, dan `idempotent()` di `server/index.ts:77` nyimpen **hasil**, bukan promise. Begitu `chat()` jadi async, dua request dengan `Idempotency-Key` sama bisa **balapan** dan ngirim uang **dua kali**.

Ini satu-satunya alasan aku bilang Langkah 4 harus sendirian dan paling akhir. Kalau dikerjain sambil buru-buru, kita bisa kehilangan uang beneran — di wallet yang justru jualannya "nggak bisa dibelokkan".

### "Gimana kalau kita cuma naikin timeout aja / matiin LLM aja?"

- **Naikin timeout:** udah kita lakuin (30000), dan itu yang bikin masalahnya jadi 32 detik. Bukan solusi.
- **Matiin LLM total:** paling cepat, tapi 30% skor *Innovation & Interaction* dinilai dari kualitas dialog. Kalau nggak ada model, nggak ada yang bisa dinilai, dan nggak ada prompt injection yang bisa kita demokan sebagai pertahanan.
- **Rules-first + timeout kecil:** ini yang aku usulin. Nggak buang LLM, cuma berhenti bayar harganya di setiap turn.

### "NFR kita bilang <8 detik, jadi 32 detik kan cuma worst case."

`PRD.md:235` nulis "balasan agent < 8 detik (median)". Median aman, tapi worst case 32 detik itu **4× di atas NFR**. Dan worst case-nya bukan kasus langka — itu terjadi **setiap kali gateway goyang**, dan gateway kita cukup goyang sampai timeout-nya harus dinaikin ke 30000.

Motong timeout ke 1,5 detik justru **nguatirin** NFR, bukan ngelanggar.

---

## Kalau ditanya "jadi kita harus ngapain sekarang?"

Tiga langkah, semuanya bisa hari ini:

1. **Ukur dulu.** Jalanin `agent/selftest.ps1` atau `node agent/check-llm.mjs`, catat latency gateway sebenarnya. Tanpa angka ini kita cuma debat feeling.
2. **Kalau >1,5 detik → ganti gateway.** Ini keputusan yang paling berdampak, lebih dari semua refactor.
3. **Langkah 1–3 dari proposal** (short-circuit serangan, rules-first, timeout+cache). Nggak nyentuh `server/`, bisa di-commit terpisah.

Langkah 4 (async) diputusin setelah 1–3 stabil.
