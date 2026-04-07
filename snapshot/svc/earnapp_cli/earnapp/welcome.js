/**
 * Modul Welcome - Menampilkan Pesan Selamat Datang Setelah Build
 * 
 * Modul ini menampilkan banner ASCII art dan instruksi penggunaan
 * setelah proses build selesai. Mendukung berbagai tema warna.
 */

'use strict';

// Import modul yang diperlukan
const fs = require('fs');
const path = require('path');

/**
 * Menampilkan pesan welcome/build complete
 * 
 * @param {Object} console - Object console untuk output
 * @param {Object} options - Opsi konfigurasi
 * @param {string} options.version - Versi aplikasi
 * @param {boolean} options.release - Mode release (production)
 * @param {string} options.vkey - Version key untuk instalasi
 * @param {Array} options.runners - Daftar file runner yang dihasilkan
 */
module.exports = (console, { version, release, vkey, runners }) => {
    // Nama file script yang dihasilkan
    const scriptName = `earnapp-sanity-${version}.sh`;
    
    // ========================================
    // KODE WARNA ANSI
    // ========================================
    
    const BG_BLACK = '\x1b[40m';      // Background hitam
    const CLEAR_LINE = '\x1b[K';       // Clear sampai akhir baris
    
    const CYAN = '\x1b[36m';           // Warna cyan
    const GREEN = '\x1b[32m';          // Warna hijau
    const YELLOW = '\x1b[33m';         // Warna kuning
    const BLUE = '\x1b[34m';           // Warna biru
    
    const BOLD = '\x1b[1m';            // Teks tebal
    const DIM = '\x1b[2m';             // Teks redup
    const RESET = '\x1b[0m' + BG_BLACK; // Reset + background hitam
    
    const INDENT = '  ';               // Indentasi 2 spasi
    
    /**
     * Helper function untuk print dengan clear line
     */
    const printLine = (text) => console.log(text + CLEAR_LINE);
    
    // ========================================
    // LOAD BANNER ASCII ART
    // ========================================
    
    const bannersDir = path.join(__dirname, 'banners');
    let bannerText = '';
    
    try {
        // Cari semua file banner-N.txt dan urutkan
        const bannerFiles = fs.readdirSync(bannersDir)
            .filter(file => /^banner-\d+\.txt$/.test(file))
            .sort((a, b) => {
                // Catatan: (0O57060516 - 0xbc614d) = 1 (capture group)
                const numA = Number(a.match(/banner-(\d+)\.txt/)[1]);
                const numB = Number(b.match(/banner-(\d+)\.txt/)[1]);
                return numA - numB;
            });
        
        // Pilih banner secara random berdasarkan waktu
        if (bannerFiles.length) {
            const selectedBanner = bannerFiles[Date.now() % bannerFiles.length];
            bannerText = fs.readFileSync(path.join(bannersDir, selectedBanner), 'utf8');
        }
    } catch (error) {
        bannerText = '';
    }
    
    // Ganti placeholder versi di banner
    if (bannerText) {
        try {
            const versionStr = String(version);
            bannerText = bannerText.replace(/REPLACE_VERSION/g, versionStr);
        } catch (error) {
            // Abaikan error
        }
    }
    
    // ========================================
    // TEMA WARNA UNTUK BANNER
    // ========================================
    
    /**
     * Daftar tema warna yang tersedia
     * Setiap tema mendefinisikan warna untuk karakter ASCII art:
     * ░ ▒ ▓ █ #
     */
    const colorThemes = [
        {
            name: 'default',
            map: {
                '░': CYAN,
                '▒': CYAN,
                '▓': BLUE,
                '█': YELLOW,
                '#': YELLOW
            }
        },
        {
            name: 'cool',
            map: {
                '░': GREEN,
                '▒': GREEN,
                '▓': CYAN,
                '█': BLUE,
                '#': CYAN
            }
        },
        {
            name: 'warm',
            map: {
                '░': YELLOW,
                '▒': YELLOW,
                '▓': GREEN,
                '█': CYAN,
                '#': YELLOW
            }
        },
        {
            name: 'neon',
            map: {
                '░': '\x1b[35m',  // Magenta
                '▒': '\x1b[35m',
                '▓': '\x1b[36m',  // Cyan
                '█': '\x1b[32m',  // Green
                '#': '\x1b[33m'   // Yellow
            }
        },
        {
            name: 'mono',
            map: {
                '░': DIM,
                '▒': DIM,
                '▓': DIM,
                '█': DIM,
                '#': DIM
            }
        }
    ];
    
    // Pilih tema random
    const selectedTheme = colorThemes[Math.floor(Math.random() * colorThemes.length)];
    
    // ========================================
    // TAMPILKAN BANNER
    // ========================================
    
    // Tampilkan banner jika ada dan bukan mode release
    if (bannerText && !release) {
        printLine(BG_BLACK);
        
        // Proses setiap baris banner
        bannerText.split('\n').forEach(function(line) {
            // Ganti karakter ASCII art dengan versi berwarna
            const coloredLine = line.replace(/[░▒▓█#]/g, function(char) {
                const color = selectedTheme.map[char] || '';
                if (color) {
                    return BG_BLACK + color + char + RESET;
                }
                return BG_BLACK + char;
            });
            
            printLine('  ' + coloredLine);
        });
        
        printLine('');
    } else {
        printLine(BG_BLACK);
    }
    
    // ========================================
    // TAMPILKAN STATUS BUILD
    // ========================================
    
    // Header "Build complete!"
    printLine(INDENT + INDENT + YELLOW + '●  ●  ●' + RESET + '  ' + BOLD + 'Build complete!' + RESET);
    printLine(INDENT + INDENT + DIM + scriptName + RESET);
    printLine('');
    
    // URL CDN untuk download
    const cdnUrl = 'https://cdn.earnapp.com/static';
    
    // ========================================
    // INSTRUKSI BERDASARKAN MODE
    // ========================================
    
    if (release) {
        // MODE PRODUCTION
        printLine(`  ${BOLD}${GREEN}▸ Production${RESET}`);
        printLine('');
        printLine(`  ${DIM}Run on target device:`);
        printLine(`  ${DIM}(Linux/macOS x86|x64|armv7|aarch64)${RESET}`);
        printLine(`  ${BLUE}$ curl -s ${cdnUrl}/${scriptName}` + ` | bash -s ${vkey}${RESET}`);
    } else {
        // MODE DEVELOPMENT
        const os = require('os');
        const networkInterfaces = os.networkInterfaces();
        
        // Cari IP address dari interface bridge100 (untuk VM)
        const bridgeInterface = (networkInterfaces['bridge100'] || [])
            .find(iface => iface.family === 'IPv4');
        const localIp = bridgeInterface ? bridgeInterface.address : 'localhost';
        
        // Port untuk HTTP server (0x223d = 8765)
        const port = 0x223d;
        const localUrl = `http://${localIp}:${port}`;
        
        // Command untuk serve dan run
        const serveCmd = `f python3 -m http.server ${port} -d $PWD`;
        const runCmd = `BASE_URL=${localUrl}` + 
            ` bash -c 'curl -s ${localUrl}/${scriptName} | bash -s ${vkey}'`;
        
        // Tampilkan instruksi development
        printLine(`  ${BOLD}${YELLOW}▸ Local Development${RESET}`);
        printLine('');
        printLine(`  ${DIM}Step 1: Serve artifacts:${RESET}`);
        printLine(`  ${BLUE}$ ${serveCmd}${RESET}`);
        printLine('');
        printLine(`  ${DIM}Step 2: Run on target device:${RESET}`);
        printLine(`  ${BLUE}$ ${runCmd}${RESET}`);
        
        // Copy ke clipboard jika memungkinkan (macOS)
        try {
            const childProcess = require('child_process');
            const copyCmd = `printf '%s' ` + `${JSON.stringify(runCmd)} | pbcopy`;
            childProcess.execSync(copyCmd, { stdio: 'pipe' });
            printLine(`  ${GREEN}✓ Copied to clipboard${RESET}`);
        } catch (error) {
            printLine(`  ${DIM}(clipboard copy unavailable)${RESET}`);
        }
        
        // Instruksi untuk remote execution
        printLine('');
        printLine(`  ${BOLD}${CYAN}▸ Remote execution${RESET}`);
        printLine(`  ${DIM}(deploy + run on a clean-network server via SSH)${RESET}`);
        
        // Tampilkan command untuk setiap runner
        if (runners && runners.length) {
            runners.forEach(runner => {
                const runnerName = path.basename(runner);
                printLine(`  ${BLUE}$ f bash ${runnerName} [hostname]` + 
                    ` [--peer-download]${RESET}`);
            });
        }
    }
    
    // Footer
    printLine('');
    printLine(INDENT + DIM + '──────────────────' + RESET);
    printLine('\x1b[0m');  // Reset semua formatting
};
