// LICENSE_CODE ZON
'use strict'; /*jslint node:true, es9: true*/
const dgram = require('dgram');
const {Duplex} = require('stream');

class Stream_udp extends Duplex {
    constructor(opt, on_connect){
        super();
        this.socket = dgram.createSocket(opt.sock_type);
        this.socket.on('message', data=>this.push(data));
        this.socket.on('error', err=>this.emit('error', err));
        this.socket.on('close', err=>this.emit('close', err));
        this.socket.on('listening', on_connect);
        this.opt = opt;
        this.socket.bind({
            address: opt.localAddress,
            port: 0,
            exclusive: opt.exclusive,
        });
    }
    _destroy(){
        try {
            this.socket.close();
        } catch(e){}
    }
    _read(){}
    _write(chunk, encoding, callback){
        try {
            this.socket.send(chunk, this.opt.port, this.opt.host,
                (err, _bytes)=>callback(err));
        } catch(e){
            callback(e);
        }
    }
}

module.exports = {Stream_udp};
