# DanaSiap

Aplikasi Android dan web untuk menyiapkan kebutuhan dari hari kerja yang benar-benar tersedia. Desain mengikuti referensi lime / charcoal pengguna, dengan tampilan web yang menyesuaikan layar lebar.

## Menjalankan proyek

Node.js 22 dan pnpm 10 diperlukan.

```sh
pnpm install
pnpm dev
pnpm test
pnpm typecheck
pnpm build
```

Web berjalan di port 5173. Jika sedang digunakan, jalankan `pnpm --filter @danasiap/web dev --port 5186`.

## Isi proyek

- `apps/web`: React + Vite, formulir transaksi/rencana/kehadiran, kalender, statistik, simulasi, backup JSON/CSV.
- `apps/mobile`: aplikasi Android React Native / Expo, SQLite lokal, notifikasi lokal, build APK.
- `packages/core`: model dan mesin prediksi yang sama untuk web, Android, dan server.
- `packages/sync`: Supabase Auth dan sinkronisasi dengan pengecekan revisi.
- `supabase`: database, kebijakan akses per pengguna, fungsi prediksi, pekerjaan pengingat.

## Cara perhitungan

Saldo aktual berasal dari saldo awal ditambah transaksi yang sudah terjadi. Kehadiran yang dikonfirmasi membuat satu transaksi pendapatan; mengedit kehadiran mengganti transaksi yang sama. Kehadiran masa depan tetap berupa rencana sampai dikonfirmasi. Hari libur tidak diberi proyeksi pendapatan.

Prediksi berjalan per tanggal selama 30 hari, memasukkan pengeluaran harian, utang, dan kebutuhan berulang. Nominal “dana disiapkan” adalah alokasi dari saldo, bukan tambahan uang atau pengeluaran kedua. Dana aman dipakai dibatasi oleh uang aktual dan kondisi terendah pada proyeksi.

Pengeluaran harian biasa mengurangi sisa anggaran harian. Pengeluaran kategori Mendadak / Darurat adalah tambahan. Membayar kebutuhan lewat Rencana membuat transaksi sekaligus memperbarui kebutuhan; jangan mencatat pembayaran yang sama sekali lagi di Catat transaksi.

Jadwal rutin dan anggaran harian ditentukan pengguna. Versi awal belum mempelajari pola secara otomatis. Prediksi bukan kepastian, dan tidak mengubah atau memindahkan uang bank.

## Data lokal dan cloud

Android menyimpan catatan di SQLite, web di penyimpanan browser. Keduanya bisa digunakan lokal tanpa akun. Data contoh tidak dicampur ke catatan pribadi. Backup JSON dapat dipindahkan antarperangkat; CSV tersedia untuk transaksi web.

Sinkronisasi lintas perangkat membutuhkan proyek Supabase aktif serta konfigurasi public URL/key. Gunakan panduan [Supabase](supabase/README.md) dan berkas `.env.example` masing-masing aplikasi. Jangan memasukkan service-role atau secret key ke aplikasi.

Konflik perubahan dari dua perangkat ditolak untuk mencegah kehilangan data. Versi awal meminta pengguna memilih data cloud atau mempertahankan cadangan lokal; penggabungan otomatis transaksi offline belum tersedia.

## Hosting web

Build menghasilkan `apps/web/dist`, siap untuk Cloudflare Pages. Build command `pnpm --filter @danasiap/web build`, output directory `apps/web/dist`. Untuk sinkron cloud, masukkan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` sebelum build. Subdomain penyedia hosting bisa digunakan tanpa membeli domain.

## APK dan pengingat

Build Android dijelaskan di `apps/mobile/README.md` bila sudah tersedia. Signing key dan kredensial berada pada direktori yang diabaikan Git. Simpan kunci tersebut untuk memperbarui instalasi yang sama nanti; jangan unggah ke repository.

Pengingat lokal Android memerlukan izin notifikasi. Pengingat dinamis dari server memerlukan Supabase Cron, fungsi pengingat, dan FCM/Expo push yang terkonfigurasi. Pengiriman Android dipengaruhi izin perangkat dan pengaturan baterai.

## Aset

Ilustrasi pembuka asli dibuat dengan imagegen bawaan, disimpan di `apps/web/public/welcome.png` dan disalin ke `apps/mobile/assets/welcome.png`. Brief: ilustrasi editorial garis tinta hitam, orang memegang koin di atas dompet lime, sweter putih, latar lime, tanpa teks atau antarmuka. Gambar referensi pengguna dipakai untuk arah visual dan tidak dimasukkan sebagai tampilan aplikasi.

Font Barlow Condensed dan DM Sans dibundel secara lokal. Ikon menggunakan Lucide dan ikon Expo sesuai aplikasi.
