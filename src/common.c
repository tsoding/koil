#include "common.h"

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
