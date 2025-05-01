#ifndef COMMON_H_
#define COMMON_H_

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

#ifndef PI
#define PI 3.14159265358979323846f
#endif // PI

// It's such mod that proper_mod(-1, 100) === 99
float proper_fmodf(float a, float b);

float lerpf(float a, float b, float t);

#define SERVER_PORT 6970  // WARNING! Has to be in sync with SERVER_PORT in client.mts
#define PLAYER_RADIUS 0.5f
#define PLAYER_SPEED 2.0f
#define PLAYER_SIZE 0.5f
#define BOMB_LIFETIME 2.0f
#define BOMB_THROW_VELOCITY 5.0f
#define BOMB_GRAVITY 10.0f
#define BOMB_DAMP 0.8f
#define BOMB_SCALE 0.25f

// WARNING! This header must be in sync with common.c3

// Have separate implementations in client and server respectively
void* allocate_temporary_buffer(size_t size);
void reset_temp_mark(void);

// Vector3 //////////////////////////////

typedef struct {
    float x, y, z;
} Vector3;

float vector3_length(Vector3 a);

// Vector2 //////////////////////////////

typedef struct {
    float x, y;
} Vector2;

Vector2 vector2_add(Vector2 a, Vector2 b);
float vector2_distance(Vector2 a, Vector2 b);
Vector2 vector2_sub(Vector2 a, Vector2 b);
float vector2_length(Vector2 a);
Vector2 vector2_from_polar(float angle, float len);
Vector2 vector2_mul(Vector2 a, Vector2 b);
Vector2 vector2_xx(float x);
Vector2 vector2_floor(Vector2 a);
Vector2 vector2_normalize(Vector2 a);
Vector2 vector2_lerp(Vector2 a, Vector2 b, float t);
Vector2 vector2_copysign(Vector2 a, Vector2 b);
float vector2_dot(Vector2 a, Vector2 b);
float vector2_angle(Vector2 a);

// IVector2 //////////////////////////////

typedef struct {
    int x, y;
} IVector2;

IVector2 ivector2_from_vector2(Vector2 a);

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

// Scene //////////////////////////////

bool scene_can_rectangle_fit_here(float px, float py, float sx, float sy);
bool scene_get_tile(Vector2 p);

// Player //////////////////////////////

typedef enum {
    MOVING_FORWARD,
    MOVING_BACKWARD,
    TURNING_LEFT,
    TURNING_RIGHT,
    COUNT_MOVINGS,
} Moving;

typedef struct {
    uint32_t id;
    Vector2 position;
    float direction;
    uint8_t moving;
    uint8_t hue;
} Player;

void update_player(Player *player, float delta_time);

// Items //////////////////////////////

typedef enum {
    ITEM_KEY,
    ITEM_BOMB,
} ItemKind;

typedef struct {
    /*ItemKind*/uint8_t kind;
    bool alive;
    Vector2 position;
} Item;

bool collect_item(Player player, Item *item);
Item *items_ptr();
size_t items_len();

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

extern Bombs bombs;

int throw_bomb(Vector2 position, float direction, Bombs *bombs);
bool update_bomb(Bomb *bomb, float delta_time);

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
bool batch_message_verify_empty(MessageKind kind, Message *message);
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

// NOTE: this struct intended to be part of the binary protocol to communicate the state of the player.
// This is why it is packed. Do not confuse it with struct Player which is used to track the state of the player.
typedef struct {
    uint32_t id;
    float x;
    float y;
    float direction;
    uint8_t hue;
    uint8_t moving;
} __attribute__((packed)) PlayerStruct;

typedef struct {
    uint32_t byte_length;
    /*MessageKind*/ uint8_t kind;
    PlayerStruct payload[];
} __attribute__((packed)) PlayersJoinedBatchMessage;

#define verify_players_joined_batch_message(message) batch_message_verify(MK_PLAYER_JOINED, message, sizeof(PlayerStruct))
#define alloc_players_joined_batch_message(count) (PlayersJoinedBatchMessage*)batch_message_alloc(MK_PLAYER_JOINED, count, sizeof(PlayerStruct))

typedef struct {
    uint32_t byte_length;
    /*MessageKind*/ uint8_t kind;
    uint32_t payload[];
} __attribute__((packed)) PlayersLeftBatchMessage;
#define PlayersLeftBatchMessage_count(self) BatchMessage_count((BatchMessage*)self, sizeof(uint))
#define verify_players_left_batch_message(message) batch_message_verify(MK_PLAYER_LEFT, message, sizeof(uint))
#define alloc_players_left_batch_message(count) (PlayersLeftBatchMessage*)batch_message_alloc(MK_PLAYER_LEFT, count, sizeof(uint))

typedef struct {
    /*ItemKind*/ uint8_t itemKind;
    uint32_t itemIndex;
    float x;
    float y;
} __attribute__((packed)) ItemSpawned;

typedef struct {
    uint32_t byte_length;
    /*MessageKind*/ uint8_t kind;
    ItemSpawned payload[];
} __attribute__((packed)) ItemsSpawnedBatchMessage;

#define verify_items_spawned_batch_message(message) batch_message_verify(MK_ITEM_SPAWNED, message, sizeof(ItemSpawned))
#define alloc_items_spawned_batch_message(count) (ItemsSpawnedBatchMessage*)batch_message_alloc(MK_ITEM_SPAWNED, count, sizeof(ItemSpawned))

ItemsSpawnedBatchMessage* reconstruct_state_of_items(Item *items, size_t items_count);

typedef struct {
    uint32_t id;
    float x;
    float y;
    float direction;
    uint8_t hue;
} __attribute__((packed)) HelloPlayer;

typedef struct {
    uint32_t byte_length;
    /*MessageKind*/ uint8_t kind;
    HelloPlayer payload;
} __attribute__((packed)) HelloMessage;

#define verify_hello_message(message) batch_message_verify(MK_HELLO, message, sizeof(HelloPlayer));

typedef struct {
    uint32_t byte_length;
    /*MessageKind*/uint8_t kind;
    PlayerStruct payload[];
} __attribute__((packed)) PlayersMovingBatchMessage;

#define PlayersMovingBatchMessage_count(self) BatchMessage_count((BatchMessage*)self, sizeof(PlayerStruct))
#define verify_players_moving_batch_message(message) batch_message_verify(MK_PLAYER_MOVING, message, sizeof(PlayerStruct))
#define alloc_players_moving_batch_message(count) (PlayersMovingBatchMessage*)batch_message_alloc(MK_PLAYER_MOVING, count, sizeof(PlayerStruct))

typedef struct {
    uint32_t byte_length;
    /*MessageKind*/ uint8_t kind;
    uint32_t payload;
} __attribute__((packed)) PongMessage;

#define verify_pong_message(message) batch_message_verify(MK_PONG, message, sizeof(uint32_t))

typedef struct {
    /*Moving*/ uint8_t direction;
    uint8_t start;
} __attribute__((packed)) AmmaMoving;

typedef struct {
    uint32_t byte_length;
    /*MessageKind*/ uint8_t kind;
    AmmaMoving payload;
} __attribute__((packed)) AmmaMovingMessage;

#define verify_amma_moving_message(message) batch_message_verify(MK_AMMA_MOVING, message, sizeof(AmmaMoving))

typedef struct {
    uint32_t byte_length;
    /*MessageKind*/ uint8_t kind;
    uint32_t payload;
} __attribute__((packed)) PingMessage;

#define verify_ping_message(message) batch_message_verify(MK_PING, message, sizeof(uint))

typedef struct {
    uint32_t byte_length;
    /*MessageKind*/ uint8_t kind;
} __attribute__((packed)) AmmaThrowingMessage;

#define verify_amma_throwing_message(message) batch_message_verify_empty(MK_AMMA_THROWING, message)

#endif // COMMON_H_
