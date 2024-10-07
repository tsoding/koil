import {readFileSync} from 'fs';
import {WebSocketServer, WebSocket} from 'ws';
import * as common from './common.mjs'

const SERVER_FPS = 60;
const SERVER_TOTAL_LIMIT = 2000;
const SERVER_SINGLE_IP_LIMIT = 10;

interface PlayerConnection {
    ws: WebSocket,
    remoteAddress: string,
}

const wasmServer = await instantiateWasmServer('server.wasm');
const connections = new Map<number, PlayerConnection>();
const connectionLimits = new Map<string, number>();
let idCounter = 0;
const wss = new WebSocketServer({port: common.SERVER_PORT})

wss.on("connection", (ws, req) => {
    ws.binaryType = 'arraybuffer';

    if (connections.size >= SERVER_TOTAL_LIMIT) {
        wasmServer.stats_inc_players_rejected_counter();
        ws.close();
        return;
    }

    if (req.socket.remoteAddress === undefined) {
        // NOTE: something weird happened the client does not have a remote address
        wasmServer.stats_inc_players_rejected_counter();
        ws.close();
        return;
    }

    const remoteAddress = req.socket.remoteAddress;

    {
        let count = connectionLimits.get(remoteAddress) || 0;
        if (count >= SERVER_SINGLE_IP_LIMIT) {
            wasmServer.stats_inc_players_rejected_counter();
            ws.close();
            return;
        }
        connectionLimits.set(remoteAddress, count + 1);
    }

    const id = idCounter++;
    wasmServer.register_new_player(id);
    connections.set(id, {ws, remoteAddress});
    // console.log(`Player ${id} connected`);
    ws.addEventListener("message", (event) => {
        if (!(event.data instanceof ArrayBuffer)) {
            throw new Error("binaryType of the client WebSocket must be 'arraybuffer'");
        }
        const eventDataPtr = common.arrayBufferAsMessageInWasm(wasmServer, event.data);
        // console.log(`Received message from player ${id}`, new Uint8ClampedArray(event.data));
        if (!wasmServer.process_message_on_server(id, eventDataPtr)) {
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
    const tickTime = wasmServer.tick();
    setTimeout(tick, Math.max(0, 1000/SERVER_FPS - tickTime));
}

interface WasmServer extends common.WasmCommon {
    stats_inc_players_rejected_counter: () => void,
    register_new_player: (id: number) => void,
    unregister_player: (id: number) => void,
    process_message_on_server: (id: number, message: number) => boolean,
    tick: () => number,
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
        stats_inc_players_rejected_counter: wasm.instance.exports.stats_inc_players_rejected_counter as () => void,
        register_new_player: wasm.instance.exports.register_new_player as (id: number) => void,
        unregister_player: wasm.instance.exports.unregister_player as (id: number) => void,
        process_message_on_server: wasm.instance.exports.process_message_on_server as (id: number, message: number) => boolean,
        tick: wasm.instance.exports.tick as () => number,
    };
}

setTimeout(tick, 1000/SERVER_FPS);

console.log(`Listening to ws://0.0.0.0:${common.SERVER_PORT}`)
