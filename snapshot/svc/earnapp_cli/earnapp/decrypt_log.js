#!/usr/bin/env node
/**
 * Script untuk mendekripsi file log EarnApp yang terenkripsi
 * 
 * Penggunaan:
 *   node decrypt_log.js <file_log_terenkripsi> [output_file]
 * 
 * Contoh:
 *   node decrypt_log.js brd_sdk3.log
 *   node decrypt_log.js brd_sdk3.log decrypted_output.log
 *   node decrypt_log.js /etc/earnapp/brd_sdk3.log > readable.log
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { Decipher } = require('./cipher_dec.js');

// Ambil argumen
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log('=== EarnApp Log Decryptor ===\n');
    console.log('Penggunaan:');
    console.log('  node decrypt_log.js <file_log> [output_file]\n');
    console.log('Contoh:');
    console.log('  node decrypt_log.js brd_sdk3.log');
    console.log('  node decrypt_log.js brd_sdk3.log output.log');
    console.log('  node decrypt_log.js /etc/earnapp/brd_sdk3.log > readable.log\n');
    process.exit(1);
}

const inputFile = args[0];
const outputFile = args[1];

// Cek file ada
if (!fs.existsSync(inputFile)) {
    console.error(`Error: File tidak ditemukan: ${inputFile}`);
    process.exit(1);
}

// Baca file
console.error(`Membaca: ${inputFile}`);
const encryptedData = fs.readFileSync(inputFile);
console.error(`Ukuran file: ${encryptedData.length} bytes`);

// Dekripsi
try {
    const decipher = new Decipher(encryptedData);
    const decrypted = Decipher.all(decipher);
    
    if (outputFile) {
        // Tulis ke file output
        fs.writeFileSync(outputFile, decrypted);
        console.error(`✓ Berhasil didekripsi ke: ${outputFile}`);
    } else {
        // Output ke stdout
        console.log(decrypted);
    }
    
    console.error(`✓ Dekripsi selesai!`);
} catch (err) {
    console.error(`Error saat dekripsi: ${err.message}`);
    process.exit(1);
}
