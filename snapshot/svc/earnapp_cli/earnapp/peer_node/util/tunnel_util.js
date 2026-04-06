// LICENSE_CODE ZON
'use strict'; /*jslint node:true*/
const net = require('net');
const E = exports;

function normalize_ip(ip){ return ip.split('%')[0].toUpperCase(); }

function ip_to_buffer(ip){
    return Buffer.from(ip.split(':')
        .map(part=>part.padStart(4, '0'))
        .join(''), 'hex');
}

function is_in_reserved_subnet(ip){
    ip = normalize_ip(ip);
    if (ip.startsWith('2001:DB8') || ip.startsWith('2001:0DB8'))
        return true;
    return false;
}

function is_special_v6_addr(ip){
    ip = normalize_ip(ip);
    if (ip.startsWith('FE80:'))
        return true;
    if (ip.startsWith('FEC0:'))
        return true;
    if (ip.startsWith('FC') || ip.startsWith('FD'))
        return true;
    if (ip === '::1'
        || ip === '0:0:0:0:0:0:0:1'
        || ip === '0000:0000:0000:0000:0000:0000:0000:0001')
    {
        return true;
    }
    return false;
}

function check_addr_in_same_subnet(ip1, ip2, mask){
    const mask_parts = mask.split(':')
        .map(part=>part.padStart(4, '0'));
    const mask_hex = mask_parts.join('');
    const mask_buf = Buffer.from(mask_hex, 'hex');
    const n1 = normalize_ip(ip1);
    const n2 = normalize_ip(ip2);
    const buf1 = ip_to_buffer(n1);
    const buf2 = ip_to_buffer(n2);
    for (let i = 0; i < 16; i++){
        if ((buf1[i] & mask_buf[i]) !== (buf2[i] & mask_buf[i]))
            return false;
    }
    return true;
}

E.is_ipv6_target_allowed = (target, dev_addr, dev_netmask)=>{
    if (!net.isIPv6(target))
        return true;
    try {
        const target_ip = normalize_ip(target);
        if (dev_addr && dev_netmask
            && check_addr_in_same_subnet(dev_addr, target_ip, dev_netmask))
        {
            return false;
        }
        if (is_special_v6_addr(target_ip))
            return false;
        if (is_in_reserved_subnet(target_ip))
            return false;
    } catch(e){
        // on error, allow (same as client.js)
    }
    return true;
};

E.ip_in_cidrs = (cidrs, ip)=>{
    if (!cidrs || !cidrs.length || !ip)
        return false;
    const parts = ip.split('.').map(Number);
    if (parts.length!=4)
        return false;
    const ip_num = (parts[0]<<24 | parts[1]<<16 | parts[2]<<8 | parts[3])>>>0;
    return cidrs.some(cidr=>{
        const [addr, prefix] = cidr.split('/');
        const a = addr.split('.').map(Number);
        const addr_num = (a[0]<<24 | a[1]<<16 | a[2]<<8 | a[3])>>>0;
        const mask = prefix==0 ? 0 : ~0 << 32-prefix>>>0;
        return (ip_num & mask)===(addr_num & mask);
    });
};

E.milestones = [1, 1e3, 1e4, 1e5];

E.calc_cpu_usage = (curr, prev)=>{
    const diffs = prev.map((p, i)=>{
        const c = curr[i];
        const idle_diff = c.idle - p.idle;
        const total_diff = c.user-p.user + c.nice-p.nice +
            c.sys-p.sys + c.irq-p.irq + idle_diff;
        return {idle_diff, total_diff};
    });
    const idle_diff = diffs.reduce((acc, diff)=>acc + diff.idle_diff, 0);
    const total_diff = diffs.reduce((acc, diff)=>acc + diff.total_diff, 0);
    return 1 - idle_diff / total_diff;
};
