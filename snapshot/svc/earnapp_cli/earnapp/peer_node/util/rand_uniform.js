// LICENSE_CODE ZON
'use strict'; /*jslint node:true*/
require('./config.js');
const crypto = require('crypto');
const array = require('./array.js');
const zutil = require('./util.js');
const E = exports;

var is_jtest = false;
var jtest_vals = {};
var rand_buf_quanta = 8192;
var rand_buf = Buffer.alloc(0);

function rand_buf_get(n){
    var ret;
    if (rand_buf.length>=n)
    {
        ret = rand_buf.slice(0, n);
        rand_buf = rand_buf.slice(n);
        return ret;
    }
    var need = n-rand_buf.length;
    var new_buf = crypto.pseudoRandomBytes(rand_buf_quanta);
    ret = Buffer.concat([rand_buf, new_buf.slice(0, need)]);
    rand_buf = new_buf.slice(need);
    return ret;
}

function read_uint_le(buffer, bytes){
    if (bytes==1)
        return buffer.readUInt8(0);
    if (bytes==4)
        return buffer.readUInt32LE(0);
    throw new Error('Reading '+bytes+' bytes is not supported in '
        +'read_uint_le');
}

function uniform(max){
    if (max<=0)
        return 0;
    var bytes = 1, bytes_range = 256;
    if (max>256)
    {
        bytes = 4;
        bytes_range = 4294967296;
    }
    if (max>4294967296)
        throw new Error('Max '+max+' in rand.uniform is too big');
    var limit = zutil.floor_mul(bytes_range, max);
    for (;;)
    {
        var val = read_uint_le(rand_buf_get(bytes), bytes);
        if (val<limit)
            return val % max;
    }
}

function jtest_pop(s){
    var elm;
    if (s===undefined)
        return null;
    if ((elm = jtest_vals[s])===undefined)
        return null;
    return elm.shift();
}

E.rand_int32 = function(s){
    var ret;
    if (is_jtest && (ret = jtest_pop(s))!==null)
        return ret;
    return rand_buf_get(4).readInt32LE(0);
};

const NP2_53 = -Math.pow(2, 53);
const P2_48 = Math.pow(2, 48);
// -2^53..2^53-1 is the range of continuous integers in JS
E.rand_int54 = function(s){
    let ret;
    if (is_jtest && (ret = jtest_pop(s))!==null)
        return ret;
    let buf = rand_buf_get(7);
    let a = buf.readUInt8(0) & 0x3f;
    let b = buf.readUIntLE(1, 6);
    return NP2_53 + P2_48*a + b;
};

E.rand_range = function(from, to, s){
    var ret;
    if (is_jtest && (ret = jtest_pop(s))!==null)
        return ret;
    return uniform(to-from)+from;
};

E.rand_element = function(a, s){
    if (a.length)
        return a[E.rand_range(0, a.length, s)];
};

E.rand_subset = function(a, size, s){
    /* Fisher-Yates-Knuth shuffle */
    var shuffled = a.slice(0);
    for (var i=0; i<size; ++i)
    {
        var j = E.rand_range(i, shuffled.length, s);
        var tmp = shuffled[j];
        shuffled[j] = shuffled[i];
        shuffled[i] = tmp;
    }
    return shuffled.slice(0, size);
};

E.jtest_push = function(s, arr){
    if (!jtest_vals[s])
        jtest_vals[s] = [];
    if (Array.isArray(arr))
        array.push(jtest_vals[s], arr);
    else
        jtest_vals[s].push(arr);
};

E.jtest_init = function(){
    is_jtest = true;
    jtest_vals = {};
};

E.jtest_uninit = function(){
    is_jtest = false; };

// This is xorshift128, one of the fastest non-cryptographical pseudo-random
// generators. Internally, xorshift32 is used to initialize its state in order
// to increase the randomness of the first results with small seeds.
//
// seed must not be 0!
function xorshift128(seed){
    let a = seed>>>0;
    let b = a;
    b ^= b<<13;
    b ^= b>>>17;
    b ^= b<<5;
    b >>>= 0;
    let c = b;
    c ^= c<<13;
    c ^= c>>>17;
    c ^= c<<5;
    c >>>= 0;
    let d = c;
    d ^= d<<13;
    d ^= d>>>17;
    d ^= d<<5;
    d >>>= 0;
    return ()=>{
        let t = d;
        t ^= t<<11;
        t ^= t>>8;
        d = c;
        c = b;
        b = a;
        t ^= a;
        t ^= a>>19;
        return a = t>>>0;
    };
}

// Generate a pseudo-random permutation of [1...max] incrementally
E.shuffle = function(seed, max){
    let a = new Uint32Array(max), index = 0, random = xorshift128(seed);
    return ()=>{
        if (index>=max)
            return;
        let other = random()%(max-index)+index;
        let t = a[other] || other+1;
        if (other>index)
        {
            a[other] = a[index] || index+1;
            a[index] = t;
        }
        index++;
        return t;
    };
};
