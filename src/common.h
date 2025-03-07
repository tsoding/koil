#ifndef COMMON_H_
#define COMMON_H_

#include <stdint.h>

// WARNING! This header must be in sync with common.c3

// Short String //////////////////////////////

typedef struct {
    char data[64];
} Short_String;

// Assets //////////////////////////////

typedef struct {
    const char *filename;
    size_t offset;
    size_t width;
    size_t height;
} Asset;

typedef struct {
    Asset *items;
    size_t count;
    size_t capacity;
} Assets;

// Messages //////////////////////////////

typedef struct {
    uint32_t byte_length;
    uint8_t bytes[];
} __attribute__((packed)) Message;

#endif // COMMON_H_
