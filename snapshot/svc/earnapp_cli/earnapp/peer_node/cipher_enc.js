// LICENSE_CODE ZON
'use strict'; /*jslint node:true*/
const crypto = require('crypto');
const rc4 = require('./rc4.js');
const {Cipher_base, ENCODING, CIPHER_MAGIC,
    RC4_ALG} = require('./cipher_base.js');

class Encipher extends Cipher_base {
    get_enc_iv(){
        return crypto.randomBytes(this.iv_sz);
    }
    encrypt(str){
        const iv = this.get_enc_iv();
        const key = this.get_key(iv);
        let bytes;
        if (this.cipher==RC4_ALG)
            bytes = rc4.do(key, Buffer.from(str, ENCODING));
        else
        {
            const cipher = crypto.createCipheriv(this.cipher, key, null);
            bytes = cipher.update(str, ENCODING);
        }
        const crc = this.adler32(str, 0);
        const sz = 4+iv.length+4+4;
        const buffer = Buffer.alloc(sz);
        let index = buffer.writeUInt32LE(CIPHER_MAGIC);
        index = index+buffer.write(iv.toString('binary'), index, this.iv_sz,
            'binary');
        index = buffer.writeUInt32BE(bytes.length, index);
        buffer.writeUInt32BE(crc, index);
        const encrypted = Buffer.concat([buffer, bytes]);
        return encrypted;
    }
}

module.exports = {Encipher};
