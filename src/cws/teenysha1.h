/*
 * TeenySHA1 - a header only implementation of the SHA1 algorithm in C. Based
 * on the implementation in boost::uuid::details. Translated to C from
 * https://github.com/mohaps/TinySHA1
 *
 * SHA1 Wikipedia Page: http://en.wikipedia.org/wiki/SHA-1
 *
 * Copyright (c) 2012-25 SAURAV MOHAPATRA <mohaps@gmail.com>
 * Copyright (c) 2025    ALEXEY KUTEPOV   <reximkut@gmail.com>
 *
 * Permission to use, copy, modify, and distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
#ifndef _TEENY_SHA1_HPP_
#define _TEENY_SHA1_HPP_
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

typedef uint32_t digest32_t[5];
typedef uint8_t digest8_t[20];

typedef struct {
    digest32_t digest;
    uint8_t block[64];
    size_t block_byte_index;
    size_t byte_count;
} SHA1;

void sha1_reset(SHA1 *sha1);
void sha1_process_block(SHA1 *sha1, const void* const start, const void* const end);
void sha1_process_byte(SHA1 *sha1, uint8_t octet);
void sha1_process_bytes(SHA1 *sha1, const void* const data, size_t len);
// WARNING! On little-endian machine (like x86_64) `sha1_get_digest` will return the digest uint32_t chunks
// in a byte order suitable for human readable printing
// ```c
// printf("%08x%08x%08x%08x%08x\n", digest[0], digest[1], digest[2], digest[3], digest[4])
// ```
// If you need actual digest bytes in a correct order use `sha1_get_digest_bytes`.
const uint32_t* sha1_get_digest(SHA1 *sha1, digest32_t digest);
const uint8_t* sha1_get_digest_bytes(SHA1 *sha1, digest8_t digest);

#endif // _TEENY_SHA1_HPP_

#ifdef TEENY_SHA1_IMPLEMENTATION

static inline uint32_t sha1__left_rotate(uint32_t value, size_t count)
{
    return (value << count) ^ (value >> (32-count));
}

void sha1__process_block(SHA1 *sha1)
{
    uint32_t w[80];
    for (size_t i = 0; i < 16; i++) {
        w[i]  = (sha1->block[i*4 + 0] << 24);
        w[i] |= (sha1->block[i*4 + 1] << 16);
        w[i] |= (sha1->block[i*4 + 2] << 8);
        w[i] |= (sha1->block[i*4 + 3]);
    }
    for (size_t i = 16; i < 80; i++) {
        w[i] = sha1__left_rotate((w[i-3] ^ w[i-8] ^ w[i-14] ^ w[i-16]), 1);
    }

    uint32_t a = sha1->digest[0];
    uint32_t b = sha1->digest[1];
    uint32_t c = sha1->digest[2];
    uint32_t d = sha1->digest[3];
    uint32_t e = sha1->digest[4];

    for (size_t i=0; i<80; ++i) {
        uint32_t f = 0;
        uint32_t k = 0;

        if (i<20) {
            f = (b & c) | (~b & d);
            k = 0x5A827999;
        } else if (i<40) {
            f = b ^ c ^ d;
            k = 0x6ED9EBA1;
        } else if (i<60) {
            f = (b & c) | (b & d) | (c & d);
            k = 0x8F1BBCDC;
        } else {
            f = b ^ c ^ d;
            k = 0xCA62C1D6;
        }
        uint32_t temp = sha1__left_rotate(a, 5) + f + e + k + w[i];
        e = d;
        d = c;
        c = sha1__left_rotate(b, 30);
        b = a;
        a = temp;
    }

    sha1->digest[0] += a;
    sha1->digest[1] += b;
    sha1->digest[2] += c;
    sha1->digest[3] += d;
    sha1->digest[4] += e;
}

void sha1_reset(SHA1 *sha1)
{
    sha1->digest[0] = 0x67452301;
    sha1->digest[1] = 0xEFCDAB89;
    sha1->digest[2] = 0x98BADCFE;
    sha1->digest[3] = 0x10325476;
    sha1->digest[4] = 0xC3D2E1F0;
    sha1->block_byte_index = 0;
    sha1->byte_count = 0;
}

void sha1_process_byte(SHA1 *sha1, uint8_t octet)
{
    sha1->block[sha1->block_byte_index++] = octet;
    ++sha1->byte_count;
    if(sha1->block_byte_index == 64) {
        sha1->block_byte_index = 0;
        sha1__process_block(sha1);
    }
}

void sha1_process_block(SHA1 *sha1, const void* const start, const void* const end)
{
    const uint8_t* begin = (const uint8_t*)(start);
    const uint8_t* finish = (const uint8_t*)(end);
    while(begin != finish) {
        sha1_process_byte(sha1, *begin);
        begin++;
    }
}

void sha1_process_bytes(SHA1 *sha1, const void* const data, size_t len)
{
    const uint8_t* block = (const uint8_t*)(data);
    sha1_process_block(sha1, block, block + len);
}

const uint32_t* sha1_get_digest(SHA1 *sha1, digest32_t digest)
{
    size_t bitCount = sha1->byte_count * 8;
    sha1_process_byte(sha1, 0x80);
    if (sha1->block_byte_index > 56) {
        while (sha1->block_byte_index != 0) {
            sha1_process_byte(sha1, 0);
        }
        while (sha1->block_byte_index < 56) {
            sha1_process_byte(sha1, 0);
        }
    } else {
        while (sha1->block_byte_index < 56) {
            sha1_process_byte(sha1, 0);
        }
    }
    sha1_process_byte(sha1, 0);
    sha1_process_byte(sha1, 0);
    sha1_process_byte(sha1, 0);
    sha1_process_byte(sha1, 0);
    sha1_process_byte(sha1, (unsigned char)((bitCount>>24) & 0xFF));
    sha1_process_byte(sha1, (unsigned char)((bitCount>>16) & 0xFF));
    sha1_process_byte(sha1, (unsigned char)((bitCount>>8 ) & 0xFF));
    sha1_process_byte(sha1, (unsigned char)((bitCount)     & 0xFF));

    memcpy(digest, sha1->digest, 5 * sizeof(uint32_t));
    return digest;
}

const uint8_t* sha1_get_digest_bytes(SHA1 *sha1, digest8_t digest)
{
    digest32_t d32;
    sha1_get_digest(sha1, d32);
    size_t di = 0;
    digest[di++] = ((d32[0] >> 24) & 0xFF);
    digest[di++] = ((d32[0] >> 16) & 0xFF);
    digest[di++] = ((d32[0] >> 8) & 0xFF);
    digest[di++] = ((d32[0]) & 0xFF);

    digest[di++] = ((d32[1] >> 24) & 0xFF);
    digest[di++] = ((d32[1] >> 16) & 0xFF);
    digest[di++] = ((d32[1] >> 8) & 0xFF);
    digest[di++] = ((d32[1]) & 0xFF);

    digest[di++] = ((d32[2] >> 24) & 0xFF);
    digest[di++] = ((d32[2] >> 16) & 0xFF);
    digest[di++] = ((d32[2] >> 8) & 0xFF);
    digest[di++] = ((d32[2]) & 0xFF);

    digest[di++] = ((d32[3] >> 24) & 0xFF);
    digest[di++] = ((d32[3] >> 16) & 0xFF);
    digest[di++] = ((d32[3] >> 8) & 0xFF);
    digest[di++] = ((d32[3]) & 0xFF);

    digest[di++] = ((d32[4] >> 24) & 0xFF);
    digest[di++] = ((d32[4] >> 16) & 0xFF);
    digest[di++] = ((d32[4] >> 8) & 0xFF);
    digest[di++] = ((d32[4]) & 0xFF);
    return digest;
}

#endif // TEENY_SHA1_IMPLEMENTATION
