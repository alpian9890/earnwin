'use strict';

// ===================================
// UTIL.JS - DEOBFUSCATED VERSION
// File utilitas untuk EarnApp CLI
// ===================================

// Import modul-modul yang diperlukan
const fs = require('fs');                          // Modul untuk operasi file system
const childProcess = require('child_process');     // Modul untuk menjalankan perintah shell
const crypto = require('crypto');                  // Modul untuk operasi kriptografi (hashing)
const axios = require('axios');                    // Modul untuk HTTP request
const chalk = require('chalk');                    // Modul untuk pewarnaan teks di terminal
const rimraf = require('rimraf');                  // Modul untuk menghapus folder secara rekursif
const { Encipher } = require('./cipher_enc.js');   // Modul enkripsi custom dari EarnApp
const verConf = require('./ver_conf.json');        // Konfigurasi versi aplikasi
const packageJson = require('./package.json');     // File package.json untuk info versi

// Alias untuk exports (objek yang akan diekspor)
const exports_ = exports;
const objectAssign = Object.assign;

// ===================================
// FUNGSI FORMAT TANGGAL/WAKTU
// ===================================

/**
 * Mengkonversi tanggal ke format ISO string yang lebih mudah dibaca
 * Menghilangkan karakter 'T' dan 'Z' dari format ISO
 * @param {Date} date - Objek tanggal (default: tanggal sekarang)
 * @returns {string} - Tanggal dalam format "YYYY-MM-DD HH:mm:ss.sss"
 */
const formatDateTime = (date = new Date()) => 
    date.toISOString().replace(/T/, ' ').replace(/Z$/, '');

// ===================================
// OBJEK FILE - OPERASI FILE SYSTEM
// ===================================

/**
 * Objek untuk menangani operasi file dengan error handling
 * Semua operasi dibungkus dalam try-catch untuk mencegah crash
 */
const fileOperations = {
    encoding: 'utf8', // Encoding default untuk baca/tulis file

    /**
     * Membaca isi file dan mengembalikan string yang sudah di-trim
     * @param {string} filePath - Path file yang akan dibaca
     * @returns {string|undefined} - Isi file atau undefined jika gagal
     */
    read: function(filePath) {
        return this.run(() => fs.readFileSync(filePath, this.encoding).trim());
    },

    /**
     * Membaca file JSON dan mengkonversi ke objek JavaScript
     * @param {string} filePath - Path file JSON
     * @returns {Object|undefined} - Objek hasil parsing atau undefined jika gagal
     */
    read_json: function(filePath) {
        const content = this.read(filePath);
        return this.run(() => JSON.parse(content));
    },

    /**
     * Menulis data ke file
     * @param {string} filePath - Path file tujuan
     * @param {string|Buffer} data - Data yang akan ditulis
     */
    write: function(filePath, data) {
        return this.run(() => fs.writeFileSync(filePath, data));
    },

    /**
     * Memeriksa apakah file/folder ada
     * @param {string} filePath - Path yang akan dicek
     * @returns {boolean|undefined} - true jika ada, false jika tidak, undefined jika error
     */
    exists: function(filePath) {
        return this.run(() => fs.existsSync(filePath));
    },

    /**
     * Membuat file kosong (seperti perintah 'touch' di Linux)
     * @param {string} filePath - Path file yang akan dibuat
     */
    touch: function(filePath) {
        return fs.writeFileSync(filePath, '');
    },

    /**
     * Menghapus file
     * @param {string} filePath - Path file yang akan dihapus
     */
    unlink: function(filePath) {
        return fs.unlinkSync(filePath);
    },

    /**
     * Menyalin file dari sumber ke tujuan
     * @param {string} source - Path file sumber
     * @param {string} destination - Path file tujuan
     * @param {number} flags - Flag opsional untuk operasi copy
     */
    copy: function(source, destination, flags) {
        return fs.copyFileSync(source, destination, flags);
    },

    /**
     * Mengganti nama atau memindahkan file
     * @param {string} oldPath - Path file lama
     * @param {string} newPath - Path file baru
     */
    rename: function(oldPath, newPath) {
        return fs.renameSync(oldPath, newPath);
    },

    /**
     * Mendapatkan ukuran file dalam bytes
     * @param {string} filePath - Path file
     * @returns {number|undefined} - Ukuran file dalam bytes
     */
    size: function(filePath) {
        return fs.statSync(filePath).size;
    },

    /**
     * Menghapus folder secara rekursif (seperti 'rm -rf')
     * @param {string} dirPath - Path folder yang akan dihapus
     */
    rm_rf: function(dirPath) {
        return rimraf.sync(dirPath);
    },

    /**
     * Helper function untuk menjalankan operasi dengan error handling
     * Membungkus operasi dalam try-catch, mengembalikan undefined jika error
     * @param {Function} operation - Fungsi yang akan dijalankan
     * @returns {*} - Hasil operasi atau undefined jika error
     */
    run: function(operation) {
        try {
            return operation();
        } catch (error) {
            // Error diabaikan, mengembalikan undefined
        }
    }
};

// Alias untuk objek file operations
const file = fileOperations;

// ===================================
// FUNGSI FORMAT LOG DENGAN TIMESTAMP
// ===================================

/**
 * Menambahkan timestamp di depan pesan log
 * @param {string} message - Pesan yang akan di-log
 * @returns {string} - Pesan dengan timestamp di depan
 */
const formatLogMessage = (message) => formatDateTime() + '\t' + message;

// ===================================
// KONFIGURASI LOGGER
// ===================================

/**
 * Konfigurasi untuk berbagai logger
 * Setiap logger memiliki file output masing-masing
 */
const loggerConfig = {
    autoupgrade: {
        filename: `${verConf.confdir}/upgrade_err.log` // File log untuk error saat auto-upgrade
    }
};

// Variabel untuk menyimpan instance Encipher (lazy initialization)
let encipherInstance;

// ===================================
// EKSPOR: GET_LOGGER
// ===================================

/**
 * Mendapatkan instance logger berdasarkan nama
 * Logger akan otomatis rotate file jika ukuran > 2MB
 * @param {string} loggerName - Nama logger (harus ada di loggerConfig)
 * @returns {Object} - Objek logger dengan method log() dan close()
 * @throws {Error} - Jika nama logger tidak valid
 */
exports_.get_logger = (loggerName) => {
    // Validasi nama logger
    if (!loggerConfig[loggerName] || !loggerConfig[loggerName].filename) {
        throw new Error(`invalid logger name: ${loggerName}`);
    }

    // Inisialisasi logger jika belum ada
    if (!loggerConfig[loggerName].handle) {
        const MAX_LOG_SIZE = 0x200000; // 2MB dalam bytes (2097152)
        const { filename } = loggerConfig[loggerName];

        // Rotasi log jika ukuran melebihi batas
        if (file.exists(filename)) {
            const fileSize = file.size(filename);
            if (fileSize > MAX_LOG_SIZE) {
                file.rename(filename, filename + '.1'); // Rename ke .1 sebagai backup
            }
        }

        // Menambahkan method log dan close ke logger
        objectAssign(loggerConfig[loggerName], {
            /**
             * Menulis pesan ke log file
             * @param {string} message - Pesan yang akan ditulis
             */
            log(message) {
                message = formatLogMessage(message);
                
                // Tampilkan ke console jika mode debug aktif
                if (verConf.debug) {
                    console.log(message);
                }
                
                message += '\n';
                
                // Enkripsi log jika dikonfigurasi
                if (verConf.encrypt_logs) {
                    encipherInstance = encipherInstance || new Encipher();
                    message = encipherInstance.encrypt(message);
                }
                
                // Tulis ke file (lazy initialization untuk stream)
                this.handle = this.handle || fs.createWriteStream(filename, { flags: 'a' });
                this.handle.write(message);
            },

            /**
             * Menutup file stream
             */
            close() {
                this.handle?.end?.();
            }
        });
    }

    return loggerConfig[loggerName];
};

// ===================================
// EKSPOR: FUNGSI PRINT ERROR & SUCCESS
// ===================================

/**
 * Mencetak pesan error ke console dengan ikon merah
 * @param {...any} args - Argumen yang akan dicetak
 */
exports_.print_err = (...args) => console.error(chalk.red('❌'), ...args);

/**
 * Mencetak pesan sukses ke console dengan ikon hijau
 * @param {...any} args - Argumen yang akan dicetak
 */
exports_.print_success = (...args) => console.log(chalk.green('✔'), ...args);

// ===================================
// PATH FILE KONFIGURASI
// ===================================

const UUID_FILE = `${verConf.confdir}/uuid`;           // File untuk menyimpan UUID perangkat
const STATUS_FILE = `${verConf.confdir}/status`;       // File untuk menyimpan status aplikasi
const REGISTERED_FILE = `${verConf.confdir}/registered`; // File untuk menyimpan status registrasi
const VER_FILE = `${verConf.confdir}/ver`;             // File untuk menyimpan versi runtime
const LICENSE_FILE = `${verConf.confdir}/license`;     // File untuk menyimpan lisensi

// ===================================
// EKSPOR: FUNGSI-FUNGSI KONFIGURASI
// ===================================

// Ekspor konfigurasi versi
exports_.ver_conf = verConf;

/**
 * Mendapatkan UUID perangkat dari file
 * @returns {string|undefined} - UUID perangkat
 */
exports_.get_uuid = () => file.read(UUID_FILE);

/**
 * Mendapatkan status aplikasi dari file
 * @returns {string} - Status aplikasi (string kosong jika tidak ada)
 */
exports_.get_status = () => file.read(STATUS_FILE) || '';

/**
 * Menyimpan status aplikasi ke file
 * @param {string} status - Status yang akan disimpan
 */
exports_.set_status = (status) => file.write(STATUS_FILE, status + '\n');

/**
 * Memeriksa apakah perangkat sudah terdaftar
 * @param {Object} options - Opsi tambahan
 * @param {boolean} options.obsolete - Jika true, return true meskipun UUID berbeda
 * @returns {boolean} - true jika sudah terdaftar, false jika belum
 */
exports_.is_registered = (options = {}) => {
    // NaN === NaN selalu false, jadi ini mengembalikan false jika file tidak ada
    if (!file.exists(REGISTERED_FILE)) {
        return (NaN === NaN); // Selalu false
    }
    
    // Jika mode obsolete, langsung return true
    if (options.obsolete) {
        return true;
    }
    
    // Bandingkan UUID saat ini dengan yang tersimpan
    return exports_.get_uuid() == file.read(REGISTERED_FILE);
};

/**
 * Menyimpan versi runtime ke file
 */
exports_.set_runtime_ver = () => file.write(VER_FILE, packageJson.version);

/**
 * Mendapatkan versi runtime dari file
 * @returns {string|undefined} - Versi runtime
 */
exports_.get_runtime_ver = () => file.read(VER_FILE);

/**
 * Menandai perangkat sebagai sudah terdaftar
 * Menyimpan UUID saat ini ke file registrasi
 */
exports_.set_registered = () => file.write(REGISTERED_FILE, exports_.get_uuid());

/**
 * Mendapatkan lisensi dari file
 * @returns {string|undefined} - Isi file lisensi
 */
exports_.get_license = () => file.read(LICENSE_FILE);

// ===================================
// EKSPOR: FUNGSI SEND_API
// ===================================

/**
 * Mengirim request ke API EarnApp
 * @param {string} endpoint - Endpoint API (tanpa domain)
 * @param {Object} options - Opsi request
 * @param {string} options.method - HTTP method (default: 'get')
 * @param {*} options.data - Data untuk body request
 * @returns {Promise<Object>} - Response dari axios
 */
exports_.send_api = async function(endpoint, options = {}) {
    // Log event mulai request (untuk debugging/monitoring)
    exports_.process_send({
        event: 'send_api_01_start',
        data: { endpoint, opt: options }
    });

    // Konstrusikan URL lengkap
    // (0x75bcd15-0O726746425) = 123456789 - 123456789 = 0, jadi mengambil api_domain[0]
    const url = 'https://' + verConf.api_domain[0] + endpoint;

    // Parameter query yang selalu dikirim
    const params = {
        uuid: exports_.get_uuid(),           // UUID perangkat
        version: packageJson.version,         // Versi aplikasi
        arch: process.arch,                   // Arsitektur sistem (x64, arm, dll)
        appid: verConf.appid,                 // ID aplikasi
        os: "Microsoft Windows 10 Pro"       // Versi sistem operasi
    };

    // Konfigurasi request axios
    const requestConfig = {
        method: options.method || 'get',
        url: url,
        params: params,
        data: options.data
    };

    // Log request (untuk debugging)
    exports_.process_send({
        event: 'send_api_02_req',
        data: requestConfig
    });

    // Kirim request
    const response = await axios(requestConfig);

    // Log response (untuk debugging)
    exports_.process_send({
        event: 'send_api_03_res',
        data: { err: response.err, res: response.data }
    });

    return response;
};

// ===================================
// EKSPOR: FUNGSI REQ_ROOT
// ===================================

/**
 * Memeriksa apakah aplikasi dijalankan sebagai root
 * Jika tidak, tampilkan pesan dan keluar
 * @param {string} command - Nama perintah yang memerlukan root
 */
exports_.req_root = (command) => {
    // (0x75bcd15-0O726746425) = 0, jadi memeriksa apakah UID == 0 (root)
    if (process.getuid() === 0) {
        return; // Sudah root, lanjutkan
    }
    
    // Bukan root, tampilkan pesan dan keluar
    console.log(
        'You need root permissions to run the installer.',
        'Use',
        chalk.green('sudo earnapp ' + command)
    );
    
    // (0O57060516-0xbc614d) = 12345678 - 12345677 = 1
    process.exit(1);
};

// ===================================
// EKSPOR: OBJEK FILE & UTILITAS
// ===================================

// Ekspor objek operasi file
exports_.file = file;

/**
 * Mengkonversi error ke string yang readable
 * Termasuk stack trace dan error code jika ada
 * @param {Error} error - Objek error
 * @returns {string} - String representasi error
 */
exports_.e2s = function(error) {
    let errorString = error && error.stack ? '' + error.stack : '' + error;
    
    // Tambahkan error code jika ada
    if (error && error.code) {
        errorString = '[code=' + error.code + '] ' + errorString;
    }
    
    return errorString;
};

/**
 * Fungsi sleep/delay menggunakan Promise
 * @param {number} ms - Waktu delay dalam milidetik
 * @returns {Promise} - Promise yang resolve setelah delay
 */
exports_.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Mengkonversi milidetik ke format durasi yang mudah dibaca
 * Contoh: 5000 -> "5s", 65000 -> "1m5s", 3600000 -> "1h"
 * @param {number} ms - Waktu dalam milidetik
 * @returns {string} - Durasi dalam format readable
 */
exports_.ms_to_dur = (ms) => {
    let unit = 'ms';
    
    // Jika kurang dari 1 detik, kembalikan dalam ms
    if (ms < 1000) {
        return ms + unit;
    }
    
    let prevUnit = null;
    let value = ms / 1000;       // Konversi ke detik
    let remainder = ms % 1000;   // Sisa milidetik
    
    // Iterasi untuk konversi ke unit yang lebih besar
    for (let u of ['s', 'm', 'h']) {
        prevUnit = unit;
        unit = u;
        
        // Jika kurang dari 60, stop di unit ini
        if (value < 60) break;
        
        remainder = value % 60;
        value = value / 60;
    }
    
    // Jika tidak ada sisa, kembalikan tanpa sisa
    if (remainder === 0) {
        return value + unit;
    }
    
    // Kembalikan dengan sisa (contoh: "1m30s")
    return value + unit + remainder + prevUnit;
};

// ===================================
// EKSPOR: OBJEK SYSTEMCTL
// ===================================

/**
 * Objek untuk berinteraksi dengan systemctl (service manager Linux)
 * Digunakan untuk mengelola service EarnApp
 */
exports_.systemctl = {
    /**
     * Reload konfigurasi daemon systemd
     */
    reload: () => childProcess.execSync('systemctl daemon-reload'),
    
    /**
     * Menjalankan service
     * @param {string} serviceName - Nama service
     */
    start: (serviceName) => childProcess.execSync('systemctl start ' + serviceName),
    
    /**
     * Menghentikan service
     * @param {string} serviceName - Nama service
     */
    stop: (serviceName) => childProcess.execSync('systemctl stop ' + serviceName),
    
    /**
     * Restart service
     * @param {string} serviceName - Nama service
     */
    restart: (serviceName) => childProcess.execSync('systemctl restart ' + serviceName),
    
    /**
     * Enable service (otomatis start saat boot)
     * @param {string} serviceName - Nama service
     */
    enable: (serviceName) => childProcess.execSync('systemctl enable ' + serviceName),
    
    /**
     * Disable service (tidak otomatis start saat boot)
     * @param {string} serviceName - Nama service
     */
    disable: (serviceName) => childProcess.execSync('systemctl disable ' + serviceName)
};

// ===================================
// EKSPOR: GET_CMD_OUTPUT
// ===================================

/**
 * Menjalankan perintah shell dan mendapatkan output-nya
 * @param {string} command - Perintah yang akan dijalankan
 * @param {Object} options - Opsi untuk child_process.exec
 * @returns {Promise<string>} - Output perintah (sudah di-trim)
 */
exports_.get_cmd_output = (command, options = { env: {} }) => 
    new Promise((resolve, reject) => 
        childProcess.exec(command, options, (error, stdout, stderr) => {
            if (error) return reject(error);
            resolve(stdout.trim());
        })
    );

// ===================================
// EKSPOR: GET_SERIAL
// ===================================

// Cache untuk serial number (agar tidak perlu baca ulang)
let serialCache;

/**
 * Mendapatkan serial number/identifier unik perangkat
 * Mencoba beberapa metode: device tree, ip link, ifconfig
 * @returns {Promise<string|undefined>} - Hash dari serial number
 */
exports_.get_serial = async () => {
    if (!serialCache) {
        // Metode 1: Baca dari device tree (untuk Raspberry Pi, dll)
        let serial = file.read('/sys/firmware/devicetree/base/serial-number');
        
        // Metode 2: Gunakan MAC address dari 'ip link show'
        if (!serial) {
            try {
                serial = await exports_.get_cmd_output(
                    "ip link show | awk '/link\\/ether/ {print $2}'",
                    { env: { LANG: 'C' } }
                );
            } catch (error) {
                // Gagal, coba metode selanjutnya
            }
        }
        
        // Metode 3: Gunakan MAC address dari '/sbin/ifconfig'
        if (!serial) {
            try {
                serial = await exports_.get_cmd_output(
                    "/sbin/ifconfig | awk '/ether/ {print $2}'"
                );
            } catch (error) {
                // Gagal
            }
        }
        
        // Jika semua metode gagal, kembalikan undefined
        if (!serial) return undefined;
        
        // Hash serial untuk privasi
        serialCache = exports_.get_hash(serial);
    }
    
    return serialCache;
};

// ===================================
// EKSPOR: GET_HASH
// ===================================

/**
 * Membuat hash dari data menggunakan algoritma tertentu
 * @param {string|Buffer} data - Data yang akan di-hash
 * @param {string} algorithm - Algoritma hash (default: 'sha1')
 * @returns {string} - Hash dalam format hexadecimal
 */
exports_.get_hash = (data, algorithm = 'sha1') => {
    const hash = crypto.createHash(algorithm);
    hash.update(data);
    return hash.digest('hex');
};

// ===================================
// EKSPOR: PROCESS_SEND
// ===================================

/**
 * Mengirim pesan ke parent process (jika ada)
 * Digunakan untuk IPC (Inter-Process Communication)
 * @param {Object} message - Pesan yang akan dikirim
 */
exports_.process_send = (message) => {
    // Cek apakah process.send tersedia (hanya ada jika dijalankan sebagai child process)
    if (!process.send) return;
    process.send(message);
};

// ===================================
// EKSPOR: GET_OS_VER
// ===================================

/**
 * Mendapatkan versi/nama sistem operasi
 * Mencoba beberapa metode untuk berbagai OS (macOS, Linux)
 * @returns {Promise<string>} - Nama dan versi OS
 */
exports_.get_os_ver = async () => {
    let result, output;
    
    // Daftar perintah dan regex untuk berbagai OS
    const commands = [
        { cmd: 'sw_vers', rx: /ProductName:\s+(.*)/ },               // macOS
        { cmd: 'hostnamectl', rx: /Operating System: (.*)/ },        // Linux dengan systemd
        { cmd: 'lsb_release -a', rx: /Description:\t(.*)/ },         // Linux dengan lsb_release
        { cmd: 'cat /etc/os-release', rx: /PRETTY_NAME="(.*)"/ }     // Linux dengan os-release
    ];
    
    // Coba setiap metode sampai berhasil
    for (const { cmd, rx } of commands) {
        try {
            output = await exports_.get_cmd_output(cmd);
        } catch (error) {
            continue; // Perintah gagal, coba yang berikutnya
        }
        
        // Cari pattern dalam output
        // (0O57060516-0xbc614d) = 1, jadi mengambil capture group pertama
        if (result = output.match(rx)) {
            return result[1];
        }
    }
    
    // Jika semua metode gagal
    return 'unknown';
};
