# PRD — Tameng Wallet (Aplikasi)

**Versi:** 0.1 (draft)
**Tanggal:** 19 Oktober 2026
**Pemilik dokumen:** Habib — Backend Aplikasi
**Status:** Draft untuk review

---

## 1. Ringkasan

Tameng Wallet adalah aplikasi mobile (React Native) yang menggabungkan tiga hal:

1. **Exchange sederhana** — beli/jual crypto (ETH, BTC, DOGE) ala Indodax.
2. **Smart wallet** — melihat alokasi dana per koin: berapa rupiah yang sudah ditaruh di tiap koin, berapa nilainya sekarang, untung/rugi.
3. **Kantong (pocket)** — pembagian alokasi dana ala Bank Jago, untuk memisahkan uang berdasarkan tujuan.

Di atas ketiganya ada **AI Agent** yang membantu keputusan beli dan bisa menjalankan investasi otomatis (DCA / rule-based).

Dokumen ini hanya mendefinisikan **backend aplikasi**. Bagian frontend, AI agent, dan integrasi blockchain/exchange dikerjakan tim lain dan dibahas di sini hanya sebagai kontrak antar-batas.

## 2. Pembagian Kerja & Struktur Repo

```
tamengwallet/
├── PRD.md       ← dokumen ini
├── app/         ← backend aplikasi (scope dokumen ini)
├── agent/       ← AI agent service (tim lain)
└── crypto/      ← layanan crypto: harga, eksekusi order, custody (tim lain)
```

| Area | Pemilik | Tanggung jawab |
|---|---|---|
| `app/` | Habib | Auth, user, saldo rupiah, pocket, portfolio, order intent, transaksi, notifikasi, API untuk mobile |
| Frontend | Tim frontend | React Native app, konsumsi API `app/` |
| `agent/` | Tim AI | Rekomendasi, chat, eksekusi rencana investasi otomatis |
| `crypto/` | Tim crypto | Harga realtime, eksekusi order ke exchange/chain, konfirmasi settlement, wallet address |

**Aturan batas:** `app/` adalah satu-satunya sumber kebenaran untuk saldo user, kepemilikan koin, dan riwayat transaksi. `agent/` dan `crypto/` tidak menulis langsung ke database `app/`; keduanya berinteraksi lewat API internal.

## 3. Pengguna Sasaran

- Investor crypto pemula di Indonesia yang ingin nabung rutin tanpa harus memantau pasar.
- Pengguna yang sudah terbiasa dengan konsep kantong/pocket di aplikasi bank digital.
- Pengguna yang ingin bantuan AI untuk memutuskan kapan dan berapa membeli.

## 4. Tujuan & Metrik

**Tujuan produk**
- Pengguna bisa menaruh rupiah, membaginya ke kantong, dan membeli crypto dari kantong tertentu.
- Pengguna selalu tahu persis: uang saya ada di mana, berapa nilainya sekarang.
- Investasi rutin bisa berjalan tanpa intervensi manual.

**Metrik keberhasilan (6 bulan setelah rilis)**
- 40% pengguna aktif membuat minimal 2 kantong.
- 25% pengguna aktif mengaktifkan minimal 1 aturan investasi otomatis.
- Median waktu dari tekan "Beli" sampai saldo koin ter-update: di bawah 5 detik.
- Selisih pencatatan saldo (app vs settlement crypto): 0 kasus per bulan.

## 5. Ruang Lingkup

### 5.1 Masuk scope (backend aplikasi, v1)

| # | Modul | Isi |
|---|---|---|
| 1 | Auth & akun | Registrasi, login, refresh token, PIN transaksi, logout semua perangkat |
| 2 | KYC | Penyimpanan status KYC dan data identitas, webhook dari provider KYC |
| 3 | Saldo rupiah | Deposit, penarikan, ledger rupiah |
| 4 | Kantong (pocket) | CRUD kantong, pindah dana antar kantong, kantong utama bawaan |
| 5 | Portfolio | Kepemilikan per koin, harga rata-rata beli, nilai sekarang, untung/rugi |
| 6 | Order | Buat order beli/jual, lacak status, batalkan, riwayat |
| 7 | Transaksi & ledger | Catatan tunggal semua pergerakan dana, double-entry |
| 8 | Investasi otomatis | Definisi aturan (jadwal, nominal, koin, kantong sumber), eksekusi, jeda/hentikan |
| 9 | Integrasi agent | Endpoint agar agent bisa membaca konteks user dan mengajukan order |
| 10 | Notifikasi | Order selesai, aturan otomatis jalan, saldo kantong kurang |

### 5.2 Di luar scope v1

- Trading lanjutan: limit order, stop loss, margin.
- Transfer crypto keluar ke alamat eksternal (hanya custody internal dulu).
- Koin selain ETH, BTC, DOGE.
- Fitur sosial, referral, leaderboard.
- Web dashboard.

## 6. Konsep Domain

### 6.1 Kantong (Pocket)

Kantong adalah wadah rupiah dengan tujuan tertentu. Semua rupiah user selalu berada di salah satu kantong.

- Setiap user otomatis punya satu **Kantong Utama** saat registrasi. Kantong ini tidak bisa dihapus.
- Deposit masuk ke Kantong Utama kecuali user memilih kantong lain.
- Pembelian crypto selalu mengambil dana dari satu kantong tertentu.
- Kantong punya: nama, target nominal (opsional), ikon/warna, saldo rupiah.
- Penarikan dana hanya dari kantong, bukan dari saldo global.
- Kantong tidak menyimpan crypto. Crypto dicatat di portfolio, dengan referensi kantong asal pembelian.

**Aturan:** total saldo semua kantong = saldo rupiah user. Invariant ini diuji di setiap transaksi.

### 6.2 Portfolio & Alokasi

Portfolio mencatat kepemilikan crypto user per koin:

- `quantity` — jumlah koin yang dimiliki.
- `average_buy_price` — harga rata-rata beli tertimbang (IDR per koin).
- `total_invested` — total rupiah yang sudah dikeluarkan untuk koin ini.
- `current_value` — dihitung on-the-fly dari harga terbaru `crypto/`.
- `unrealized_pnl` — `current_value - total_invested`.

Alokasi per koin dihitung sebagai persentase `current_value` koin terhadap total nilai portfolio.

Pembelian dicatat juga dengan referensi `pocket_id` asal, sehingga user bisa melihat "dari kantong Liburan, saya sudah beli 0,0032 BTC".

### 6.3 Ledger

Semua pergerakan dana memakai pencatatan double-entry di satu tabel ledger. Saldo kantong dan quantity portfolio adalah hasil turunan yang di-cache, bukan sumber kebenaran. Tersedia job rekonsiliasi harian yang membandingkan cache dengan ledger.

Jenis entry: `deposit`, `withdrawal`, `pocket_transfer`, `buy_debit`, `buy_credit`, `sell_debit`, `sell_credit`, `fee`, `adjustment`.

## 7. Alur Utama

### 7.1 Deposit rupiah
1. User minta deposit, pilih kantong tujuan dan nominal.
2. Backend buat `payment_intent`, kembalikan instruksi pembayaran (VA/QRIS dari payment gateway).
3. Webhook pembayaran masuk → verifikasi tanda tangan → catat ledger → saldo kantong naik → notifikasi.
4. Webhook idempoten: `provider_reference` unik, pengiriman ulang tidak menambah saldo dua kali.

### 7.2 Beli crypto
1. User pilih koin, nominal rupiah, kantong sumber. Frontend tampilkan estimasi harga dari `crypto/`.
2. Backend validasi: PIN benar, KYC lolos, saldo kantong cukup, nominal di atas minimum.
3. Backend buat `order` status `pending`, **hold** dana di kantong (saldo tersedia turun, saldo total belum).
4. Backend panggil `crypto/execute-order`.
5. `crypto/` balas sukses dengan harga eksekusi dan jumlah koin → order jadi `filled`, hold dilepas jadi debit, portfolio naik, ledger dicatat.
6. Jika gagal atau timeout → order jadi `failed`, hold dilepas penuh, user diberi tahu.
7. Jika tidak ada jawaban: order masuk status `unknown`, job rekonsiliasi menanyakan ulang ke `crypto/` sampai jelas. Dana tetap ditahan selama status belum jelas.

### 7.3 Jual crypto
Kebalikan 7.2. Hasil penjualan masuk ke kantong yang dipilih user (default: kantong asal pembelian terbesar).

### 7.4 Investasi otomatis (DCA)
1. User buat aturan: koin, nominal, frekuensi (harian/mingguan/bulanan), kantong sumber, tanggal mulai, tanggal berakhir opsional.
2. Scheduler backend menjalankan aturan yang jatuh tempo.
3. Jika saldo kantong kurang → eksekusi dilewati, catat alasan, kirim notifikasi. Aturan tidak otomatis mati; setelah 3 kali gagal berturut-turut aturan dijeda dan user diberi tahu.
4. Setiap eksekusi membuat `order` normal lewat alur 7.2, dengan penanda `source = auto_rule`.

### 7.5 Aksi dari AI Agent
1. Agent membaca konteks user lewat API internal (portfolio, kantong, riwayat, profil risiko).
2. Agent mengajukan `order_proposal` ke backend, bukan order langsung.
3. Mode persetujuan diatur user per-aturan:
   - **Manual** — proposal muncul sebagai notifikasi, user harus menyetujui. Default.
   - **Otomatis dengan batas** — proposal dieksekusi langsung selama masih di bawah batas nominal harian dan koin termasuk whitelist user.
4. Semua eksekusi dari agent diberi penanda `source = agent` dan `proposal_id`, dengan alasan rekomendasi yang disimpan apa adanya untuk audit.
5. Batas keras: agent tidak bisa melakukan penarikan dana, menghapus kantong, atau mengubah pengaturan keamanan.

## 8. Kontrak API

### 8.1 API publik (dipakai frontend)

```
POST   /v1/auth/register
POST   /v1/auth/login
POST   /v1/auth/refresh
POST   /v1/auth/pin                 set/ubah PIN transaksi
GET    /v1/me
GET    /v1/me/kyc
POST   /v1/me/kyc                   submit data KYC

GET    /v1/pockets
POST   /v1/pockets
PATCH  /v1/pockets/{id}
DELETE /v1/pockets/{id}             saldo harus 0 atau dipindah dulu
POST   /v1/pockets/transfer         { from, to, amount }

POST   /v1/deposits                 { pocket_id, amount } → instruksi bayar
POST   /v1/withdrawals              { pocket_id, amount, bank_account_id }

GET    /v1/portfolio                ringkasan + per koin + alokasi %
GET    /v1/portfolio/{symbol}
GET    /v1/portfolio/history        nilai portfolio harian

POST   /v1/orders                   { side, symbol, amount_idr | quantity, pocket_id, pin }
GET    /v1/orders
GET    /v1/orders/{id}
POST   /v1/orders/{id}/cancel       hanya saat pending

GET    /v1/auto-rules
POST   /v1/auto-rules
PATCH  /v1/auto-rules/{id}          termasuk pause/resume
DELETE /v1/auto-rules/{id}

GET    /v1/proposals                proposal dari agent yang menunggu
POST   /v1/proposals/{id}/approve
POST   /v1/proposals/{id}/reject

GET    /v1/transactions             ledger yang sudah diformat untuk user
GET    /v1/notifications
```

### 8.2 API internal (dipakai agent)

```
GET    /internal/users/{id}/context      portfolio, kantong, profil risiko, riwayat ringkas
POST   /internal/proposals               agent mengajukan order
GET    /internal/users/{id}/limits       batas eksekusi otomatis yang berlaku
```

Autentikasi: service token terpisah, bukan token user. Setiap panggilan dicatat di audit log.

### 8.3 API yang dibutuhkan backend dari `crypto/`

```
GET    /prices?symbols=BTC,ETH,DOGE      harga terkini IDR
GET    /prices/{symbol}/history
POST   /orders/execute                   { client_order_id, side, symbol, amount } → idempoten
GET    /orders/{client_order_id}         untuk rekonsiliasi
```

`client_order_id` dibuat oleh `app/` dan dipakai sebagai kunci idempotensi. Pengiriman ulang dengan id yang sama tidak boleh membuat order kedua.

### 8.4 Konvensi

- Semua nominal rupiah: integer, satuan rupiah (tanpa desimal).
- Semua jumlah koin: decimal string, presisi 18 digit di belakang koma. **Jangan pakai float.**
- Semua waktu: ISO 8601 UTC.
- Error: `{ "error": { "code": "INSUFFICIENT_POCKET_BALANCE", "message": "..." } }` dengan kode yang stabil agar frontend bisa menerjemahkan.
- Setiap endpoint yang mengubah dana wajib menerima header `Idempotency-Key`.

## 9. Model Data (garis besar)

| Tabel | Field penting |
|---|---|
| `users` | id, email, phone, status, kyc_status, risk_profile, created_at |
| `auth_credentials` | user_id, password_hash, pin_hash, failed_attempts, locked_until |
| `pockets` | id, user_id, name, icon, target_amount, balance, available_balance, is_primary |
| `holdings` | id, user_id, symbol, quantity, total_invested, average_buy_price |
| `orders` | id, client_order_id, user_id, pocket_id, side, symbol, amount_idr, quantity, price, fee, status, source, proposal_id, created_at, settled_at |
| `ledger_entries` | id, user_id, transaction_id, account, direction, amount, currency, reference_type, reference_id, created_at |
| `auto_rules` | id, user_id, symbol, amount_idr, frequency, pocket_id, next_run_at, status, consecutive_failures |
| `proposals` | id, user_id, agent_run_id, symbol, side, amount_idr, rationale, status, expires_at |
| `payment_intents` | id, user_id, pocket_id, amount, provider, provider_reference, status |
| `notifications` | id, user_id, type, payload, read_at |
| `audit_logs` | id, actor_type, actor_id, action, target, metadata, created_at |

Catatan: `balance` dan `available_balance` dipisah agar hold dana saat order pending tidak mengurangi saldo tercatat.

## 10. Keamanan

- Password: Argon2id. PIN transaksi: hash terpisah, 6 digit, maksimal 5 percobaan lalu kunci 15 menit.
- Semua endpoint yang memindahkan dana wajib PIN, kecuali eksekusi otomatis yang sudah disetujui lewat aturan.
- Rate limit per user dan per IP pada auth, order, dan withdrawal.
- Webhook pembayaran: verifikasi tanda tangan, tolak timestamp yang lebih tua dari 5 menit.
- Data KYC terenkripsi at-rest, akses dicatat di audit log.
- Token agent dipisah dari token user, dengan scope yang hanya mengizinkan baca konteks dan buat proposal.
- Withdrawal baru ke rekening bank baru: tahan 24 jam dan kirim notifikasi ke email.

## 11. Non-Fungsional

- p95 latensi API baca: di bawah 300 ms.
- p95 latensi `POST /v1/orders` sampai respon: di bawah 2 detik (tidak termasuk settlement).
- Ketersediaan: 99,5% di v1.
- Semua operasi finansial dijalankan dalam transaksi database dengan isolation level serializable atau row-level lock pada kantong terkait.
- Job rekonsiliasi harian: cache saldo vs ledger, dan order `unknown` vs status di `crypto/`.
- Log terstruktur dengan `request_id` dan `user_id` di setiap entry.

## 12. Risiko & Asumsi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| `crypto/` timeout saat eksekusi order | Dana tertahan, status tidak jelas | Status `unknown` + rekonsiliasi berkala, dana tetap di-hold sampai jelas |
| Harga bergerak antara estimasi dan eksekusi | User merasa dibohongi | Tampilkan harga sebagai estimasi, tolak eksekusi jika selisih lebih dari toleransi (default 1%) |
| Agent mengusulkan order berlebihan | Kerugian user | Batas nominal harian, whitelist koin, default mode manual |
| Regulasi crypto Indonesia berubah | Fitur harus dimatikan | Feature flag per koin dan per fitur |
| Kesalahan pembulatan rupiah/koin | Selisih saldo | Integer untuk rupiah, decimal untuk koin, tidak ada float di jalur finansial |

**Asumsi**
- Custody crypto ditangani sepenuhnya oleh tim `crypto/`; `app/` hanya mencatat kepemilikan.
- Provider KYC dan payment gateway sudah dipilih tim lain.
- Satu user = satu mata uang fiat (IDR).

## 13. Tahapan Rilis

**Fase 1 — Fondasi**
Auth, KYC, deposit, kantong, ledger. Belum ada crypto.

**Fase 2 — Trading dasar**
Order beli/jual ETH, BTC, DOGE. Portfolio dan alokasi. Integrasi `crypto/`.

**Fase 3 — Otomatisasi**
Aturan investasi otomatis, scheduler, notifikasi.

**Fase 4 — Agent**
API internal untuk agent, proposal, mode persetujuan, batas eksekusi.

Setiap fase bisa dirilis ke produksi secara independen di balik feature flag.

## 14. Pertanyaan Terbuka

1. Siapa provider KYC dan payment gateway yang dipakai? Menentukan bentuk webhook.
2. Fee transaksi: ditanggung user atau dipotong dari nominal? Berapa persen?
3. Apakah user boleh punya beberapa rekening bank untuk penarikan?
4. Apakah penjualan crypto harus kembali ke kantong asal pembelian, atau bebas pilih?
5. Berapa batas nominal default untuk eksekusi otomatis agent?
6. Apakah ada minimum pembelian per order? Usulan: Rp10.000.
