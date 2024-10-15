import { readFileSync } from 'fs';
import { WebSocketServer } from 'ws';
import * as common from './common.mjs';
const SERVER_FPS = 60;
const wasmServer = await instantiateWasmServer('server.wasm');
const connections = new Map();
let idCounter = 0;
const wss = new WebSocketServer({ port: common.SERVER_PORT });
wss.on("connection", (ws, req) => {
    ws.binaryType = 'arraybuffer';
    const remoteAddressPtr = common.stringAsShortStringInWasm(wasmServer, req.socket.remoteAddress ?? "");
    const id = idCounter++;
    if (!wasmServer.register_new_player(id, remoteAddressPtr)) {
        ws.close();
        return;
    }
    connections.set(id, ws);
    ws.addEventListener("message", (event) => {
        if (!(event.data instanceof ArrayBuffer)) {
            throw new Error("binaryType of the client WebSocket must be 'arraybuffer'");
        }
        const eventDataPtr = common.arrayBufferAsMessageInWasm(wasmServer, event.data);
        if (!wasmServer.process_message_on_server(id, eventDataPtr)) {
            ws.close();
            return;
        }
    });
    ws.on("close", () => {
        wasmServer.unregister_player(id);
        connections.delete(id);
    });
});
function tick() {
    const tickTime = wasmServer.tick();
    setTimeout(tick, Math.max(0, 1000 / SERVER_FPS - tickTime));
}
function platform_write(buffer, buffer_len) {
    console.log(new TextDecoder().decode(new Uint8ClampedArray(wasmServer.memory.buffer, buffer, buffer_len)));
}
function platform_send_message(player_id, message) {
    if (message === 0)
        return 0;
    const connection = connections.get(player_id);
    if (connection === undefined)
        return 0;
    const size = new Uint32Array(wasmServer.memory.buffer, message, 1)[0];
    if (size === 0)
        return 0;
    connection.send(new Uint8Array(wasmServer.memory.buffer, message + common.UINT32_SIZE, size - common.UINT32_SIZE));
    return size;
}
async function instantiateWasmServer(path) {
    const wasm = await WebAssembly.instantiate(readFileSync(path), {
        "env": {
            platform_write,
            platform_send_message,
            platform_now_msecs: () => performance.now(),
            fmodf: (x, y) => x % y,
            memcmp: (ps1, ps2, n) => {
                const mem = new Uint8ClampedArray(wasmServer.memory.buffer);
                for (; n > 0 && mem[ps1] === mem[ps2]; n--, ps1++, ps2++)
                    ;
                return n > 0 ? mem[ps1] - mem[ps2] : 0;
            },
        },
    });
    const wasmCommon = common.makeWasmCommon(wasm);
    wasmCommon._initialize();
    return {
        ...wasmCommon,
        register_new_player: wasm.instance.exports.register_new_player,
        unregister_player: wasm.instance.exports.unregister_player,
        process_message_on_server: wasm.instance.exports.process_message_on_server,
        tick: wasm.instance.exports.tick,
    };
}
setTimeout(tick, 1000 / SERVER_FPS);
console.log(`Listening to ws://0.0.0.0:${common.SERVER_PORT}`);
//# sourceMappingURL=server.mjs.map