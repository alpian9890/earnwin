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

## 3) Cek Syntax Sebelum Build

**PENTING**: Selalu cek syntax semua file JavaScript sebelum build untuk menghindari error runtime.

### Cek syntax satu file:
```bash
node --check index.js
node --check cipher_base.js
node --check cipher_enc.js
node --check cipher_dec.js
```

### Cek syntax semua file .js di folder utama:
```bash
for f in *.js; do echo "Checking $f..."; node --check "$f" || echo "ERROR: $f"; done
```

### Cek syntax file-file penting:
```bash
node --check index.js && \
node --check cipher_base.js && \
node --check cipher_enc.js && \
node --check cipher_dec.js && \
node --check util.js && \
node --check rc4.js && \
echo "✓ Semua file syntax OK"
```

Jika ada error syntax, perbaiki dulu sebelum melanjutkan ke build.

---

## 4) Build binary Linux x64

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

## 5) Verifikasi hasil build

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
- dec_log (untuk dekripsi log terenkripsi)

---

## 6) Catatan warning saat build

Saat build dari source extract, warning seperti modul internal missing/obfuscated bisa muncul (contoh: beberapa modul di `peer_node/util`), tapi binary tetap dapat terbentuk.

Ini normal untuk source hasil decompile/extract.

---

## 7) (Opsional) checksum hasil build

Untuk tracking versi build:

```bash
sha256sum ~/earnapp-rebuild-test/EarnApp
```

Simpan hash tersebut ke catatan build.

---

## 8) Ringkasan singkat (quick copy)

```bash
cd ~/earnapp-extracted/snapshot/svc/earnapp_cli/earnapp

# Cek syntax dulu
for f in *.js; do node --check "$f" 2>&1 | grep -v "^Syntax OK" || true; done

# Build
mkdir -p ~/earnapp-rebuild-test
npx --yes pkg . --targets node18-linux-x64 --out-path ~/earnapp-rebuild-test

# Test
~/earnapp-rebuild-test/EarnApp --help
```
