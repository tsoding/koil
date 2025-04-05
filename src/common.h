#ifndef COMMON_H_
#define COMMON_H_

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

#define PLAYER_RADIUS 0.5f
#define BOMB_LIFETIME 2.0f
#define BOMB_THROW_VELOCITY 5.0f

// WARNING! This header must be in sync with common.c3

void* allocate_temporary_buffer(size_t size);

// Vector2 //////////////////////////////

typedef struct {
    float x, y;
} Vector2;

float vector2_distance(Vector2 a, Vector2 b);
Vector2 vector2_sub(Vector2 a, Vector2 b);
float vector2_length(Vector2 a);
Vector2 vector2_from_polar(float angle, float len);
Vector2 vector2_mul(Vector2 a, Vector2 b);
Vector2 vector2_xx(float x);

// Short String //////////////////////////////

typedef struct {
    char data[64];
} ShortString;

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

// Scene //////////////////////////////

typedef void Scene;

// Bombs //////////////////////////////

typedef struct {
    Vector2 position;
    float position_z;
    Vector2 velocity;
    float velocity_z;
    float lifetime;
} Bomb;

#define BOMBS_CAPACITY 20

typedef struct {
    Bomb items[BOMBS_CAPACITY];
} Bombs;

extern Bombs bombs;             // Implemented in C3

int throw_bomb(Vector2 position, float direction, Bombs *bombs);
bool update_bomb(Bomb *bomb, Scene *scene, float delta_time); // Implemented in C3

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
#define verify_items_collected_batch_message(message) batch_message_verify(MK_ITEM_COLLECTED, message, sizeof(uint32_t));
#define alloc_items_collected_batch_message(count) (ItemsCollectedBatchMessage*)batch_message_alloc(MK_ITEM_COLLECTED, count, sizeof(uint32_t))

typedef struct {
    uint32_t bombIndex;
    float x;
    float y;
    float z;
    float dx;
    float dy;
    float dz;
    float lifetime;
} __attribute__((packed)) BombSpawned;

typedef struct {
    uint32_t byte_length;
    /*MessageKind*/ uint8_t kind;
    BombSpawned payload[];
} __attribute__((packed)) BombsSpawnedBatchMessage;
#define verify_bombs_spawned_batch_message(message) batch_message_verify(MK_BOMB_SPAWNED, message, sizeof(BombSpawned))
#define alloc_bombs_spawned_batch_message(count) (BombsSpawnedBatchMessage*)batch_message_alloc(MK_BOMB_SPAWNED, count, sizeof(BombSpawned))

typedef struct {
    uint32_t bombIndex;
    float x;
    float y;
    float z;
} __attribute__((packed)) BombExploded;

typedef struct {
    uint32_t byte_length;
    /*MessageKind*/ uint8_t kind;
    BombExploded payload[];
} __attribute__((packed)) BombsExplodedBatchMessage;
#define verify_bombs_exploded_batch_message(message) batch_message_verify(MK_BOMB_EXPLODED, message, sizeof(BombExploded))
#define alloc_bombs_exploded_batch_message(count) (BombsExplodedBatchMessage*)batch_message_alloc(MK_BOMB_EXPLODED, count, sizeof(BombExploded))

#endif // COMMON_H_
