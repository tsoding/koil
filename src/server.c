#include <assert.h>
#include <stdlib.h>
#include <errno.h>

#include <sys/socket.h>

#include "common.h"

#include "arena.h"
#define NOB_STRIP_PREFIX
#include "nob.h"
#include "cws.h"
#include "coroutine.h"
#include "stats.h"

// TODO: stb_ds does not provide maximum performance. we should eventually implement our own hash table.
#define STB_DS_IMPLEMENTATION
#include "stb_ds.h"

// WARNING! Must be in sync with the value in server.c3
#define SERVER_TOTAL_LIMIT 2000
#define SERVER_SINGLE_IP_LIMIT 10
#define SERVER_FPS 60

Arena temp = {0};

// Forward declarations //////////////////////////////

void send_message_and_update_stats(uint32_t player_id, void* message);

// Items //////////////////////////////

typedef struct {
    size_t *items;
    size_t count;
    size_t capacity;
} Indices;

Indices collected_items = {0};

void collect_items_by_player(Player player, Item *items, size_t items_count) {
    for (size_t index = 0; index < items_count; ++index) {
        Item *item = &items[index];
        if (collect_item(player, item)) {
            da_append(&collected_items, index);
        }
    }
}

ItemsCollectedBatchMessage *collected_items_as_batch_message() {
    if (collected_items.count == 0) return NULL;
    ItemsCollectedBatchMessage *message = alloc_items_collected_batch_message(collected_items.count);
    for (size_t i = 0; i < collected_items.count; ++i) {
        message->payload[i] = collected_items.items[i];
    }
    collected_items.count = 0;
    return message;
}

// Connection Limits //////////////////////////////

typedef struct {
    ShortString key;           // remote address
    uint32_t value;             // count
} Connection_Limit;

Connection_Limit *connection_limits = NULL;

uint32_t *connection_limits_get(ShortString remote_address)
{
    ptrdiff_t i = hmgeti(connection_limits, remote_address);
    if (i < 0) return NULL;
    return &connection_limits[i].value;
}

void connection_limits_set(ShortString remote_address, uint count)
{
    hmput(connection_limits, remote_address, count);
}

void connection_limits_remove(ShortString remote_address)
{
    int deleted = hmdel(connection_limits, remote_address);
    UNUSED(deleted);
}

// Player //////////////////////////////

typedef struct {         // WARNING! Must be in sync with the one in server.c3
    Player player;
    char new_moving;
    ShortString remote_address;
} PlayerOnServer;

typedef struct {         // WARNING! Must be in sync with the one in server.c3
    uint key;
    PlayerOnServer value;
} PlayerOnServerEntry;

PlayerOnServerEntry *players = NULL;

typedef struct {         // WARNING! Must be in sync with the on in server.c3
    uint32_t key;
    bool value;
} PlayerIdsEntry;
PlayerIdsEntry* joined_ids = NULL;
PlayerIdsEntry* left_ids = NULL;

typedef struct {         // WARNING! Must be in sync with the on in server.c
    uint32_t key;
    uint32_t value;
} PingEntry;
PingEntry *ping_ids = NULL;

bool register_new_player(uint32_t id, ShortString* remote_address) {
    if (hmlen(players) >= SERVER_TOTAL_LIMIT) {
        stat_inc_counter(SE_PLAYERS_REJECTED, 1);
        return false;
    }

    if (remote_address != NULL) {
        size_t remote_address_len = strlen((char*)remote_address); // WutFace
        if (remote_address_len == 0) {
            stat_inc_counter(SE_PLAYERS_REJECTED, 1);
            return false;
        }

        uint32_t *count = connection_limits_get(*remote_address);
        if (count) {
            // TODO: we need to let the player know somehow that they were rejected due to the limit
            if (*count >= SERVER_SINGLE_IP_LIMIT) {
                stat_inc_counter(SE_PLAYERS_REJECTED, 1);
                return false;
            }
            connection_limits_set(*remote_address, *count + 1);
        } else {
            connection_limits_set(*remote_address, 1);
        }
    }

    assert(hmgeti(players, id) < 0);
    hmput(joined_ids, id, true);

    if (remote_address != NULL) {
        hmput(players, id, ((PlayerOnServer) {
            .player = {
                .id = id,
            },
            .remote_address = *remote_address,
        }));
    } else {
        hmput(players, id, ((PlayerOnServer) {
            .player = {
                .id = id,
            },
        }));
    }

    stat_inc_counter(SE_PLAYERS_JOINED, 1);
    stat_inc_counter(SE_PLAYERS_CURRENTLY, 1);

    return true;
}

void unregister_player(uint32_t id) {
    // console.log(`Player ${id} disconnected`);
    ptrdiff_t place = hmgeti(players, id);
    if (place >= 0) {
        PlayerOnServer *player = &players[place].value;
        uint32_t *count = connection_limits_get(player->remote_address);
        if (count) {
            if (*count <= 1) {
                connection_limits_remove(player->remote_address);
            } else {
                connection_limits_set(player->remote_address, *count - 1);
            }
        }

        if (!hmdel(joined_ids, id)) {
            hmput(left_ids, id, false);
        }

        stat_inc_counter(SE_PLAYERS_LEFT, 1);
        stat_inc_counter(SE_PLAYERS_CURRENTLY, -1);
        hmdel(players, id);
    }
}

PlayersJoinedBatchMessage *all_players_as_joined_batch_message() {
    if (hmlen(players) == 0) return NULL;
    PlayersJoinedBatchMessage *message = alloc_players_joined_batch_message(hmlen(players));
    for (ptrdiff_t i = 0; i < hmlen(players); ++i) {
        PlayerOnServerEntry* entry = &players[i];
        message->payload[i].id        = entry->value.player.id;
        message->payload[i].x         = entry->value.player.position.x;
        message->payload[i].y         = entry->value.player.position.y;
        message->payload[i].direction = entry->value.player.direction;
        message->payload[i].hue       = entry->value.player.hue;
        message->payload[i].moving    = entry->value.player.moving;
    };
    return message;
}

PlayersJoinedBatchMessage *joined_players_as_batch_message() {
    if (hmlen(joined_ids) == 0) return NULL;
    PlayersJoinedBatchMessage *message = alloc_players_joined_batch_message(hmlen(joined_ids));
    int index = 0;
    for (ptrdiff_t i = 0; i < hmlen(joined_ids); ++i) {
        PlayerIdsEntry *entry = &joined_ids[i];
        uint32_t joined_id = entry->key;
        ptrdiff_t place = hmgeti(players, joined_id);
        if (place >= 0) { // This should never happen, but we're handling none existing ids for more robustness
            PlayerOnServer *joined_player = &players[place].value;
            message->payload[index].id        = joined_player->player.id;
            message->payload[index].x         = joined_player->player.position.x;
            message->payload[index].y         = joined_player->player.position.y;
            message->payload[index].direction = joined_player->player.direction;
            message->payload[index].hue       = joined_player->player.hue;
            message->payload[index].moving    = joined_player->player.moving;
            index += 1;
        }
    }

    return message;
}

PlayersLeftBatchMessage *left_players_as_batch_message() {
    if (hmlen(left_ids) == 0) return NULL;
    PlayersLeftBatchMessage *message = alloc_players_left_batch_message(hmlen(left_ids));
    int index = 0;
    for (ptrdiff_t i = 0; i < hmlen(left_ids); ++i) {
        PlayerIdsEntry *entry = &left_ids[i];
        uint32_t left_id = entry->key;
        message->payload[index] = left_id;
        index += 1;
    }
    return message;
}

void process_joined_players(Item* items, size_t items_count) {
    if (hmlen(joined_ids) == 0) return;

    // Initialize joined players
    {
        // Reconstructing the state of the other players batch
        PlayersJoinedBatchMessage *players_joined_batch_message = all_players_as_joined_batch_message();

        // Reconstructing the state of items batch
        ItemsSpawnedBatchMessage *items_spanwed_batch_message = reconstruct_state_of_items(items, items_count);

        // Greeting all the joined players and notifying them about other players
        for (ptrdiff_t i = 0; i < hmlen(joined_ids); ++i) {
            PlayerIdsEntry *entry = &joined_ids[i];
            uint joined_id = entry->key;
            ptrdiff_t place = hmgeti(players, joined_id);
            if (place >= 0) { // This should never happen, but we're handling none existing ids for more robustness
                PlayerOnServer *joined_player = &players[place].value;
                // The greetings
                HelloMessage hello_message = {
                    .byte_length = sizeof(HelloMessage),
                    .kind        = MK_HELLO,
                    .payload     = {
                        .id         = joined_player->player.id,
                        .x          = joined_player->player.position.x,
                        .y          = joined_player->player.position.y,
                        .direction  = joined_player->player.direction,
                        .hue        = joined_player->player.hue,
                    }
                };
                send_message_and_update_stats(joined_id, &hello_message);

                // Reconstructing the state of the other players
                if (players_joined_batch_message != NULL) {
                    send_message_and_update_stats(joined_id, players_joined_batch_message);
                }

                // Reconstructing the state of items
                if (items_spanwed_batch_message != NULL) {
                    send_message_and_update_stats(joined_id, items_spanwed_batch_message);
                }

                // TODO: Reconstructing the state of bombs
            }
        }
    }

    // Notifying old player about who joined
    PlayersJoinedBatchMessage *players_joined_batch_message = joined_players_as_batch_message();
    if (players_joined_batch_message != NULL) {
        for (ptrdiff_t i = 0; i < hmlen(players); ++i) {
            PlayerOnServerEntry* entry = &players[i];
            if (hmgeti(joined_ids, entry->value.player.id) < 0) { // Joined player should already know about themselves
                send_message_and_update_stats(entry->value.player.id, players_joined_batch_message);
            }
        }
    }
}

void process_left_players() {
    // Notifying about whom left
    if (hmlen(left_ids) == 0) return;
    PlayersLeftBatchMessage *players_left_batch_message = left_players_as_batch_message();
    for (ptrdiff_t i = 0; i < hmlen(players); ++i) {
        PlayerOnServerEntry* entry = &players[i];
        send_message_and_update_stats(entry->value.player.id, players_left_batch_message);
    }
}

void process_moving_players() {
    int count = 0;
    for (ptrdiff_t i = 0; i < hmlen(players); ++i) {
        PlayerOnServerEntry* entry = &players[i];
        if (entry->value.new_moving != entry->value.player.moving) {
            count += 1;
        }
    }
    if (count <= 0) return;

    PlayersMovingBatchMessage *message = alloc_players_moving_batch_message(count);
    int index = 0;
    for (ptrdiff_t i = 0; i < hmlen(players); ++i) {
        PlayerOnServerEntry* entry = &players[i];
        if (entry->value.new_moving != entry->value.player.moving) {
            entry->value.player.moving = entry->value.new_moving;
            message->payload[index].id        = entry->value.player.id;
            message->payload[index].x         = entry->value.player.position.x;
            message->payload[index].y         = entry->value.player.position.y;
            message->payload[index].direction = entry->value.player.direction;
            message->payload[index].moving    = entry->value.player.moving;
            index += 1;
        }
    }

    for (ptrdiff_t i = 0; i < hmlen(players); ++i) {
        PlayerOnServerEntry* entry = &players[i];
        send_message_and_update_stats(entry->value.player.id, message);
    }
}

void player_update_moving(uint32_t id, AmmaMovingMessage *message) {
    ptrdiff_t place = hmgeti(players, id);
    if (place >= 0) {
        PlayerOnServer *value = &players[place].value;
        if (message->payload.start) {
            value->new_moving |= (1<<(uint32_t)message->payload.direction);
        } else {
            value->new_moving &= ~(1<<(uint32_t)message->payload.direction);
        }
    }
}

/// Bombs //////////////////////////////

Indices thrown_bombs = {0};

void throw_bomb_on_server_side(uint32_t player_id, Bombs *bombs) {
    ptrdiff_t place = hmgeti(players, player_id);
    if (place >= 0) {
        PlayerOnServer *player = &players[place].value;
        int index = throw_bomb(player->player.position, player->player.direction, bombs);
        if (index >= 0) da_append(&thrown_bombs, (size_t)index);
    }
}

BombsSpawnedBatchMessage *thrown_bombs_as_batch_message(Bombs *bombs) {
    if (thrown_bombs.count == 0) return NULL;
    BombsSpawnedBatchMessage *message = alloc_bombs_spawned_batch_message(thrown_bombs.count);
    for (size_t index = 0; index < thrown_bombs.count; ++index) {
        size_t bombIndex = thrown_bombs.items[index];
        assert(bombIndex < BOMBS_CAPACITY);
        Bomb *bomb = &bombs->items[bombIndex];
        message->payload[index].bombIndex = (uint32_t)bombIndex;
        message->payload[index].x = bomb->position.x;
        message->payload[index].y = bomb->position.y;
        message->payload[index].z = bomb->position_z;
        message->payload[index].dx = bomb->velocity.x;
        message->payload[index].dy = bomb->velocity.y;
        message->payload[index].dz = bomb->velocity_z;
        message->payload[index].lifetime = bomb->lifetime;
    }
    thrown_bombs.count = 0;
    return message;
}

Indices exploded_bombs = {0};

void update_bombs_on_server_side(Scene *scene, float delta_time, Bombs *bombs) {
    for (size_t bombIndex = 0; bombIndex < BOMBS_CAPACITY; ++bombIndex) {
        Bomb *bomb = &bombs->items[bombIndex];
        if (bomb->lifetime > 0) {
            update_bomb(bomb, scene, delta_time);
            if (bomb->lifetime <= 0) {
                da_append(&exploded_bombs, bombIndex);
            }
        }
    }
}

BombsExplodedBatchMessage* exploded_bombs_as_batch_message(Bombs* bombs) {
    if (exploded_bombs.count == 0) return NULL;
    BombsExplodedBatchMessage *message = alloc_bombs_exploded_batch_message(exploded_bombs.count);
    for (size_t index = 0; index < exploded_bombs.count; ++index) {
        size_t bombIndex = exploded_bombs.items[index];
        assert(bombIndex < BOMBS_CAPACITY);
        Bomb bomb = bombs->items[bombIndex];
        message->payload[index].bombIndex = bombIndex;
        message->payload[index].x         = bomb.position.x;
        message->payload[index].y         = bomb.position.y;
        message->payload[index].z         = bomb.position_z;
    }
    exploded_bombs.count = 0;
    return message;
}

void process_thrown_bombs(Bombs *bombs) {
    // Notifying about thrown bombs
    BombsSpawnedBatchMessage *bombs_spawned_batch_message = thrown_bombs_as_batch_message(bombs);
    if (bombs_spawned_batch_message != NULL) {
        for (ptrdiff_t i = 0; i < hmlen(players); ++i) {
            PlayerOnServerEntry* entry = &players[i];
            send_message_and_update_stats(entry->value.player.id, bombs_spawned_batch_message);
        }
    }
}

// World //////////////////////////////

void process_world_simulation(Item *items, size_t items_len, Scene *scene, Bombs *bombs, float delta_time) {
    // Simulating the world for one server tick.
    for (ptrdiff_t i = 0; i < hmlen(players); ++i) {
        PlayerOnServerEntry* entry = &players[i];
        update_player(&entry->value.player, scene, delta_time);
        collect_items_by_player(entry->value.player, items, items_len);
    }

    ItemsCollectedBatchMessage *items_collected_batch_message = collected_items_as_batch_message();
    if (items_collected_batch_message) {
        for (ptrdiff_t i = 0; i < hmlen(players); ++i) {
            PlayerOnServerEntry* entry = &players[i];
            send_message_and_update_stats(entry->value.player.id, items_collected_batch_message);
        }
    }

    update_bombs_on_server_side(scene, delta_time, bombs);
    BombsExplodedBatchMessage *bombs_exploded_batch_message = exploded_bombs_as_batch_message(bombs);
    if (bombs_exploded_batch_message) {
        for (ptrdiff_t i = 0; i < hmlen(players); ++i) {
            PlayerOnServerEntry* entry = &players[i];
            send_message_and_update_stats(entry->value.player.id, bombs_exploded_batch_message);
        }
    }
}

// Pings //////////////////////////////

void process_pings(void) {
    // Sending out pings
    for (ptrdiff_t i = 0; i < hmlen(ping_ids); ++i) {
        PingEntry *entry = &ping_ids[i];
        uint32_t id = entry->key;
        uint32_t timestamp = entry->value;
        ptrdiff_t place = hmgeti(players, id);
        if (place >= 0) { // This MAY happen. A player may send a ping and leave.
            PongMessage pong_message = {
                .byte_length = sizeof(PongMessage),
                .kind = MK_PONG,
                .payload = timestamp,
            };
            send_message_and_update_stats(id, &pong_message);
        }
    }
}

void schedule_ping_for_player(uint32_t id, PingMessage *message) {
    hmput(ping_ids, id, message->payload);
}

void clear_intermediate_ids(void) {
    hmfree(joined_ids);
    hmfree(left_ids);
    hmfree(ping_ids);
}

// Connections //////////////////////////////

typedef struct {
    uint32_t key;
    Cws value;
} Connection;

Connection *connections = NULL;
uint32_t idCounter = 0;

void connections_remove(uint32_t player_id)
{
    int deleted = hmdel(connections, player_id);
    UNUSED(deleted);
}

Cws *connections_get_ref(uint32_t player_id)
{
    ptrdiff_t i = hmgeti(connections, player_id);
    if (i < 0) return NULL;
    return &connections[i].value;
}

void connections_set(uint32_t player_id, Cws cws)
{
    hmput(connections, player_id, cws);
}

// Connection //////////////////////////////

bool server_process_message_on_server(uint32_t id, Message* message); // Implemented in C3

void client_connection(void *data)
{
    uint32_t id = (uint32_t)(uintptr_t)data;
    Cws* cws = connections_get_ref(id);

    if (cws == NULL) {
        fprintf(stderr, "ERROR: unknown player id %u\n", id);
        exit(69);
    }

    while (true) {
        Cws_Message cws_message;
        int err = cws_read_message(cws, &cws_message);
        if (err < 0) {
            if ((Cws_Error)err != CWS_ERROR_FRAME_CLOSE_SENT) {
                fprintf(stderr, "ERROR: could not read message from player %u\n", id);
            }
            goto defer;
        }
        size_t byte_length = sizeof(Message) + cws_message.payload_len;
        Message *message = allocate_temporary_buffer(byte_length);
        message->byte_length = byte_length;
        memcpy(message->bytes, cws_message.payload, cws_message.payload_len);
        if (!server_process_message_on_server(id, message)) return;
        arena_reset(&cws->arena);
    }

defer:
    unregister_player(id);
    connections_remove(id);
    if (cws) {
        cws_close(cws);
        arena_free(&cws->arena);
    }
}

// Messages //////////////////////////////

uint32_t send_message(uint32_t player_id, void *message_raw)
{
    Cws* cws = connections_get_ref(player_id);
    if (cws == NULL) {
        fprintf(stderr, "ERROR: unknown player id %d\n", player_id);
        exit(69);
    }
    Message* message = message_raw;
    int err = cws_send_message(cws, CWS_MESSAGE_BIN, message->bytes, message->byte_length - sizeof(message->byte_length));
    if (err < 0) {
        // TODO: do not crash on failing to send a message
        fprintf(stderr, "ERROR: Could not send message to player %d: %s\n", player_id, cws_error_message(cws, (Cws_Error)err));
        exit(69);
    }
    return message->byte_length;
}

void send_message_and_update_stats(uint32_t player_id, void* message)
{
    uint32_t sent = send_message(player_id, message);
    if (sent > 0) {
        bytes_sent_within_tick += sent;
        message_sent_within_tick += 1;
    }
}

// Cws_Socket //////////////////////////////

int cws_socket_read(void *data, void *buffer, size_t len)
{
    while (true) {
        int n = recv((int)(uintptr_t)data, buffer, len, MSG_NOSIGNAL);
        if (n > 0) return (int)n;
        if (n < 0 && errno != EWOULDBLOCK) return (int)CWS_ERROR_ERRNO;
        if (n == 0) return (int)CWS_ERROR_CONNECTION_CLOSED;
        coroutine_yield();
    }
}

// peek: like read, but does not remove data from the buffer
// Usually implemented via MSG_PEEK flag of recv
int cws_socket_peek(void *data, void *buffer, size_t len)
{
    while (true) {
        int n = recv((int)(uintptr_t)data, buffer, len, MSG_PEEK | MSG_NOSIGNAL);
        if (n > 0) return (int)n;
        if (n < 0 && errno != EWOULDBLOCK) return (int)CWS_ERROR_ERRNO;
        if (n == 0) return (int)CWS_ERROR_CONNECTION_CLOSED;
        coroutine_yield();
    }
}

int cws_socket_write(void *data, const void *buffer, size_t len)
{
    while (true) {
        int n = send((int)(uintptr_t)data, buffer, len, MSG_NOSIGNAL);
        if (n > 0) return (int)n;
        if (n < 0 && errno != EWOULDBLOCK) return (int)CWS_ERROR_ERRNO;
        if (n == 0) return (int)CWS_ERROR_CONNECTION_CLOSED;
        coroutine_yield();
    }
}

int cws_socket_shutdown(void *data, Cws_Shutdown_How how)
{
    if (shutdown((int)(uintptr_t)data, (int)how) < 0) return (int)CWS_ERROR_ERRNO;
    return 0;
}

int cws_socket_close(void *data)
{
    if (close((int)(uintptr_t)data) < 0) return (int)CWS_ERROR_ERRNO;
    return 0;
}

Cws_Socket cws_socket_from_fd(int fd)
{
    return (Cws_Socket) {
        .data     = (void*)(uintptr_t)fd,
        .read     = cws_socket_read,
        .peek     = cws_socket_peek,
        .write    = cws_socket_write,
        .shutdown = cws_socket_shutdown,
        .close    = cws_socket_close,
    };
}
