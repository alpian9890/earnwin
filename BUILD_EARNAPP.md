# Build Ulang EarnApp (dari hasil extract)

Dokumentasi ini menjelaskan cara build ulang binary EarnApp dari folder:

`~/earnapp-extracted/snapshot/svc/earnapp_cli/earnapp`

> Catatan: ini **rebuild untuk testing/research lokal** dari hasil extract, bukan jaminan binary identik 100% dengan rilis resmi.

---

## 1) Prasyarat

Pastikan di server sudah ada:

- Node.js (contoh yang dipakai saat test: `v18.20.8`)
- npm (contoh: `10.8.2`)
- akses internet (untuk `npx pkg` download base runtime)

Cek versi:

```bash
node -v
npm -v
```

---

## 2) Masuk ke folder source hasil extract

```bash
cd ~/earnapp-extracted/snapshot/svc/earnapp_cli/earnapp
```

(Opsional) cek CLI source:

```bash
node index.js --help
```

---

## 3) Build binary Linux x64

Perintah yang dipakai:

```bash
mkdir -p ~/earnapp-rebuild-test
npx --yes pkg . --targets node18-linux-x64 --out-path ~/earnapp-rebuild-test
```

Output binary biasanya menjadi:

```bash
~/earnapp-rebuild-test/EarnApp
```

---

## 4) Verifikasi hasil build

Cek file + tipe binary:

```bash
ls -lah ~/earnapp-rebuild-test
file ~/earnapp-rebuild-test/EarnApp
```

Tes jalan:

```bash
~/earnapp-rebuild-test/EarnApp --help
```

Kalau sukses, akan muncul command:

- start
- stop
- status
- register
- showid
- uninstall

---

## 5) Catatan warning saat build

Saat build dari source extract, warning seperti modul internal missing/obfuscated bisa muncul (contoh: beberapa modul di `peer_node/util`), tapi binary tetap dapat terbentuk.

Ini normal untuk source hasil decompile/extract.

---

## 6) (Opsional) checksum hasil build

Untuk tracking versi build:

```bash
sha256sum ~/earnapp-rebuild-test/EarnApp
```

Simpan hash tersebut ke catatan build.

---

## 7) Ringkasan singkat (quick copy)

```bash
cd ~/earnapp-extracted/snapshot/svc/earnapp_cli/earnapp
mkdir -p ~/earnapp-rebuild-test
npx --yes pkg . --targets node18-linux-x64 --out-path ~/earnapp-rebuild-test
~/earnapp-rebuild-test/EarnApp --help
```

