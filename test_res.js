const os = require('os');
const networkInterfaces = os.networkInterfaces();

// Ambil interface pertama yang tersedia
const ifaceKey = Object.keys(networkInterfaces)[0];
const iface = networkInterfaces[ifaceKey]?.[0];

const res = {
    arch: os.arch(),
    platform: process.platform,
    release: os.release(),
    type: iface?.family,
    ifname: ifaceKey,
    uuid: crypto.randomUUID(),
    http3: true,
    dca: false,
    usage: {},
};

console.log(res);
