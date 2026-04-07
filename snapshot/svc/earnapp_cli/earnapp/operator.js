/**
 * Modul Operator - Handler untuk Perintah CLI EarnApp
 * 
 * Modul ini berisi fungsi-fungsi handler untuk berbagai perintah CLI:
 * - verify_license: Verifikasi lisensi aplikasi
 * - ensure_registered: Pastikan device terdaftar di server
 * - status_handler: Cek status aplikasi (enabled/disabled)
 * - start_handler: Memulai EarnApp
 * - stop_handler: Menghentikan EarnApp
 * - register_handler: Menampilkan URL registrasi
 * - showid_handler: Menampilkan device UUID
 * - detect_duplicated_process: Deteksi proses duplikat
 */

'use strict';

// Import modul-modul yang diperlukan
const chalk = require('chalk');              // Untuk output berwarna
const ora = require('ora');                  // Untuk spinner/loading indicator
const client = require('./peer_node/client.js');  // Client untuk komunikasi peer
const util = require('./util.js');           // Fungsi utilitas
const { get_app_conf } = require('./conf.js');    // Konfigurasi aplikasi

// Export modul
const operator = exports;

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Cek apakah status aplikasi adalah 'enabled'
 * 
 * @returns {boolean} - true jika status dimulai dengan 'enabled'
 */
const isEnabled = () => {
    const status = util.get_status();
    return status.startsWith('enabled');
};

/**
 * Tampilkan pesan warning dengan ikon kuning
 * 
 * @param {string} message - Pesan utama
 * @param {...any} args - Argumen tambahan untuk format string
 */
const warn = (...args) => {
    const [message, ...rest] = args;
    console.log('%s ' + message, chalk.yellow('⚠'), ...rest);
};

// ========================================
// HANDLER FUNCTIONS
// ========================================

/**
 * Verifikasi lisensi aplikasi
 * 
 * Proses:
 * 1. Cek apakah UUID sudah ada (jika tidak, skip verifikasi)
 * 2. Ambil konfigurasi verify_license dari peer node
 * 3. Kirim request verifikasi ke server dengan serial, product, dan license
 * 4. Jika gagal, tunggu dan retry
 * 
 * @returns {boolean} - true jika lisensi valid
 */
operator.verify_license = async function() {
    const verConf = util.ver_conf;
    
    // Jika belum ada UUID, anggap valid (skip verifikasi)
    if (!util.get_uuid()) return true;
    
    // Ambil konfigurasi verify_license dari peer (dengan fallback ke local config)
    const { verify_license: verifyConfig = verConf.verify_license } = await client('verify_license');
    
    // Jika tidak ada config verify_license, anggap valid
    if (!verifyConfig) return true;
    
    // Ambil data yang diperlukan untuk verifikasi
    const license = util.get_license();
    const productName = verConf.name;
    const serial = await util.get_serial();
    
    try {
        // Kirim request verifikasi ke server
        const response = await util.send_api('/verify_license', {
            method: 'post',
            data: {
                serial: serial,
                product: productName,
                license: license
            }
        });
        
        // Cek apakah response valid
        if (response.data[productName] && response.data[productName] == serial) {
            return true;
        }
    } catch (error) {
        // Error diabaikan, lanjut ke retry logic
    }
    
    // Lisensi tidak valid, tunggu sebelum retry
    // Default delay: 12 jam (0xc * 0x3c * 0x3c * 0x3e8 = 12 * 60 * 60 * 1000 ms)
    const retryDelay = +verifyConfig || (0xc * 0x3c * 0x3c * 0x3e8);
    
    warn('invalid license: next check in %s', util.ms_to_dur(retryDelay));
    
    // Tunggu dan retry rekursif
    await util.sleep(retryDelay);
    return operator.verify_license();
};

/**
 * Pastikan device sudah terdaftar di server
 * 
 * @param {Object} options - Opsi
 * @param {boolean} options.force - Paksa registrasi ulang
 * @returns {boolean} - true jika berhasil terdaftar
 */
operator.ensure_registered = async function(options = {}) {
    try {
        // Handle migrasi dari format registrasi lama
        if (options.force && !util.is_registered() && util.is_registered({ obsolete: 1 })) {
            util.set_registered();
            return true;
        }
        
        // Jika sudah terdaftar, return true
        if (util.is_registered()) return true;
        
        // Mulai proses registrasi
        const spinner = ora('Registering Device...').start();
        
        // Kirim request registrasi ke server
        const response = await util.send_api('/install_device', {
            method: 'post',
            data: {
                serial: await util.get_serial()
            }
        });
        
        // Validasi response
        if (!response || !response.data) {
            spinner.fail('Failed registering device');
            return false;  // Catatan: NaN === NaN = false
        }
        
        // Handle response sukses
        if (response.data.ok) {
            util.set_registered();
            spinner.succeed('Registered');
        } else if (response.data.preinstall) {
            // Mode preinstall tidak perlu set_registered
            spinner.succeed('Registered (preinstall mode)');
        } else {
            spinner.fail('Failed registering device (unexpected response)');
            return false;
        }
        
        return true;
    } catch (error) {
        console.error(error);
    }
    
    return false;
};

/**
 * Handler untuk perintah 'status'
 * Menampilkan status EarnApp (enabled/disabled)
 */
operator.status_handler = async function() {
    const spinner = ora('Checking status...').start();
    
    // Delay singkat untuk UX (0x320 = 800ms)
    await util.sleep(0x320);
    
    const enabled = isEnabled();
    const message = 'Current status: ' + (enabled ? 'enabled' : 'disabled');
    
    spinner.succeed(message);
};

/**
 * Handler untuk perintah 'start'
 * Memulai EarnApp dan memastikan device terdaftar
 * 
 * @param {Object} options - Opsi
 * @param {boolean} options.force - Paksa start meskipun sudah running
 */
operator.start_handler = async function(options = {}) {
    const spinner = ora('Starting EarnApp...');
    
    // Cek apakah sudah berjalan (kecuali force mode)
    const alreadyEnabled = isEnabled();
    if (alreadyEnabled && !options.force) {
        return spinner.fail(
            'EarnApp was already started before.',
            'To check status run:',
            chalk.yellow('earnapp status')
        );
    }
    
    // Set status ke enabled
    util.set_status('enabled');
    
    // Pastikan device terdaftar
    const registered = await operator.ensure_registered({ force: options.force });
    
    if (!registered) {
        return console.log('Failed registration: check internet connection and try again');
    }
    
    spinner.succeed('EarnApp is active (making money in the background)');
};

/**
 * Handler untuk perintah 'stop'
 * Menghentikan EarnApp
 */
operator.stop_handler = () => {
    const spinner = ora('Stopping EarnApp...');
    
    // Cek apakah sedang berjalan
    const isRunning = isEnabled();
    if (!isRunning) {
        return spinner.fail(
            'EarnApp is not running, nothing to stop',
            'To start run:',
            chalk.green('earnapp start')
        );
    }
    
    // Set status ke disabled
    util.set_status('disabled');
    
    const message = 'EarnApp stopped. Run: ' + chalk.green('earnapp start') + ' to activate again';
    spinner.succeed(message);
};

/**
 * Handler untuk perintah 'register'
 * Menampilkan URL untuk registrasi device ke akun pengguna
 */
operator.register_handler = () => {
    const uuid = util.get_uuid();
    
    warn('You must register it for earnings to be added to your account.');
    warn(
        'Open the following URL in the browser:\n  %s',
        chalk.yellow(`https://earnapp.com/r/${uuid}`)
    );
};

/**
 * Handler untuk perintah 'showid'
 * Menampilkan UUID device
 */
operator.showid_handler = () => {
    console.log(util.get_uuid());
};

/**
 * Deteksi proses EarnApp duplikat
 * 
 * Menggunakan 'ps' untuk mencari proses earnapp yang berjalan.
 * Jika ditemukan lebih dari 1, log error ke peer node.
 */
operator.detect_duplicated_process = async function() {
    const logOptions = { log_tail: true };
    
    // Path executable berbeda untuk macOS dan Linux
    const execPath = process.platform === 'darwin'
        ? '/usr/local/bin/earnapp'
        : '/usr/bin/earnapp';
    
    // Command untuk menghitung proses earnapp yang running
    const countCmd = 'ps aux|grep "' + execPath + ' run"' + ' | grep -v grep | wc -l';
    
    try {
        const count = await util.get_cmd_output(countCmd);
        
        // Jika lebih dari 1 proses, log error
        // Catatan: (0O57060516 - 0xbc614d) = 1
        if (count > 1) {
            client.perr('dup_run', { count: count }, logOptions);
        }
    } catch (error) {
        client.perr('dup_run_check_fail', { err: util.e2s(error) }, logOptions);
    }
};
