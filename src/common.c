#include "common.h"

// Vector3 //////////////////////////////

float vector3_length(Vector3 a) {
    return __builtin_sqrtf(a.x*a.x + a.y*a.y + a.z*a.z);
}

// Vector2 //////////////////////////////

float vector2_distance(Vector2 a, Vector2 b){
    b = vector2_sub(b, a);
    return vector2_length(b);
}

Vector2 vector2_add(Vector2 a, Vector2 b) {
    a.x += b.x;
    a.y += b.y;
    return a;
}

Vector2 vector2_sub(Vector2 a, Vector2 b) {
    a.x -= b.x;
    a.y -= b.y;
    return a;
}

float vector2_length(Vector2 a) {
    return __builtin_sqrtf(a.x*a.x + a.y*a.y);
}

Vector2 vector2_from_polar(float angle, float len) {
    return (Vector2) {
        __builtin_cos(angle)*len,
        __builtin_sin(angle)*len,
    };
}

Vector2 vector2_mul(Vector2 a, Vector2 b) {
    a.x *= b.x;
    a.y *= b.y;
    return a;
}

Vector2 vector2_xx(float x) {
    return (Vector2){x, x};
}

Vector2 vector2_floor(Vector2 a) {
    return (Vector2) {
        __builtin_floorf(a.x),
        __builtin_floorf(a.y)
    };
}


// IVector2 //////////////////////////////

IVector2 ivector2_from_vector2(Vector2 a) {
    return (IVector2) {(int)a.x, (int)a.y};
}

// Message //////////////////////////////

bool batch_message_verify_empty(MessageKind kind, Message *message) {
    // If message is empty it's byte_length must be equal to the size of BatchMessage exactly
    if (message->byte_length != sizeof(BatchMessage)) return false;
    BatchMessage* batch_message = (BatchMessage*)message;
    if ((MessageKind)batch_message->kind != kind) return false;
    return true;
}

bool batch_message_verify(MessageKind kind, Message *message, size_t payload_size) {
    if (message->byte_length < sizeof(BatchMessage)) return false;
    if ((message->byte_length - sizeof(BatchMessage))%payload_size != 0) return false;
    BatchMessage* batch_message = (BatchMessage*)message;
    if ((MessageKind)batch_message->kind != kind) return false;
    return true;
}

BatchMessage *batch_message_alloc(MessageKind kind, size_t count, size_t payload_size) {
    size_t byte_length = sizeof(BatchMessage) + payload_size*count;
    BatchMessage *message = allocate_temporary_buffer(byte_length);
    message->byte_length = byte_length;
    message->kind = kind;
    return message;
}

// Items //////////////////////////////

bool collect_item(Player player, Item *item) {
    if (!item->alive) return false;
    if (vector2_distance(player.position, item->position) >= PLAYER_RADIUS) return false;
    item->alive = false;
    return true;
}

ItemsSpawnedBatchMessage* reconstruct_state_of_items(Item *items, size_t items_count) {
    size_t itemsCount = 0;
    for (size_t i = 0; i < items_count; ++i){
        Item *item = &items[i];
        if (item->alive) itemsCount += 1;
    }
    if (itemsCount == 0) return NULL;
    ItemsSpawnedBatchMessage *message = alloc_items_spawned_batch_message(itemsCount);
    size_t index = 0;
    for (size_t itemIndex = 0; itemIndex < items_count; ++itemIndex) {
        Item *item = &items[itemIndex];
        if (item->alive) {
            message->payload[index] = ((ItemSpawned) {
                .itemKind = item->kind,
                .itemIndex = (int)itemIndex,
                .x = item->position.x,
                .y = item->position.y,
            });
            index += 1;
        }
    }
    return message;
}

static Item items[] = {
    {
        .kind = ITEM_BOMB,
        .position = {1.5, 3.5},
        .alive = true,
    },
    {
        .kind = ITEM_KEY,
        .position = {2.5, 1.5},
        .alive = true,
    },
    {
        .kind = ITEM_KEY,
        .position = {3, 1.5},
        .alive = true,
    },
    {
        .kind = ITEM_KEY,
        .position = {3.5, 1.5},
        .alive = true,
    },
    {
        .kind = ITEM_KEY,
        .position = {4.0, 1.5},
        .alive = true,
    },
    {
        .kind = ITEM_KEY,
        .position = {4.5, 1.5},
        .alive = true,
    },
};

Item *items_ptr() {
    return items;
}

size_t items_len() {
    return sizeof(items)/sizeof(items[0]);
}

// Bombs //////////////////////////////

Bombs bombs = {0};

int throw_bomb(Vector2 position, float direction, Bombs *bombs) {
    for (size_t index = 0; index < BOMBS_CAPACITY; ++index) {
        Bomb *bomb = &bombs->items[index];
        if (bomb->lifetime <= 0) {
            bomb->lifetime    = BOMB_LIFETIME;
            bomb->position    = position;
            bomb->position_z  = 0.6;
            bomb->velocity    = vector2_from_polar(direction, 1.0f);
            bomb->velocity_z  = 0.5;
            bomb->velocity    = vector2_mul(bomb->velocity, vector2_xx(BOMB_THROW_VELOCITY));
            bomb->velocity_z *= BOMB_THROW_VELOCITY;
            return (int)index;
        }
    }
    return -1;
}

bool update_bomb(Bomb *bomb, float delta_time) {
    bool collided = false;
    bomb->lifetime -= delta_time;
    bomb->velocity_z -= BOMB_GRAVITY*delta_time;

    float nx = bomb->position.x + bomb->velocity.x*delta_time;
    float ny = bomb->position.y + bomb->velocity.y*delta_time;
    if (scene_get_tile((Vector2) {nx, ny})) {
        float dx = __builtin_fabsf(__builtin_floorf(bomb->position.x) - __builtin_floorf(nx));
        float dy = __builtin_fabsf(__builtin_floorf(bomb->position.y) - __builtin_floorf(ny));

        if (dx > 0) bomb->velocity.x *= -1;
        if (dy > 0) bomb->velocity.y *= -1;
        bomb->velocity = vector2_mul(bomb->velocity, vector2_xx(BOMB_DAMP));
        bomb->velocity_z *= BOMB_DAMP;
        if (vector3_length((Vector3){bomb->velocity.x, bomb->velocity.y, bomb->velocity_z}) > 1) collided = true; // Wall collision
    } else {
        bomb->position.x = nx;
        bomb->position.y = ny;
    }

    float nz = bomb->position_z + bomb->velocity_z*delta_time;
    if (nz < BOMB_SCALE || nz > 1.0) {
        bomb->velocity_z *= -1*BOMB_DAMP;
        bomb->velocity = vector2_mul(bomb->velocity, vector2_xx(BOMB_DAMP));
        if (vector3_length((Vector3){bomb->velocity.x, bomb->velocity.y, bomb->velocity_z}) > 1) collided = true; // Floor collision
    } else {
        bomb->position_z = nz;
    }
    return collided;
}

// Player //////////////////////////////

void update_player(Player *player, float delta_time) {
    Vector2 control_velocity = {0, 0};
    float angular_velocity = 0.0;
    if ((player->moving>>(uint32_t)MOVING_FORWARD)&1) {
        control_velocity = vector2_add(control_velocity, vector2_from_polar(player->direction, PLAYER_SPEED));
    }
    if ((player->moving>>(uint32_t)MOVING_BACKWARD)&1) {
        control_velocity = vector2_sub(control_velocity, vector2_from_polar(player->direction, PLAYER_SPEED));
    }
    if ((player->moving>>(uint32_t)TURNING_LEFT)&1) {
        angular_velocity -= PI;
    }
    if ((player->moving>>(uint32_t)TURNING_RIGHT)&1) {
        angular_velocity += PI;
    }
    player->direction = __builtin_fmodf(player->direction + angular_velocity*delta_time, 2*PI);

    float nx = player->position.x + control_velocity.x*delta_time;
    if (scene_can_rectangle_fit_here(nx, player->position.y, PLAYER_SIZE, PLAYER_SIZE)) {
        player->position.x = nx;
    }
    float ny = player->position.y + control_velocity.y*delta_time;
    if (scene_can_rectangle_fit_here(player->position.x, ny, PLAYER_SIZE, PLAYER_SIZE)) {
        player->position.y = ny;
    }
}

// Scene //////////////////////////////

#define WALLS_WIDTH 7
#define WALLS_HEIGHT 7
bool walls[WALLS_HEIGHT][WALLS_WIDTH] = {
    { false, false, true, true, true, false, false},
    { false, false, false, false, false, true, false},
    { true, false, false, false, false, true, false},
    { true,  false, false, false, false, true, false},
    { true, false, false, false, false, false, false},
    { false,  true, true, true, false, false, false},
    { false,  false, false, false, false, false, false},
};

bool scene_get_tile(Vector2 p) {
    IVector2 ip = ivector2_from_vector2(vector2_floor(p));
    if (!(0 <= ip.x && ip.x < WALLS_WIDTH)) return false;
    if (!(0 <= ip.y && ip.y < WALLS_HEIGHT)) return false;
    return walls[ip.y][ip.x];
}

bool scene_can_rectangle_fit_here(float px, float py, float sx, float sy) {
    int x1 = (int)__builtin_floorf(px - sx*0.5f);
    int x2 = (int)__builtin_floorf(px + sx*0.5f);
    int y1 = (int)__builtin_floorf(py - sy*0.5f);
    int y2 = (int)__builtin_floorf(py + sy*0.5f);
    for (int x = x1; x <= x2; ++x) {
        for (int y = y1; y <= y2; ++y) {
            if (scene_get_tile((Vector2) {x, y})) {
                return false;
            }
        }
    }
    return true;
}
