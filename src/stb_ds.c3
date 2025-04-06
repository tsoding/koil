module stbds;

const int STBDS_HM_BINARY = 0;

struct ArrayHeader {
    usz length;
    usz capacity;
    void *hash_table;
    iptr temp;
}

macro header(t) => (ArrayHeader*)t - 1;
macro temp(t) => header(t).temp;
macro hmlen(t) => t ? (iptr) header(t-1).length-1 : 0;
macro @hmput(#t, k, v) {
    #t = hmput_key(#t, $typeof(*#t).sizeof, &&k, $typeof(#t.key).sizeof, 0);
    #t[temp(#t-1)].key = k;
    #t[temp(#t-1)].value = v;
}

macro @hmdel(#t, k) {
    #t = hmdel_key(#t, $typeof(*#t).sizeof, &&k, $typeof(#t.key).sizeof, $offsetof(#t.key), STBDS_HM_BINARY);
    return #t ? temp(#t-1) : 0;
}

macro @hmgeti(#t, k) {
    #t = hmget_key(#t, $typeof(*#t).sizeof, &&k, $typeof(#t.key).sizeof, STBDS_HM_BINARY); 
    return temp(#t-1);
}

extern fn void *hmput_key(void *a, usz elemsize, void *key, usz keysize, int mode) @extern("stbds_hmput_key");
extern fn void *hmdel_key(void *a, usz elemsize, void *key, usz keysize, usz keyoffset, int mode) @extern("stbds_hmdel_key");
extern fn void *hmget_key(void *a, usz elemsize, void *key, usz keysize, int mode) @extern("stbds_hmget_key");
