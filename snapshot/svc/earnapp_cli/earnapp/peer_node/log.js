// LICENSE_CODE ZON
'use strict'; /*jslint node:true es9:true*/

const path = require('path');
const rfs = require('rotating-file-stream');
const {cipher_enc, cipher_base} = require('./_modules.js');
const {Encipher} = cipher_enc;
const {CIPHER_MAGIC} = cipher_base;
const E = exports;
E.CIPHER_MAGIC = CIPHER_MAGIC;

const log_options = {
    size: '3M',
    maxFiles: 2,
    path: `./`,
    history: 'brd_sdk_logs_history.log',
};
const loggers = {};
const encipher = new Encipher();

E.get_logger = (log_path, debug)=>{
    if (!loggers[log_path] || !loggers[log_path].handle)
    {
        const folder = path.dirname(log_path);
        const file = path.basename(log_path);
        loggers[log_path] = {
            handle: rfs.createStream(file, Object.assign({}, log_options, {
                path: folder})),
        };
        Object.assign(loggers[log_path], {
            log(s){
                if (!debug)
                    s = encipher.encrypt(s);
                this.handle.write(s);
            },
            close(){ this.handle.end(); },
        });
    }
    return loggers[log_path];
};
