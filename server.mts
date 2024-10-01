import {readFileSync} from 'fs';
import {WebSocketServer, WebSocket} from 'ws';
import * as common from './common.mjs'

const SERVER_FPS = 60;
const SERVER_TOTAL_LIMIT = 2000;
const SERVER_SINGLE_IP_LIMIT = 10;

// IMPORTANT: This must be synchronized with the StatEntry in server.c3 until server.mts is fully rewritten in C3.
enum StatEntry {
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

interface PlayerConnection {
    ws: WebSocket,
    remoteAddress: string,
}

const wasmServer = await instantiateWasmServer('server.wasm');
const connections = new Map<number, PlayerConnection>();
const connectionLimits = new Map<string, number>();
let idCounter = 0;
const wss = new WebSocketServer({port: common.SERVER_PORT})
const level = common.createLevel(wasmServer);

wss.on("connection", (ws, req) => {
    ws.binaryType = 'arraybuffer';

    if (connections.size >= SERVER_TOTAL_LIMIT) {
        wasmServer.stats_inc_counter(StatEntry.PLAYERS_REJECTED, 1);
        ws.close();
        return;
    }

    if (req.socket.remoteAddress === undefined) {
        // NOTE: something weird happened the client does not have a remote address
        wasmServer.stats_inc_counter(StatEntry.PLAYERS_REJECTED, 1);
        ws.close();
        return;
    }

    const remoteAddress = req.socket.remoteAddress;

    {
        let count = connectionLimits.get(remoteAddress) || 0;
        if (count >= SERVER_SINGLE_IP_LIMIT) {
            wasmServer.stats_inc_counter(StatEntry.PLAYERS_REJECTED, 1);
            ws.close();
            return;
        }
        connectionLimits.set(remoteAddress, count + 1);
    }

    const id = idCounter++;
    const x = 0;//Math.random()*(common.WORLD_WIDTH - common.PLAYER_SIZE);
    const y = 0;//Math.random()*(common.WORLD_HEIGHT - common.PLAYER_SIZE);
    const hue = Math.floor(Math.random()*255);
    wasmServer.register_new_player(id, x, y, hue);
    connections.set(id, {ws, remoteAddress});
    // console.log(`Player ${id} connected`);
    ws.addEventListener("message", (event) => {
        if (!(event.data instanceof ArrayBuffer)){
            wasmServer.stats_inc_counter(StatEntry.BOGUS_AMOGUS_MESSAGES, 1);
            // console.log(`Received bogus-amogus message from client ${id}:`, message)
            ws.close();
            return;
        }
        const eventDataPtr = common.arrayBufferAsMessageInWasm(wasmServer, event.data);
        // console.log(`Received message from player ${id}`, new Uint8ClampedArray(event.data));
        if (!wasmServer.process_message_on_server(id, eventDataPtr, level.bombsPtr)) {
            ws.close();
            return;
        }
    });
    ws.on("close", () => {
        // console.log(`Player ${id} disconnected`);
        let count = connectionLimits.get(remoteAddress);
        if (count !== undefined) {
            if (count <= 1) {
                connectionLimits.delete(remoteAddress);
            } else {
                connectionLimits.set(remoteAddress, count - 1);
            }
        }
        wasmServer.unregister_player(id);
        connections.delete(id);
    })
})

function tick() {
    const tickTime = wasmServer.tick(level.itemsPtr, level.bombsPtr, level.scenePtr);
    setTimeout(tick, Math.max(0, 1000/SERVER_FPS - tickTime));
}

interface WasmServer extends common.WasmCommon {
    stats_inc_counter: (entry: number, delta: number) => void,
    stats_push_sample: (entry: number, sample: number) => void,
    stats_print_per_n_ticks: (n: number) => void,
    reconstruct_state_of_items: (items: number) => number,
    collect_items_by_player_at: (player_position_x: number, player_position_y: number, items: number) => void,
    collected_items_as_batch_message: (items: number) => number,
    throw_bomb: (player_position_x: number, player_position_y: number, player_direction: number, bombs: number) => number,
    throw_bomb_on_server_side: (player_id: number, bombs: number) => number,
    thrown_bombs_as_batch_message: (bombs: number) => number,
    update_bombs_on_server_side: (scene: number, delta_time: number, bombs: number) => void,
    exploded_bombs_as_batch_message: (bombs: number) => number,
    register_new_player: (id: number, x: number, y: number, hue: number) => void,
    unregister_player: (id: number) => void,
    all_players_as_joined_batch_message: () => number,
    process_joined_players: (items: number) => void,
    process_left_players: () => void,
    process_moving_players: () => void,
    player_update_moving: (id: number, message: number) => void,
    process_thrown_bombs: (bombs: number) => void,
    process_world_simulation: (items: number, scene: number, bombs: number, delta_time: number) => void,
    process_pings: () => void,
    schedule_ping_for_player: (id: number, message: number) => void,
    clear_intermediate_ids: () => void,
    verify_ping_message: (message: number) => boolean,
    verify_amma_throwing_message: (message: number) => boolean,
    verify_amma_moving_message: (message: number) => boolean,
    process_message_on_server: (id: number, message: number, bombs: number) => boolean,
    tick: (items: number, bombs: number, scene: number) => number,
}

function platform_now_secs(): number {
    return Math.floor(Date.now()/1000);
}

// NOTE: This implicitly adds newline, but given how we using this
// function in server.c3 it's actually fine. This function is called
// once per io::printn() anyway.
function platform_write(buffer: number, buffer_len: number) {
    console.log(new TextDecoder().decode(new Uint8ClampedArray(wasmServer.memory.buffer, buffer, buffer_len)));
}

function platform_send_message(player_id: number, message: number): number {
    if (message === 0) return 0;  // null message
    const connection = connections.get(player_id);
    if (connection === undefined) return 0; // connection does not exist
    const size = new Uint32Array(wasmServer.memory.buffer, message, 1)[0];
    if (size === 0) return 0;     // empty emssage
    connection.ws.send(new Uint8Array(wasmServer.memory.buffer, message + common.UINT32_SIZE, size - common.UINT32_SIZE));
    return size;
}

async function instantiateWasmServer(path: string): Promise<WasmServer> {
    const wasm = await WebAssembly.instantiate(readFileSync(path), {
        "env": {
            platform_now_secs,
            platform_write,
            platform_send_message,
            platform_now_msecs: () => performance.now(),
            fmodf:  (x: number, y: number) => x%y,
        },
    });
    const wasmCommon = common.makeWasmCommon(wasm);
    wasmCommon._initialize();
    return {
        ...wasmCommon,
        stats_inc_counter: wasm.instance.exports.stats_inc_counter as (entry: number) => void,
        stats_push_sample: wasm.instance.exports.stats_push_sample as (entry: number, sample: number) => void,
        stats_print_per_n_ticks: wasm.instance.exports.stats_print_per_n_ticks as (n: number) => void,
        reconstruct_state_of_items: wasm.instance.exports.reconstruct_state_of_items as (items: number) => number,
        collect_items_by_player_at: wasm.instance.exports.collect_items_by_player_at as (player_position_x: number, player_position_y: number, items: number) => void,
        collected_items_as_batch_message: wasm.instance.exports.collected_items_as_batch_message as (items: number) => number,
        throw_bomb: wasm.instance.exports.throw_bomb as (player_position_x: number, player_position_y: number, player_direction: number, bombs: number) => number,
        throw_bomb_on_server_side: wasm.instance.exports.throw_bomb_on_server_side as (player_id: number, bombs: number) => number,
        thrown_bombs_as_batch_message: wasm.instance.exports.thrown_bombs_as_batch_message as (bombs: number) => number,
        update_bombs_on_server_side: wasm.instance.exports.update_bombs_on_server_side as (scene: number, delta_time: number, bombs: number) => void,
        exploded_bombs_as_batch_message: wasm.instance.exports.exploded_bombs_as_batch_message as (bombs: number) => number,
        register_new_player: wasm.instance.exports.register_new_player as (id: number, x: number, y: number, hue: number) => void,
        unregister_player: wasm.instance.exports.unregister_player as (id: number) => void,
        all_players_as_joined_batch_message: wasm.instance.exports.all_players_as_joined_batch_message as () => number,
        process_joined_players: wasm.instance.exports.process_joined_players as (items: number) => void,
        process_left_players: wasm.instance.exports.process_left_players as () => void,
        process_moving_players: wasm.instance.exports.process_moving_players as () => void,
        player_update_moving: wasm.instance.exports.player_update_moving as (id: number, message: number) => void,
        process_thrown_bombs: wasm.instance.exports.process_thrown_bombs as (bombs: number) => void,
        process_world_simulation: wasm.instance.exports.process_world_simulation as (items: number, scene: number, bombs: number, delta_time: number) => void,
        process_pings: wasm.instance.exports.process_pings as () => void,
        schedule_ping_for_player: wasm.instance.exports.schedule_ping_for_player as (id: number, timestamp: number) => void,
        clear_intermediate_ids: wasm.instance.exports.clear_intermediate_ids as () => void,
        verify_ping_message: wasm.instance.exports.verify_ping_message as (message: number) => boolean,
        verify_amma_throwing_message: wasm.instance.exports.verify_amma_throwing_message as (message: number) => boolean,
        verify_amma_moving_message: wasm.instance.exports.verify_amma_moving_message as (message: number) => boolean,
        process_message_on_server: wasm.instance.exports.process_message_on_server as (id: number, message: number, bombs: number) => boolean,
        tick: wasm.instance.exports.tick as (items: number, bombs: number, scene: number) => number,
    };
}

setTimeout(tick, 1000/SERVER_FPS);

console.log(`Listening to ws://0.0.0.0:${common.SERVER_PORT}`)
