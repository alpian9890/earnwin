/**
 * Modul Enkripsi Cipher
 * 
 * File ini berisi kelas Encipher yang digunakan untuk mengenkripsi data
 * menggunakan algoritma cipher seperti RC4 atau cipher bawaan Node.js.
 * 
 * Proses enkripsi:
 * 1. Generate IV (Initialization Vector) secara random
 * 2. Derive key dari IV
 * 3. Enkripsi data menggunakan cipher yang dipilih
 * 4. Hitung checksum Adler32 dari data asli
 * 5. Buat header yang berisi magic number, IV, panjang data terenkripsi, dan checksum
 * 6. Gabungkan header dengan data terenkripsi
 */

'use strict';

// Import modul crypto bawaan Node.js untuk operasi kriptografi
const crypto = require('crypto');

// Import modul RC4 custom untuk enkripsi RC4
const rc4 = require('./rc4.js');

// Import kelas dan konstanta dari cipher_base.js
const { 
    Cipher_base,      // Kelas dasar untuk cipher
    ENCODING,         // Encoding yang digunakan (biasanya 'utf8')
    CIPHER_MAGIC,     // Magic number untuk identifikasi format cipher
    RC4_ALG           // Konstanta untuk algoritma RC4
} = require('./cipher_base.js');

/**
 * Kelas Encipher - Turunan dari Cipher_base
 * 
 * Kelas ini menangani proses enkripsi data dengan dukungan untuk:
 * - Algoritma RC4 (jika cipher == RC4_ALG)
 * - Algoritma cipher lainnya dari Node.js crypto (AES, dll)
 */
class Encipher extends Cipher_base {
    
    /**
     * Menghasilkan Initialization Vector (IV) untuk enkripsi
     * 
     * IV adalah nilai random yang digunakan untuk memastikan bahwa
     * enkripsi data yang sama akan menghasilkan output yang berbeda
     * setiap kali dienkripsi.
     * 
     * @returns {Buffer} - IV random dengan ukuran sesuai iv_sz
     */
    get_enc_iv() {
        return crypto.randomBytes(this.iv_sz);
    }
    
    /**
     * Mengenkripsi data plaintext
     * 
     * Proses:
     * 1. Generate IV random
     * 2. Derive encryption key dari IV
     * 3. Enkripsi data menggunakan RC4 atau cipher lainnya
     * 4. Hitung checksum Adler32 untuk integritas data
     * 5. Buat header dengan format:
     *    - 4 bytes: Magic number (LE)
     *    - N bytes: IV (sesuai iv_sz)
     *    - 4 bytes: Panjang data terenkripsi (BE)
     *    - 4 bytes: Checksum Adler32 (BE)
     * 6. Gabungkan header + data terenkripsi
     * 
     * @param {string} plaintext - Data yang akan dienkripsi
     * @returns {Buffer} - Data terenkripsi dengan header
     */
    encrypt(plaintext) {
        // Langkah 1: Generate IV (Initialization Vector) secara random
        const iv = this.get_enc_iv();
        
        // Langkah 2: Derive encryption key dari IV menggunakan metode di parent class
        const key = this.get_key(iv);
        
        // Langkah 3: Enkripsi data
        let encryptedData;
        
        if (this.cipher == RC4_ALG) {
            // Gunakan RC4 custom jika cipher adalah RC4
            encryptedData = rc4.do(key, Buffer.from(plaintext, ENCODING));
        } else {
            // Gunakan cipher bawaan Node.js (misal: AES)
            // Catatan: IV null karena sudah di-handle secara custom
            const cipherInstance = crypto.createCipheriv(this.cipher, key, null);
            encryptedData = cipherInstance.update(plaintext, ENCODING);
        }
        
        // Langkah 4: Hitung checksum Adler32 dari plaintext
        // Nilai 0x75bcd15 - 0O726746425 = 0 (seed awal untuk Adler32)
        // Catatan: 0x75bcd15 = 123456789, 0O726746425 = 123456789 (oktal)
        const checksum = this.adler32(plaintext, 0);
        
        // Langkah 5: Hitung ukuran header
        // (0x5E30A78 - 0O570605164) = 4 (ukuran field dalam bytes)
        // Header = 4 (magic) + iv.length + 4 (panjang encrypted) + 4 (checksum)
        const FIELD_SIZE = 4;
        const headerSize = FIELD_SIZE + iv.length + FIELD_SIZE + FIELD_SIZE;
        
        // Alokasi buffer untuk header
        const header = Buffer.alloc(headerSize);
        
        // Tulis header secara berurutan
        let offset = header.writeUInt32LE(CIPHER_MAGIC);  // Magic number (Little Endian)
        
        // Tulis IV ke header
        offset = offset + header.write(iv.toString('binary'), offset, this.iv_sz, 'binary');
        
        // Tulis panjang data terenkripsi (Big Endian)
        offset = header.writeUInt32BE(encryptedData.length, offset);
        
        // Tulis checksum Adler32 (Big Endian)
        header.writeUInt32BE(checksum, offset);
        
        // Langkah 6: Gabungkan header dengan data terenkripsi
        const result = Buffer.concat([header, encryptedData]);
        
        return result;
    }
}

// Export kelas Encipher
module.exports = { Encipher };
