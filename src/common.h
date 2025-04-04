#ifndef COMMON_H_
#define COMMON_H_

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

#define PLAYER_RADIUS 0.5f

// WARNING! This header must be in sync with common.c3

// Vector2 //////////////////////////////

typedef struct {
    float x, y;
} Vector2;

float vector2_distance(Vector2 a, Vector2 b);
Vector2 vector2_sub(Vector2 a, Vector2 b);
float vector2_length(Vector2 a);

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

// Player //////////////////////////////

typedef struct {
    uint32_t id;
    Vector2 position;
    float direction;
    char moving;
    char hue;
} Player;

// Items //////////////////////////////

typedef enum {
    ITEM_KEY,
    ITEM_BOMB,
} ItemKind;

typedef struct {
    /*ItemKind*/char kind;
    bool alive;
    Vector2 position;
} Item;

bool collect_item(Player player, Item *item);

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
BatchMessage *batch_message_alloc(MessageKind kind, size_t count, size_t payload_size);

typedef struct {
    uint32_t byte_length;
    /*MessageKind*/uint8_t kind;
    uint32_t payload[];
} __attribute__((packed)) ItemsCollectedBatchMessage;
#define alloc_items_collected_batch_message(count) (ItemsCollectedBatchMessage*)batch_message_alloc(MK_ITEM_COLLECTED, count, sizeof(int))

#endif // COMMON_H_
