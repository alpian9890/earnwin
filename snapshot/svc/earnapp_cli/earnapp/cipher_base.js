/**
 * Modul Cipher Base - Kelas Dasar untuk Enkripsi/Dekripsi
 * 
 * Modul ini menyediakan:
 * - Kelas dasar Cipher_base dengan fungsi get_key() dan adler32()
 * - Konstanta untuk encoding, magic number, dan algoritma cipher
 * - Fungsi derivasi kunci menggunakan PBKDF2
 * 
 * Digunakan sebagai parent class untuk Encipher dan Decipher
 */

'use strict';

// Import modul crypto bawaan Node.js
const crypto = require('crypto');

// ========================================
// KONSTANTA
// ========================================

/**
 * Encoding yang digunakan untuk string
 */
const ENCODING = 'utf8';

/**
 * Magic number untuk identifikasi format cipher
 * Nilai: 3845267346 (0xE5321F92)
 * Digunakan di header data terenkripsi untuk validasi format
 */
const CIPHER_MAGIC = 3845267346;

/**
 * Konstanta untuk algoritma RC4
 */
const RC4_ALG = 'rc4';

/**
 * Algoritma cipher default
 */
const DEFAULT_CIPHER = RC4_ALG;

/**
 * Salt default (kosong)
 */
const DEFAULT_SALT = '';

/**
 * Kunci default yang di-hardcode
 * Key ini digunakan jika tidak ada secret yang diberikan
 */
const DEFAULT_KEY = Buffer.from('0fed3863ba344de422ad9a917c17649e', 'hex');

/**
 * Konstanta Adler-32
 */
const ADLER_MOD = 65521;      // 0xFFF1 - bilangan prima terbesar < 65536
const ADLER_NMAX = 5552;       // Jumlah maksimum iterasi sebelum modulo

// ========================================
// FUNGSI DERIVASI KUNCI
// ========================================

/**
 * Derivasi kunci menggunakan PBKDF2
 * 
 * Fungsi ini menghasilkan key dan IV dari buffer input menggunakan
 * Password-Based Key Derivation Function 2 (PBKDF2).
 * 
 * @param {Buffer} buf - Buffer input (password/secret)
 * @param {string} salt - Salt untuk derivasi
 * @param {Buffer|null} customIV - IV custom (jika null, akan digenerate)
 * @param {number} iterations - Jumlah iterasi PBKDF2 (default: 100)
 * @param {number} keySize - Ukuran key output dalam bytes (default: 16)
 * @param {number} ivSize - Ukuran IV dalam bytes (default: 0)
 * @returns {Object} - Object berisi {key: Buffer, iv: Buffer}
 */
const deriveKey = (buf, salt, customIV, iterations = 100, keySize = 16, ivSize = 0) => {
    // Jika buf tidak ada, gunakan DEFAULT_KEY langsung (tanpa derivasi)
    if (!buf) {
        return { key: DEFAULT_KEY, iv: Buffer.alloc(0) };
    }
    
    // Gunakan PBKDF2 untuk derivasi key
    const key = crypto.pbkdf2Sync(
        buf,          // Password
        salt,         // Salt
        iterations,   // Jumlah iterasi
        keySize,      // Panjang key output
        'sha256'      // Algoritma hash
    );
    
    // Generate atau gunakan IV yang diberikan
    let iv;
    if (customIV !== null) {
        iv = customIV;
    } else if (ivSize > 0) {
        // Generate IV dari PBKDF2 juga
        iv = crypto.pbkdf2Sync(
            buf,
            salt + '_iv',
            iterations,
            ivSize,
            'sha256'
        );
    } else {
        iv = Buffer.alloc(0);
    }
    
    return { key, iv };
};

// ========================================
// KELAS CIPHER_BASE
// ========================================

/**
 * Kelas dasar untuk operasi cipher
 * 
 * Menyediakan fungsi-fungsi umum yang digunakan oleh
 * kelas turunan Encipher dan Decipher
 */
class Cipher_base {
    /**
     * Konstruktor Cipher_base
     * 
     * @param {Buffer} buf - Buffer data/secret
     * @param {string} salt - Salt untuk derivasi kunci (default: '')
     * @param {string} cipher - Algoritma cipher ('rc4', 'aes-128-ecb', dll)
     * @param {Buffer|null} customIV - IV custom (null untuk auto-generate)
     * @param {number} iterations - Jumlah iterasi PBKDF2 (default: 100)
     */
    constructor(
        buf,
        salt = DEFAULT_SALT,
        cipher = DEFAULT_CIPHER,
        customIV = null,
        iterations = 0x64  // 100
    ) {
        // Simpan buffer dan cipher
        this.buf = buf;
        this.cipher = cipher;
        
        // Derivasi key dan IV
        // Catatan: 0x10 = 16 (ukuran key default)
        // Catatan: (0x75bcd15 - 0O726746425) = 0 (ukuran IV default)
        const derived = deriveKey(customIV, salt, null, iterations, 0x10, 0);
        Object.assign(this, derived);
        
        // Offset untuk parsing (digunakan oleh Decipher)
        this.offset = 0;
        
        // Ukuran IV (gunakan panjang IV jika ada, atau panjang key)
        this.iv_sz = this.iv.length ? this.iv.length : this.key.length;
        
        // Ukuran header:
        // 4 bytes (magic) + iv_sz + 4 bytes (length) + 4 bytes (checksum)
        // Catatan: (0x5E30A78 - 0O570605164) = 4
        this.hdr_sz = 4 + this.iv_sz + 4 + 4;
    }
    
    /**
     * Mendapatkan kunci enkripsi berdasarkan IV
     * 
     * Jika IV kosong, XOR key dengan parameter iv yang diberikan
     * Jika IV ada, kembalikan key langsung
     * 
     * @param {Buffer} iv - Initialization Vector
     * @returns {Buffer} - Kunci enkripsi
     */
    get_key(iv) {
        // Clone key ke buffer baru
        let key = Buffer.from(this.key);
        
        // Jika IV sudah ada di instance, kembalikan key langsung
        if (this.iv.length) {
            return key;
        }
        
        // Jika tidak, XOR key dengan IV parameter
        for (let i = 0; i < key.length; i++) {
            key[i] ^= iv[i];
        }
        
        return key;
    }
    
    /**
     * Menghitung checksum Adler-32
     * 
     * Adler-32 adalah algoritma checksum yang lebih cepat dari CRC32.
     * Menggunakan optimisasi dengan batasan NMAX untuk mengurangi
     * operasi modulo.
     * 
     * @param {string} data - Data untuk dihitung checksum-nya
     * @param {number} seed - Nilai awal (biasanya 1 atau 0)
     * @returns {number} - Nilai checksum Adler-32 (32-bit unsigned)
     */
    adler32(data, seed) {
        // Pisahkan seed menjadi A (lower 16 bits) dan B (upper 16 bits)
        let a = seed & 0xFFFF;
        let b = (seed >>> 16) & 0xFFFF;
        
        let index = 0;
        const len = data.length;
        let count;
        
        // Proses data dalam chunk untuk optimisasi
        while (index < len) {
            // Proses maksimal ADLER_NMAX bytes sekaligus
            count = Math.min(ADLER_NMAX, len - index);
            
            do {
                // A = A + byte
                // B = B + A
                a += data.charCodeAt(index++);
                b += a;
            } while (--count);
            
            // Modulo setelah setiap chunk
            a %= ADLER_MOD;
            b %= ADLER_MOD;
        }
        
        // Gabungkan B dan A menjadi nilai 32-bit unsigned
        // Catatan: (0x75bcd15 - 0O726746425) = 0
        return ((b << 16) | a) >>> 0;
    }
}

// ========================================
// EXPORTS
// ========================================

module.exports = {
    Cipher_base,    // Kelas dasar cipher
    ENCODING,       // Encoding string ('utf8')
    CIPHER_MAGIC,   // Magic number untuk header (3845267346)
    RC4_ALG         // Konstanta algoritma RC4 ('rc4')
};
