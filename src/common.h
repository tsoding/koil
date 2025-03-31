#ifndef COMMON_H_
#define COMMON_H_

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

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

typedef enum {
    MK_HELLO,
    MK_PLAYER_JOINED,
    MK_PLAYER_LEFT,
    MK_PLAYER_MOVING,
    MK_AMMA_MOVING,
    MK_AMMA_THROWING,
    MK_PING,
    MK_PONG,
    MK_ITEM_SPAWNED,
    MK_ITEM_COLLECTED,
    MK_BOMB_SPAWNED,
    MK_BOMB_EXPLODED,
} MessageKind;

typedef struct {
    uint32_t byte_length;
    uint8_t bytes[];
} __attribute__((packed)) Message;

typedef struct {
    uint32_t byte_length;
    /*MessageKind*/ uint8_t kind;
    uint8_t payload[];
} __attribute__((packed)) BatchMessage;

bool batch_message_verify(MessageKind kind, Message *message, size_t payload_size);

#endif // COMMON_H_
