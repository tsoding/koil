module common;
import std::math;
import std::io;
import std::collections::list;

def ShortString = char[64];

struct Asset {
    String filename;
    usz offset;
    usz width;
    usz height;
}

def Assets = List(<Asset>);

const float BOMB_GRAVITY = 10;
const float BOMB_LIFETIME = 2;
const float BOMB_THROW_VELOCITY = 5;
const float BOMB_DAMP = 0.8;
const float BOMB_SCALE = 0.25;
const float PLAYER_SIZE = 0.5;
const float PLAYER_RADIUS = 0.5;
const float PLAYER_SPEED = 2;

extern fn void platform_write(void *buffer, usz buffer_sz);
extern fn float platform_atan2f(float y, float x);

def Vector2 = float[<2>];
def IVector2 = int[<2>];
def Vector3 = float[<3>];
def Vector4 = float[<4>];

macro Vector2.angle(self) => platform_atan2f(self.y, self.x);
// // TODO: math::atan2 is broken. Does not work with sprite_angle_index() properly.
// // Investigate what's up and potentially report to C3.
// macro Vector2.angle(self) => math::atan2(self.y, self.x);

fn Vector2 from_polar(float angle, float len) {
    return {math::cos(angle)*len, math::sin(angle)*len};
}

// It's such mod that proper_mod(-1, 100) === 99
macro proper_mod(a, b) => (a%b + b)%b;

/// Messages //////////////////////////////

enum MessageKind: char {
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

fault MessageFault {
    INVALID
}

struct Message @packed {
    uint byte_length;
    char[*] bytes;
}

/// Scene //////////////////////////////

struct Scene {
    usz width;
    usz height;
    bool[*] walls;
}

fn Scene *allocate_scene(usz width, usz height) {
    Scene *scene = mem::calloc(Scene.sizeof + bool.sizeof*width*height);
    scene.width = width;
    scene.height = height;
    for (usz i = 0; i < width*height; ++i) scene.walls[i] = false;
    return scene;
}

Scene *scene = null;

fn Scene *allocate_default_scene() {
    bool[*][*] default_walls = {
        { false, false, true, true, true, false, false},
        { false, false, false, false, false, true, false},
        { true, false, false, false, false, true, false},
        { true,  false, false, false, false, true, false},
        { true, false, false, false, false, false, false},
        {  false,  true, true, true, false, false, false},
        {  false,  false, false, false, false, false, false},
    };
    usz width = default_walls[0].len;
    usz height = default_walls.len;
    Scene *scene = allocate_scene(width, height);
    for (usz y = 0; y < height; ++y) {
        for (usz x = 0; x < width; ++x) {
            scene.walls[y*width + x] = default_walls[y][x];
        }
    }
    return scene;
}

fn bool Scene.get_tile(&scene, Vector2 p) {
    int x = (int)math::floor(p.x);
    int y = (int)math::floor(p.y);
    if (!(0 <= x && x < scene.width && 0 <= y && y < scene.height)) return false;
    return scene.walls[y*scene.width + x];
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

enum ItemKind: char {
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

fn bool collect_item(Player player, Item *item) {
    if (!item.alive) return false;
    if (player.position.distance(item.position) >= PLAYER_RADIUS) return false;
    item.alive = false;
    return true;
}

struct ItemSpawned @packed {
    ItemKind itemKind;
    uint itemIndex;
    float x;
    float y;
}

def ItemsSpawnedBatchMessage = BatchMessage(<ItemSpawned, MessageKind.ITEM_SPAWNED>);
def verify_items_spawned_batch_message = msg::batch::verify(<ItemSpawned, MessageKind.ITEM_SPAWNED>);
def alloc_items_spawned_batch_message = msg::batch::alloc(<ItemSpawned, MessageKind.ITEM_SPAWNED>);

fn ItemsSpawnedBatchMessage* reconstruct_state_of_items(Item[] *items) {
    usz itemsCount = 0;
    foreach (&item: *items) {
        if (item.alive) itemsCount += 1;
    }
    if (itemsCount == 0) return null;
    ItemsSpawnedBatchMessage *message = alloc_items_spawned_batch_message(itemsCount);
    usz index = 0;
    foreach (itemIndex, item: *items) {
        if (item.alive) {
            message.payload[index] = {
                .itemKind = item.kind,
                .itemIndex = (int)itemIndex,
                .x = item.position.x,
                .y = item.position.y,
            };
            index += 1;
        }
    }
    return message;
}

def ItemsCollectedBatchMessage = BatchMessage(<int, MessageKind.ITEM_COLLECTED>);
def verify_items_collected_batch_message = msg::batch::verify(<int, MessageKind.ITEM_COLLECTED>);
def alloc_items_collected_batch_message = msg::batch::alloc(<int, MessageKind.ITEM_COLLECTED>);

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
            bomb.velocity    = from_polar(direction, 1.0f);
            bomb.velocity_z  = 0.5;
            bomb.velocity   *= BOMB_THROW_VELOCITY;
            bomb.velocity_z *= BOMB_THROW_VELOCITY;
            return (int)index;
        }
    }
    return -1;
}

fn bool update_bomb(Bomb *bomb, Scene* scene, float delta_time) {
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
        bomb.velocity *= BOMB_DAMP;
        bomb.velocity_z *= BOMB_DAMP;
        if (Vector3{bomb.velocity, bomb.velocity_z}.length() > 1) collided = true; // Wall collision
    } else {
        bomb.position.x = nx;
        bomb.position.y = ny;
    }

    float nz = bomb.position_z + bomb.velocity_z*delta_time;
    if (nz < BOMB_SCALE || nz > 1.0) {
        bomb.velocity_z *= -1*BOMB_DAMP;
        bomb.velocity *= BOMB_DAMP;
        if (Vector3{bomb.velocity, bomb.velocity_z}.length() > 1) collided = true; // Floor collision
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

def BombsSpawnedBatchMessage = BatchMessage(<BombSpawned, MessageKind.BOMB_SPAWNED>);
def verify_bombs_spawned_batch_message = msg::batch::verify(<BombSpawned, MessageKind.BOMB_SPAWNED>);
def alloc_bombs_spawned_batch_message = msg::batch::alloc(<BombSpawned, MessageKind.BOMB_SPAWNED>);

struct BombExploded @packed {
    uint bombIndex;
    float x;
    float y;
    float z;
}

def BombsExplodedBatchMessage = BatchMessage(<BombExploded, MessageKind.BOMB_EXPLODED>);
def verify_bombs_exploded_batch_message = msg::batch::verify(<BombExploded, MessageKind.BOMB_EXPLODED>);
def alloc_bombs_exploded_batch_message = msg::batch::alloc(<BombExploded, MessageKind.BOMB_EXPLODED>);

/// Player //////////////////////////////

enum Moving: char {
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

def PlayersJoinedBatchMessage = BatchMessage(<PlayerStruct, MessageKind.PLAYER_JOINED>);
def verify_players_joined_batch_message = msg::batch::verify(<PlayerStruct, MessageKind.PLAYER_JOINED>);
def alloc_players_joined_batch_message = msg::batch::alloc(<PlayerStruct, MessageKind.PLAYER_JOINED>);

def PlayersLeftBatchMessage = BatchMessage(<uint, MessageKind.PLAYER_LEFT>);
def verify_players_left_batch_message = msg::batch::verify(<uint, MessageKind.PLAYER_LEFT>);
def alloc_players_left_batch_message = msg::batch::alloc(<uint, MessageKind.PLAYER_LEFT>);

def PlayersMovingBatchMessage = BatchMessage(<PlayerStruct, MessageKind.PLAYER_MOVING>);
def verify_players_moving_batch_message = msg::batch::verify(<PlayerStruct, MessageKind.PLAYER_MOVING>);
def alloc_players_moving_batch_message = msg::batch::alloc(<PlayerStruct, MessageKind.PLAYER_MOVING>);

struct HelloPlayer @packed {
    uint id;
    float x;
    float y;
    float direction;
    char hue;
}

def HelloMessage = SingleMessage(<HelloPlayer, MessageKind.HELLO>);
def verify_hello_message = msg::single::verify(<HelloPlayer, MessageKind.HELLO>);

def PongMessage = SingleMessage(<uint, MessageKind.PONG>);
def verify_pong_message = msg::single::verify(<uint, MessageKind.PONG>);

struct AmmaMoving @packed {
    Moving direction;
    char start;
}

def AmmaMovingMessage = SingleMessage(<AmmaMoving, MessageKind.AMMA_MOVING>);
def verify_amma_moving_message = msg::single::verify(<AmmaMoving, MessageKind.AMMA_MOVING>);

// TODO: EmptyMessage does not need Payload type, but since passing void is forbidden in C3, we must provide something.
// Providing uint in here is a completely arbitrary decision. Investigate how such things should be made properly.
def AmmaThrowingMessage = EmptyMessage(<MessageKind.AMMA_THROWING>);
def verify_amma_throwing_message = msg::empty::verify(<MessageKind.AMMA_THROWING>);

def PingMessage = SingleMessage(<uint, MessageKind.PING>);
def verify_ping_message = msg::single::verify(<uint, MessageKind.PING>);

fn void update_player(Player *player, Scene *scene, float delta_time) {
    Vector2 control_velocity = {0, 0};
    float angular_velocity = 0.0;
    if ((player.moving>>(uint)Moving.MOVING_FORWARD)&1) {
        control_velocity += from_polar(player.direction, PLAYER_SPEED);
    }
    if ((player.moving>>(uint)Moving.MOVING_BACKWARD)&1) {
        control_velocity -= from_polar(player.direction, PLAYER_SPEED);
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

module common::msg::empty(<KIND>);

struct EmptyMessage @packed {
    uint byte_length;
    MessageKind kind;
}

fn EmptyMessage*! verify(Message *message) {
    if (message.byte_length != EmptyMessage.sizeof) return MessageFault.INVALID?;
    EmptyMessage *empty_message = (EmptyMessage*)message;
    if (empty_message.kind != KIND) return MessageFault.INVALID?;
    return empty_message;
}

module common::msg::single(<Payload, KIND>);

struct SingleMessage @packed {
    uint byte_length;
    MessageKind kind;
    Payload payload;
}

fn SingleMessage*! verify(Message *message) {
    if (message.byte_length != SingleMessage.sizeof) return MessageFault.INVALID?;
    SingleMessage* single_message = (SingleMessage*)message;
    if (single_message.kind != (MessageKind)KIND) return MessageFault.INVALID?;
    return single_message;
}

module common::msg::batch(<Payload, KIND>);

struct BatchMessage @packed {
    uint byte_length;
    MessageKind kind;
    Payload[*] payload;
}

macro uint BatchMessage.count(self) => (self.byte_length - BatchMessage.sizeof)/Payload.sizeof;

fn BatchMessage *alloc(usz count = 1, Allocator allocator = allocator::temp(), usz alignment = 0) {
    usz byte_length = BatchMessage.sizeof + Payload.sizeof*count;
    BatchMessage *message = allocator.acquire(byte_length, ZERO, alignment)!!;
    message.byte_length = (int)byte_length;
    message.kind = KIND;
    return message;
}

fn BatchMessage*! verify(Message *message) {
    if (message.byte_length < BatchMessage.sizeof) return MessageFault.INVALID?;
    if ((message.byte_length - BatchMessage.sizeof)%Payload.sizeof != 0) return MessageFault.INVALID?;
    BatchMessage* batch_message = (BatchMessage*)message;
    if (batch_message.kind != (MessageKind)KIND) return MessageFault.INVALID?;
    return batch_message;
}
