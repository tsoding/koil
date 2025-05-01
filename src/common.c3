module common;
import common::vector2;
import common::ivector2;
import std::math;
import std::io;
import std::collections::list;
import std::collections::map;
import std::hash::fnv32a;

// WARNING! struct Asset definition must be in sync with the one in common.h
struct Asset {
    String filename;
    usz offset;
    usz width;
    usz height;
}

def Assets = List(<Asset>);

/// Messages //////////////////////////////

enum MessageKind: inline char {
    HELLO,
    PLAYER_JOINED,
    PLAYER_LEFT,
    PLAYER_MOVING,
    AMMA_MOVING,
    AMMA_THROWING,
    PING,
    PONG,
    ITEM_SPAWNED,
    ITEM_COLLECTED,
    BOMB_SPAWNED,
    BOMB_EXPLODED,
}

struct Message @packed {
    uint byte_length;
    char[*] bytes;
}

/// Items //////////////////////////////

enum ItemKind: inline char {
    KEY,
    BOMB,
}

struct Item {
    ItemKind kind;
    bool alive;
    Vector2 position;
}

extern fn Item *items_ptr() @extern("items_ptr");
extern fn usz items_len() @extern("items_len");

struct ItemSpawned @packed {
    ItemKind itemKind;
    uint itemIndex;
    float x;
    float y;
}

struct ItemsSpawnedBatchMessage @packed {
    uint byte_length;
    MessageKind kind;
    ItemSpawned[*] payload;
}
macro verify_items_spawned_batch_message(message) => msg::batch::verify(MessageKind.ITEM_SPAWNED, message, ItemSpawned.sizeof);
macro alloc_items_spawned_batch_message(count) => (ItemsSpawnedBatchMessage*)msg::batch::alloc(MessageKind.ITEM_SPAWNED, count, ItemSpawned.sizeof);

struct ItemsCollectedBatchMessage @packed {
    uint byte_length;
    MessageKind kind;
    int[*] payload;
}
macro verify_items_collected_batch_message(message) => msg::batch::verify(MessageKind.ITEM_COLLECTED, message, int.sizeof);
macro alloc_items_collected_batch_message(count) => (ItemsCollectedBatchMessage*)msg::batch::alloc(MessageKind.ITEM_COLLECTED, count, int.sizeof);

/// Bombs //////////////////////////////

struct Bomb {
    Vector2 position;
    float position_z;
    Vector2 velocity;
    float velocity_z;
    float lifetime;
}

def Bombs = Bomb[20];
extern Bombs bombs @extern("bombs");

extern fn int throw_bomb(Vector2 position, float direction, Bombs *bombs) @extern("throw_bomb");

struct BombSpawned @packed {
    uint bombIndex;
    float x;
    float y;
    float z;
    float dx;
    float dy;
    float dz;
    float lifetime;
}

struct BombsSpawnedBatchMessage @packed {
    uint byte_length;
    MessageKind kind;
    BombSpawned[*] payload;
}
macro verify_bombs_spawned_batch_message(message) => msg::batch::verify(MessageKind.BOMB_SPAWNED, message, BombSpawned.sizeof);
macro alloc_bombs_spawned_batch_message(count) => (BombsSpawnedBatchMessage*)msg::batch::alloc(MessageKind.BOMB_SPAWNED, count, BombSpawned.sizeof);

struct BombExploded @packed {
    uint bombIndex;
    float x;
    float y;
    float z;
}

struct BombsExplodedBatchMessage @packed {
    uint byte_length;
    MessageKind kind;
    BombExploded[*] payload;
}
macro verify_bombs_exploded_batch_message(message) => msg::batch::verify(MessageKind.BOMB_EXPLODED, message, BombExploded.sizeof);
macro alloc_bombs_exploded_batch_message(count) => (BombsExplodedBatchMessage*)msg::batch::alloc(MessageKind.BOMB_EXPLODED, count, BombExploded.sizeof);

/// Player //////////////////////////////

enum Moving: inline char {
    MOVING_FORWARD,
    MOVING_BACKWARD,
    TURNING_LEFT,
    TURNING_RIGHT,
    COUNT,
}

struct Player {
    uint id;
    Vector2 position;
    float direction;
    char moving;
    char hue;
}

// NOTE: this struct intended to be part of the binary protocol to communicate the state of the player.
// This is why it is @packed. Do not confuse it with struct Player which is used to track the state of the player.
struct PlayerStruct @packed {
    uint id;
    float x;
    float y;
    float direction;
    char hue;
    char moving;
}

struct PlayersJoinedBatchMessage @packed {
    uint byte_length;
    MessageKind kind;
    PlayerStruct[*] payload;
}
macro verify_players_joined_batch_message(message) => msg::batch::verify(MessageKind.PLAYER_JOINED, message, PlayerStruct.sizeof);
macro alloc_players_joined_batch_message(count) => (PlayersJoinedBatchMessage*)msg::batch::alloc(MessageKind.PLAYER_JOINED, count, PlayerStruct.sizeof);

struct PlayersLeftBatchMessage @packed {
    uint byte_length;
    MessageKind kind;
    uint[*] payload;
}
macro PlayersLeftBatchMessage.count(&self) => ((BatchMessage*)self).count(uint.sizeof);
macro verify_players_left_batch_message(message) => msg::batch::verify(MessageKind.PLAYER_LEFT, message, uint.sizeof);
macro alloc_players_left_batch_message(count) => (PlayersLeftBatchMessage*)msg::batch::alloc(MessageKind.PLAYER_LEFT, count, uint.sizeof);

struct PlayersMovingBatchMessage @packed {
    uint byte_length;
    MessageKind kind;
    PlayerStruct[*] payload;
}
macro PlayersMovingBatchMessage.count(&self) => ((BatchMessage*)self).count(PlayerStruct.sizeof);
macro verify_players_moving_batch_message(message) => msg::batch::verify(MessageKind.PLAYER_MOVING, message, PlayerStruct.sizeof);
macro alloc_players_moving_batch_message(count) => (PlayersMovingBatchMessage*)msg::batch::alloc(MessageKind.PLAYER_MOVING, count, PlayerStruct.sizeof);

struct HelloPlayer @packed {
    uint id;
    float x;
    float y;
    float direction;
    char hue;
}

struct HelloMessage @packed {
    uint byte_length;
    MessageKind kind;
    HelloPlayer payload;
}
macro verify_hello_message(message) => msg::batch::verify(MessageKind.HELLO, message, HelloPlayer.sizeof);

struct PongMessage @packed {
    uint byte_length;
    MessageKind kind;
    uint payload;
}
macro verify_pong_message(message) => msg::batch::verify(MessageKind.PONG, message, uint.sizeof);

struct AmmaMoving @packed {
    Moving direction;
    char start;
}

struct AmmaMovingMessage @packed {
    uint byte_length;
    MessageKind kind;
    AmmaMoving payload;
}
macro verify_amma_moving_message(message) => msg::batch::verify(MessageKind.AMMA_MOVING, message, AmmaMoving.sizeof);

struct AmmaThrowingMessage @packed {
    uint byte_length;
    MessageKind kind;
}
macro verify_amma_throwing_message(message) => msg::batch::verify_empty(MessageKind.AMMA_THROWING, message);

struct PingMessage @packed {
    uint byte_length;
    MessageKind kind;
    uint payload;
}
macro verify_ping_message(message) => msg::batch::verify(MessageKind.PING, message, uint.sizeof);

extern fn void update_player(Player *player, float delta_time) @extern("update_player");

module common::msg::batch;

struct BatchMessage @packed {
    uint byte_length;
    MessageKind kind;
    char[*] payload;
}

macro uint BatchMessage.count(self, payload_size) => (self.byte_length - BatchMessage.sizeof)/payload_size;
extern fn BatchMessage *alloc(MessageKind kind, usz count, usz payload_size) @extern("batch_message_alloc");
extern fn bool verify_empty(MessageKind kind, Message *message) @extern("batch_message_verify_empty");
extern fn bool verify(MessageKind kind, Message *message, usz payload_size) @extern("batch_message_verify");

module common::vector2;
import common::vector3;
import std::math;

struct Vector2 {
    float x, y;
}

module common::ivector2;
import common::vector2;
import std::hash::fnv32a;

struct IVector2 {
    int x, y;
}

module common::vector3;
import std::math;

struct Vector3 {
    float x, y, z;
}
