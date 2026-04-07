/**
 * Modul Test Runner (Mocha)
 * 
 * Modul ini mengelola eksekusi test menggunakan framework Mocha.
 * Test dikategorikan menjadi:
 * - integrity: Test integritas file/sistem
 * - unit: Test unit untuk operator, util, dan client
 * - e2e: End-to-end test
 */

'use strict';

// Import modul path untuk manipulasi path file
const path = require('path');

// Import framework Mocha untuk testing
const Mocha = require('mocha');

// Import konfigurasi versi dari util
const { ver_conf } = require('./util.js');

// Export modul
const testRunner = module.exports;

// ========================================
// KONFIGURASI FILE TEST
// ========================================

/**
 * Mapping kategori test ke file test masing-masing
 */
const testFiles = {};

// Test integritas - memverifikasi integritas file/sistem
testFiles.integrity = [
    path.join(__dirname, './test/integrity.test.js')
];

// Unit test - test individual untuk setiap modul
testFiles.unit = [
    path.join(__dirname, './test/operator.test.js'),   // Test operator commands
    path.join(__dirname, './test/util.test.js'),       // Test utility functions
    path.join(__dirname, './test/client.test.js')      // Test peer node client
];

// End-to-end test - test integrasi penuh
testFiles.e2e = [
    path.join(__dirname, './test/e2e.test.js')
];

/**
 * Menjalankan test suite berdasarkan opsi yang diberikan
 * 
 * @param {Object} options - Opsi untuk test runner
 * @param {boolean} options.unit - Jalankan unit test (default: true)
 * @param {boolean} options.e2e - Jalankan e2e test (default: true)
 * @param {boolean} options.integrity - Jalankan integrity test (default: berdasarkan ver_conf.name)
 * @returns {Promise<boolean>} - true jika semua test pass, false jika ada yang gagal
 */
testRunner.run = async function(options) {
    // Set opsi test global (diakses oleh file test)
    // Default: unit dan e2e aktif, integrity aktif jika ada nama produk di ver_conf
    global.test_opt = Object.assign({
        unit: true,
        e2e: true,
        integrity: ver_conf.name  // Aktif jika ver_conf.name ada (truthy)
    }, options);
    
    // Buat instance Mocha baru
    const mocha = new Mocha({});
    
    // Tambahkan file test berdasarkan kategori yang diaktifkan
    for (const category in testFiles) {
        // Skip jika kategori tidak diaktifkan
        if (!global.test_opt[category]) continue;
        
        // Tambahkan semua file dalam kategori
        for (const testFile of testFiles[category]) {
            mocha.addFile(testFile);
        }
    }
    
    // Jalankan test dan return Promise
    return new Promise((resolve, reject) => {
        mocha.run()
            // Handler ketika ada test yang gagal
            .on('fail', (test, error) => {
                console.log(error);
                resolve(false);  // Catatan: NaN === NaN = false
            })
            // Handler ketika semua test selesai
            .on('end', () => {
                resolve(true);   // Catatan: !![] = true
            });
    });
};
