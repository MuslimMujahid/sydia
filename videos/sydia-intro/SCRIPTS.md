# Naskah video Sydia

Cara edit: ubah teks setelah `:` saja. Jangan ubah `id` di dalam backtick, karena id itu dipakai untuk mencocokkan teks dengan file suara. Boleh menambah atau menghapus baris. Untuk baris baru, buat id baru dengan format `nama-pembicara`, misalnya `nanya-rina`.

Aturan karakter: Rina pakai "aku". Sydia pakai "saya" dan "Anda". Angka ditulis dengan huruf supaya dibaca benar oleh suara.

---

## 1. Undangan nikahan (SydiaTiktokUndangan)

Konsep: undangan menumpuk, Rina memfoto undangan Sarah, lalu Sydia memasukkannya ke kalender dan mengingatkan beli kado.

- `hook-rina` (Rina): Undangan nikahan Sarah numpuk sama undangan lain. Tanggalnya kapan, ya?
- `send-rina` (Rina): Aku foto undangannya aja ahh, kirim ke Sydia.
- `reply-sydia` (Sydia): Sarah dan Bagas, Sabtu tujuh November, jam sebelas siang, di Graha Cakrawala.
- `gift-sydia` (Sydia): Sudah masuk kalender Anda. Tiga hari sebelumnya saya ingatkan beli kado.
- `thanks-rina` (Rina): Okedeh ,kalau dengan Sydia pasti aman.
- `end-sydia` (Sydia): Foto sekali, jadwal, undangan semua beres.

## 2. Ganti oli (SydiaTiktokOli)

Konsep: montir menanyakan kapan terakhir ganti oli. Sydia menjawab dari catatan harian Rina, lalu memasang pengingat.

- `hook-rina` (Rina): Montirnya nanya, terakhir ganti oli kapan? Aku lupa.
- `ask-rina` (Rina): Sydia, terakhir aku ganti oli kapan?
- `reply-sydia` (Sydia): Dua puluh tujuh Agustus, hari Kamis, tepat dua bulan yang lalu.
- `minta-rina` (Rina): Udah lama. Ingetin aku ganti oli lagi, ya.
- `ingat-sydia` (Sydia): Siap. Dua bulan lagi, dua puluh tujuh Desember, saya ingatkan.
- `end-sydia` (Sydia): Catat sekali, sisanya saya yang ingat.

## 3. Kontrak kos (SydiaTiktokKos)

Konsep: Rina menemukan anak kucing. Sydia membaca kontrak kos (PDF) dan membuatkan draf pesan untuk Ibu Kos, lalu Rina menyalin dan mengirimnya sendiri.

- `hook-rina` (Rina): Aku nemu anak kucing di depan kos. Boleh nggak, ya, dibawa masuk?
- `ask-rina` (Rina): Sydia, di kontrak kos aku boleh bawa hewan nggak?
- `reply-sydia` (Sydia): Pasal tujuh: hewan peliharaan boleh, asal izin pemilik kos dulu.
- `draft-rina` (Rina): Buatin pesan buat Ibu Kos, dong.
- `draft-sydia` (Sydia): Ini drafnya. Anda salin, lalu kirim sendiri.
- `end-sydia` (Sydia): Kirim sekali, sydia yang bantu ingatkan.

## 4. Tukang AC (SydiaTiktokAc), belum selesai

Konsep: AC menetes dan Rina lupa nama tukangnya. Sydia menemukan kontak "Pak Joko" (alias "Tukang AC"), lalu Rina menelepon sendiri.

- `hook-rina` (Rina): AC-nya netes, panas banget. Tukang yang kemarin, aku lupa namanya.
- `ask-rina` (Rina): Sydia, nomor tukang AC yang kemarin siapa?
- `reply-sydia` (Sydia): Pak Joko, tukang AC. Terakhir datang bulan Maret. Nomornya saya kirim.
- `call-rina` (Rina): Nah, ini dia. Aku telepon sekarang.
- `end-sydia` (Sydia): Sydia, asisten pribadi mu.

## 5. Call dadakan / Google Meet (SydiaTiktokMeet)

Konsep: klien tiba-tiba minta call. Rina minta Sydia menjadwalkan Meet dengan Pak Budi. Sydia mencari email Pak Budi dari kontak dan mengirim undangan Google. Linknya awalnya "sedang dibuat", lalu Sydia mengirim pesan "Link Google Meet sudah siap".

- `hook-rina` (Rina): Pak Budi tiba-tiba minta call jam dua. Mepet banget, link Meet belum ada!
- `ask-rina` (Rina): Sydia, jadwalin Meet sama Pak Budi jam dua, ya.
- `reply-sydia` (Sydia): Siap. Undangan sudah saya kirim ke email Pak Budi. Link Meet-nya sedang dibuat.
- `ready-sydia` (Sydia): Link Google Meet sudah siap. Pak Budi juga sudah dapat undangannya.
- `thanks-rina` (Rina): Okedeh, aku tinggal gabung aja.
- `end-sydia` (Sydia): Call dadakan, Sydia yang siapkan.

---

# Video lama (sudah jadi)

## 6. Kue ulang tahun Dita (SydiaTiktokKue)

- `hook-rina` (Rina): Besok Dita ulang tahun. Aku mau pesan kue buat kejutan.
- `ragu-rina` (Rina): Eh, tapi Dita ada alergi nggak, ya? Kayaknya pernah cerita.
- `ask-rina` (Rina): Sydia, Dita alergi apa, ya? Mau pesan kue ulang tahun.
- `reply-sydia` (Sydia): Dita alergi kacang. Anda cerita bulan Juli, waktu makan siang bareng. Pilih kue tanpa kacang, ya.
- `pick-rina` (Rina): Hampir aja pesan brownies kacang! Ganti red velvet, deh.
- `thanks-rina` (Rina): Makasih, Sydia! Kuenya udah dipesan.
- `thanks-sydia` (Sydia): Sama-sama, Rina. Besok jam tujuh pagi, saya ingatkan untuk ucapkan selamat ke Dita.
- `end-sydia` (Sydia): Hal kecil tentang orang tersayang, biar Sydia yang ingatkan.

## 7. KTP dan KK (SydiaTiktokKtp)

- `hook-rina` (Rina): Duh, formulirnya minta foto KTP sama KK.
- `gallery-rina` (Rina): Galeri isinya ribuan foto. Nyarinya dari mana, coba?
- `ingat-rina` (Rina): Eh, bentar. Kan udah aku simpan di Sydia!
- `ask-rina` (Rina): Sydia, kirimin foto KTP sama KK aku, dong.
- `reply-sydia` (Sydia): Ini KTP dan KK Anda. Langsung bisa diunggah ke formulirnya.
- `upload-rina` (Rina): Tinggal unggah, beres! Nggak perlu bongkar galeri lagi.
- `thanks-rina` (Rina): Makasih, Sydia! Formulirnya udah kekirim.
- `thanks-sydia` (Sydia): Sama-sama, Rina. Akta kelahiran dan NPWP Anda juga saya simpan, kalau nanti dibutuhkan.
- `end-sydia` (Sydia): Simpan sekali. Siap kapan pun Anda butuh.

## 8. Langganan (SydiaTiktokLangganan)

- `hook-rina` (Rina): Netflix, Spotify, ChatGPT, belum lagi trial ini, trial itu.
- `boncos-rina` (Rina): Kalau lupa tanggalnya, tahu-tahu saldo kepotong. Boncos!
- `log-rina` (Rina): Untung, tiap daftar langganan aku selalu bilang ke Sydia.
- `brief-sydia` (Sydia): Selamat pagi, Rina. Trial Canva Pro habis besok, dan Netflix diperpanjang lusa. Mau lanjut atau berhenti?
- `decide-rina` (Rina): Canva stop aja. Netflix lanjut.
- `ok-sydia` (Sydia): Siap. Batalkan Canva hari ini, ya, biar nggak kepotong. Netflix tetap jalan.
- `end-sydia` (Sydia): Biar saya yang ingat tanggalnya.

## 9. Pengingat voice note (SydiaTiktokPengingat)

- `hook-rina` (Rina): Duh, telat! Tangan penuh, nggak sempat ngetik.
- `vn-rina` (Rina): Sydia, nanti jam tujuh malam ingetin aku beli obat buat Mama. Terus besok pagi transfer SPP Adik, ya.
- `reply-sydia` (Sydia): Siap, dua-duanya sudah saya catat. Beli obat untuk Mama jam tujuh malam, dan transfer SPP Adik besok pagi.
- `remind-sydia` (Sydia): Rina, waktunya beli obat untuk Mama.
- `again-sydia` (Sydia): Belum sempat, ya? Saya ingatkan lagi. Obat Mama jangan sampai lupa.
- `done-rina` (Rina): Udah beli! Makasih, Sydia.
- `done-sydia` (Sydia): Sip, saya tandai selesai. Besok pagi saya ingatkan soal SPP.
- `end-sydia` (Sydia): Cukup kirim voice note. Sisanya, biar saya yang urus.

## 10. Deadline numpuk (TikTok pertama)

- `hook-rina` (Rina): Deadline numpuk semua. Aku harus mulai dari mana, sih?
- `log-rina` (Rina): Untungnya, tiap hari aku rajin catat semuanya di Sydia.
- `ask-rina` (Rina): Sydia, urutin tugasku dari yang paling mepet, dong.
- `list-sydia` (Sydia): Siap. Pertama, laporan bulanan untuk Bu Ratna, besok jam lima sore. Kedua, revisi logo klien, hari Kamis. Ketiga, slide rapat, hari Jumat.
- `steps-sydia` (Sydia): Mulai dari laporan dulu, ya. Langkah pertama, kumpulkan data penjualan. Cukup tiga puluh menit.
- `relief-rina` (Rina): Oke, sekarang jelas. Gas!
- `end-sydia` (Sydia): Satu per satu, pasti beres.

## 11. Grafik presentasi (video usecase, bukan TikTok)

- `flash-rina` (Rina): Sydia, simpan grafik ini, ya. Penting buat presentasi klien nanti.
- `flash-sydia` (Sydia): Siap, sudah saya simpan. Kapan pun butuh, tinggal tanya.
- `today-rina` (Rina): Aduh, grafiknya belum masuk! Nama filenya apa, ya?
- `ask-rina` (Rina): Sydia, grafik penjualan yang aku simpan bulan lalu, kirim sekarang, ya.
- `ask-sydia` (Sydia): Ini grafiknya. Anda simpan tanggal dua puluh empat September, dari Mbak Sinta. Semangat presentasinya!
- `thanks-rina` (Rina): Makasih, Sydia. Kamu penyelamat!
- `thanks-sydia` (Sydia): Sama-sama. Saya siap membantu, kapan saja.
- `end-sydia` (Sydia): Biar saya yang ingat.
