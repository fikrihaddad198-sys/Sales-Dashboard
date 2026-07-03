# Setup — Staff Management Backend (Apps Script + Supabase)

Panduan sekali setup untuk sistem staff baru (login Fore ID + register + approval owner).
**Tidak perlu `service_role` / kunci rahasia apa pun** — desainnya sengaja tanpa kunci master.

Setelah deploy, kirim ke saya **URL Web App** (`/exec`) kalau berubah dari yang lama.

---

## 1. Aktifkan konfirmasi email di Supabase (1 menit)

1. Buka Supabase → project kamu → **Authentication → Sign In / Providers → Email**.
2. Pastikan **"Confirm email"** = ON. (Ini yang bikin user dapat email konfirmasi saat daftar.)
3. Tes: nanti saat register pertama, cek email masuk (kadang di folder Spam).

## 2. Buat tab `staff` di spreadsheet data

1. Buka spreadsheet data (yang ada sheet **bacot**).
2. Tambah sheet/tab baru bernama **`staff`** (huruf kecil).
3. Baris pertama (header), isi persis 7 kolom ini:

   | A | B | C | D | E | F | G |
   |---|---|---|---|---|---|---|
   | fore_id | email | status | is_owner | created_at | approved_at | last_seen |

4. **Tambah baris owner-mu** (biar kamu tidak terkunci):
   - `fore_id`: pilih angka 3–8 digit, misal **`100`**
   - `email`: email Supabase-mu yang sekarang (`fikrihaddad198@gmail.com`)
   - `status`: **`active`**
   - `is_owner`: **`TRUE`**
   - `created_at` & `approved_at`: tanggal hari ini (bebas format)
   - `last_seen`: kosongkan

5. **Migrasi user lama:** untuk tiap user Supabase yang sudah ada, tambah satu baris:
   `fore_id` (angka unik), `email` mereka, `status`=`active`, `is_owner`=(kosong), dst.
   *(Kalau belum ada user lain, lewati.)*

## 3. Paste kode & deploy Apps Script

1. Buka spreadsheet → **Extensions → Apps Script**.
2. Hapus isi `Code.gs`, **paste seluruh isi** `backend/Code.gs` (versi baru).
3. Cek blok **CFG** atas: `SPREADSHEET_ID`, `DATA_SHEET`, `SUPA_URL`, `SUPA_KEY` sudah benar.
   (Tidak ada kunci rahasia yang perlu diisi — anon key aman.)
4. **Save**.
5. **Deploy → Manage deployments → (deployment yang ada) → Edit → Version: New version → Deploy.**
   → URL `/exec` **tetap sama** (jadi tidak perlu kirim ulang ke saya).
   *(Kalau belum pernah deploy: Deploy → New deployment → Web app → Execute as: **Me**, Who has access: **Anyone** → Deploy → salin URL `/exec`.)*
6. Kalau diminta **Authorize** → pilih akun Google → Allow.
   ⚠️ Versi ini kirim **email notifikasi ke owner** tiap ada staff baru daftar, jadi
   Apps Script minta izin **kirim email atas nama kamu** (scope Gmail baru). Kalau
   deploy tidak memunculkan prompt authorize, jalankan sekali fungsi `apiRegister`
   dari editor (Run) supaya prompt-nya muncul, lalu **Allow**. Tanpa izin ini,
   pendaftaran tetap jalan tapi email notifikasi tidak terkirim.

## 4. Tes backend (checklist — buka URL di browser)

Ganti `<EXEC>` dengan URL `/exec` kamu. Tiap URL harus balas `callback({...})`.

1. **resolveLogin (owner-mu):**
   `<EXEC>?action=resolveLogin&fore_id=100&callback=cb`
   → harus muncul email-mu + `"status":"active"` + `"is_owner":true`.

2. **register (user tes):**
   `<EXEC>?action=register&fore_id=999&email=EMAILTESMU@gmail.com&callback=cb`
   → `{"ok":true}` **dan** baris baru muncul di tab `staff` dengan status `pending`.
   *(Register asli nanti dari app; email konfirmasi dikirim oleh app, bukan URL ini.)*

3. **data tanpa token:**
   `<EXEC>?action=data&callback=cb`
   → `{"ok":false,"error":"no_session"}` (bagus — artinya data terkunci).

Kalau ada yang error, perbaiki di Apps Script lalu **Deploy versi baru** lagi.

---

## Selesai

Kalau ketiga tes di atas hijau → **kabari saya**, lalu saya kerjakan bagian frontend
(halaman Masuk/Daftar + Kelola Staff). Kalau URL `/exec` berubah, kirim yang baru.

**Cara kerja sistemnya:**
- Staff **Daftar** (Fore ID, email, password) → dapat email konfirmasi → klik konfirmasi.
- Kamu (owner) buka **Kelola Staff** → **Aktifkan** akun itu.
- Staff **Masuk** pakai **Fore ID + password**.
- Kamu bisa lihat siapa **online**, **nonaktifkan**, atau **hapus** kapan saja.
- Semua data tetap terkunci: hanya status `active` yang bisa menariknya.
