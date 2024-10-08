module server;
import common;
import std::io;
import std::math;
import std::collections::list;
import std::collections::map;

extern fn int platform_now_secs();
extern fn uint platform_send_message(uint player_id, void *message);
extern fn uint platform_now_msecs();

const int SERVER_FPS = 60;

fn void send_message_and_update_stats(uint player_id, void* message) {
    uint sent = platform_send_message(player_id, message);
    if (sent > 0) {
        stats::bytes_sent_within_tick += sent;
        stats::message_sent_within_tick += 1;
    }
}

/// Items //////////////////////////////

List(<usz>) collected_items;

fn void collect_items_by_player_at(float player_position_x, float player_position_y, Item[] *items) {
    foreach (item_index, item: *items) {
        if (item.alive) {
            if (common::collect_item(player_position_x, player_position_y, items, item_index)) {
                collected_items.push(item_index);
            }
        }
    }
}

fn ItemsCollectedBatchMessage *collected_items_as_batch_message(Item[]* items) {
    if (collected_items.size == 0) return null;
    int size = ItemsCollectedBatchMessage.sizeof + int.sizeof*collected_items.size;
    ItemsCollectedBatchMessage *message = mem::tcalloc(size);
    message.size = size;
    message.kind = MessageKind.ITEM_COLLECTED;
    for (int i = 0; i < collected_items.size; ++i) {
        message.ids[i] = collected_items[i];
    }
    collected_items.size = 0;
    return message;
}

/// Bombs //////////////////////////////

List(<usz>) thrown_bombs;

fn void throw_bomb_on_server_side(uint player_id, Bombs *bombs) {
    if (try player = players.get(player_id)) {
        int index = common::throw_bomb(player.player.position, player.player.direction, bombs);
        if (index >= 0) thrown_bombs.push(index);
    }
}

fn BombsSpawnedBatchMessage *thrown_bombs_as_batch_message(Bombs *bombs) {
    if (thrown_bombs.size == 0) return null;
    int size = BombsSpawnedBatchMessage.sizeof + BombSpawned.sizeof*thrown_bombs.size;
    BombsSpawnedBatchMessage *message = mem::tcalloc(size);
    message.size = size;
    message.kind = MessageKind.BOMB_SPAWNED;

    foreach (index, bombIndex: thrown_bombs) {
        Bomb *bomb = &(*bombs)[bombIndex];
        message.bombs[index].bombIndex = bombIndex;
        message.bombs[index].x = bomb.position.x;
        message.bombs[index].y = bomb.position.y;
        message.bombs[index].z = bomb.position_z;
        message.bombs[index].dx = bomb.velocity.x;
        message.bombs[index].dy = bomb.velocity.y;
        message.bombs[index].dz = bomb.velocity_z;
        message.bombs[index].lifetime = bomb.lifetime;
    }
    thrown_bombs.size = 0;
    return message;
}

List(<usz>) exploded_bombs;

fn void update_bombs_on_server_side(Scene *scene, float delta_time, Bombs *bombs) {
    foreach (bombIndex, &bomb: *bombs) {
        if (bomb.lifetime > 0) {
            common::update_bomb(bomb, scene, delta_time);
            if (bomb.lifetime <= 0) {
                exploded_bombs.push(bombIndex);
            }
        }
    }
}

fn BombsExplodedBatchMessage* exploded_bombs_as_batch_message(Bombs* bombs) {
    if (exploded_bombs.size == 0) return null;
    int size = BombsExplodedBatchMessage.sizeof + BombExploded.sizeof*exploded_bombs.size;
    BombsExplodedBatchMessage *message = mem::tcalloc(size);
    message.size = size;
    message.kind = MessageKind.BOMB_EXPLODED;

    foreach (index, bombIndex: exploded_bombs) {
        Bomb bomb = (*bombs)[bombIndex];
        message.bombs[index].bombIndex = bombIndex;
        message.bombs[index].x         = bomb.position.x;
        message.bombs[index].y         = bomb.position.y;
        message.bombs[index].z         = bomb.position_z;
    }

    exploded_bombs.size = 0;
    return message;
}

/// Player //////////////////////////////

struct PlayerOnServer {
    Player player;
    char new_moving;
}

def PlayerOnServerEntry = Entry(<uint, PlayerOnServer>);
HashMap(<uint, PlayerOnServer>) players;

def PlayerIdsEntry = Entry(<uint, bool>);
HashMap(<uint, bool>) joined_ids;
HashMap(<uint, bool>) left_ids;
def PingEntry = Entry(<uint, uint>);
HashMap(<uint, uint>) ping_ids;

fn void register_new_player(uint id) @extern("register_new_player") @wasm {
    assert(!players.has_key(id));
    joined_ids.set(id, true);
    stats::inc_counter(PLAYERS_JOINED, 1);
    stats::inc_counter(PLAYERS_CURRENTLY, 1);
    players.set(id, {
        .player = {
            .id = id,
        }
    });
}

fn void unregister_player(uint id) @extern("unregister_player") @wasm {
    if (catch joined_ids.remove(id)) {
        left_ids.set(id, false);
    }
    stats::inc_counter(PLAYERS_LEFT, 1);
    stats::inc_counter(PLAYERS_CURRENTLY, -1);
    players.remove(id);
}

fn PlayersJoinedBatchMessage *all_players_as_joined_batch_message() {
    if (players.is_empty()) return null;
    int size = PlayersJoinedBatchMessage.sizeof + PlayerStruct.sizeof*players.len();
    PlayersJoinedBatchMessage *message = mem::tcalloc(size);
    message.size = size;
    message.kind = MessageKind.PLAYER_JOINED;
    
    int index = 0;
    players.@each_entry(; PlayerOnServerEntry* entry) {
        message.players[index].id        = entry.value.player.id;
        message.players[index].x         = entry.value.player.position.x;
        message.players[index].y         = entry.value.player.position.y;
        message.players[index].direction = entry.value.player.direction;
        message.players[index].hue       = entry.value.player.hue;
        message.players[index].moving    = entry.value.player.moving;
        index += 1;
    };

    return message;
}

fn PlayersJoinedBatchMessage *joined_players_as_batch_message() {
    if (joined_ids.is_empty()) return null;
    int size = PlayersJoinedBatchMessage.sizeof + PlayerStruct.sizeof*joined_ids.len();
    PlayersJoinedBatchMessage *message = mem::tcalloc(size);
    message.size = size;
    message.kind = MessageKind.PLAYER_JOINED;

    int index = 0;
    joined_ids.@each_entry(; PlayerIdsEntry *entry) {
        uint joined_id = entry.key;
        if (try joined_player = players.get(joined_id)) { // This should never happen, but we're handling none existing ids for more robustness
            message.players[index].id        = joined_player.player.id;
            message.players[index].x         = joined_player.player.position.x;
            message.players[index].y         = joined_player.player.position.y;
            message.players[index].direction = joined_player.player.direction;
            message.players[index].hue       = joined_player.player.hue;
            message.players[index].moving    = joined_player.player.moving;
            index += 1;
        }
    };

    return message;
}

fn PlayersLeftBatchMessage *left_players_as_batch_message() {
    if (left_ids.is_empty()) return null;

    int size = PlayersLeftBatchMessage.sizeof + uint.sizeof*left_ids.len();
    PlayersLeftBatchMessage *message = mem::tcalloc(size);
    message.size = size;
    message.kind = MessageKind.PLAYER_LEFT;

    int index = 0;
    left_ids.@each_entry(; PlayerIdsEntry *entry) {
        uint left_id = entry.key;
        message.ids[index] = left_id;
        index += 1;
    };

    return message;
}

fn void process_joined_players(Item[]* items) {
    if (joined_ids.is_empty()) return; 

    // Initialize joined players
    {
        // Reconstructing the state of the other players batch
        PlayersJoinedBatchMessage *players_joined_batch_message = all_players_as_joined_batch_message();

        // Reconstructing the state of items batch
        ItemsSpawnedBatchMessage *items_spanwed_batch_message = common::reconstruct_state_of_items(items);

        // Greeting all the joined players and notifying them about other players
        joined_ids.@each_entry(; PlayerIdsEntry *entry) {
            uint joined_id = entry.key;
            if (try joined_player = players.get(joined_id)) { // This should never happen, but we're handling none existing ids for more robustness
                // The greetings
                HelloMessage *hello_message = mem::tcalloc(HelloMessage.sizeof);
                hello_message.size      = HelloMessage.sizeof;
                hello_message.kind      = HELLO;
                hello_message.id        = joined_player.player.id;
                hello_message.x         = joined_player.player.position.x;
                hello_message.y         = joined_player.player.position.y;
                hello_message.direction = joined_player.player.direction;
                hello_message.hue       = joined_player.player.hue;
                send_message_and_update_stats(joined_id, hello_message);

                // Reconstructing the state of the other players
                if (players_joined_batch_message != null) {
                    send_message_and_update_stats(joined_id, players_joined_batch_message);
                }

                // Reconstructing the state of items
                if (items_spanwed_batch_message != null) {
                    send_message_and_update_stats(joined_id, items_spanwed_batch_message);
                }

                // TODO: Reconstructing the state of bombs
            }
        };
    }

    // Notifying old player about who joined
    PlayersJoinedBatchMessage *players_joined_batch_message = joined_players_as_batch_message();
    if (players_joined_batch_message != null) {
        players.@each_entry(; PlayerOnServerEntry* entry) {
            if (!joined_ids.has_key(entry.value.player.id)) { // Joined player should already know about themselves
                send_message_and_update_stats(entry.value.player.id, players_joined_batch_message);
            }
        };
    }
}

fn void process_left_players() {
    // Notifying about whom left
    if (left_ids.is_empty()) return;
    PlayersLeftBatchMessage *players_left_batch_message = left_players_as_batch_message();
    players.@each_entry(; PlayerOnServerEntry* entry) {
        send_message_and_update_stats(entry.value.player.id, players_left_batch_message);
    };
}

fn void process_moving_players() {
    int count = 0;
    players.@each_entry(; PlayerOnServerEntry* entry) {
        if (entry.value.new_moving != entry.value.player.moving) {
            count += 1;
        }
    };
    if (count <= 0) return;

    int size = PlayersMovingBatchMessage.sizeof + PlayerStruct.sizeof*count;
    PlayersMovingBatchMessage *message = mem::tcalloc(size);
    message.size = size;
    message.kind = MessageKind.PLAYER_MOVING;
    int index = 0;
    players.@each_entry(; PlayerOnServerEntry* entry) {
        if (entry.value.new_moving != entry.value.player.moving) {
            entry.value.player.moving = entry.value.new_moving;
            message.players[index].id = entry.value.player.id;
            message.players[index].x = entry.value.player.position.x;
            message.players[index].y = entry.value.player.position.y;
            message.players[index].direction = entry.value.player.direction;
            message.players[index].moving = entry.value.player.moving;
            index += 1;
        }
    };

    players.@each_entry(; PlayerOnServerEntry* entry) {
        send_message_and_update_stats(entry.value.player.id, message);
    };
}

fn void process_thrown_bombs(Bombs *bombs) {
    // Notifying about thrown bombs
    BombsSpawnedBatchMessage *bombs_spawned_batch_message = thrown_bombs_as_batch_message(bombs);
    if (bombs_spawned_batch_message != null) {
        players.@each_entry(; PlayerOnServerEntry* entry) {
            send_message_and_update_stats(entry.value.player.id, bombs_spawned_batch_message);
        };
    }
}

fn void process_world_simulation(Item[] *items, Scene *scene, Bombs *bombs, float delta_time) {
    // Simulating the world for one server tick.
    players.@each_entry(; PlayerOnServerEntry* entry) {
        common::update_player(&entry.value.player, scene, delta_time);
        collect_items_by_player_at(entry.value.player.position.x, entry.value.player.position.y, items);
    };

    ItemsCollectedBatchMessage *items_collected_batch_message = collected_items_as_batch_message(items);
    if (items_collected_batch_message) {
        players.@each_entry(; PlayerOnServerEntry* entry) {
            send_message_and_update_stats(entry.value.player.id, items_collected_batch_message);
        };
    }

    update_bombs_on_server_side(scene, delta_time, bombs);
    BombsExplodedBatchMessage *bombs_exploded_batch_message = exploded_bombs_as_batch_message(bombs);
    if (bombs_exploded_batch_message) {
        players.@each_entry(; PlayerOnServerEntry* entry) {
            send_message_and_update_stats(entry.value.player.id, bombs_exploded_batch_message);
        };
    }
}

fn void process_pings() {
    // Sending out pings
    ping_ids.@each_entry(; PingEntry *entry) {
        uint id = entry.key;
        uint timestamp = entry.value;
        if (try player = players.get(id)) { // This MAY happen. A player may send a ping and leave.
            PongMessage *message = mem::tcalloc(PongMessage.sizeof);
            message.size = PongMessage.sizeof;
            message.kind = PONG;
            message.timestamp = timestamp;
            send_message_and_update_stats(id, message);
        }
    };
}

fn void player_update_moving(uint id, AmmaMovingMessage *message) {
    if (try value = players.get_ref(id)) {
        if (message.start) {
            value.new_moving |= (1<<(uint)message.direction);
        } else {
            value.new_moving &= ~(1<<(uint)message.direction);
        }
    }
}

fn void schedule_ping_for_player(uint id, PingMessage *message) {
    ping_ids.set(id, message.timestamp);
}

fn void clear_intermediate_ids() {
    joined_ids.clear();
    left_ids.clear();
    ping_ids.clear();
}

fn bool verify_ping_message(Message *message) {
    if (message.size != PingMessage.sizeof) return false;
    PingMessage* ping_message = (PingMessage*)message;
    if (ping_message.kind != PING) return false;
    return true;
}

fn bool verify_amma_throwing_message(Message *message) {
    if (message.size != AmmaThrowingMessage.sizeof) return false;
    AmmaThrowingMessage* amma_throwing_message = (AmmaThrowingMessage*)message;
    if (amma_throwing_message.kind != AMMA_THROWING) return false;
    return true;
}

fn bool verify_amma_moving_message(Message *message) {
    if (message.size != AmmaMovingMessage.sizeof) return false;
    AmmaMovingMessage* amma_moving_message = (AmmaMovingMessage*)message;
    if (amma_moving_message.kind != AMMA_MOVING) return false;
    return true;
}

fn bool process_message_on_server(uint id, Message *message) @extern("process_message_on_server") @wasm {
    stats::inc_counter(MESSAGES_RECEIVED, 1);
    stats::messages_recieved_within_tick += 1;
    stats::inc_counter(BYTES_RECEIVED, message.size);
    stats::bytes_received_within_tick += message.size;
    if (verify_amma_moving_message(message)) {
        player_update_moving(id, (AmmaMovingMessage*)message);
    } else if (verify_amma_throwing_message(message)) {
        throw_bomb_on_server_side(id, &common::bombs);
    } else if (verify_ping_message(message)) {
        schedule_ping_for_player(id, (PingMessage*)message);
    } else {
        // console.log(`Received bogus-amogus message from client ${id}:`, view)
        stats::inc_counter(BOGUS_AMOGUS_MESSAGES, 1);
        return false;
    }
    return true;
}

uint previous_timestamp = 0;
fn uint tick() @extern("tick") @wasm {
    uint timestamp = platform_now_msecs();
    float delta_time = (float)(timestamp - previous_timestamp)/1000.0f;
    previous_timestamp = timestamp;

    process_joined_players(&common::items);
    process_left_players();
    process_moving_players();
    process_thrown_bombs(&common::bombs);
    process_world_simulation(&common::items, common::scene, &common::bombs, delta_time);
    process_pings();

    uint tickTime = platform_now_msecs() - timestamp;
    stats::inc_counter(TICKS_COUNT, 1);
    stats::push_sample(TICK_TIMES, tickTime/1000.0f);
    stats::inc_counter(MESSAGES_SENT, stats::message_sent_within_tick);
    stats::push_sample(TICK_MESSAGES_SENT, stats::message_sent_within_tick);
    stats::push_sample(TICK_MESSAGES_RECEIVED, stats::messages_recieved_within_tick);
    stats::inc_counter(BYTES_SENT, stats::bytes_sent_within_tick);
    stats::push_sample(TICK_BYTE_SENT, stats::bytes_sent_within_tick);
    stats::push_sample(TICK_BYTE_RECEIVED, stats::bytes_received_within_tick);

    clear_intermediate_ids();

    stats::bytes_received_within_tick = 0;
    stats::messages_recieved_within_tick = 0;
    stats::message_sent_within_tick = 0;
    stats::bytes_sent_within_tick = 0;

    // TODO: serve the stats over a separate websocket, so a separate html page can poll it once in a while
    stats::print_per_n_ticks(SERVER_FPS);

    common::reset_temp_mark();
    return tickTime;
}

fn void stats_inc_players_rejected_counter() @extern("stats_inc_players_rejected_counter") @wasm {
    stats::inc_counter(PLAYERS_REJECTED, 1);
}

/// Entry point //////////////////////////////

fn void entry() @init(2048) @private {
    // NOTE: ideally we need to override os::native_fputc_fn as well
    // because io::printn uses it to print newline at the end of the
    // message. But since js_write() in server.mts is implemented as a
    // single console.log(), that newline is added implicitly anyway.
    os::native_fwrite_fn = fn usz!(void* f, char[] buffer) {
        common::platform_write(&buffer[0], buffer.len);
        return buffer.len;
    };
    stats::stats[StatEntry.UPTIME].timer.started_at = platform_now_secs();
    common::temp_mark = allocator::temp().used;
    common::scene = common::allocate_default_scene();
    previous_timestamp = platform_now_msecs();
}

/// Stats //////////////////////////////

module server::stats;
import std::collections::ringbuffer;
import std::io;

const usz AVERAGE_CAPACITY = 30;
def StatSamples = RingBuffer(<float, AVERAGE_CAPACITY>);

enum StatKind {
    COUNTER,
    AVERAGE,
    TIMER,
}

struct StatCounter {
    int value;
}

struct StatAverage {
    StatSamples samples;
}

struct StatTimer {
    uint started_at;
}

struct Stat {
    StatKind kind;
    String description;

    union {
        StatCounter counter;
        StatAverage average;
        StatTimer timer;
    }
}

enum StatEntry: usz {
    UPTIME,
    TICKS_COUNT,
    TICK_TIMES,
    MESSAGES_SENT,
    MESSAGES_RECEIVED,
    TICK_MESSAGES_SENT,
    TICK_MESSAGES_RECEIVED,
    BYTES_SENT,
    BYTES_RECEIVED,
    TICK_BYTE_SENT,
    TICK_BYTE_RECEIVED,
    PLAYERS_CURRENTLY,
    PLAYERS_JOINED,
    PLAYERS_LEFT,
    BOGUS_AMOGUS_MESSAGES,
    PLAYERS_REJECTED,
    COUNT,
}

// TODO: Why do I have to cast to usz in here? Is there cleaner way to do this?
Stat[(usz)StatEntry.COUNT] stats = {
    [StatEntry.UPTIME] = {
        .kind = TIMER,
        .description = "Uptime"
    },
    [StatEntry.TICKS_COUNT] = {
        .kind = COUNTER,
        .description = "Ticks count"
    },
    [StatEntry.TICK_TIMES] = {
        .kind = AVERAGE,
        .description = "Average time to process a tick"
    },
    [StatEntry.MESSAGES_SENT] = {
        .kind = COUNTER,
        .description = "Total messages sent"
    },
    [StatEntry.MESSAGES_RECEIVED] = {
        .kind = COUNTER,
        .description = "Total messages received"
    },
    [StatEntry.TICK_MESSAGES_SENT] = {
        .kind = AVERAGE,
        .description = "Average messages sent per tick"
    },
    [StatEntry.TICK_MESSAGES_RECEIVED] = {
        .kind = AVERAGE,
        .description = "Average messages received per tick"
    },
    [StatEntry.BYTES_SENT] = {
        .kind = COUNTER,
        .description = "Total bytes sent"
    },
    [StatEntry.BYTES_RECEIVED] = {
        .kind = COUNTER,
        .description = "Total bytes received"
    },
    [StatEntry.TICK_BYTE_SENT] = {
        .kind = AVERAGE,
        .description = "Average bytes sent per tick"
    },
    [StatEntry.TICK_BYTE_RECEIVED] = {
        .kind = AVERAGE,
        .description = "Average bytes received per tick"
    },
    [StatEntry.PLAYERS_CURRENTLY] = {
        .kind = COUNTER,
        .description = "Currently players"
    },
    [StatEntry.PLAYERS_JOINED] = {
        .kind = COUNTER,
        .description = "Total players joined"
    },
    [StatEntry.PLAYERS_LEFT] = {
        .kind = COUNTER,
        .description = "Total players left"
    },
    [StatEntry.BOGUS_AMOGUS_MESSAGES] = {
        .kind = COUNTER,
        .description = "Total bogus-amogus messages"
    },
    [StatEntry.PLAYERS_REJECTED] = {
        .kind = COUNTER,
        .description = "Total players rejected"
    },
};
int messages_recieved_within_tick = 0;
int bytes_received_within_tick = 0;
int message_sent_within_tick = 0;
int bytes_sent_within_tick = 0;

fn float StatSamples.average(&self) {
    float sum = 0;
    for (usz i = 0; i < self.written; ++i) {
        sum += self.get(i);
    }
    return sum/self.written;
}

fn String Stat.display(&stat) {
    switch (stat.kind) {
        case COUNTER: return string::tformat("%d", stat.counter.value);
        case AVERAGE: return string::tformat("%f", stat.average.samples.average());
        case TIMER:   return display_time_interval(server::platform_now_secs() - stat.timer.started_at);
    }
}

fn String plural_number(int num, String singular, String plural) {
    return num == 1 ? singular : plural;
}

fn String display_time_interval(uint diffSecs) {
    String[4] result;
    usz result_count = 0;

    uint days = diffSecs/60/60/24;
    if (days > 0) result[result_count++] = string::tformat("%d %s", days, plural_number(days, "day", "days"));
    uint hours = diffSecs/60/60%24;
    if (hours > 0) result[result_count++] = string::tformat("%d %s", hours, plural_number(hours, "hour", "hours"));
    uint mins = diffSecs/60%60;
    if (mins > 0) result[result_count++] = string::tformat("%d %s", mins, plural_number(mins, "min", "mins"));
    uint secs = diffSecs%60;
    if (secs > 0) result[result_count++] = string::tformat("%d %s", secs, plural_number(secs, "sec", "secs"));
    return result_count == 0 ? "0 secs" : string::join_new(&result, " ", allocator::temp());
}

fn void push_sample(StatEntry entry, float sample) {
    assert(entry < StatEntry.COUNT);
    Stat *stat = &stats[entry];
    assert(stat.kind == StatKind.AVERAGE);
    stat.average.samples.push(sample);
}

fn void inc_counter(StatEntry entry, int delta) {
    assert(entry < StatEntry.COUNT);
    Stat *stat = &stats[entry];
    assert(stat.kind == StatKind.AVERAGE);
    stat.counter.value += delta;
}

fn void print_per_n_ticks(int n) {
    if (stats[StatEntry.TICKS_COUNT].counter.value%n == 0) {
        io::printn("Stats:");
        foreach (&stat: stats) {
            io::printn(string::tformat("  %s %s", stat.description, stat.display()));
        }
    }
}
