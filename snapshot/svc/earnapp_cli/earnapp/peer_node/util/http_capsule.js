// LICENSE_CODE ZON
'use strict'; /*jslint node:true es9:true*/
const {Transform} = require('stream');

const max_qvi1 = 63,
    max_qvi2 = 16383,
    max_qvi4 = 1073741823,
    // in node.js 2^53-1 is max safe integer due to Number being a 64bit float,
    // it's ok to use this reduced this value because we use it to check for
    // packet size, at 2^53-1 the limit is over 1PB
    max_qvi8 = 1125899906842623;

if (true)
{
const E = {};
const read_qvi = (buf, offset)=>{
    let v = buf.readUint8(offset);
    let prefix = v >> 6;
    let length = 1 << prefix;
    v &= 0x3f;
    let i;
    for (i = 1; i < length; i++)
        v = (v << 8) + buf.readUint8(offset+i);
    return [v, offset+i];
};
const write_qvi = num=>{
    if (num <= max_qvi1)
        return new Buffer.from([num]);
    else if (num <= max_qvi2)
        return new Buffer.from([num >> 8 | 0x40, num]);
    else if (num <= max_qvi4)
        return new Buffer.from([num >> 24 | 0x80, num >> 16, num >> 8, num]);
    else if (num <= max_qvi8)
    {
        return new Buffer.from([num >> 56 | 0xc0, num >> 48, num >> 40,
            num >> 32, num >> 24, num >> 16, num >> 8, num]);
    }
    throw new Error('doesnt fit into 62 bits');
};

E.Http_capsule_to_udp = class Http_capsule_to_udp extends Transform {
    constructor(){
        super();
        this.reminder = Buffer.alloc(0);
    }
    _transform(chunk, encoding, callback){
        try {
            let buf = Buffer.concat([this.reminder, chunk]);
            let offset = 0, q_stream_id, c_type, c_length, c_value;
            while (offset < buf.length)
            {
                [c_type, offset] = read_qvi(buf, offset);
                if (c_type != 0)
                    throw new Error(`bad c_type=${c_type}`);
                [c_length, offset] = read_qvi(buf, offset);
                // eslint-disable-next-line no-unused-vars
                [q_stream_id, offset] = read_qvi(buf, offset);
                c_length -= 1;
                if (c_length < 0 || c_length > 65536)
                    throw new Error(`bad c_length=${c_length}`);
                if (offset+c_length > buf.length)
                {
                    this.reminder = buf;
                    return callback();
                }
                c_value = buf.subarray(offset, offset+c_length);
                this.push(c_value);
                buf = buf.subarray(offset+c_length);
                offset = 0;
                this.reminder = Buffer.alloc(0);
            }
            callback();
        } catch(e){
            this.reminder = Buffer.alloc(0);
        }
    }
};

E.Udp_to_http_capsule = class Udp_to_http_capsule extends Transform {
    constructor(){
        super();
    }
    _transform(chunk, encoding, callback){
        const len = write_qvi(chunk.length+1);
        const buf = Buffer.concat([
            Buffer.from([0]), len, Buffer.from([0]), chunk,
        ]);
        this.push(buf);
        callback();
    }
};

E.Udp_encapsulate = class Udp_encapsulate extends Transform {
    _transform(chunk, encoding, callback){
        const len = Buffer.alloc(2);
        len.writeUint16BE(chunk.length);
        this.push(Buffer.concat([len, chunk]));
        callback();
    }
};

E.Udp_unwrap = class Udp_unwrap extends Transform {
    constructor(){
        super();
        this.reminder = Buffer.alloc(0);
    }
    _transform(chunk, encoding, callback){
        try {
            let buf = Buffer.concat([this.reminder, chunk]);
            let len, value;
            while (buf.length)
            {
                len = buf.readUInt16BE(0);
                if (len >= 65536)
                    throw new Error(`bad len=${len}`);
                if (len+2 > buf.length)
                {
                    this.reminder = buf;
                    return callback();
                }
                value = buf.subarray(2, 2+len);
                this.push(value);
                buf = buf.subarray(len+2);
                this.reminder = Buffer.alloc(0);
            }
            callback();
        } catch(e){
            this.reminder = Buffer.alloc(0);
        }
    }
};
module.exports = E;
}
if (true)
{
const E = {};
const write_qvi = (buf, off, num)=>{
    if (num <= max_qvi1)
    {
        buf[off] = num;
        return 1;
    }
    else if (num <= max_qvi2)
    {
        buf[off] = num >> 8 | 0x40;
        buf[off+1] = num;
        return 2;
    }
    else if (num <= max_qvi4)
    {
        buf[off] = num >> 24 | 0x80;
        buf[off+1] = num >> 16;
        buf[off+2] = num >> 8;
        buf[off+3] = num;
        return 4;
    }
    else if (num <= max_qvi8)
    {
        buf[off] = num >> 56 | 0xc0;
        buf[off+1] = num >> 48;
        buf[off+2] = num >> 40;
        buf[off+3] = num >> 32;
        buf[off+4] = num >> 24;
        buf[off+5] = num >> 16;
        buf[off+6] = num >> 8;
        buf[off+7] = num;
        return 8;
    }
    throw new Error('doesnt fit into 62 bits');
};

class Qvi_reader {
    constructor(){
        this.reset();
    }
    reset(){
        this.len = 0;
        this.read = 0;
        this.value = 0;
    }
    read_vi(chunk, offset, length){
        if (this.read === 0)
        {
            if (offset >= length)
                return {offset, done: false};
            const b0 = chunk[offset++];
            const prefix = b0 >> 6;
            this.len = 1 << prefix;
            this.value = b0 & 0x3f;
            this.read = 1;
            if (this.len === 1)
            {
                const value = this.value;
                this.reset();
                return {offset, done: true, value};
            }
        }
        const need = this.len - this.read;
        const available = Math.min(need, length - offset);
        for (let i = 0; i < available; i++)
            this.value = (this.value << 8) + chunk[offset++];
        this.read += available;
        if (this.read === this.len)
        {
            const value = this.value;
            this.reset();
            return {offset, done: true, value};
        }
        return {offset, done: false};
    }
}

class Buffer_pool {
    constructor(opt={}){
        this.size = opt.size||65542;
        this.buf = Buffer.allocUnsafe(this.size);
        this.buf_pos = 0;
        this.buf_start = 0;
    }
    ensure_size(size){
        if (size < 0 || size > this.size)
            throw new Error(`bad size=${size}`);
        if (this.buf_pos+size > this.size)
        {
            const new_buf = Buffer.allocUnsafe(this.size);
            this.buf.copy(new_buf, 0, this.buf_start, this.buf_pos);
            this.buf = new_buf;
            this.buf_pos = this.buf_pos - this.buf_start;
            this.buf_start = 0;
        }
    }
    write_nil(){
        this.buf[this.buf_pos] = 0;
        this.buf_pos++;
    }
    write_uint16(val){
        this.buf.writeUint16BE(val, this.buf_pos);
        this.buf_pos += 2;
    }
    write_qvi(val){
        const off = write_qvi(this.buf, this.buf_pos, val);
        this.buf_pos += off;
    }
    push(chunk, offset, take){
        chunk.copy(this.buf, this.buf_pos,
            offset, offset+take);
        this.buf_pos += take;
    }
    end(){
        const result = this.buf.subarray(this.buf_start, this.buf_pos);
        this.buf_start = this.buf_pos;
        return result;
    }
}
E.Buffer_pool = Buffer_pool;

const MAX_PAYLOAD = 65536;
const HC_TO_UDP_STATE = {
    READ_CTYPE: 0,
    READ_CLENGTH: 1,
    READ_QID: 2,
    SEND_PAYLOAD: 3,
};
E.Http_capsule_to_udp = class Http_capsule_to_udp extends Transform {
    constructor(){
        super();
        this.state = 0;
        this.vi = new Qvi_reader();
        this.c_type = 0;
        this.c_length = 0;
        this.q_stream_id = 0;
        this.remaining = 0;
        this.buf = new Buffer_pool();
    }
    _transform(chunk, encoding, callback){
        try {
            let offset = 0;
            const length = chunk.length;
            while (offset < length)
            {
                if (this.state === HC_TO_UDP_STATE.READ_CTYPE)
                {
                    offset += 1;
                    this.state = HC_TO_UDP_STATE.READ_CLENGTH;
                }
                else if (this.state === HC_TO_UDP_STATE.READ_CLENGTH)
                {
                    const r = this.vi.read_vi(chunk, offset, length);
                    offset = r.offset;
                    if (!r.done)
                        break;
                    this.c_length = r.value;
                    this.remaining = this.c_length - 1;
                    this.buf.ensure_size(this.remaining);
                    this.state = HC_TO_UDP_STATE.READ_QID;
                }
                else if (this.state === HC_TO_UDP_STATE.READ_QID)
                {
                    offset += 1;
                    this.state = this.remaining === 0
                        ? HC_TO_UDP_STATE.READ_CTYPE
                        : HC_TO_UDP_STATE.SEND_PAYLOAD;
                }
                else if (this.state === HC_TO_UDP_STATE.SEND_PAYLOAD)
                {
                    if (this.remaining === 0)
                    {
                        this.state = HC_TO_UDP_STATE.READ_CTYPE;
                        continue;
                    }
                    const take = Math.min(this.remaining, length - offset);
                    if (take > 0)
                    {
                        this.buf.push(chunk, offset, take);
                        offset += take;
                        this.remaining -= take;
                    }
                    if (this.remaining === 0)
                    {
                        this.push(this.buf.end());
                        this.state = HC_TO_UDP_STATE.READ_CTYPE;
                    }
                }
            }
            callback();
        } catch(e){
            callback(e);
        }
    }
};

E.Udp_to_http_capsule = class Udp_to_http_capsule extends Transform {
    constructor(){
        super();
        this.buf = new Buffer_pool();
    }
    _transform(chunk, encoding, callback){
        // 2: write_qvi is no more than 4 bytes
        this.buf.ensure_size(6+chunk.length);
        this.buf.write_nil();
        this.buf.write_qvi(chunk.length+1);
        this.buf.write_nil();
        this.buf.push(chunk, 0, chunk.length);
        const res = this.buf.end();
        this.push(res);
        callback();
    }
};

E.Udp_encapsulate = class Udp_encapsulate extends Transform {
    constructor(opt){
        super();
        this.clone_chunk = opt && opt.clone_chunk;
        if (!this.clone_chunk)
            this.buf = new Buffer_pool();
    }
    _transform_clone_chunk(chunk, encoding, callback){
        let buf = Buffer.allocUnsafe(chunk.length+2);
        buf.writeUint16BE(chunk.length);
        chunk.copy(buf, 2);
        this.push(buf);
        callback();
    }
    _transform(chunk, encoding, callback){
        if (this.clone_chunk)
            return this._transform_clone_chunk(chunk, encoding, callback);
        this.buf.ensure_size(chunk.length+2);
        this.buf.write_uint16(chunk.length);
        this.buf.push(chunk, 0, chunk.length);
        this.push(this.buf.end());
        callback();
    }
};

const UDP_UNWRAP_STATE = {
    READ_LEN: 0,
    SEND_PAYLOAD: 1,
};
E.Udp_unwrap = class Udp_unwrap extends Transform {
    constructor(){
        super();
        this.state = 0;
        this.remaining = 0;
        this.len_buf = Buffer.allocUnsafe(2);
        this.len_bytes_read = 0;
        this.buf = new Buffer_pool();
    }
    apply_len(len){
        this.len_bytes_read = 0;
        if (len > MAX_PAYLOAD)
            throw new Error(`bad len=${len}`);
        this.remaining = len;
        this.buf.ensure_size(this.remaining);
        this.state = UDP_UNWRAP_STATE.SEND_PAYLOAD;
        if (len === 0)
            this.state = UDP_UNWRAP_STATE.READ_LEN;
    }
    _transform(chunk, encoding, callback){
        try {
            let offset = 0;
            const length = chunk.length;
            while (offset < length)
            {
                if (this.state === UDP_UNWRAP_STATE.READ_LEN)
                {
                    if (this.len_bytes_read === 0 && length - offset >= 2)
                    {
                        // Fast path: we have 2 bytes available
                        const len = chunk.readUInt16BE(offset); offset += 2;
                        this.apply_len(len);
                        continue;
                    }
                    // Slow path: header split across chunks
                    while (this.len_bytes_read < 2 && offset < length)
                        this.len_buf[this.len_bytes_read++] = chunk[offset++];
                    if (this.len_bytes_read === 2)
                    {
                        const len = this.len_buf.readUInt16BE(0);
                        this.apply_len(len);
                    }
                }
                else
                {
                    if (this.remaining === 0)
                    {
                        this.state = UDP_UNWRAP_STATE.READ_LEN;
                        continue;
                    }
                    const take = Math.min(this.remaining, length - offset);
                    if (take > 0)
                    {
                        this.buf.push(chunk, offset, take);
                        offset += take;
                        this.remaining -= take;
                    }
                    if (this.remaining === 0)
                    {
                        this.push(this.buf.end());
                        this.state = UDP_UNWRAP_STATE.READ_LEN;
                    }
                }
            }
            callback();
        } catch(e){
            callback(e);
        }
    }
};
E.Fast_udp_unwrap = class Fast_udp_unwrap extends Transform {
    constructor(){
        super();
        this.state = 0;
        this.remaining = 0;
        this.len_buf = Buffer.allocUnsafe(2);
        this.len_bytes_read = 0;
        this.buf = new Buffer_pool();
    }
    apply_len(len){
        this.len_bytes_read = 0;
        this.remaining = len;
        this.buf.ensure_size(this.remaining+6);
        this.buf.write_nil();
        this.state = UDP_UNWRAP_STATE.SEND_PAYLOAD;
        if (len === 0)
            this.state = UDP_UNWRAP_STATE.READ_LEN;
        this.buf.write_qvi(len+1);
        this.buf.write_nil();
    }
    _transform(chunk, encoding, callback){
        try {
            let offset = 0;
            const length = chunk.length;
            while (offset < length)
            {
                if (this.state === UDP_UNWRAP_STATE.READ_LEN)
                {
                    if (this.len_bytes_read === 0 && length - offset >= 2)
                    {
                        // Fast path: we have 2 bytes available
                        const len = chunk.readUInt16BE(offset); offset += 2;
                        this.apply_len(len);
                        continue;
                    }
                    // Slow path: header split across chunks
                    while (this.len_bytes_read < 2 && offset < length)
                        this.len_buf[this.len_bytes_read++] = chunk[offset++];
                    if (this.len_bytes_read === 2)
                    {
                        const len = this.len_buf.readUInt16BE(0);
                        this.apply_len(len);
                    }
                }
                else
                {
                    if (this.remaining === 0)
                    {
                        this.state = UDP_UNWRAP_STATE.READ_LEN;
                        continue;
                    }
                    const take = Math.min(this.remaining, length - offset);
                    if (take > 0)
                    {
                        this.buf.push(chunk, offset, take);
                        offset += take;
                        this.remaining -= take;
                    }
                    if (this.remaining === 0)
                    {
                        this.push(this.buf.end());
                        this.state = UDP_UNWRAP_STATE.READ_LEN;
                    }
                    continue;
                }
            }
            callback();
        } catch(e){
            callback(e);
        }
    }
};

E.Fast_http_capsule_to_udp = class Fast_http_capsule_to_udp extends Transform {
    constructor(opt){
        super();
        this.clone_chunk = opt && opt.clone_chunk;
        this.state = 0;
        this.vi = new Qvi_reader();
        this.c_type = 0;
        this.c_length = 0;
        this.q_stream_id = 0;
        this.remaining = 0;
        this.buf = new Buffer_pool();
    }
    _transform(chunk, encoding, callback){
        try {
            let offset = 0;
            const length = chunk.length;
            while (offset < length)
            {
                if (this.state === HC_TO_UDP_STATE.READ_CTYPE)
                {
                    offset += 1;
                    this.state = HC_TO_UDP_STATE.READ_CLENGTH;
                }
                else if (this.state === HC_TO_UDP_STATE.READ_CLENGTH)
                {
                    const r = this.vi.read_vi(chunk, offset, length);
                    offset = r.offset;
                    if (!r.done)
                        break;
                    this.c_length = r.value;
                    this.remaining = this.c_length - 1;
                    this.buf.ensure_size(this.remaining+2);
                    this.state = HC_TO_UDP_STATE.READ_QID;
                }
                else if (this.state === HC_TO_UDP_STATE.READ_QID)
                {
                    offset += 1;
                    this.state = this.remaining === 0
                        ? HC_TO_UDP_STATE.READ_CTYPE
                        : HC_TO_UDP_STATE.SEND_PAYLOAD;
                    this.buf.write_uint16(this.remaining);
                }
                else if (this.state === HC_TO_UDP_STATE.SEND_PAYLOAD)
                {
                    if (this.remaining === 0)
                    {
                        this.state = HC_TO_UDP_STATE.READ_CTYPE;
                        continue;
                    }
                    const take = Math.min(this.remaining, length - offset);
                    if (take > 0)
                    {
                        this.buf.push(chunk, offset, take);
                        offset += take;
                        this.remaining -= take;
                    }
                    if (this.remaining === 0)
                    {
                        let cont_chunk = this.buf.end();
                        this.push(cont_chunk);
                        this.state = HC_TO_UDP_STATE.READ_CTYPE;
                    }
                }
            }
            callback();
        } catch(e){
            callback(e);
        }
    }
};

class Udp_encapsulate_with_aggregate extends Transform {
    constructor(opt){
        super();
        opt = opt||{};
        this._buffer_store = opt.buffer_store;
        this._min_chunk = opt.min_chunk||100e3;
        this._throttle_size = opt.throttle_size||50e3;
        this._throttle_ms = opt.throttle_ms||100;
        this._pos = 0;
        this._timeout_fn = this._timeout_fn.bind(this);
    }
    _alloc(len){
        // WS.mux returns this buffer to store
        return this._buffer_store ? this._buffer_store.alloc(len)
            : Buffer.allocUnsafe(len);
    }
    _add_chunk(chunk){
        let inc = 20e3;
        let chunk_len = 2+chunk.length;
        let exp_len = Math.max(Math.ceil((this._pos+chunk_len)/inc), 1)*inc;
        if (exp_len<this._min_chunk)
            exp_len = this._min_chunk;
        if (!this._buffer)
            this._buffer = this._alloc(exp_len);
        else if (this._buffer.length<exp_len)
        {
            let n_buf = this._alloc(exp_len);
            this._buffer.copy(n_buf);
            this._buffer = n_buf;
        }
        this._buffer.writeUint16BE(chunk.length, this._pos);
        chunk.copy(this._buffer, this._pos+2);
        this._pos += 2+chunk.length;
    }
    _transform(chunk, encoding, cb){
        if (this._pos>=this._throttle_size)
        {
            if (this._send)
                clearTimeout(this._send);
            this._timeout_fn();
        }
        this._add_chunk(chunk);
        this._send = this._send || setTimeout(this._timeout_fn, this
            ._throttle_ms);
        cb();
    }
    _timeout_fn(){
        this._send = null;
        this._send_buffer();
    }
    _send_buffer(){
        if (!this._pos)
            return;
        let chunk = this._buffer.subarray(0, this._pos);
        if (this._buffer_store)
            chunk.unuse_store_buffer = this._buffer.unuse_store_buffer;
        this.push(chunk);
        this._buffer = null;
        this._pos = 0;
    }
    _flush(cb){
        if (this._send)
        {
            clearTimeout(this._send);
            this._send = null;
        }
        this._send_buffer();
        cb();
    }
}
E.Udp_encapsulate_with_aggregate = Udp_encapsulate_with_aggregate;

module.exports.v2 = E;
}
