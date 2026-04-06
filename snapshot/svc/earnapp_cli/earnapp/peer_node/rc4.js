// LICENSE_CODE ZON
'use strict'; /*jslint node:true*/

const E = exports;

E.do = (key, val)=>{
    var s = [], i = 0, j = 0, x, res = [];
    for (i=0; i<256; i++)
        s[i] = i;
    for (i=0; i<256; i++){
        j = (j+s[i]+key[i%key.length])%256;
        x = s[i];
        s[i] = s[j];
        s[j] = x;
    }
    i = 0;
    j = 0;
    for (let y=0; y<val.length; y++){
        i = (i+1)%256;
        j = (j+s[i])%256;
        x = s[i];
        s[i] = s[j];
        s[j] = x;
        res.push(val[y]^s[(s[i]+s[j])%256]);
    }
    return Buffer.from(res);
};
