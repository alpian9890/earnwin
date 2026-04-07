// LICENSE_CODE ZON
'use strict'; /*jslint node:true*/
require('./util/config.js');
const os = require('os');
const https_proxy_agent = require('https-proxy-agent'); // require for dep scan
const {file, etask, zerr, date, util, zescape} = require('./_modules.js');
const zconf = require('./util/config.js');
const version = zconf.ZON_VERSION;
const {ver_conf, get_rand_elm} = util;
const ms = date.ms;
const E = exports;

const is_success = res=>res && res.status==200;

let sdk_conf;
let uuid;
let tracking_id;
let perr_last_host;
let perr_last_zagent;
const perr_max_zagent_retry = 3;
const __perr = (host, qs, body, proxy)=>etask(function*(){
    this.on('uncaught', e=>zerr('perr err '+zerr.e2s(e)));
    const path = zescape.uri('/perr', qs);
    let agent;
    zerr.notice(`perr ${qs.id} proxy ${util.print_zagent(proxy)}`);
    let headers = {'User-Agent': `Luminati/${zconf.ZON_VERSION} (sdk; )`,
        'content-type': 'application/json',
        'Host': host,
    };
    if (proxy)
    {
        headers['x-proxy'] = `${proxy.servername}:${proxy.host}:${proxy.port}`;
        const agent_opt = Object.assign({}, proxy);
        if (uuid)
            agent_opt.headers = Object.assign({'x-uuid': uuid}, proxy.headers);
        agent = new https_proxy_agent(agent_opt);
    }
    const res = yield util.request({
        proto: 'https:',
        hostname: host,
        path,
        method: 'POST',
        timeout: ms.MIN,
        data: JSON.stringify(body),
        headers,
        agent,
    });
    zerr.notice(`perr https://${host}${path} res ${res && res.status}`);
    return res;
});
let perr_direct_success_sent;
let perr_zagent_success_sent;
const _perr = (qs, body)=>etask(function*(){
    this.on('uncaught', e=>zerr('perr err '+zerr.e2s(e)));
    let res;
    let err;
    if (perr_last_host)
    {
        try {
            res = yield __perr(perr_last_host, qs, body, perr_last_zagent);
            if (is_success(res))
                return res;
        } catch(e){
            err = e;
        }
        zerr.warn(`perr last failed: H ${perr_last_host} `
            +`P ${util.print_zagent(perr_last_zagent)}`
            +`R ${res && res.status} E ${zerr.e2s(err)}`);
        err = undefined;
    }
    perr_last_host = perr_last_zagent = null;
    for (let i=0; i<=perr_max_zagent_retry; i++)
    {
        let zagent_ip;
        if (i>0)
            zagent_ip = get_rand_elm(sdk_conf.lum_zagent_ips_ssl);
        for (let port of sdk_conf.lum_zagent_ports_ssl)
        {
            const zagent = zagent_ip ? {
                protocol: 'https:',
                port,
                host: zagent_ip,
                servername: util.gen_servername(zagent_ip,
                    get_rand_elm(sdk_conf.lum_zagent_domains)),
            } : undefined;
            for (let host of sdk_conf.lum_perr_domains)
            {
                try {
                    res = yield __perr(host, qs, body, zagent);
                    if (process.env.ZLXC || is_success(res))
                    {
                        // success perrs sending attempts are limited to
                        // one per session to avoid infinite perr loop
                        if (zagent && !perr_zagent_success_sent)
                        {
                            zerr.perr('perr_zagent_success', {zagent},
                                {once: true});
                            perr_zagent_success_sent = true;
                        }
                        else if (!zagent && !perr_direct_success_sent)
                        {
                            zerr.perr('perr_direct_success', {}, {once: true});
                            perr_direct_success_sent = true;
                        }
                        perr_last_zagent = zagent;
                        perr_last_host = host;
                        return res;
                    }
                } catch(e){
                    err = e;
                }
                zerr.notice(`perr send failed: H ${host} `
                    +`P ${util.print_zagent(zagent)} `
                    +`R ${res && res.status} `
                    +`E ${zerr.e2s(err)}`);
                err = undefined;
            }
        }
    }
    zerr.err('perr send failed all attempts');
});

// XXX vladislavs: normalize with perr/proxyjs entities
const build_info = ()=>{
    const data = [
        `Version: ${zconf.ZON_VERSION}`,
        `Build date: ${zconf.CONFIG_BUILD_DATE}`,
        `Makeflags: ${zconf.CONFIG_MAKEFLAGS}`,
        `OS Version: win 10.0.19045 ${os.arch()}`,
        'Device: Generic',
        `UUID: ${uuid}`,
    ];
    if (tracking_id)
        data.push(`Tracking ID: ${tracking_id}`);
    return data.join('\n');
};

const perr = (id, opt)=>etask(function*(){
    if (process.send)
        process.send({event: id, data: opt});
    this.on('uncaught', e=>zerr('perr err '+zerr.e2s(e)));
    opt = opt||{};
    if (!opt.ts)
        opt.ts = Date.now();
    const ts = opt.ts;
    opt.ts = date.to_sql(opt.ts);
    const build = build_info();
    const body = Object.assign({}, opt, {
        build,
        appid: ver_conf.appid,
        cid: E.cid_js,
        since_start: ts-E.start_ts,
        since_connect: ts-E.connect_ts,
    });
    const qs = {
        id,
        file: opt.file,
        appid: ver_conf.appid,
        ver: zconf.ZON_VERSION,
        // XXX vladislavs: reserved for rmt update
        ver_sdk: zconf.ZON_VERSION,
        uuid,
    };
    return yield _perr(qs, body);
});

const perr_send_retry = (id, info, opt)=>{
    opt.retry_timeout = opt.retry_timeout ? opt.retry_timeout*2 : 1000;
    if (opt.retry_timeout<date.ms.MIN)
    {
        zerr.notice('perr %s: retry scheduled in %d', id,
            opt.retry_timeout);
        setTimeout(()=>perr_send(id, info, opt), opt.retry_timeout);
    }
    else
        zerr.notice('perr %s: too many retries, give up', id);
};

const perr_send = (id, info, opt)=>etask(function*(){
    this.on('uncaught', e=>{
        zerr('perr send err '+zerr.e2s(e));
        if (opt.retry)
            perr_send_retry(id, info, opt);
    });
    opt = opt||{};
    info = info||{};
    const confdir = ver_conf.confdir;
    const sent_file = `${confdir}/perr_${id}_${version}.sent`;
    const funnel_sent_file = `${confdir}/funnel_perr_${id}.sent`;
    const sending_file = `${confdir}/perr_${id}_${version||''}.sending`;
    if (opt.once || opt.funnel)
    {
        if (file.exists(sent_file) || file.exists(sending_file))
            return;
        file.touch(sending_file);
        this.finally(()=>file.unlink(sending_file));
    }
    if (id instanceof Error)
    {
        info = Object.assign({}, info, {error: id});
        id = id.code||'error';
    }
    if (info instanceof Error)
        info = {error: info};
    if (info.error)
    {
        opt.filehead = opt.filehead || zerr.log_tail();
        opt.backtrace = opt.backtrace || zerr.e2s(info.error);
        info.error_msg = info.error.message;
        delete info.error;
    }
    if (opt.log_tail)
        opt.filehead = (opt.filehead||'')+zerr.log_tail(10000);
    if (opt.funnel && !file.exists(funnel_sent_file))
        info.install = 1;
    const platform = util.ver_conf && util.ver_conf.tv_platform || 'node';
    const _id = `lum_sdk_${platform}_${id}`;
    const res = yield perr(_id, {
        info,
        filehead: opt.filehead,
        bt: opt.backtrace,
        cid: E.cid_js,
    });
    if (opt.once || opt.funnel)
    {
        if (is_success(res))
            file.touch(sent_file);
        if (is_success(res) && opt.funnel)
            file.touch(funnel_sent_file);
        if (!file.exists(sent_file))
            zerr('perr resp error: %O', res && res.data);
    }
    if (!is_success(res) && opt.retry)
        perr_send_retry(id, info, opt);
});

E.install = conf=>(perr_orig, pending)=>{
    tracking_id = conf.tracking_id;
    uuid = conf.uuid;
    while (pending.length)
        perr_send.apply(null, pending.shift());
    const res = {};
    res.send = (id, info, opt)=>{
        perr_orig(id, info, opt);
        return perr_send(id, info, opt);
    };
    res.pre_send = conf.perr_pre_send;
    return res;
};

const perr_throttle_ms = 5*ms.MIN;
const perr_process_cache = {};
E.process = ()=>etask(function*(){
    let dir = ver_conf.confdir+'/log';
    let files = file.readdir(dir);
    if (!files)
        return {err: 'not found'};
    if (!files.length)
        return {ok: true};
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (let f of files)
    {
        let m = f.match(/^((\d{8}_\d{6})_[a-z0-9_]+)\.log$/);
        if (!m)
            continue;
        let full_sent = dir+'/'+m[1]+'.sent';
        let errid = m[1].replace(/^[0-9]+_[0-9]+_(perr_)*/, '');
        let buf;
        if (file.exists(full_sent) || !(buf = file.read(dir+'/'+f, null)))
            continue;
        try {
            const ts = date.strptime(m[2], '%Y%m%d_%H%M%S');
            let data = {file: f, filehead: buf.toString('base64'), ts};
            let dmp_data;
            if (errid.endsWith('crash')||errid.endsWith('zexit'))
            {
                let df = f.replace(/\.log$/, '.dmp');
                if (buf = file.read(dir+'/'+df, null))
                {
                    dmp_data = Object.assign({dump: buf.toString('base64')},
                        data);
                    delete data.filehead;
                }
            }
            if (!perr_process_cache[errid]
                || ts-perr_process_cache[errid]>perr_throttle_ms)
            {
                yield perr(errid, data);
                file.touch(full_sent);
                if (dmp_data)
                    yield perr(errid+'_dmp', dmp_data);
                sent++;
                perr_process_cache[errid] = ts;
            }
            else
                skipped++;
        } catch(e){
            zerr('perr send failed '+f+' '+zerr.e2s(e));
            failed++;
        }
    }
    return {ok: true, sent, failed, skipped};
});

E.init = _sdk_conf=>{
    sdk_conf = _sdk_conf;
};
