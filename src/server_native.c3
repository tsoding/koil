module server::platform;
import std::io;
import std::collections::map;
import std::net::tcp;
import std::net::os;
import std::thread;
import std::math;
import libc;
import std::time::clock;

import cws;
import coroutine;
import arena;

import server;
import server::stats;
import common;

fn int cws_socket_read(void* data, void* buffer, usz len)
{
    while (true) {
        isz n = libc::read((int)(iptr)data, buffer, len);
        if (n > 0) return (int)n;
        if (n < 0 && os::socket_error() != IoError.WOULD_BLOCK) return (int)cws::ERROR_ERRNO;
        if (n == 0) return (int)cws::ERROR_CONNECTION_CLOSED;
        coroutine::yield();
    }
}

// peek: like read, but does not remove data from the buffer
// Usually implemented via MSG_PEEK flag of recv
fn int cws_socket_peek(void* data, void* buffer, usz len)
{
    const int MSG_PEEK = 2;
    while (true) {
        isz n = libc::recv((int)(iptr)data, buffer, len, MSG_PEEK);
        if (n > 0) return (int)n;
        if (n < 0 && os::socket_error() != IoError.WOULD_BLOCK) return (int)cws::ERROR_ERRNO;
        if (n == 0) return (int)cws::ERROR_CONNECTION_CLOSED;
        coroutine::yield();
    }
}

fn int cws_socket_write(void* data, void* buffer, usz len)
{
    while (true) {
        isz n = libc::write((int)(iptr)data, buffer, len);
        if (n > 0) return (int)n;
        if (n < 0 && os::socket_error() != IoError.WOULD_BLOCK) return (int)cws::ERROR_ERRNO;
        if (n == 0) return (int)cws::ERROR_CONNECTION_CLOSED;
        coroutine::yield();
    }
}

extern fn int shutdown(int sockfd, int how) @extern("shutdown");

fn int cws_socket_shutdown(void* data, CwsShutdownHow how)
{
    if (shutdown((int)(iptr)data, (int)how) < 0) return (int)cws::ERROR_ERRNO;
    return 0;
}

fn int cws_socket_close(void *data)
{
    if (libc::close((int)(iptr)data) < 0) return (int)cws::ERROR_ERRNO;
    return 0;
}

fn CwsSocket cws_socket_from_fd(int fd)
{
    return CwsSocket {
        .data     = (void*)(iptr)fd,
        .read     = &cws_socket_read,
        .peek     = &cws_socket_write,
        .write    = &cws_socket_peek,
        .shutdown = &cws_socket_shutdown,
        .close    = &cws_socket_close,
    };
}

HashMap(<uint, Cws>) connections;
uint idCounter = 0;

fn void client_connection(void *data)
{
    uint id = (uint)(uptr)data;
    defer {
        server::unregister_player(id);
        connections.remove(id);
    }

    Cws*! cws = connections.get_ref(id);
    if (catch cws) {
        io::eprintfn("ERROR: could not find websocket for player %d", id);
        return;
    }
    defer {
        cws::close(cws);
        arena::free(&cws.arena);
    }

    while (true) {
        CwsMessage cws_message;
        int err = cws::read_message(cws, &cws_message);
        if (err < 0) {
            io::eprintfn("ERROR: could not read message from player %d", id);
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

    stats::stats[StatEntry.UPTIME].timer.started_at = platform::now_msecs();
    common::temp_mark = allocator::temp().used;
    common::load_default_scene();
    server::previous_timestamp = platform::now_msecs();

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
                .debug = true,
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

            connections.set(id, cws);
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

fn uint send_message(uint player_id, void *message_row)
{
    Cws* cws = connections.get_ref(player_id)!!;
    Message* message = message_row;
    int err = cws::send_message(cws, cws::MESSAGE_BIN, &message.bytes[0], message.byte_length - $sizeof(message.byte_length));
    if (err < 0) {
        io::eprintf("ERROR: Could not send message to player %d: %s\n", player_id, cws::error_message(cws, (CwsError)err));
        thread::exit(69);
    }
    return message.byte_length;
}

fn uint now_msecs()
{
    return (uint)(clock::now()/1000_000);
}
