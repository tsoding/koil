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

// TODO: stb_ds does not provide maximum performance. we should eventually implement our own hash table.
#define STB_DS_IMPLEMENTATION
#include "stb_ds.h"

static Arena temp = {0};

// Forward declarations //////////////////////////////

extern int messages_recieved_within_tick;
extern int bytes_received_within_tick;
extern int message_sent_within_tick;
extern int bytes_sent_within_tick;

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
void server_unregister_player(uint32_t id); // Implemented in C3

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
    server_unregister_player(id);
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
        int n = read((int)(uintptr_t)data, buffer, len);
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
        int n = recv((int)(uintptr_t)data, buffer, len, MSG_PEEK);
        if (n > 0) return (int)n;
        if (n < 0 && errno != EWOULDBLOCK) return (int)CWS_ERROR_ERRNO;
        if (n == 0) return (int)CWS_ERROR_CONNECTION_CLOSED;
        coroutine_yield();
    }
}

int cws_socket_write(void *data, const void *buffer, size_t len)
{
    while (true) {
        int n = write((int)(uintptr_t)data, buffer, len);
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

// Stats //////////////////////////////

#define AVERAGE_CAPACITY 30

typedef struct {
    float items[AVERAGE_CAPACITY];
    size_t begin;
    size_t count;
} Stat_Samples;

// TODO: consider contributing the Ring Buffer operations to nob

#define rb_capacity(rb) (sizeof((rb)->items)/sizeof((rb)->items[0]))

#define rb_at(rb, i)                            \
    (rb)->items[                                \
        (                                       \
            assert((i) < (rb)->count),          \
            ((rb)->begin + (i))%rb_capacity(rb) \
        )                                       \
    ]

#define rb_push(rb, sample)                                                  \
    do {                                                                     \
        (rb)->items[((rb)->begin + (rb)->count)%rb_capacity(rb)] = (sample); \
        if ((rb)->count < rb_capacity(rb)) {                                 \
            (rb)->count += 1;                                                \
        } else {                                                             \
            (rb)->begin = ((rb)->begin + 1)%rb_capacity(rb);                 \
        }                                                                    \
    } while (0)

typedef enum {
    SK_COUNTER,
    SK_AVERAGE,
    SK_TIMER,
} Stat_Kind;

typedef struct {
    int value;
} Stat_Counter;

typedef struct {
    Stat_Samples samples;
} Stat_Average;

typedef struct {
    uint started_at;
} Stat_Timer;

typedef struct {
    Stat_Kind kind;
    const char *description;

    union {
        Stat_Counter counter;
        Stat_Average average;
        Stat_Timer timer;
    };
} Stat;

typedef enum {
    SE_UPTIME = 0,
    SE_TICKS_COUNT,
    SE_TICK_TIMES,
    SE_MESSAGES_SENT,
    SE_MESSAGES_RECEIVED,
    SE_TICK_MESSAGES_SENT,
    SE_TICK_MESSAGES_RECEIVED,
    SE_BYTES_SENT,
    SE_BYTES_RECEIVED,
    SE_TICK_BYTE_SENT,
    SE_TICK_BYTE_RECEIVED,
    SE_PLAYERS_CURRENTLY,
    SE_PLAYERS_JOINED,
    SE_PLAYERS_LEFT,
    SE_BOGUS_AMOGUS_MESSAGES,
    SE_PLAYERS_REJECTED,
    NUMBER_OF_STAT_ENTRIES,
} Stat_Entry;

static_assert(NUMBER_OF_STAT_ENTRIES == 16, "Number of Stat Enties has changed");
static Stat stats[NUMBER_OF_STAT_ENTRIES] = {
    [SE_UPTIME] = {
        .kind = SK_TIMER,
        .description = "Uptime"
    },
    [SE_TICKS_COUNT] = {
        .kind = SK_COUNTER,
        .description = "Ticks count"
    },
    [SE_TICK_TIMES] = {
        .kind = SK_AVERAGE,
        .description = "Average time to process a tick"
    },
    [SE_MESSAGES_SENT] = {
        .kind = SK_COUNTER,
        .description = "Total messages sent"
    },
    [SE_MESSAGES_RECEIVED] = {
        .kind = SK_COUNTER,
        .description = "Total messages received"
    },
    [SE_TICK_MESSAGES_SENT] = {
        .kind = SK_AVERAGE,
        .description = "Average messages sent per tick"
    },
    [SE_TICK_MESSAGES_RECEIVED] = {
        .kind = SK_AVERAGE,
        .description = "Average messages received per tick"
    },
    [SE_BYTES_SENT] = {
        .kind = SK_COUNTER,
        .description = "Total bytes sent"
    },
    [SE_BYTES_RECEIVED] = {
        .kind = SK_COUNTER,
        .description = "Total bytes received"
    },
    [SE_TICK_BYTE_SENT] = {
        .kind = SK_AVERAGE,
        .description = "Average bytes sent per tick"
    },
    [SE_TICK_BYTE_RECEIVED] = {
        .kind = SK_AVERAGE,
        .description = "Average bytes received per tick"
    },
    [SE_PLAYERS_CURRENTLY] = {
        .kind = SK_COUNTER,
        .description = "Currently players"
    },
    [SE_PLAYERS_JOINED] = {
        .kind = SK_COUNTER,
        .description = "Total players joined"
    },
    [SE_PLAYERS_LEFT] = {
        .kind = SK_COUNTER,
        .description = "Total players left"
    },
    [SE_BOGUS_AMOGUS_MESSAGES] = {
        .kind = SK_COUNTER,
        .description = "Total bogus-amogus messages"
    },
    [SE_PLAYERS_REJECTED] = {
        .kind = SK_COUNTER,
        .description = "Total players rejected"
    },
};

static float stat_samples_average(Stat_Samples self)
{
    float sum = 0;
    if (self.count == 0) return sum;
    for (size_t i = 0; i < self.count; ++i) {
        sum += rb_at(&self, i);
    }
    return sum/self.count;
}

static const char *plural_number(int num, const char *singular, const char *plural)
{
    return num == 1 ? singular : plural;
}

static const char *display_time_interval(uint32_t diff_msecs)
{
    const char* result[4];
    size_t result_count = 0;

    uint days = diff_msecs/1000/60/60/24;
    if (days > 0) result[result_count++] = arena_sprintf(&temp, "%d %s", days, plural_number(days, "day", "days"));
    uint hours = diff_msecs/1000/60/60%24;
    if (hours > 0) result[result_count++] = arena_sprintf(&temp, "%d %s", hours, plural_number(hours, "hour", "hours"));
    uint mins = diff_msecs/1000/60%60;
    if (mins > 0) result[result_count++] = arena_sprintf(&temp, "%d %s", mins, plural_number(mins, "min", "mins"));
    uint secs = diff_msecs/1000%60;
    if (secs > 0) result[result_count++] = arena_sprintf(&temp, "%d %s", secs, plural_number(secs, "sec", "secs"));

    if (result_count == 0) return "0 secs";

    String_Builder sb = {0};
    for (size_t i = 0; i < result_count; ++i) {
        if (i > 0) arena_da_append(&temp, &sb, ' ');
        arena_sb_append_cstr(&temp, &sb, result[i]);
    }
    arena_sb_append_null(&temp, &sb);
    return sb.items;
}

static const char *stat_display(Stat stat, uint32_t now_msecs)
{
    switch (stat.kind) {
        case SK_COUNTER: return arena_sprintf(&temp, "%d", stat.counter.value);
        case SK_AVERAGE: return arena_sprintf(&temp, "%f", stat_samples_average(stat.average.samples));
        case SK_TIMER:   return display_time_interval(now_msecs - stat.timer.started_at);
        default: UNREACHABLE("stat_display");
    }
}

void stat_push_sample(Stat_Entry entry, float sample)
{
    assert(entry < NUMBER_OF_STAT_ENTRIES);
    Stat *stat = &stats[entry];
    assert(stat->kind == SK_AVERAGE);
    rb_push(&stat->average.samples, sample);
}

void stat_inc_counter(Stat_Entry entry, int delta)
{
    assert(entry < NUMBER_OF_STAT_ENTRIES);
    Stat *stat = &stats[entry];
    assert(stat->kind == SK_COUNTER);
    stat->counter.value += delta;
}

void stat_start_timer_at(Stat_Entry entry, uint32_t msecs)
{
    assert(entry < NUMBER_OF_STAT_ENTRIES);
    Stat *stat = &stats[entry];
    assert(stat->kind == SK_TIMER);
    stat->timer.started_at = msecs;
}

void stat_print_per_n_ticks(int n, uint32_t now_msecs)
{
    if (stats[SE_TICKS_COUNT].counter.value%n == 0) {
        printf("Stats:\n");
        for (size_t i = 0; i < ARRAY_LEN(stats); ++i) {
            printf("  %s %s\n", stats[i].description, stat_display(stats[i], now_msecs));
        }
        fflush(stdout);
    }
}

int messages_recieved_within_tick = 0;
int bytes_received_within_tick = 0;
int message_sent_within_tick = 0;
int bytes_sent_within_tick = 0;
