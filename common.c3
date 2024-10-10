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

struct ItemsSpawnedBatchMessage @packed {
    uint byte_length;
    MessageKind kind;
    ItemSpawned[*] items;
}

fn ItemsSpawnedBatchMessage*! verify_items_spawned_batch_message(Message *message) {
    if (message.byte_length < ItemsSpawnedBatchMessage.sizeof) return MessageFault.INVALID?;
    if ((message.byte_length - ItemsSpawnedBatchMessage.sizeof)%ItemSpawned.sizeof != 0) return MessageFault.INVALID?;
    ItemsSpawnedBatchMessage* items_spawned_batch_message = (ItemsSpawnedBatchMessage*)message;
    if (items_spawned_batch_message.kind != MessageKind.ITEM_SPAWNED) return MessageFault.INVALID?;
    return items_spawned_batch_message;
}

fn ItemsSpawnedBatchMessage* reconstruct_state_of_items(Item[] *items) {
    usz itemsCount = 0;
    foreach (&item: *items) {
        if (item.alive) itemsCount += 1;
    }
    if (itemsCount == 0) return null;
    usz byte_length = ItemsSpawnedBatchMessage.sizeof + ItemSpawned.sizeof*itemsCount;
    ItemsSpawnedBatchMessage *message = mem::tcalloc(byte_length);
    message.byte_length = (int)byte_length;
    message.kind = MessageKind.ITEM_SPAWNED;
    usz index = 0;
    foreach (itemIndex, item: *items) {
        if (item.alive) {
            message.items[index] = {
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

struct ItemsCollectedBatchMessage @packed {
    uint byte_length;
    MessageKind kind;
    int[*] ids;
}

fn ItemsCollectedBatchMessage*! verify_items_collected_batch_message(Message *message) {
    if (message.byte_length < ItemsCollectedBatchMessage.sizeof) return MessageFault.INVALID?;
    if ((message.byte_length - ItemsCollectedBatchMessage.sizeof)%int.sizeof != 0) return MessageFault.INVALID?;
    ItemsCollectedBatchMessage* items_collected_batch_message = (ItemsCollectedBatchMessage*)message;
    if (items_collected_batch_message.kind != MessageKind.ITEM_COLLECTED) return MessageFault.INVALID?;
    return items_collected_batch_message;
}

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

fn Bombs* allocate_bombs() @extern("allocate_bombs") @wasm {
    return mem::new(Bombs);
}

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

struct BombsSpawnedBatchMessage @packed {
    uint byte_length;
    MessageKind kind;
    BombSpawned[*] bombs;
}

fn BombsSpawnedBatchMessage*! verify_bombs_spawned_batch_message(Message *message) {
    if (message.byte_length < BombsSpawnedBatchMessage.sizeof) return MessageFault.INVALID?;
    if ((message.byte_length - BombsSpawnedBatchMessage.sizeof)%BombSpawned.sizeof != 0) return MessageFault.INVALID?;
    BombsSpawnedBatchMessage* bombs_spawned_batch_message = (BombsSpawnedBatchMessage*)message;
    if (bombs_spawned_batch_message.kind != MessageKind.BOMB_SPAWNED) return MessageFault.INVALID?;
    return bombs_spawned_batch_message;
}

struct BombExploded @packed {
    uint bombIndex;
    float x;
    float y;
    float z;
}

struct BombsExplodedBatchMessage @packed {
    uint byte_length;
    MessageKind kind;
    BombExploded[*] bombs;
}

fn BombsExplodedBatchMessage*! verify_bombs_exploded_batch_message(Message *message) {
    if (message.byte_length < BombsExplodedBatchMessage.sizeof) return MessageFault.INVALID?;
    if ((message.byte_length - BombsExplodedBatchMessage.sizeof)%BombExploded.sizeof != 0) return MessageFault.INVALID?;
    BombsExplodedBatchMessage* bombs_exploded_batch_message = (BombsExplodedBatchMessage*)message;
    if (bombs_exploded_batch_message.kind != MessageKind.BOMB_EXPLODED) return MessageFault.INVALID?;
    return bombs_exploded_batch_message;
}

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

struct PlayersJoinedBatchMessage @packed {
    uint byte_length;
    MessageKind kind;
    PlayerStruct[*] players;
}

fn PlayersJoinedBatchMessage*! verify_players_joined_batch_message(Message *message) {
    if (message.byte_length < PlayersJoinedBatchMessage.sizeof) return MessageFault.INVALID?;
    if ((message.byte_length - PlayersJoinedBatchMessage.sizeof)%PlayerStruct.sizeof != 0) return MessageFault.INVALID?;
    PlayersJoinedBatchMessage* players_joined_batch_message = (PlayersJoinedBatchMessage*)message;
    if (players_joined_batch_message.kind != PLAYER_JOINED) return MessageFault.INVALID?;
    return players_joined_batch_message;
}

struct PlayersLeftBatchMessage @packed {
    uint byte_length;
    MessageKind kind;
    uint[*] ids;
}

fn PlayersLeftBatchMessage*! verify_players_left_batch_message(Message *message) {
    if (message.byte_length < PlayersLeftBatchMessage.sizeof) return MessageFault.INVALID?;
    if ((message.byte_length - PlayersLeftBatchMessage.sizeof)%uint.sizeof != 0) return MessageFault.INVALID?;
    PlayersLeftBatchMessage* players_left_batch_message = (PlayersLeftBatchMessage*)message;
    if (players_left_batch_message.kind != PLAYER_LEFT) return MessageFault.INVALID?;
    return players_left_batch_message;
}

struct PlayersMovingBatchMessage @packed {
    uint byte_length;
    MessageKind kind;
    PlayerStruct[*] players;
}

fn PlayersMovingBatchMessage*! verify_players_moving_batch_message(Message *message) {
    if (message.byte_length < PlayersMovingBatchMessage.sizeof) return MessageFault.INVALID?;
    if ((message.byte_length - PlayersMovingBatchMessage.sizeof)%PlayerStruct.sizeof != 0) return MessageFault.INVALID?;
    PlayersMovingBatchMessage* players_moving_batch_message = (PlayersMovingBatchMessage*)message;
    if (players_moving_batch_message.kind != PLAYER_MOVING) return MessageFault.INVALID?;
    return players_moving_batch_message;
}

struct HelloMessage @packed {
    uint byte_length;
    MessageKind kind;
    uint id;
    float x;
    float y;
    float direction;
    char hue;
}

fn HelloMessage*! verify_hello_message(Message *message) {
    if (message.byte_length != HelloMessage.sizeof) return MessageFault.INVALID?;
    HelloMessage* hello_message = (HelloMessage*)message;
    if (hello_message.kind != HELLO) return MessageFault.INVALID?;
    return hello_message;
}

struct PongMessage @packed {
    uint byte_length;
    MessageKind kind;
    uint timestamp;
}

fn PongMessage*! verify_pong_message(Message *message) {
    if (message.byte_length != PongMessage.sizeof) return MessageFault.INVALID?;
    PongMessage* pong_message = (PongMessage*)message;
    if (pong_message.kind != PONG) return MessageFault.INVALID?;
    return pong_message;
}

struct AmmaMovingMessage @packed {
    uint byte_length;
    MessageKind kind;
    Moving direction;
    char start;
}

fn AmmaMovingMessage*! verify_amma_moving_message(Message *message) {
    if (message.byte_length != AmmaMovingMessage.sizeof) return MessageFault.INVALID?;
    AmmaMovingMessage* amma_moving_message = (AmmaMovingMessage*)message;
    if (amma_moving_message.kind != AMMA_MOVING) return MessageFault.INVALID?;
    return amma_moving_message;
}

struct AmmaThrowingMessage @packed {
    uint byte_length;
    MessageKind kind;
}

fn AmmaThrowingMessage*! verify_amma_throwing_message(Message *message) {
    if (message.byte_length != AmmaThrowingMessage.sizeof) return MessageFault.INVALID?;
    AmmaThrowingMessage* amma_throwing_message = (AmmaThrowingMessage*)message;
    if (amma_throwing_message.kind != AMMA_THROWING) return MessageFault.INVALID?;
    return amma_throwing_message;
}

struct PingMessage {
    uint byte_length;
    MessageKind kind;
    uint timestamp;
}

fn PingMessage*! verify_ping_message(Message *message) {
    if (message.byte_length != PingMessage.sizeof) return MessageFault.INVALID?;
    PingMessage* ping_message = (PingMessage*)message;
    if (ping_message.kind != PING) return MessageFault.INVALID?;
    return ping_message;
}

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
