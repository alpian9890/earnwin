// LICENSE_CODE ZON
'use strict'; /*jslint node:true*/
require('./util/config.js');
const fs = require('fs');
const {spawn} = require('child_process');
const os = require('os');
const {zerr} = require('./_modules.js');
const E = module.exports;

// XXX shachar: fix iface monitoring
// const SYS_NET_PATH = '/sys/class/net';
const FIB_TRIE_FILE = '/proc/net/fib_trie';
const IF_INET6_FILE = '/proc/net/if_inet6';
const platform = os.platform();

function monitor_linux(callback){
    /*
    const ifaces_map = new Map();

    function watchInterface(iface) {
        if (iface=='lo' || ifaces_map.has(iface))
            return;
        const carrierFile = path.join(SYS_NET_PATH, iface, 'carrier');
        const operstateFile = path.join(SYS_NET_PATH, iface, 'operstate');
        const carrierWatcher = fs.watch(carrierFile, () => {
            fs.readFile(carrierFile, 'utf8', (err, data) => {
                if (!err) {
                    const status = data.trim() === '1' ? 'up' : 'down';
                    callback({type: 'carrier_change', iface: iface, status});
                }
            });
        });
        const operstateWatcher = fs.watch(operstateFile, () => {
            fs.readFile(operstateFile, 'utf8', (err, data) => {
                if (!err) {
                    const state = data.trim();
                    callback({type: 'operstate_change', iface: iface, state});
                }
            });
        });
        zerr.notice('Watching network interface: '+iface);
        ifaces_map.set(iface, [carrierWatcher, operstateWatcher]);
    }

    function unwatch_iface(iface) {
        if (!ifaces_map.has(iface))
            return;
        ifaces_map.get(iface).forEach(w=>w.close());
        ifaces_map.delete(iface);
    }

    function watch_ifaces() {
        const netWatcher = fs.watch(SYS_NET_PATH, () => {
            fs.readdir(SYS_NET_PATH, (err, ifaces) => {
                if (err)
                    return zerr.err(`Failed to read ${SYS_NET_PATH}: %O`, err);
                ifaces.forEach(watchInterface);
                Array.from(ifaces_map.keys())
                    .filter((iface) => !ifaces.includes(iface))
                    .forEach(unwatch_iface);
            });
        });
        fs.readdir(SYS_NET_PATH, (err, ifaces) =
           if (!err)
               ifaces.forEach(watchInterface);
       });
       zerr.notice('Watching network interfaces');
       return netWatcher;
    }
    */

    function watch_ipv4(){
        return fs.watch(FIB_TRIE_FILE, ()=>{
            callback({type: 'ipv4_change'});
        });
    }

    function watch_ipv6(){
        return fs.watch(IF_INET6_FILE, ()=>{
            callback({type: 'ipv6_change'});
        });
    }

    // let ifaces_watcher;
    let ipv4_watcher, ipv6_watcher;
    try {
        // ifaces_watcher = watch_ifaces();
        ipv4_watcher = watch_ipv4();
        ipv6_watcher = watch_ipv6();
    } catch(e){
        zerr.err('Failed to start network monitoring: %O', e);
        return;
    }
    zerr.notice('Watching network changes (linux)');

    return ()=>{
        // ifaces_watcher?.close();
        if (ipv4_watcher)
            ipv4_watcher.close();
        if (ipv6_watcher)
            ipv6_watcher.close();
        // ifaces_watcher = null;
        ipv4_watcher = null;
        ipv6_watcher = null;
        // Array.from(ifaces_map.keys()).forEach(unwatch_iface);
    };
}

function monitor_darwin(callback){
    const proc = spawn('route', ['-n', 'monitor'], {stdio: ['ignore', 'pipe',
        'ignore']});
    proc.stdout.on('data', buf=>{
        const text = buf.toString();
        if (text.includes('RTM_NEWADDR') || text.includes('RTM_DELADDR')
            || text.includes('RTM_IFINFO'))
        {
            callback({type: 'network_change'});
        }
    });
    proc.on('error', e=>{
        zerr.err('route monitor failed: %O', e);
    });
    zerr.notice('Watching network changes (darwin)');
    return ()=>{
        proc.kill();
    };
}

function monitor_network_changes(callback){
    zerr.notice('Starting network monitoring');
    if (platform==='linux')
        return monitor_linux(callback);
    if (platform==='darwin')
        return monitor_darwin(callback);
    zerr.warn('Network monitoring not supported on '+platform);
}

let stop_monitoring;
E.start_monitoring = cb=>{
    if (E.monitor_running)
        return;
    E.monitor_running = true;
    stop_monitoring = monitor_network_changes(cb);
};

E.stop_monitoring = ()=>{
    if (!E.monitor_running)
        return;
    E.monitor_running = false;
    stop_monitoring();
};
