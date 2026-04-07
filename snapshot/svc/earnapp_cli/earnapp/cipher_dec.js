/**
 * Modul Dekripsi Cipher
 * 
 * File ini berisi kelas Decipher untuk mendekripsi log yang terenkripsi.
 * Format data terenkripsi:
 * - 4 bytes: Magic number (Little Endian)
 * - N bytes: IV (ukuran sesuai iv_sz, default 16)
 * - 4 bytes: Panjang data terenkripsi (Big Endian)
 * - 4 bytes: Checksum Adler32 (Big Endian)
 * - M bytes: Data terenkripsi
 */

'use strict';

const crypto = require('crypto');
const rc4 = require('./rc4.js');
const { Cipher_base, ENCODING, CIPHER_MAGIC, RC4_ALG } = require('./cipher_base.js');

/**
 * Kelas Decipher - Mendekripsi data yang dienkripsi oleh Encipher
 */
class Decipher extends Cipher_base {
    /**
     * Konstruktor Decipher
     * @param {Buffer} buf - Buffer data terenkripsi
     */
    constructor(buf) {
        super(buf);
        this.buf = buf;
        this.offset = 0;
    }

    /**
     * Mendekripsi satu blok data
     * @returns {string|null} - Data yang didekripsi atau null jika selesai/error
     */
    decrypt() {
        // Cek apakah masih ada data untuk dibaca
        if (this.offset >= this.buf.length) {
            return null;
        }

        // Baca magic number (4 bytes, Little Endian)
        if (this.offset + 4 > this.buf.length) return null;
        const magic = this.buf.readUInt32LE(this.offset);
        
        // Validasi magic number
        if (magic !== CIPHER_MAGIC) {
            // Mungkin data tidak terenkripsi atau corrupt
            return null;
        }
        this.offset += 4;

        // Baca IV
        if (this.offset + this.iv_sz > this.buf.length) return null;
        const iv = this.buf.slice(this.offset, this.offset + this.iv_sz);
        this.offset += this.iv_sz;

        // Baca panjang data terenkripsi (4 bytes, Big Endian)
        if (this.offset + 4 > this.buf.length) return null;
        const encLen = this.buf.readUInt32BE(this.offset);
        this.offset += 4;

        // Baca checksum (4 bytes, Big Endian)
        if (this.offset + 4 > this.buf.length) return null;
        const checksum = this.buf.readUInt32BE(this.offset);
        this.offset += 4;

        // Baca data terenkripsi
        if (this.offset + encLen > this.buf.length) return null;
        const encryptedData = this.buf.slice(this.offset, this.offset + encLen);
        this.offset += encLen;

        // Derive key dari IV
        const key = this.get_key(iv);

        // Dekripsi data
        let decrypted;
        if (this.cipher === RC4_ALG) {
            decrypted = rc4.do(key, encryptedData);
        } else {
            const decipher = crypto.createDecipheriv(this.cipher, key, null);
            decrypted = decipher.update(encryptedData);
        }

        return decrypted.toString(ENCODING);
    }

    /**
     * Mendekripsi semua blok dalam buffer
     * @param {Decipher} decipher - Instance Decipher
     * @returns {string} - Semua data yang didekripsi digabung
     */
    static all(decipher) {
        const results = [];
        let chunk;
        while ((chunk = decipher.decrypt()) !== null) {
            results.push(chunk);
        }
        return results.join('');
    }
}

module.exports = { Decipher };
