// LICENSE_CODE ZON
'use strict'; /*jslint node:true*/
require('./util/config.js');
const {etask, zurl, zerr, date} = require('./_modules.js');
const web_request = require('./web_request.js');
const conv = require('./util/conv.js');
const {ms} = date;
const E = exports;

let interval = 15*ms.MIN;

E.get = _sdk_conf=>etask(function*(){
    this.on('uncaught', e=>zerr('cloud conf request err '+zerr.e2s(e)));
    const urls = _sdk_conf.cloud_config_urls.sort(()=>Math.random()-0.5);
    for (let n in urls)
    {
        let conf = {};
        let url = urls[n];
        const parsed_url = zurl.parse(url);
        try {
            const rsp = yield web_request.request(parsed_url.host,
                parsed_url.path, parsed_url.query, null, 'GET');
            conf = JSON.parse(conv.decode_base64_shift(rsp.data));
            if (conf.zagent_sdk_ips)
            {
                conf.zagent_sdk_ips.forEach((el, i)=>{
                    _sdk_conf.lum_zagent_ips[i] = el;
                });
            }
            if (conf.zagent_sdk_ips_ssl)
            {
                conf.zagent_sdk_ips_ssl.forEach((el, i)=>{
                    _sdk_conf.lum_zagent_ips_ssl[i] = el;
                });
            }
            if (conf.perr_domains)
            {
                conf.perr_domains.forEach((el, i)=>{
                    _sdk_conf.lum_perr_domains[i] = el;
                });
            }
            if (conf.proxyjs_domains_a1)
            {
                conf.proxyjs_domains_a1.forEach((el, i)=>{
                    _sdk_conf.lum_proxy_domains_a1[i] = el;
                });
            }
            if (conf.expire)
                interval = conf.expire;
            return;
        } catch(e){
            // Status code 429 is sent by Dropbox
            // if download frequency is exceeded
            if (!e.response || e.response.status!=429)
                return;
            const h = conv.hash(url).substr(0, 6);
            zerr.perr('cloud_config_dropbox_error_'+h, {
                error: zerr.e2s(e),
            });
        }
    }
    zerr.perr('cloud_config_not_loaded');
});

E.run_background = _sdk_conf=>{
    const loop = ()=>etask(function*(){
        yield E.get(_sdk_conf);
        setTimeout(loop, interval);
    });
    loop();
};
