/**
 * Modul Installer - Mengelola Instalasi dan Upgrade EarnApp
 * 
 * Modul ini menangani:
 * - Instalasi dan registrasi service systemd
 * - Proses upgrade otomatis
 * - Penghapusan (uninstall) aplikasi
 * - Manajemen service earnapp dan earnapp_upgrader
 */

'use strict';

// Import modul-modul yang diperlukan
const { execSync, spawn } = require('child_process');
const path = require('path');
const semver = require('semver');          // Untuk perbandingan versi
const chalk = require('chalk');             // Output berwarna
const ora = require('ora');                 // Spinner/loading indicator
const yesno = require('yesno');             // Konfirmasi yes/no
const client = require('./peer_node/client.js');
const packageJson = require('./package.json');
const operator = require('./operator.js');
const conf = require('./conf.js');
const util = require('./util.js');

// Destructure fungsi dari util
const { file, systemctl, ver_conf } = util;

// Export modul
const installer = exports;

// Path direktori systemd service
const SYSTEMD_DIR = '/etc/systemd/system';

// Logger untuk proses autoupgrade
const logger = util.get_logger('autoupgrade');

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Membuat atau memperbarui service systemd
 * 
 * @param {string} serviceName - Nama service (tanpa .service)
 * @param {boolean} shouldRestart - Apakah perlu restart jika service sudah ada
 */
const createService = (serviceName, shouldRestart) => {
    const spinner = ora(`Creating service ${serviceName}`);
    const servicePath = `${SYSTEMD_DIR}/${serviceName}.service`;
    
    try {
        // Baca template service dari direktori services
        const templatePath = path.join(__dirname, `./services/${serviceName}.service`);
        let serviceContent = file.read(templatePath);
        
        if (!serviceContent) throw new Error('service data corrupted');
        
        // Cek apakah service sudah ada
        const serviceExists = file.exists(servicePath);
        let needsUpdate = true;
        
        if (serviceExists) {
            // Bandingkan hash untuk cek apakah perlu update
            let existingContent;
            if (existingContent = file.read(servicePath)) {
                const existingHash = util.get_hash(existingContent);
                const newHash = util.get_hash(serviceContent);
                needsUpdate = existingHash != newHash;
            }
        }
        
        // Install atau update service jika diperlukan
        if (!serviceExists || needsUpdate) {
            spinner.text = `Registering service ${serviceName}`;
            file.copy(templatePath, servicePath);
            systemctl.reload();  // systemctl daemon-reload
        } else {
            spinner.text = `Service already exists: ${serviceName}`;
            spinner.succeed();
        }
        
        // Enable dan start service jika baru dibuat
        if (!serviceExists) {
            spinner.text = `Enabling service ${serviceName}`;
            systemctl.enable(serviceName);
            systemctl.start(serviceName);
        } else if (shouldRestart) {
            // Restart jika diminta dan service sudah ada
            spinner.text = `Restarting service ${serviceName}`;
            systemctl.restart(serviceName);
        }
        
        spinner.succeed(`Service ${serviceName} ${serviceExists ? (needsUpdate ? 'updated' : 'refreshed') : 'installed'}`);
        
    } catch (error) {
        spinner.fail(error.message);
    }
};

/**
 * Menghapus service systemd
 * 
 * @param {string} serviceName - Nama service yang akan dihapus
 */
const removeService = async function(serviceName) {
    const spinner = ora(`Removing service ${serviceName}`);
    
    try {
        // Stop service
        spinner.text = `Stopping service ${serviceName}`;
        systemctl.stop(serviceName);
        
        // Disable service
        spinner.text = `Disabling service ${serviceName}`;
        systemctl.disable(serviceName);
        
        // Hapus file service
        spinner.text = `Removing service ${serviceName}`;
        file.unlink(`${SYSTEMD_DIR}/${serviceName}.service`);
        
        // Reload daemon
        systemctl.reload();
        
        spinner.succeed(`Service ${serviceName} removed`);
    } catch (error) {
        spinner.fail(error.message);
    }
};

/**
 * Cek versi terbaru dari server
 * 
 * @param {string} caller - Nama pemanggil (untuk logging)
 * @returns {string|false} - Versi terbaru jika ada update, false jika sudah up-to-date
 */
const checkNewVersion = async function(caller) {
    // Setup logger atau spinner berdasarkan konteks
    let log = caller ? util.get_logger(caller) : false;
    let spinner = caller ? false : ora('Checking the newest version...');
    
    try {
        // Ambil konfigurasi aplikasi dari server
        const appConf = await conf.get_app_conf(caller);
        
        if (appConf.err) {
            log && log.log('error: ' + appConf.err);
            spinner && spinner.fail(appConf.err);
            return false;
        }
        
        let message;
        
        // Bandingkan versi menggunakan semver
        if (semver.gt(appConf.version, packageJson.version)) {
            message = 'There is an upgrade available: ' + appConf.version;
            log && log.log(message);
            spinner && spinner.succeed(message);
            return appConf.version;
        }
        
        message = 'Current version is already up to date';
        log && log.log(message);
        spinner && spinner.succeed(message);
        
    } catch (error) {
        log && log.log(util.e2s(error));
        spinner && spinner.fail(error.message);
    }
    
    return false;
};

// ========================================
// HANDLER FUNCTIONS
// ========================================

/**
 * Handler untuk menyelesaikan proses instalasi
 * 
 * Dipanggil setelah binary dipindahkan ke /usr/bin atau /usr/local/bin
 * 
 * @param {Object} options - Opsi instalasi
 * @param {boolean} options.auto - Mode instalasi otomatis
 */
installer.finish_install_handler = async function(options) {
    // Harus dijalankan sebagai root
    util.req_root('finish_install');
    
    // Generate UUID untuk device
    client.generate_uuid(util.ver_conf);
    
    // Buat service earnapp
    await createService('earnapp', true);
    
    // Tentukan apakah perlu restart service upgrader
    let shouldRestartUpgrader = !options.auto;
    if (!util.get_runtime_ver()) {
        shouldRestartUpgrader = true;
    }
    
    // Set versi runtime
    util.set_runtime_ver();
    
    // Buat service earnapp_upgrader
    await createService('earnapp_upgrader', shouldRestartUpgrader);
    
    // Tampilkan pesan sukses
    util.print_success('EarnApp is installed and running.');
    
    // Start EarnApp dengan force mode
    await operator.start_handler({ force: 1 });
    
    console.log('\nSee usage options by running', chalk.green('earnapp'));
    console.log('');
    
    // Tampilkan URL registrasi
    operator.register_handler();
};

/**
 * Handler untuk perintah 'install'
 * 
 * Memindahkan binary ke direktori sistem dan menjalankan finish_install
 * 
 * @param {Object} options - Opsi instalasi
 * @param {boolean} options.auto - Mode instalasi otomatis
 */
installer.install_handler = async function(options) {
    util.req_root('install');
    
    // Ambil path executable saat ini
    const currentExec = process.execPath;
    
    // Tentukan direktori tujuan berdasarkan OS
    const isMacOS = process.platform === 'darwin';
    const binDir = isMacOS ? '/usr/local/bin' : '/usr/bin';
    const targetPath = `${binDir}/earnapp`;
    const backupPath = `${binDir}/earnapp_bak`;
    
    util.print_success('Moving', currentExec, 'to ' + binDir);
    
    // Buat direktori jika macOS
    if (isMacOS) {
        execSync(`mkdir -p ${binDir}`);
    }
    
    // Pindahkan executable
    execSync(`mv ${currentExec} ${targetPath}`);
    
    // Jalankan finish_install dalam proses baru
    const finishCmd = `${targetPath} finish_install`;
    const args = [];
    if (options.auto) args.push('--auto');
    
    const child = spawn(finishCmd, args, {
        stdio: 'inherit',  // Teruskan stdio ke terminal
        shell: true
    });
    
    // Tunggu proses selesai
    return new Promise(resolve => child.on('exit', () => {
        try {
            // Hapus backup jika ada
            if (file.exists(backupPath)) {
                execSync(`rm ${backupPath}`);
            }
        } catch (error) {}
        
        resolve();
    }));
};

/**
 * Background process untuk auto-upgrade
 * 
 * Berjalan terus-menerus, mengecek update secara periodik
 */
installer.autoupgrade_bg_process = async function() {
    util.req_root('autoupgrade');
    
    logger.log('starting autoupgrade ver ' + packageJson.version);
    
    // Loop tak terbatas untuk pengecekan periodik
    for (;;) {
        // Random delay antara 30-40 menit (0xa + 0x1e = 10 + 30)
        const waitMinutes = Math.floor(Math.random() * 0xa) + 0x1e;
        
        logger.log('next autoupgrade check in ' + waitMinutes + ' minutes');
        
        // Tunggu sebelum cek (menit * 60 * 1000 ms)
        await util.sleep(waitMinutes * 0x3c * 0x3e8);
        
        // Cek apakah ada upgrade eksternal (versi runtime berbeda dari versi package)
        if (util.get_runtime_ver() != packageJson.version) {
            logger.log('external upgrade detected, exiting...');
            return;
        }
        
        logger.log('running autoupgrade...');
        
        try {
            // Jalankan upgrade
            if (await installer.upgrade_handler({ from: 'autoupgrade' })) {
                logger.log('autoupgrade complete, exiting...');
                return;
            }
        } catch (error) {
            logger.log(error);
        }
    }
};

/**
 * Handler untuk perintah 'upgrade'
 * 
 * @param {Object} options - Opsi upgrade
 * @param {string} options.from - Sumber pemanggilan (untuk logging)
 * @param {string} options.ver - Versi target (opsional, jika tidak ada akan cek server)
 * @returns {boolean} - true jika upgrade berhasil
 */
installer.upgrade_handler = async function(options) {
    util.req_root('upgrade');
    
    // Setup fungsi print berdasarkan konteks
    const printFn = options.from
        ? (msg) => util.get_logger(options.from).log(msg)
        : util.print_success;
    
    printFn('checking for updates...');
    
    // Cek versi terbaru
    const newVersion = options.ver || await checkNewVersion(options.from);
    
    if (!newVersion) return false;
    
    printFn('fetching and running installation script in a new process');
    
    // Download script instalasi
    const scriptName = `earnapp-install-${newVersion}.sh`;
    const downloadCmd = `wget -qO- https://cdn.earnapp.com/static/${scriptName}` + ` > /tmp/${scriptName}`;
    
    execSync(downloadCmd);
    
    printFn('fetched install script, running bash script');
    
    // Jalankan script instalasi
    const runCmd = `bash /tmp/${scriptName} -y ${ver_conf.name || ''}` + ' >> /etc/earnapp/install_bash.log';
    
    const child = spawn(runCmd, {
        stdio: 'inherit',
        shell: true
    });
    
    await new Promise(resolve => child.on('exit', resolve));
    
    printFn('install script complete');
    
    // Hapus script sementara
    file.unlink(`/tmp/${scriptName}`);
    
    return true;
};

/**
 * Handler untuk perintah 'uninstall'
 * 
 * Menghapus EarnApp beserta service-nya
 */
installer.uninstall_handler = async function() {
    util.req_root('uninstall');
    
    // Konfirmasi uninstall
    const confirm = await yesno({
        question: 'Are you sure you want to uninstall EarnApp? [y/N]',
        defaultValue: false  // Catatan: NaN === NaN = false
    });
    
    if (!confirm) return;
    
    // Hapus kedua service
    await removeService('earnapp');
    await removeService('earnapp_upgrader');
    
    // Tentukan path executable berdasarkan OS
    const isMacOS = process.platform === 'darwin';
    const execPath = isMacOS ? '/usr/local/bin/earnapp' : '/usr/bin/earnapp';
    
    // Hapus executable
    util.print_success('Removing ' + execPath);
    file.unlink(execPath);
    
    // Tanya apakah mau hapus config juga
    const removeConfig = await yesno({
        question: 'Do you also want to remove the config files?\nYou may ' +
            'loose your earnings if you haven\'t added this device in the ' +
            'dashboard yet [y/N]',
        defaultValue: false
    });
    
    if (removeConfig) {
        util.print_success('Removing /etc/earnapp/');
        file.rm_rf('/etc/earnapp/');
    }
    
    util.print_success('EarnApp successfully removed');
};
