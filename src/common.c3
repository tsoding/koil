module common;
import common::vector2;
import common::ivector2;
import std::math;
import std::io;
import std::collections::list;
import std::collections::map;
import std::hash::fnv32a;

def ShortString = char[64];
macro uint ShortString.hash(self) => fnv32a::encode(&self);

// WARNING! struct Asset definition must be in sync with the one in common.h
struct Asset {
    String filename;
    usz offset;
    usz width;
    usz height;
}

def Assets = List(<Asset>);

const ushort SERVER_PORT = 6970;  // WARNING! Has to be in sync with SERVER_PORT in client.mts
const float BOMB_GRAVITY = 10;
const float BOMB_LIFETIME = 2;
const float BOMB_THROW_VELOCITY = 5;
const float BOMB_DAMP = 0.8;
const float BOMB_SCALE = 0.25;
const float PLAYER_SIZE = 0.5;
const float PLAYER_RADIUS = 0.5;
const float PLAYER_SPEED = 2;

// It's such mod that proper_mod(-1, 100) === 99
macro proper_mod(a, b) => (a%b + b)%b;

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

/// Scene //////////////////////////////

struct Scene {
    HashMap(<IVector2, bool>) walls;
}

Scene scene;
fn void load_default_scene() {
    bool[*][*] default_walls = {
        { false, false, true, true, true, false, false},
        { false, false, false, false, false, true, false},
        { true, false, false, false, false, true, false},
        { true,  false, false, false, false, true, false},
        { true, false, false, false, false, false, false},
        { false,  true, true, true, false, false, false},
        { false,  false, false, false, false, false, false},
    };
    usz width = default_walls[0].len;
    usz height = default_walls.len;
    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            if (default_walls[y][x]) {
                scene.walls.set({x, y}, default_walls[y][x]);
            }
        }
    }
}

fn bool Scene.get_tile(&scene, Vector2 p) {
    if (try tile = scene.walls.get(ivector2::from_vector2(vector2::floor(p)))) {
        return tile;
    }
    return false;
}

fn bool Scene.can_rectangle_fit_here(&scene, float px, float py, float sx, float sy) {
    int x1 = (int)math::floor(px - sx*0.5f);
    int x2 = (int)math::floor(px + sx*0.5f);
    int y1 = (int)math::floor(py - sy*0.5f);
    int y2 = (int)math::floor(py + sy*0.5f);
    for (int x = x1; x <= x2; ++x) {
        for (int y = y1; y <= y2; ++y) {
            if (scene.get_tile({x, y})) {
                return false;
            }
        }
    }
    return true;
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

Item[] items = {
    {
        .kind = ItemKind.BOMB,
        .position = {1.5, 3.5},
        .alive = true,
    },
    {
        .kind = ItemKind.KEY,
        .position = {2.5, 1.5},
        .alive = true,
    },
    {
        .kind = ItemKind.KEY,
        .position = {3, 1.5},
        .alive = true,
    },
    {
        .kind = ItemKind.KEY,
        .position = {3.5, 1.5},
        .alive = true,
    },
    {
        .kind = ItemKind.KEY,
        .position = {4.0, 1.5},
        .alive = true,
    },
    {
        .kind = ItemKind.KEY,
        .position = {4.5, 1.5},
        .alive = true,
    },
};

extern fn bool collect_item(Player player, Item *item) @extern("collect_item");

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

extern fn ItemsSpawnedBatchMessage* reconstruct_state_of_items(Item *items, usz items_count) @extern("reconstruct_state_of_items");

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
Bombs bombs;

fn int throw_bomb(Vector2 position, float direction, Bombs *bombs) {
    foreach (index, &bomb: *bombs) {
        if (bomb.lifetime <= 0) {
            bomb.lifetime    = BOMB_LIFETIME;
            bomb.position    = position;
            bomb.position_z  = 0.6;
            bomb.velocity    = vector2::from_polar(direction, 1.0f);
            bomb.velocity_z  = 0.5;
            bomb.velocity    = vector2::mul(bomb.velocity, vector2::xx(BOMB_THROW_VELOCITY));
            bomb.velocity_z *= BOMB_THROW_VELOCITY;
            return (int)index;
        }
    }
    return -1;
}

fn bool update_bomb(Bomb *bomb, Scene* scene, float delta_time) @export("update_bomb") {
    bool collided = false;
    bomb.lifetime -= delta_time;
    bomb.velocity_z -= BOMB_GRAVITY*delta_time;

    float nx = bomb.position.x + bomb.velocity.x*delta_time;
    float ny = bomb.position.y + bomb.velocity.y*delta_time;
    if (scene.get_tile({nx, ny})) {
        float dx = math::abs(math::floor(bomb.position.x) - math::floor(nx));
        float dy = math::abs(math::floor(bomb.position.y) - math::floor(ny));

        if (dx > 0) bomb.velocity.x *= -1;
        if (dy > 0) bomb.velocity.y *= -1;
        bomb.velocity = vector2::mul(bomb.velocity, vector2::xx(BOMB_DAMP));
        bomb.velocity_z *= BOMB_DAMP;
        if (vector3::length({bomb.velocity.x, bomb.velocity.y, bomb.velocity_z}) > 1) collided = true; // Wall collision
    } else {
        bomb.position.x = nx;
        bomb.position.y = ny;
    }

    float nz = bomb.position_z + bomb.velocity_z*delta_time;
    if (nz < BOMB_SCALE || nz > 1.0) {
        bomb.velocity_z *= -1*BOMB_DAMP;
        bomb.velocity = vector2::mul(bomb.velocity, vector2::xx(BOMB_DAMP));
        if (vector3::length({bomb.velocity.x, bomb.velocity.y, bomb.velocity_z}) > 1) collided = true; // Floor collision
    } else {
        bomb.position_z = nz;
    }
    return collided;
}

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

fn void update_player(Player *player, Scene *scene, float delta_time) {
    Vector2 control_velocity = {0, 0};
    float angular_velocity = 0.0;
    if ((player.moving>>(uint)Moving.MOVING_FORWARD)&1) {
        control_velocity = vector2::add(control_velocity, vector2::from_polar(player.direction, PLAYER_SPEED));
    }
    if ((player.moving>>(uint)Moving.MOVING_BACKWARD)&1) {
        control_velocity = vector2::sub(control_velocity, vector2::from_polar(player.direction, PLAYER_SPEED));
    }
    if ((player.moving>>(uint)Moving.TURNING_LEFT)&1) {
        angular_velocity -= math::PI;
    }
    if ((player.moving>>(uint)Moving.TURNING_RIGHT)&1) {
        angular_velocity += math::PI;
    }
    player.direction = (player.direction + angular_velocity*delta_time)%(2*(float)math::PI);

    float nx = player.position.x + control_velocity.x*delta_time;
    if (scene.can_rectangle_fit_here(nx, player.position.y, PLAYER_SIZE, PLAYER_SIZE)) {
        player.position.x = nx;
    }
    float ny = player.position.y + control_velocity.y*delta_time;
    if (scene.can_rectangle_fit_here(player.position.x, ny, PLAYER_SIZE, PLAYER_SIZE)) {
        player.position.y = ny;
    }
}

/// Temporary Memory //////////////////////////////

usz temp_mark = 0;
fn void reset_temp_mark() {
    allocator::temp().reset(temp_mark);
}

fn void* allocate_temporary_buffer(usz size) @extern("allocate_temporary_buffer") @wasm {
    return mem::tcalloc(size);
}

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

extern fn Vector2 xx(float x) @extern("vector2_xx");

fn Vector2 add(Vector2 a, Vector2 b) {
    a.x += b.x;
    a.y += b.y;
    return a;
}

extern fn Vector2 sub(Vector2 a, Vector2 b) @extern("vector2_sub");
extern fn Vector2 mul(Vector2 a, Vector2 b) @extern("vector2_mul");

extern fn float length(Vector2 a) @extern("vector2_length");

fn Vector2 normalize(Vector2 a) {
    float l = length(a);
    if (l == 0.0) return a;
    a.x /= l;
    a.y /= l;
    return a;
}

fn float lerpf(float a, float b, float t) {
    return a + (b - a)*t;
}

fn Vector2 lerp(Vector2 a, Vector2 b, float t) {
    return {lerpf(a.x, b.x, t), lerpf(a.y, b.y, t)};
}

fn Vector2 copysign(Vector2 a, Vector2 b) {
    return {math::copysign(a.x, b.x), math::copysign(a.y, b.y)};
}

fn Vector2 floor(Vector2 a) {
    return {math::floor(a.x), math::floor(a.y)};
}

extern fn float distance(Vector2 a, Vector2 b) @extern("vector2_distance");

fn float dot(Vector2 a, Vector2 b) {
    return a.x*b.x + a.y*b.y;
}

extern fn Vector2 from_polar(float angle, float len) @extern("vector2_from_polar");

fn Vector2 from_vector3(Vector3 a) {
    return {a.x, a.y};
}

module common::ivector2;
import common::vector2;
import std::hash::fnv32a;

struct IVector2 {
    int x, y;
}
fn uint IVector2.hash(IVector2 self) => fnv32a::encode(@as_char_view(self));
macro bool IVector2.equals(IVector2 a, IVector2 b) => a.x == b.x && a.y == b.y;

fn IVector2 from_vector2(Vector2 a) {
    return {(int)a.x, (int)a.y};
}

module common::vector3;
import std::math;

struct Vector3 {
    float x, y, z;
}

fn Vector3 mul(Vector3 a, Vector3 b) {
    a.x *= b.x;
    a.y *= b.y;
    a.z *= b.z;
    return a;
}

fn Vector3 xxx(float x) {
    return {x, x, x};
}

fn float length(Vector3 a) {
    return math::sqrt(a.x*a.x + a.y*a.y + a.z*a.z);
}
