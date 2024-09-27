module common;
import std::math;
import std::io;

const float BOMB_GRAVITY = 10;
const float BOMB_LIFETIME = 2;
const float BOMB_THROW_VELOCITY = 5;
const float BOMB_DAMP = 0.8;
const float BOMB_SCALE = 0.25;
const float PLAYER_RADIUS = 0.5;

extern fn void platform_write(void *buffer, usz buffer_sz);

def Vector2 = float[<2>];
def IVector2 = int[<2>];
def Vector3 = float[<3>];
def Vector4 = float[<4>];

/// Messages //////////////////////////////

// IMPORTANT: This must be synchronized with the MessageKind in common.mts until it is fully rewritten in C3.
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

struct Message @packed {
    int size;
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

fn Scene *allocate_default_scene() @extern("allocate_default_scene") @wasm {
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

fn bool Scene.get_tile(Scene *scene, Vector2 p) {
    int x = (int)math::floor(p.x);
    int y = (int)math::floor(p.y);
    if (!(0 <= x && x < scene.width && 0 <= y && y < scene.height)) return false;
    return scene.walls[y*scene.width + x];
}

fn bool scene_can_rectangle_fit_here(Scene *scene, float px, float py, float sx, float sy) @extern("scene_can_rectangle_fit_here") @wasm {
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

fn Item[]* allocate_items() @export("allocate_items") @wasm {
    return &items;
}

fn bool collect_item(float player_position_x, float player_position_y, Item[] *items, usz item_index) @extern("collect_item") @wasm {
    if (item_index >= items.len) return false;
    Item *item = &(*items)[item_index];
    if (!item.alive) return false;
    if (Vector2{player_position_x, player_position_y}.distance(item.position) >= PLAYER_RADIUS) return false;
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
    int size;
    MessageKind kind;
    ItemSpawned[*] items;
}

fn ItemsSpawnedBatchMessage* reconstruct_state_of_items(Item[] *items) @extern("reconstruct_state_of_items") @wasm {
    usz itemsCount = 0;
    foreach (&item: *items) {
        if (item.alive) itemsCount += 1;
    }
    int size = ItemsSpawnedBatchMessage.sizeof + ItemSpawned.sizeof*itemsCount;
    ItemsSpawnedBatchMessage *message = mem::tcalloc(size);
    message.size = size;
    message.kind = MessageKind.ITEM_SPAWNED;
    usz index = 0;
    foreach (itemIndex, item: *items) {
        if (item.alive) {
            message.items[index] = {
                .itemKind = item.kind,
                .itemIndex = itemIndex,
                .x = item.position.x,
                .y = item.position.y,
            };
            index += 1;
        }
    }
    return message;
}

struct ItemsCollectedBatchMessage @packed {
    int size;
    MessageKind kind;
    int[*] ids;
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

fn Bombs* allocate_bombs() @extern("allocate_bombs") @wasm {
    return mem::new(Bombs);
}

fn int throw_bomb(float player_position_x, float player_position_y, float player_direction, Bombs *bombs) @extern("throw_bomb") @wasm {
    foreach (index, &bomb: *bombs) {
        if (bomb.lifetime <= 0) {
            bomb.lifetime    = BOMB_LIFETIME;
            bomb.position.x  = player_position_x;
            bomb.position.y  = player_position_y;
            bomb.position_z  = 0.6;
            bomb.velocity.x  = math::cos(player_direction);
            bomb.velocity.y  = math::sin(player_direction);
            bomb.velocity_z  = 0.5;
            bomb.velocity   *= BOMB_THROW_VELOCITY;
            bomb.velocity_z *= BOMB_THROW_VELOCITY;
            return index;
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
    int size;
    MessageKind kind;
    BombSpawned[*] bombs;
}

struct BombExploded @packed {
    uint bombIndex;
    float x;
    float y;
    float z;
}

struct BombsExplodedBatchMessage @packed {
    int size;
    MessageKind kind;
    BombExploded[*] bombs;
}

/// Temporary Memory //////////////////////////////

usz temp_mark = 0;
fn void reset_temp_mark() @extern("reset_temp_mark") @wasm {
    allocator::temp().reset(temp_mark);
}

fn void* allocate_temporary_buffer(usz size) @extern("allocate_temporary_buffer") @wasm {
    return mem::tcalloc(size);
}
