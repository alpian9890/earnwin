// LICENSE_CODE ZON
'use strict'; /*jslint node:true, es6:true*/
const {zerr, date, etask, util, zescape} = require('./_modules.js');
const {get_rand_elm} = util;
const E = exports;

const max_request_retry = 3;
const ms = date.ms;
let last_zagent;
let uuid;
let lum_zagent_ports_ssl;
let lum_zagent_ips_ssl;
let lum_zagent_domains;
let version;

const gen_servername = (ip, host)=>`${ip.replace(/\./g, '-')}.${host}`;

const proxy_request = (host, path, qs, body, method)=>etask(function*(){
    for (let port of lum_zagent_ports_ssl)
    {
        let headers = {};
        let _host = host;
        if (!last_zagent)
        {
            let zagent_ip = get_rand_elm(lum_zagent_ips_ssl);
            last_zagent = zagent_ip
                ? {
                    port,
                    host: zagent_ip,
                    servername: gen_servername(zagent_ip,
                        get_rand_elm(lum_zagent_domains)),
                }
                : undefined;
        }
        _host = `${last_zagent.servername}:${last_zagent.port}`;
        headers['x-proxy'] = _host;
        headers['x-host'] = host;
        try {
            return yield E.request(_host, path, qs, body, method, headers);
        } catch(e){
            last_zagent = undefined;
            zerr.notice(`web_request proxy_request failed: host ${host}, `
                +`proxy ${util.print_zagent(last_zagent)}, `
                +`error ${zerr.e2s(e)}`);
        }
    }
    throw Error('proxy request failed');
});

E.request = (host, path, qs, body, method, headers)=>etask(function*(){
    this.on('uncaught', e=>zerr('web request err '+zerr.e2s(e)));
    let _path = zescape.uri(path, qs);
    zerr.notice(`web_request ${path}`);
    let _headers = Object.assign({
        'User-Agent': `Luminati/${version} (sdk; )`,
        'content-type': 'application/json'
    }, headers);
    if (uuid)
        _headers['x-uuid'] = uuid;
    const res = yield util.request({
        protocol: 'https:',
        hostname: host,
        path: _path,
        method,
        timeout: ms.MIN,
        data: body ? JSON.stringify(body) : undefined,
        headers: _headers,
        json: true,
        redir: 3,
    });
    zerr.notice(`web_request https://${host}${_path} res ${res && res.status}`);
    return res;
});

E.get = (hosts, path, qs)=>etask(function*(){
    let res;
    for (let i=0; i<=max_request_retry; i++)
    {
        for (let host of hosts)
        {
            try {
                if (i==0)
                    res = yield E.request(host, path, qs, null, 'GET');
                else
                    res = yield proxy_request(host, path, qs, null, 'GET');
                if (res && res.status==200)
                    return res;
            } catch(e){
                zerr.notice(`web_request get failed: host ${host}, `
                    +`response ${res && res.status}, `
                    +`error ${zerr.e2s(e)}`);
            }
        }
    }
});

E.init = params=>{
    uuid = params.uuid;
    version = params.version;
    lum_zagent_ports_ssl = params.lum_zagent_ports_ssl;
    lum_zagent_ips_ssl = params.lum_zagent_ips_ssl;
    lum_zagent_domains = params.lum_zagent_domains;
};
