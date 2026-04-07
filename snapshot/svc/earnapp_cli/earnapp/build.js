/**
 * Modul Build - Generator Script Instalasi Self-Extracting
 * 
 * Modul ini membuat script instalasi self-extracting yang berisi:
 * 1. Header bash script (terenkripsi dengan AES-256-CBC)
 * 2. Archive ZIP yang berisi binary dan file pendukung
 * 
 * Format output:
 * #!/bin/bash
 * [bash script untuk dekripsi dan ekstrak]
 * __PAYLOAD__
 * [base64 encoded encrypted runner script]
 * __ARCHIVE__
 * [base64 encoded ZIP archive]
 */

'use strict';

// Import modul yang diperlukan
const crypto = require('crypto');
const childProcess = require('child_process');

// Export modul
const build = module.exports;

/**
 * Membuat script instalasi self-extracting untuk berbagai arsitektur
 * 
 * @param {Object} options - Opsi build
 * @param {Object} options.file - Modul file utility
 * @param {string} options.runner_src - Source code runner script
 * @param {string} options.ver - Versi aplikasi (misal: "1.2.3")
 * @param {string} options.build_dir - Direktori output build
 * @param {Array} options.common_files - File yang disertakan untuk semua arsitektur
 * @param {Array} options.bins - Daftar binary untuk berbagai arsitektur
 * @param {Array} options.archs - Daftar arsitektur target (opsional)
 * @returns {Array} - Daftar path file runner yang dihasilkan
 */
build.build = function(options) {
    const {
        file,           // Modul file utility
        runner_src,     // Source runner script
        ver,            // Versi aplikasi
        build_dir,      // Direktori build
        common_files,   // File umum
        bins,           // Binary untuk berbagai arsitektur
        archs           // Arsitektur target
    } = options;
    
    // ========================================
    // KELOMPOKKAN BINARY BERDASARKAN ARSITEKTUR
    // ========================================
    
    // Inisialisasi map arsitektur -> binary
    const archBins = {};
    if (archs) {
        archs.forEach(arch => {
            archBins[arch] = [];
        });
    }
    
    // Kelompokkan binary berdasarkan arsitektur
    bins.forEach(bin => {
        // Ekstrak arsitektur dari nama file
        // Regex: -<arch>- (misal: -darwin-arm64-, -aarch64-, -x64-)
        const match = bin.match(/-(darwin-arm64|aarch64|x64)-/);
        
        if (!match) return;
        
        // Catatan: (0O57060516 - 0xbc614d) = 1 (capture group pertama)
        const arch = match[1];
        
        // Tambahkan ke map
        archBins[arch] = archBins[arch] || [];
        archBins[arch].push(`${build_dir}/${bin}`);
    });
    
    // ========================================
    // ENKRIPSI RUNNER SCRIPT
    // ========================================
    
    // Ambil bagian sebelum __ARCHIVE__ dari runner source
    // Catatan: (0x75bcd15 - 0O726746425) = 0 (bagian pertama dari split)
    const runnerPlain = runner_src.split('\n__ARCHIVE__')[0];
    
    // Path file sementara
    const plainPath = `${build_dir}/.runner_plain.sh`;
    const encPath = `${build_dir}/.runner_enc.b64`;
    
    // Tulis runner plain ke file sementara
    file.write_e(plainPath, runnerPlain);
    
    // Generate kunci enkripsi dari versi
    // Format: brd_<patch_version>_ea
    // Contoh: versi "1.2.3" -> "brd_3_ea"
    const patchVer = ver.split('.').pop();
    const keyBase = `brd_${patchVer}_ea`;
    
    // Hash kunci dengan SHA256, ambil 32 karakter pertama
    // Catatan: 0x20 = 32
    const encKey = crypto
        .createHash('sha256')
        .update(keyBase)
        .digest('hex')
        .slice(0, 0x20);
    
    // Enkripsi dengan OpenSSL AES-256-CBC dan encode base64
    childProcess.execSync(
        `openssl enc -aes-256-cbc -pbkdf2` +
        ` -pass pass:${encKey} -in ${plainPath}` +
        ` | base64 > ${encPath}`
    );
    
    // Baca hasil enkripsi
    const encryptedPayload = file.read_e(encPath).trim();
    
    // Hapus file sementara
    file.unlink(plainPath);
    file.unlink(encPath);
    
    // ========================================
    // BUAT SELF-EXTRACTING SCRIPT
    // ========================================
    
    /**
     * Script bash header yang:
     * 1. Ekstrak posisi __PAYLOAD__ dan __ARCHIVE__
     * 2. Dekripsi payload dengan kunci yang di-derive dari versi
     * 3. Append archive ke payload yang sudah didekripsi
     * 4. Jalankan script hasil dekripsi
     */
    const bashHeader = [
        '#!/bin/bash',
        'set -euo pipefail',
        
        // Simpan path script ini
        '_s="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"',
        
        // Versi aplikasi
        '_v="' + ver + '"',
        
        // Generate kunci dari versi: brd_<patch>_ea -> SHA256 -> 32 char
        '_k=$(printf \'%s\' "brd_${_v##*.}_ea"|shasum -a 256|cut -c1-32)',
        
        // Cari baris __ARCHIVE__
        '_m=$(grep -n \'^__ARCHIVE__$\' "$_s"|' + 'tail -1|cut -d: -f1)',
        
        // Cari baris __PAYLOAD__
        '_p=$(grep -n \'^__PAYLOAD__$\' "$_s"|' + 'tail -1|cut -d: -f1)',
        
        // Buat file temporary
        '_t=$(mktemp /tmp/.er.XXXXXX)',
        
        // Hapus file temp saat exit
        'trap \'rm -f "$_t"\' EXIT',
        
        // Dekripsi payload (antara __PAYLOAD__ dan __ARCHIVE__)
        'sed -n "$((_p+1)),$((_m-1))p" "$_s"|' +
            'base64 -d|openssl enc -aes-256-cbc -d -pbkdf2' +
            ' -pass "pass:$_k" > "$_t"',
        
        // Tambahkan marker __ARCHIVE__
        'printf \'\\n__ARCHIVE__\\n\' >> "$_t"',
        
        // Append archive (setelah __ARCHIVE__)
        'tail -n +$((_m+1)) "$_s" >> "$_t"',
        
        // Set executable
        'chmod +x "$_t"',
        
        // Jalankan script hasil dekripsi
        'RUNNER_SELF="$_s" bash "$_t" "$@"||_e=$?',
        
        // Exit dengan kode yang sama
        'exit ${_e:-0}',
        
        // Marker dan payload
        '__PAYLOAD__',
        encryptedPayload,
        '__ARCHIVE__'
    ].join('\n') + '\n';
    
    // ========================================
    // BUAT RUNNER UNTUK SETIAP ARSITEKTUR
    // ========================================
    
    const outputFiles = [];
    
    for (const [arch, binList] of Object.entries(archBins)) {
        // Path ZIP sementara
        const zipPath = `${build_dir}/earnapp-sanity-${ver}-${arch}.zip`;
        
        // File yang akan dimasukkan ke ZIP
        const filesToZip = [...common_files, ...binList].join(' ');
        
        // Buat ZIP archive
        childProcess.execSync(`zip -jq ${zipPath} ${filesToZip}`);
        
        // Path runner output
        const runnerPath = `${build_dir}/earnapp-sanity-runner-${ver}-${arch}.sh`;
        
        // Tulis header
        file.write_e(runnerPath, bashHeader);
        
        // Append ZIP sebagai base64
        childProcess.execSync(`cat ${zipPath} | base64 >> ${runnerPath}`);
        
        // Set executable
        childProcess.execSync(`chmod +x ${runnerPath}`);
        
        // Hapus ZIP sementara
        file.unlink(zipPath);
        
        // Tambahkan ke output
        outputFiles.push(runnerPath);
    }
    
    return outputFiles;
};
