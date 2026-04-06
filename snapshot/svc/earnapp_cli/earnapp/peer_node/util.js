// LICENSE_CODE ZON
'use strict'; /*jslint node:true*/
require('./util/config.js');
const assert = require('assert');
const {URL} = require('url');
const http = require('http');
const https = require('https');
const fs = require('fs');
const rand_uniform = require('./util/rand_uniform.js');
const etask = require('./util/etask.js');
const zerr = require('./util/zerr.js');
const E = exports;

E.ver_conf = {
    log_file: 'brd_sdk3.log',
};
E.set_conf = conf=>{
    Object.assign(E.ver_conf, conf);
    assert(E.ver_conf.confdir);
};
E.print_zagent = zagent=>zagent ?
    `${zagent.protocol}//${zagent.servername}:${zagent.port}/` : '';
E.get_rand_elm = list=>list[rand_uniform.rand_range(0, list.length)];
E.gen_servername = (ip, host)=>`p${ip.replace(/\./g, '-')}.${host}`;

// webos 3/4 use node.js 0.12.2, after 12/10/25 connections to BD servers need
// to use updated root CAs list
let need_ca_certs = true, ca_certs;
E.get_root_ca = ()=>{
    if (ca_certs)
        return ca_certs;
    if (!need_ca_certs)
        return;
    if (process.version.split('.')[0]!='v0')
    {
        need_ca_certs = false;
        return;
    }
    try {
        zerr.notice('Old node.js loading local root CAs');
        const root_ca_txt = fs.readFileSync(
            '/etc/ssl/certs/ca-certificates.crt', 'utf8');
        const re = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
        const raw_certs = root_ca_txt.match(re) || [];
        const unique_certs = new Set(raw_certs.map(cert=>cert.trim()));
        const root_ca = require('../root_ca.js');
        root_ca.forEach(ca=>unique_certs.add(ca));
        const certs = [...unique_certs];
        zerr.notice(`Old node.js loaded ${certs.length} root CAs`);
        ca_certs = certs;
        return certs;
    } catch(e){
        // avoid keeping retrying reading 'static' data that doesn't exist
        need_ca_certs = false;
        zerr.err(`Old node.js failed loading local root CAs ${zerr.e2s(e)}`);
    }
};

E.request = options => etask(function*(){
    const ret = {};
    const sp = etask.wait();
    let protocol = options.protocol;
    if (!options.protocol)
        protocol = 'https:';
    const host = options.host || options.hostname;
    const port = options.port ? `:${options.port}` : '';
    const base_url = `${protocol}//${host}${port}${options.path||'/'}`;
    const transport = protocol==='http:' ? http : https;
    options.ca = E.get_root_ca();
    const req = transport.request(options, res => {
        ret.status = res.statusCode;
        ret.statusText = res.statusMessage;
        ret.headers = res.headers;
        if (options.redir && (ret.status==301 || ret.status==302) &&
            ret.headers.location)
        {
            const new_url = new URL(ret.headers.location, base_url);
            const new_options = Object.assign({}, options, {
                protocol: new_url.protocol,
                hostname: new_url.hostname,
                port: new_url.port,
                path: new_url.pathname + new_url.search,
                headers: Object.assign({}, options.headers),
                redir: options.redir,
            });
            ret.redir = true;
            ret.options = new_options;
            req.destroy();
            sp.continue();
            return;
        }
        let data = '';
        res.on('data', chunk => {
            data += chunk;
        });
        res.on('end', () => {
            if (options.json)
            {
                try {
                    ret.data = JSON.parse(data);
                } catch(err){ }
            }
            ret.data = ret.data||data;
            sp.continue();
        });
    });
    req.on('timeout', () => {
        req.destroy();
        sp.throw(new Error('Request timed out'));
    });
    req.on('error', err => {
        sp.throw(err);
    });
    if (options.data)
        req.write(options.data);
    req.end();
    yield sp;
    if (ret.redir && ret.options.redir>0)
    {
        ret.options.redir -= 1;
        return yield E.request(ret.options);
    }
    return ret;
});
