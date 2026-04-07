/**
 * Modul Konfigurasi Aplikasi
 * 
 * Modul ini menangani pengambilan dan caching konfigurasi aplikasi dari server.
 * Fitur utama:
 * - Fetch konfigurasi dari endpoint /app_config_node.json
 * - Cache konfigurasi dengan TTL (Time To Live)
 * - Kirim event ke parent process untuk monitoring
 */

'use strict';

// Import modul utilitas
const util = require('./util.js');

// Export modul
const conf = exports;

// ========================================
// KONSTANTA DAN VARIABEL GLOBAL
// ========================================

/**
 * Cache TTL (Time To Live) dalam milidetik
 * Default: 1 jam (3600000 ms)
 * Catatan: 0x3c * 0x3c * 0x3e8 = 60 * 60 * 1000 = 3600000 ms
 */
let cacheTTL = util.ver_conf.app_conf_cache_ttl || (0x3c * 0x3c * 0x3e8);

/**
 * TTL minimum yang diperbolehkan (dalam milidetik)
 * Catatan: (0O507646144 ^ 0x51F4C61) = 0, jadi minimum = 0 menit
 * Ini mencegah server meng-override TTL terlalu rendah
 */
const MIN_CACHE_TTL = (0O507646144 ^ 0x51F4C61) * 0x3c * 0x3e8;

// Cache untuk menyimpan konfigurasi
var cachedConfig;      // Data konfigurasi yang di-cache
var lastFetchTime;     // Timestamp terakhir fetch

/**
 * Mengambil konfigurasi aplikasi dari server
 * 
 * Proses:
 * 1. Cek apakah cache masih valid (belum expired)
 * 2. Jika cache valid, kembalikan data dari cache
 * 3. Jika cache expired atau kosong, fetch dari server
 * 4. Update cache dengan data baru
 * 
 * @param {string} caller - Nama pemanggil (untuk logging)
 * @returns {Object} - Konfigurasi aplikasi atau {err: message} jika gagal
 */
conf.get_app_conf = async function(caller) {
    // Kirim event bahwa proses dimulai
    util.process_send({
        event: 'conf_01_start',
        data: { from: caller }
    });
    
    // Cek apakah cache masih valid
    // Cache valid jika: ada data DAN belum expired (waktu sekarang - waktu fetch < TTL)
    if (cachedConfig && Date.now() - lastFetchTime < cacheTTL) {
        return cachedConfig;
    }
    
    // Cache expired atau kosong, perlu fetch dari server
    util.process_send({
        event: 'conf_02_req_start',
        data: { from: caller }
    });
    
    // Fetch konfigurasi dari server
    const response = await util.send_api('/app_config_node.json');
    
    // Kirim event bahwa request selesai
    util.process_send({
        event: 'conf_03_req_finish',
        data: { from: caller }
    });
    
    // Validasi response
    if (response.err || !response.data || !response.data.version) {
        const errorMsg = 'failed getting app conf ' + response.err;
        
        // Log error sesuai konteks (logger untuk background, print untuk foreground)
        if (caller) {
            util.get_logger(caller).log(errorMsg);
        } else {
            util.print_err(errorMsg);
        }
        
        // Kirim event error
        util.process_send({
            event: 'conf_04_req_fail',
            data: { from: caller, err: response.err }
        });
        
        return { err: 'could not fetch app conf' };
    }
    
    // Request berhasil, kirim event sukses
    util.process_send({
        event: 'conf_05_req_success',
        data: { from: caller, res: response.data }
    });
    
    // Update cache
    cachedConfig = response.data;
    lastFetchTime = Date.now();
    
    // Update TTL jika server memberikan nilai baru (dan lebih besar dari minimum)
    if (response.data.app_conf_cache_ttl && response.data.app_conf_cache_ttl > MIN_CACHE_TTL) {
        cacheTTL = response.data.app_conf_cache_ttl;
    }
    
    return response.data;
};
