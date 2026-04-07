/**
 * Modul RC4 (Rivest Cipher 4)
 * 
 * RC4 adalah algoritma stream cipher yang mengenkripsi data byte per byte.
 * Algoritma ini terdiri dari 2 fase:
 * 1. Key Scheduling Algorithm (KSA) - Inisialisasi state array berdasarkan key
 * 2. Pseudo-Random Generation Algorithm (PRGA) - Generate keystream dan XOR dengan data
 */

'use strict';

// Export modul
const rc4 = exports;

/**
 * Melakukan enkripsi/dekripsi RC4
 * 
 * @param {Buffer|Array} key - Kunci enkripsi
 * @param {Buffer} data - Data yang akan dienkripsi/dekripsi
 * @returns {Buffer} - Hasil enkripsi/dekripsi
 */
rc4.do = (key, data) => {
    // State array (S-box) - array 256 elemen
    const S = [];
    
    // Index untuk iterasi
    let i = 0;
    let j = 0;
    
    // Array hasil output
    const output = [];

    // ========================================
    // FASE 1: Key Scheduling Algorithm (KSA)
    // ========================================
    
    // Isi state array dengan nilai 0-255
    for (i = 0; i < 256; i++) {
        S[i] = i;
    }
    
    // Permutasi state array berdasarkan key
    j = 0;
    for (i = 0; i < 256; i++) {
        j = (j + S[i] + key[i % key.length]) % 256;
        // Swap S[i] dengan S[j]
        const temp = S[i];
        S[i] = S[j];
        S[j] = temp;
    }
    
    // ========================================
    // FASE 2: Pseudo-Random Generation (PRGA)
    // ========================================
    
    i = 0;
    j = 0;
    
    for (let k = 0; k < data.length; k++) {
        i = (i + 1) % 256;
        j = (j + S[i]) % 256;
        
        // Swap S[i] dengan S[j]
        const temp = S[i];
        S[i] = S[j];
        S[j] = temp;
        
        // XOR data dengan keystream byte
        output.push(data[k] ^ S[(S[i] + S[j]) % 256]);
    }
    
    return Buffer.from(output);
};
