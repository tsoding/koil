module server;

import std::io;
import std::math;
import std::collections::list;
import std::collections::map;
import std::hash::fnv32a;
import std::net::os;
import std::net::tcp;
import std::thread;
import std::time::clock;
import libc;

import cws;
import coroutine;
import arena;

import common;

const usz SERVER_TOTAL_LIMIT = 2000;
const usz SERVER_SINGLE_IP_LIMIT = 10;
const int SERVER_FPS = 60;

extern fn void send_message_and_update_stats(uint player_id, void* message) @extern("send_message_and_update_stats");

/// Connection Limits //////////////////////////////

extern fn uint *connection_limits_get(ShortString remote_address)            @extern("connection_limits_get");
extern fn void connection_limits_set(ShortString remote_address, uint count) @extern("connection_limits_set");
extern fn void connection_limits_remove(ShortString remote_address)          @extern("connection_limits_remove");

/// Items //////////////////////////////

List(<usz>) collected_items;

fn void collect_items_by_player(Player player, Item[] *items) {
    foreach (index, &item: *items) {
        if (common::collect_item(player, item)) {
            collected_items.push(index);
        }
    }
}

fn ItemsCollectedBatchMessage *collected_items_as_batch_message(Item[]* items) {
    if (collected_items.size == 0) return null;
    ItemsCollectedBatchMessage *message = common::alloc_items_collected_batch_message(collected_items.size);
    for (int i = 0; i < collected_items.size; ++i) {
        message.payload[i] = (uint)collected_items[i];
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
    BombsSpawnedBatchMessage *message = common::alloc_bombs_spawned_batch_message(thrown_bombs.size);
    foreach (index, bombIndex: thrown_bombs) {
        Bomb *bomb = &(*bombs)[bombIndex];
        message.payload[index].bombIndex = (uint)bombIndex;
        message.payload[index].x = bomb.position.x;
        message.payload[index].y = bomb.position.y;
        message.payload[index].z = bomb.position_z;
        message.payload[index].dx = bomb.velocity.x;
        message.payload[index].dy = bomb.velocity.y;
        message.payload[index].dz = bomb.velocity_z;
        message.payload[index].lifetime = bomb.lifetime;
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
    BombsExplodedBatchMessage *message = common::alloc_bombs_exploded_batch_message(exploded_bombs.size);
    foreach (index, bombIndex: exploded_bombs) {
        Bomb bomb = (*bombs)[bombIndex];
        message.payload[index].bombIndex = (uint)bombIndex;
        message.payload[index].x         = bomb.position.x;
        message.payload[index].y         = bomb.position.y;
        message.payload[index].z         = bomb.position_z;
    }
    exploded_bombs.size = 0;
    return message;
}

/// Player //////////////////////////////

struct PlayerOnServer {
    Player player;
    char new_moving;
    ShortString remote_address;
}

def PlayerOnServerEntry = Entry(<uint, PlayerOnServer>);
HashMap(<uint, PlayerOnServer>) players;

def PlayerIdsEntry = Entry(<uint, bool>);
HashMap(<uint, bool>) joined_ids;
HashMap(<uint, bool>) left_ids;
def PingEntry = Entry(<uint, uint>);
HashMap(<uint, uint>) ping_ids;

fn bool register_new_player(uint id, ShortString* remote_address) @extern("register_new_player") @wasm {
    if (players.len() >= SERVER_TOTAL_LIMIT) {
        stats::inc_counter(PLAYERS_REJECTED, 1);
        return false;
    }

    if (remote_address != null) {
        usz remote_address_len = ((ZString)&(*remote_address)[0]).char_len(); // WutFace
        if (remote_address_len == 0) {
            stats::inc_counter(PLAYERS_REJECTED, 1);
            return false;
        }

        uint *count = connection_limits_get(*remote_address);
        if (count) {
            // TODO: we need to let the player know somehow that they were rejected due to the limit
            if (*count >= SERVER_SINGLE_IP_LIMIT) {
                stats::inc_counter(PLAYERS_REJECTED, 1);
                return false;
            }
            connection_limits_set(*remote_address, *count + 1);
        } else {
            connection_limits_set(*remote_address, 1);
        }
    }

    assert(!players.has_key(id));
    joined_ids.set(id, true);

    if (remote_address != null) {
        players.set(id, {
            .player = {
                .id = id,
            },
            .remote_address = *remote_address,
        });
    } else {
        players.set(id, {
            .player = {
                .id = id,
            },
        });
    }

    stats::inc_counter(PLAYERS_JOINED, 1);
    stats::inc_counter(PLAYERS_CURRENTLY, 1);

    return true;
}

fn void unregister_player(uint id) @extern("unregister_player") @wasm {
    // console.log(`Player ${id} disconnected`);
    if (try player = players.get(id)) {
        uint *count = connection_limits_get(player.remote_address);
        if (count) {
            if (*count <= 1) {
                connection_limits_remove(player.remote_address);
            } else {
                connection_limits_set(player.remote_address, *count - 1);
            }
        }

        if (catch joined_ids.remove(id)) {
            left_ids.set(id, false);
        }
        stats::inc_counter(PLAYERS_LEFT, 1);
        stats::inc_counter(PLAYERS_CURRENTLY, -1);
        players.remove(id);
    }
}

fn PlayersJoinedBatchMessage *all_players_as_joined_batch_message() {
    if (players.is_empty()) return null;
    PlayersJoinedBatchMessage *message = common::alloc_players_joined_batch_message(players.len());
    int index = 0;
    players.@each_entry(; PlayerOnServerEntry* entry) {
        message.payload[index].id        = entry.value.player.id;
        message.payload[index].x         = entry.value.player.position.x;
        message.payload[index].y         = entry.value.player.position.y;
        message.payload[index].direction = entry.value.player.direction;
        message.payload[index].hue       = entry.value.player.hue;
        message.payload[index].moving    = entry.value.player.moving;
        index += 1;
    };

    return message;
}

fn PlayersJoinedBatchMessage *joined_players_as_batch_message() {
    if (joined_ids.is_empty()) return null;
    usz byte_length = PlayersJoinedBatchMessage.sizeof + PlayerStruct.sizeof*joined_ids.len();
    PlayersJoinedBatchMessage *message = mem::tcalloc(byte_length);
    message.byte_length = (uint)byte_length;
    message.kind = MessageKind.PLAYER_JOINED;

    int index = 0;
    joined_ids.@each_entry(; PlayerIdsEntry *entry) {
        uint joined_id = entry.key;
        if (try joined_player = players.get(joined_id)) { // This should never happen, but we're handling none existing ids for more robustness
            message.payload[index].id        = joined_player.player.id;
            message.payload[index].x         = joined_player.player.position.x;
            message.payload[index].y         = joined_player.player.position.y;
            message.payload[index].direction = joined_player.player.direction;
            message.payload[index].hue       = joined_player.player.hue;
            message.payload[index].moving    = joined_player.player.moving;
            index += 1;
        }
    };

    return message;
}

fn PlayersLeftBatchMessage *left_players_as_batch_message() {
    if (left_ids.is_empty()) return null;
    PlayersLeftBatchMessage *message = common::alloc_players_left_batch_message(left_ids.len());
    int index = 0;
    left_ids.@each_entry(; PlayerIdsEntry *entry) {
        uint left_id = entry.key;
        message.payload[index] = left_id;
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
                send_message_and_update_stats(joined_id, &&HelloMessage {
                    .byte_length = HelloMessage.sizeof,
                    .kind        = HELLO,
                    .payload     = {
                        .id         = joined_player.player.id,
                        .x          = joined_player.player.position.x,
                        .y          = joined_player.player.position.y,
                        .direction  = joined_player.player.direction,
                        .hue        = joined_player.player.hue,
                    }
                });

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

    int byte_length = PlayersMovingBatchMessage.sizeof + PlayerStruct.sizeof*count;
    PlayersMovingBatchMessage *message = mem::tcalloc(byte_length);
    message.byte_length = byte_length;
    message.kind = MessageKind.PLAYER_MOVING;
    int index = 0;
    players.@each_entry(; PlayerOnServerEntry* entry) {
        if (entry.value.new_moving != entry.value.player.moving) {
            entry.value.player.moving = entry.value.new_moving;
            message.payload[index].id = entry.value.player.id;
            message.payload[index].x = entry.value.player.position.x;
            message.payload[index].y = entry.value.player.position.y;
            message.payload[index].direction = entry.value.player.direction;
            message.payload[index].moving = entry.value.player.moving;
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
        collect_items_by_player(entry.value.player, items);
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
            send_message_and_update_stats(id, &&PongMessage {
                .byte_length = PongMessage.sizeof,
                .kind = PONG,
                .payload = timestamp,
            });
        }
    };
}

fn void player_update_moving(uint id, AmmaMovingMessage *message) {
    if (try value = players.get_ref(id)) {
        if (message.payload.start) {
            value.new_moving |= (1<<(uint)message.payload.direction);
        } else {
            value.new_moving &= ~(1<<(uint)message.payload.direction);
        }
    }
}

fn void schedule_ping_for_player(uint id, PingMessage *message) {
    ping_ids.set(id, message.payload);
}

fn void clear_intermediate_ids() {
    joined_ids.clear();
    left_ids.clear();
    ping_ids.clear();
}

fn bool process_message_on_server(uint id, Message* unknown_message) @extern("process_message_on_server") @wasm {
    stats::inc_counter(MESSAGES_RECEIVED, 1);
    stats::messages_recieved_within_tick += 1;
    stats::inc_counter(BYTES_RECEIVED, unknown_message.byte_length);
    stats::bytes_received_within_tick += unknown_message.byte_length;

    if (try message = common::verify_amma_moving_message(unknown_message)) {
        player_update_moving(id, message);
        return true;
    }
    if (try common::verify_amma_throwing_message(unknown_message)) {
        throw_bomb_on_server_side(id, &common::bombs);
        return true;
    }
    if (try message = common::verify_ping_message(unknown_message)) {
        schedule_ping_for_player(id, message);
        return true;
    }

    // console.log(`Received bogus-amogus message from client ${id}:`, view)
    stats::inc_counter(BOGUS_AMOGUS_MESSAGES, 1);
    return false;
}

uint previous_timestamp = 0;
fn uint tick() @extern("tick") @wasm {
    uint timestamp = now_msecs();
    float delta_time = (float)(timestamp - previous_timestamp)/1000.0f;
    previous_timestamp = timestamp;

    process_joined_players(&common::items);
    process_left_players();
    process_moving_players();
    process_thrown_bombs(&common::bombs);
    process_world_simulation(&common::items, &common::scene, &common::bombs, delta_time);
    process_pings();

    uint tickTime = now_msecs() - timestamp;
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
    stats::print_per_n_ticks(SERVER_FPS, now_msecs());

    common::reset_temp_mark();
    return tickTime;
}

// Entry ///////////////////////////////

extern uint idCounter;

extern fn void connections_remove(uint player_id) @extern("connections_remove");
extern fn Cws *connections_get_ref(uint player_id) @extern("connections_get_ref");
extern fn void connections_set(uint player_id, Cws cws) @extern("connections_set");

extern fn CwsSocket cws_socket_from_fd(int fd) @extern("cws_socket_from_fd");

fn void client_connection(void *data)
{
    uint id = (uint)(uptr)data;
    defer {
        server::unregister_player(id);
        connections_remove(id);
    }

    Cws* cws = connections_get_ref(id);
    if (cws == null) {
        io::eprintfn("ERROR: unknown player id %d", id);
        thread::exit(69);
    }
    defer {
        cws::close(cws);
        arena::free(&cws.arena);
    }

    while (true) {
        CwsMessage cws_message;
        int err = cws::read_message(cws, &cws_message);
        if (err < 0) {
            if ((CwsError)err != cws::ERROR_FRAME_CLOSE_SENT) {
                io::eprintfn("ERROR: could not read message from player %d", id);
            }
            return;
        }
        usz byte_length = Message.sizeof + cws_message.payload_len;
        Message *message = mem::tcalloc(byte_length);
        message.byte_length = (uint)byte_length;
        libc::memcpy(&message.bytes[0], cws_message.payload, cws_message.payload_len);
        if (!server::process_message_on_server(id, message)) return;
        arena::reset(&cws.arena);
    }
}

fn int main() {
    coroutine::init();

    stats::start_timer_at(StatEntry.UPTIME, now_msecs());
    common::temp_mark = allocator::temp().used;
    common::load_default_scene();
    server::previous_timestamp = now_msecs();

    const String HOST = "0.0.0.0";
    TcpServerSocket server = tcp::listen(HOST, common::SERVER_PORT, 10, REUSEADDR)!!;
    server.sock.set_non_blocking(true)!!;
    io::printfn("Listening to ws://%s:%d/", HOST, common::SERVER_PORT);
    while (true) {
        TcpSocket! client = tcp::accept(&server);
        if (try client) {
            client.sock.set_non_blocking(true)!!;

            Cws cws = {
                .socket = cws_socket_from_fd(client.sock),
            };

            int err = cws::server_handshake(&cws);
            if (err < 0) {
                // TODO: do not die on error in here
                io::eprintf("ERROR: server_handshake: %s\n", cws::error_message(&cws, (CwsError)err));
                return 1;
            }

            uint id = idCounter++;
            // TODO: pass the remote address to server::register_new_player() to enable connection limits
            if (!server::register_new_player(id, null)) {
                cws::close(&cws);
                arena::free(&cws.arena);
                continue;
            }

            connections_set(id, cws);
            coroutine::go(&client_connection, (void*)(uptr)id);
        } else {
            anyfault nani = os::socket_error();
            if (nani != IoError.WOULD_BLOCK) {
                nani?!!;
            }
        }

        int tick_time = server::tick();
        thread::sleep_ms(math::max(0, (1000 - tick_time*server::SERVER_FPS)/server::SERVER_FPS));
        coroutine::yield();
    }
}

fn uint now_msecs()
{
    return (uint)(clock::now()/1000_000);
}

/// Stats //////////////////////////////

module server::stats;

enum StatEntry: inline usz {    // WARNING! Must be synced with Stat_Entry in server.c
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

extern int messages_recieved_within_tick;
extern int bytes_received_within_tick;
extern int message_sent_within_tick;
extern int bytes_sent_within_tick;

extern fn void push_sample(StatEntry entry, float sample) @extern("stat_push_sample");
extern fn void inc_counter(StatEntry entry, int delta) @extern("stat_inc_counter");
extern fn void start_timer_at(StatEntry entry, uint msecs) @extern("stat_start_timer_at");
extern fn void print_per_n_ticks(int n, uint now_msecs) @extern("stat_print_per_n_ticks");
