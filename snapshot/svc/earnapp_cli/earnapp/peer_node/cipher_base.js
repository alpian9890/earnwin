// LICENSE_CODE ZON
'use strict'; /*jslint node:true*/
const crypto = require('crypto');
const DEF_PASSWORD = 'E45CD26C5003BB8C'; // enc.h
const RC4_ALG = 'rc4';
const CIPHER_NAME = RC4_ALG;
const HASH_NAME = 'md5';
const CIPHER_MAGIC = 0xE5321F92;
const ENCODING = 'utf8';
const MOD_ADLER = 65521;
const NMAX = 5552;

const EVP_BytesToKey = function(hash_name, data, salt, count, key_len, iv_len){
    if (!Buffer.isBuffer(data))
        data = Buffer.from(data, 'hex');
    if (salt)
    {
        if (!Buffer.isBuffer(salt))
            salt = Buffer.from(salt, 'hex');
        if (salt.length!=8)
            throw new RangeError('salt should be Buffer with 8 byte length');
    }
    let d_max = Math.ceil((key_len+iv_len)/16);
    let d = [Buffer.alloc(0)];
    let key = Buffer.alloc(key_len);
    let iv = Buffer.alloc(iv_len||0);
    for (let i=1; i<=d_max; i++)
    {
        let hash = crypto.createHash(hash_name);
        hash.update(d[i-1]);
        hash.update(data);
        if (salt)
            hash.update(salt);
        d.push(hash.digest()); // D_i' = hash(D_(i-1) || data || salt)
        for (let j=1; j<count; j++) // D_i = hash^(count-1)(D_i')
            d[i] = crypto.createHash(hash_name).update(d[i]).digest();
    }
    let buf = Buffer.concat(d);
    buf.copy(key, 0, 0, key_len);
    if (iv)
        buf.copy(iv, 0, key_len, key_len+iv_len);
    return {key, iv};
};

class Cipher_base {
    constructor(buf, pass=DEF_PASSWORD, cipher=CIPHER_NAME, hash=HASH_NAME,
        count=100)
    {
        this.buf = buf;
        this.cipher = cipher;
        Object.assign(this, EVP_BytesToKey(hash, pass, null, count, 16,
            0));
        this.offset = 0;
        this.iv_sz = this.iv.length ? this.iv.length : this.key.length;
        this.hdr_sz = 4+this.iv_sz+4+4;
    }
    get_key(iv){
        let key = Buffer.from(this.key);
        if (this.iv.length)
            return key;
        for (let i=0; i<key.length; i++)
            key[i] ^= iv[i];
        return key;
    }
    adler32(data, adler){
        let a = adler&0xFFFF, b = adler>>>16&0xFFFF;
        let i = 0, max = data.length, n;
        while (i<max)
        {
            n = Math.min(NMAX, max-i);
            do {
                a += data.charCodeAt(i++);
                b += a;
            } while (--n);
            a %= MOD_ADLER;
            b %= MOD_ADLER;
        }
        return (b<<16|a)>>>0;
    }
}

module.exports = {Cipher_base, ENCODING, CIPHER_MAGIC, RC4_ALG};
