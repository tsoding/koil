#include "common.h"

void* allocate_temporary_buffer(size_t size);

// Vector2 //////////////////////////////

float vector2_distance(Vector2 a, Vector2 b){
    b = vector2_sub(b, a);
    return vector2_length(b);
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

// Bombs //////////////////////////////

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
