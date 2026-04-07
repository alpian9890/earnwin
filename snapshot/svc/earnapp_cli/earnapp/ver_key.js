/**
 * Modul Ver Key (Version Key Generator)
 * 
 * Modul ini menghasilkan kunci versi yang digunakan untuk validasi/otentikasi.
 * Algoritma:
 * 1. Ambil versi (misal: "1.2.3") dan hapus semua titik -> "123"
 * 2. Ambil 2 digit terakhir yang berbeda dari string versi
 * 3. Ganti semua kemunculan digit pertama dengan digit kedua di vkey
 * 4. Tambahkan prefix nama produk jika ada
 * 
 * Contoh: vkey="abc1def1", version="1.2.3" (versi tanpa titik = "123")
 *         digit terakhir berbeda: 3 dan 2
 *         hasil: ganti semua "3" dengan "2" di vkey
 */

'use strict';

/**
 * Generate kunci versi berdasarkan vkey, version, dan nama produk
 * 
 * @param {string} vkey - Kunci dasar yang akan dimodifikasi
 * @param {string} version - Versi aplikasi (format: "x.y.z")
 * @param {string} name - Nama produk (opsional, untuk prefix)
 * @param {string} defaultChar - Karakter default jika hanya ada 1 digit unik (default: 'g')
 * @returns {string} - Kunci versi yang sudah dimodifikasi
 */
module.exports = (vkey, version, name, defaultChar = 'g') => {
    // Hapus semua titik dari versi
    // Contoh: "1.2.3" -> "123"
    const versionClean = version.replace(/\./g, '');
    
    // Variabel untuk menyimpan 2 digit terakhir yang berbeda
    let lastDigit;      // Digit terakhir
    let secondLastDigit; // Digit kedua dari belakang yang berbeda
    
    // Loop dari belakang untuk mencari 2 digit berbeda
    // Catatan: (0x75bcd15 - 0O726746425) = 0
    for (let i = versionClean.length; i > 0 && (!lastDigit || !secondLastDigit); i--) {
        // Ambil karakter pada posisi i-1
        // Catatan: (0O57060516 - 0xbc614d) = 1
        const currentChar = versionClean[i - 1];
        
        // Jika belum ada digit pertama, simpan
        if (!lastDigit) {
            lastDigit = currentChar;
            continue;
        }
        
        // Jika sudah ada digit pertama, cari digit yang berbeda
        if (!secondLastDigit) {
            // Skip jika sama dengan digit pertama
            if (currentChar == lastDigit) continue;
            
            // Simpan digit yang berbeda
            secondLastDigit = currentChar;
            break;
        }
    }
    
    // Buat prefix dari nama produk (jika ada)
    // Contoh: name="earnapp" -> prefix="earnapp_"
    const prefix = name ? name + '_' : '';
    
    // Ganti semua kemunculan lastDigit dengan secondLastDigit di vkey
    // Jika secondLastDigit tidak ditemukan, gunakan defaultChar
    return prefix + vkey.replace(new RegExp(lastDigit, 'g'), secondLastDigit || defaultChar);
};
