#ifndef B64_H_
#define B64_H_

#include <assert.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

#define B64_STD_ALPHA "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
#define B64_URL_ALPHA "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
#define B64_DEFAULT_PAD '='

#define b64_encode_out_len(in_len) (((in_len) + 2)/3*4)
size_t b64_encode(const unsigned char *in, size_t in_len, char *out, size_t out_cap, const char *alpha, char padding);
// TODO: implement b64_decode and publish as a separate single-header repo

#endif // B64_H_

#ifdef B64_IMPLEMENTATION

size_t b64_encode(const unsigned char *in, size_t in_len, char *out, size_t out_cap, const char *alpha, char padding)
{
    assert(strlen(alpha) == 64);
    assert(b64_encode_out_len(in_len) <= out_cap);
    size_t out_len = 0;
    size_t in_cur = 0;
    uint32_t group = 0;
    while (in_cur + 3 <= in_len) {
        group = 0;
        group |= ((uint32_t)(in[in_cur++]))<<(2*8);
        group |= ((uint32_t)(in[in_cur++]))<<(1*8);
        group |= ((uint32_t)(in[in_cur++]))<<(0*8);
        out[out_len++] = alpha[(group>>(3*6))&0x3F];
        out[out_len++] = alpha[(group>>(2*6))&0x3F];
        out[out_len++] = alpha[(group>>(1*6))&0x3F];
        out[out_len++] = alpha[(group>>(0*6))&0x3F];
    }

    switch (in_len - in_cur) {
        case 0: break;
        case 1: {
            group = 0;
            group |= ((uint32_t)in[in_cur++])<<(2*8);
            out[out_len++] = alpha[(group>>(3*6))&0x3F];
            out[out_len++] = alpha[(group>>(2*6))&0x3F];
            out[out_len++] = padding;
            out[out_len++] = padding;
        } break;
        case 2: {
            group = 0;
            group |= ((uint32_t)in[in_cur++])<<(2*8);
            group |= ((uint32_t)in[in_cur++])<<(1*8);
            out[out_len++] = alpha[(group>>(3*6))&0x3F];
            out[out_len++] = alpha[(group>>(2*6))&0x3F];
            out[out_len++] = alpha[(group>>(1*6))&0x3F];
            out[out_len++] = padding;
        } break;
        default: assert(0 && "UNREACHABLE");
    }

    return out_len;
}

#endif // B64_IMPLEMENTATION
