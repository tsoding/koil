module server;

import std::io;
import std::math;
import std::collections::list;
import std::hash::fnv32a;
import std::net::os;
import std::net::tcp;
import std::thread;
import std::time::clock;
import libc;
import stbds;

import cws;
import coroutine;
import arena;

import common;

// WARNING! Must be in sync with the value in server.c
const int SERVER_FPS = 60;

/// Player //////////////////////////////

extern fn bool register_new_player(uint id, ShortString* remote_address) @extern("register_new_player");

extern uint previous_timestamp;
extern fn uint tick() @extern("tick");

// Entry ///////////////////////////////

extern uint idCounter;
extern fn void connections_set(uint player_id, Cws cws) @extern("connections_set");
extern fn CwsSocket cws_socket_from_fd(int fd) @extern("cws_socket_from_fd");
extern fn void client_connection(void *data) @extern("client_connection");

usz temp_mark = 0;
fn void reset_temp_mark() @export("reset_temp_mark") {
    allocator::temp().reset(temp_mark);
}

fn void* allocate_temporary_buffer(usz size) @extern("allocate_temporary_buffer") @wasm {
    return mem::tcalloc(size);
}

fn int main() {
    coroutine::init();

    stats::start_timer_at(StatEntry.UPTIME, now_msecs());
    temp_mark = allocator::temp().used;
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

extern fn uint now_msecs() @extern("now_msecs");

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

extern fn void start_timer_at(StatEntry entry, uint msecs) @extern("stat_start_timer_at");
