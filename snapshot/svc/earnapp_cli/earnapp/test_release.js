// =====================================================
// Test Script: get_release() - Device Info Checker
// =====================================================
// Requires: npm install linux-release-info
// Run: node test_release.js
// =====================================================

const lri = require('linux-release-info');

// Pengganti zerr (logger sederhana)
const zerr = {
  warn: (msg) => console.warn('[WARN]', msg)
};

const get_release = () => {
  try {
    const release_info = lri.releaseInfo({ mode: 'sync' });
    return [
      release_info.id,
      release_info.version_id,
      release_info.arch,
    ].join('_');
  } catch (e) {
    zerr.warn(e.message);
    return 'unknown';
  }
};

// === RUN TEST ===
console.log('\n========================================');
console.log('  get_release() - Device Info Tester');
console.log('========================================\n');

// Ambil raw release info dulu untuk ditampilkan
try {
  const raw = lri.releaseInfo({ mode: 'sync' });
  console.log('ðŸ“¦ Raw Release Info:');
  console.log('------------------------------------------');
  console.log('  ID (Distro)   :', raw.id || 'N/A');
  console.log('  Version ID    :', raw.version_id || 'N/A');
  console.log('  Architecture  :', raw.arch || 'N/A');
  console.log('  Pretty Name   :', raw.pretty_name || 'N/A');
  console.log('  Kernel        :', raw.kernel_release || 'N/A');
  console.log('------------------------------------------');
} catch (e) {
  console.log('[WARN] Tidak bisa membaca raw info:', e.message);
}

const result = get_release();

console.log('\nâœ… Output get_release():');
console.log('------------------------------------------');
console.log(' ', result);
console.log('------------------------------------------\n');

if (result === 'unknown') {
  console.log('âš ï¸  Status: GAGAL - Mengembalikan "unknown"');
} else {
  const parts = result.split('_');
  console.log('ðŸŽ‰ Status: BERHASIL\n');
  console.log('  Distro ID    :', parts[0]);
  console.log('  Version ID   :', parts[1]);
  console.log('  Architecture :', parts[2]);
}

console.log('\n========================================\n');
