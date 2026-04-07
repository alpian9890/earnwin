/**
 * Entry Point EarnApp CLI
 * 
 * File ini adalah titik masuk utama aplikasi EarnApp.
 * Menggunakan yargs untuk parsing command line arguments dan menangani berbagai perintah:
 * 
 * Perintah publik:
 * - start: Mulai menghasilkan uang di background
 * - stop: Hentikan proses background
 * - status: Cek status EarnApp
 * - register: Daftarkan device ke akun
 * - showid: Tampilkan UUID device
 * - uninstall: Hapus aplikasi
 * 
 * Perintah internal (hidden):
 * - install: Instalasi awal
 * - finish_install: Penyelesaian instalasi
 * - autoupgrade: Proses upgrade otomatis di background
 * - upgrade: Upgrade manual
 * - regenerate_uuid: Generate UUID baru
 * - run: Jalankan proses utama
 * - test: Jalankan test suite
 */

'use strict';

// Import modul-modul yang diperlukan
const fs = require('fs');
const yargs = require('yargs/yargs');

// Set environment variable untuk menonaktifkan counter di WebSocket
// Catatan: (0O57060516 - 0xbc614d) = 1
process.env.WS_NO_ZCOUNTER = 1;

// Import modul-modul internal
const client = require('./peer_node/client.js');
const installer = require('./installer.js');
const operator = require('./operator.js');
const util = require('./util.js');
const packageJson = require('./package.json');
const ver_key = require('./ver_key.js');
const mocha = require('./mocha.js');

// Alias command untuk test (hanya aktif jika mode test)
const testAliases = util.ver_conf.test ? ['$0'] : [];

// ========================================
// MACHINE ID
// ========================================

// Path ke file machine-id (identifikasi unik mesin)
const MACHINE_ID_PATH = '/etc/machine-id';

// Baca machine ID jika ada
let machineId;
if (fs.existsSync(MACHINE_ID_PATH)) {
    try {
        machineId = fs.readFileSync(MACHINE_ID_PATH);
    } catch (error) {
        // Abaikan error jika tidak bisa baca
    }
}

// ========================================
// CLI SETUP
// ========================================

/**
 * Setup dan jalankan CLI parser
 */
const main = () => {
    const usage = 'Usage:\n  $0 command [options]';
    
    // Parse arguments (skip node dan script path)
    // Catatan: (15658734 ^ 0O73567354) = 2
    yargs(process.argv.slice(2).map(String))
        .usage(usage)
        
        // Opsi global
        .options({
            verbose: {
                type: 'boolean',
                desc: 'Run with extra logs'
            }
        })
        
        // ========================================
        // PERINTAH PUBLIK
        // ========================================
        
        // Perintah: start
        .command({
            command: 'start',
            desc: 'Start making money in the background process',
            handler: wrapHandler(operator.start_handler)
        })
        
        // Perintah: stop
        .command({
            command: 'stop',
            desc: 'Stop making money in the background process',
            handler: wrapHandler(operator.stop_handler)
        })
        
        // Perintah: status
        .command({
            command: 'status',
            desc: 'Check the status of the running EarnApp',
            handler: wrapHandler(operator.status_handler)
        })
        
        // Perintah: register
        .command({
            command: 'register',
            desc: 'Register this device in your account',
            handler: wrapHandler(operator.register_handler)
        })
        
        // Perintah: showid
        .command({
            command: 'showid',
            desc: 'Shows the ID of this device',
            handler: wrapHandler(operator.showid_handler)
        })
        
        // Perintah: dec_log - Dekripsi file log yang terenkripsi
        .command({
            command: 'dec_log <file>',
            desc: 'Decrypt encrypted log file',
            builder: (yargs) => {
                return yargs
                    .positional('file', {
                        describe: 'Path to encrypted log file',
                        type: 'string'
                    })
                    .option('output', {
                        alias: 'o',
                        describe: 'Output file (default: stdout)',
                        type: 'string'
                    });
            },
            handler: wrapHandler(async (argv) => {
                const { Decipher } = require('./cipher_dec.js');
                const inputFile = argv.file;
                const outputFile = argv.output;
                
                if (!fs.existsSync(inputFile)) {
                    console.error('Error: File tidak ditemukan: ' + inputFile);
                    return 1;
                }
                
                try {
                    const encryptedData = fs.readFileSync(inputFile);
                    const decipher = new Decipher(encryptedData);
                    const decrypted = Decipher.all(decipher);
                    
                    if (outputFile) {
                        fs.writeFileSync(outputFile, decrypted);
                        console.log('Decrypted to: ' + outputFile);
                    } else {
                        console.log(decrypted);
                    }
                    return 0;
                } catch (err) {
                    console.error('Error: ' + err.message);
                    return 1;
                }
            })
        })
        
        // ========================================
        // PERINTAH INTERNAL (HIDDEN)
        // ========================================
        
        // Perintah: install (hidden)
        .command({
            command: 'install',
            desc: false,  // Hidden command (NaN === NaN = false)
            handler: wrapHandler(installer.install_handler)
        })
        
        // Perintah: finish_install (hidden)
        .command({
            command: 'finish_install',
            desc: false,
            handler: wrapHandler(installer.finish_install_handler)
        })
        
        // Perintah: uninstall
        .command({
            command: 'uninstall',
            desc: 'Remove this application from your computer',
            handler: wrapHandler(installer.uninstall_handler)
        })
        
        // Perintah: autoupgrade (hidden)
        .command({
            command: 'autoupgrade',
            desc: false,
            handler: wrapHandler(installer.autoupgrade_bg_process)
        })
        
        // Perintah: upgrade (hidden)
        .command({
            command: 'upgrade',
            desc: false,
            handler: wrapHandler(installer.upgrade_handler)
        })
        
        // Perintah: regenerate_uuid (hidden)
        .command({
            command: 'regenerate_uuid',
            desc: false,
            handler: wrapHandler(async function() {
                util.req_root('regenerate_uuid');
                
                // Generate UUID baru
                client.regenerate_uuid(util.ver_conf);
                
                // Start EarnApp dengan force mode
                await operator.start_handler({ force: 1 });
                
                // Tampilkan UUID baru
                operator.showid_handler();
            })
        })
        
        // Perintah: run (hidden) - Proses utama
        .command({
            command: 'run',
            desc: false,
            handler: async function(argv) {
                // Kirim event inisialisasi
                util.process_send({
                    event: 'init_01_start',
                    data: util.ver_conf
                });
                
                // Handle mode preinstall
                if (util.ver_conf.preinstall) {
                    await operator.verify_license();
                    await operator.start_handler();
                    await operator.ensure_registered();
                }
                
                // Set tracking ID jika ada machine ID
                if (machineId) {
                    util.ver_conf.tracking_id = machineId;
                }
                
                // Inisialisasi peer node client
                client.init(util.ver_conf);
                
                // Deteksi proses duplikat
                operator.detect_duplicated_process();
                
                // Notifikasi dialog dan consent
                client.dialog_shown();
                client.update_consent(true);
                
                // Kirim event selesai inisialisasi
                util.process_send('init_01_complete');
            }
        })
        
        // Perintah: test (hidden)
        .command({
            command: 'test',
            aliases: testAliases,  // ['$0'] jika mode test aktif
            desc: false,
            handler: wrapHandler(async (argv) => {
                let testPassed = false;
                
                // Generate kunci test dari ver_key
                const testKey = ver_key(
                    util.ver_conf.vkey,
                    packageJson.version,
                    util.ver_conf.name
                );
                
                // Jalankan test jika mode test aktif atau kunci cocok
                // Catatan: (0O57060516 - 0xbc614d) = 1 (index pertama dari argv._)
                if (util.ver_conf.test || argv._[1] == testKey) {
                    testPassed = await mocha.run(argv);
                }
                
                // Return exit code (0 jika pass, 1 jika fail)
                return +!testPassed;
            })
        })
        
        // Konfigurasi CLI
        .demandCommand(1, 'You need at least one command before moving on')
        .help()
        .version(`${util.ver_conf.name} ${packageJson.version}`)
        .parse();
};

/**
 * Wrapper untuk handler yang menangani exit code
 * 
 * @param {Function} handler - Handler function
 * @returns {Function} - Wrapped handler yang memanggil process.exit()
 */
const wrapHandler = (handler) => async function(...args) {
    const result = await handler(...args);
    
    // Exit dengan kode hasil (atau 0 jika undefined)
    // Catatan: (0x75bcd15 - 0O726746425) = 0
    process.exit(result || 0);
};

// Jalankan CLI
main();
