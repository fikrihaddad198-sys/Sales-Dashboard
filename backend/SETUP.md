# Setup Gatekeeper Akses (Apps Script + Telegram)

Panduan sekali setup. Setelah selesai, kirim **URL Web App** (yang diakhiri `/exec`)
ke saya supaya saya pasang ke aplikasi.

---

## 1. Buat Bot Telegram (2 menit)

1. Buka Telegram, cari **@BotFather**.
2. Kirim `/newbot`, ikuti instruksi (kasih nama + username bot).
3. BotFather kasih **token** seperti `8123456789:AAH....`. **Simpan.**

## 2. Cari Chat ID kamu

1. Cari bot baru kamu, tekan **Start**, kirim pesan apa saja (misal `halo`).
2. Cara cepat dapat Chat ID: cari **@userinfobot**, tekan Start → dia kirim ID kamu (angka).
3. **Simpan angka itu** (itu `TG_OWNER_CHAT`).

## 3. Buat Apps Script

1. Buka spreadsheet data (yang ada sheet **bacot**).
2. Menu **Extensions → Apps Script**.
3. Hapus isi `Code.gs` bawaan, **paste seluruh isi** file `backend/Code.gs`.
4. Di blok **CONFIG** atas, isi:
   - `TG_BOT_TOKEN` → token dari langkah 1
   - `TG_OWNER_CHAT` → chat id dari langkah 2
   - `OWNER_IDS` → pastikan ID Fore kamu ada (default `'5857'` & `'1'`)
   - Cek `SPREADSHEET_ID` & `DATA_SHEET` sudah benar.
5. **Save** (ikon disket).

## 4. Tes koneksi bot

1. Di Apps Script, pilih fungsi **`testTelegram`** di dropdown atas, klik **Run**.
2. Pertama kali akan minta **izin** (Authorize) → pilih akun Google kamu → Allow.
3. Kalau berhasil, kamu dapat pesan "Bot tersambung" di Telegram.

## 5. Deploy sebagai Web App

1. Klik **Deploy → New deployment**.
2. Ikon gerigi → pilih tipe **Web app**.
3. Setelan:
   - **Execute as**: `Me` (akun kamu)
   - **Who has access**: `Anyone`
4. **Deploy** → Authorize bila diminta.
5. Salin **Web app URL** (diakhiri `/exec`). **Ini yang dikirim ke saya.**

## 6. Pasang webhook Telegram (biar tombol Setujui/Tolak jalan)

Buka URL ini di browser (ganti `<BOT_TOKEN>` dan `<EXEC_URL>`):

```
https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=<EXEC_URL>
```

Kalau muncul `{"ok":true,...}` → berhasil.

## 7. Kunci data (PENTING untuk keamanan)

Supaya data tidak bisa diambil tanpa login:

1. Buka spreadsheet → tombol **Share**.
2. Bagian **General access** → ubah dari "Anyone with the link" menjadi
   **Restricted** (hanya kamu).

Karena Apps Script jalan "Execute as: Me", aplikasi tetap bisa baca data
lewat gatekeeper, tapi orang lain **tidak** bisa akses sheet langsung.

---

## Selesai

Kirim ke saya: **Web app URL (`/exec`)**. Saya pasang ke aplikasi, lalu:
- User daftar (ID Fore + Nama) → kamu dapat notif Telegram → tap ✅/❌
- Disetujui → user dapat akses **30 menit**, lalu harus daftar ulang
- Kamu (ID 5857) → masuk otomatis tanpa approval & tanpa batas waktu

### Mengganti durasi / owner nanti
Ubah `SESSION_MIN` atau `OWNER_IDS` di CONFIG, lalu **Deploy → Manage deployments
→ Edit → Version: New version → Deploy** (URL tetap sama).
