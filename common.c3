module common;
import std::math;
import std::io;

const float BOMB_GRAVITY = 10;
const float PLAYER_RADIUS = 0.5;

extern fn void js_write(void *buffer, usz buffer_sz);

def Vector2 = float[<2>];
def IVector2 = int[<2>];
def Vector3 = float[<3>];
def Vector4 = float[<4>];

fn bool scene_get_tile(bool *scene, int scene_width, int scene_height, Vector2 p) {
    int x = (int)math::floor(p.x);
    int y = (int)math::floor(p.y);
    if (!(0 <= x && x < scene_width && 0 <= y && y < scene_height)) return false;
    return scene[y*scene_width + x];
}

fn bool *allocate_scene(usz width, usz height) @extern("allocate_scene") @wasm {
    bool[] scene = mem::new_array(bool, width*height);
    foreach (&c: scene) *c = false;
    return &scene[0];
}

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

usz temp_mark = 0;
fn void reset_temp_mark() @extern("reset_temp_mark") @wasm {
    allocator::temp().reset(temp_mark);
}

fn void* allocate_temporary_buffer(usz size) @extern("allocate_temporary_buffer") @wasm {
    return mem::tcalloc(size);
}
