export const SERVER_PORT = 6970;
export const UINT32_SIZE = 4;
const SCREEN_FACTOR = 30;
const SCREEN_WIDTH = Math.floor(16 * SCREEN_FACTOR);
const SCREEN_HEIGHT = Math.floor(9 * SCREEN_FACTOR);
let game;
function renderDebugInfo(ctx, deltaTime, game) {
    const fontSize = 28;
    ctx.font = `${fontSize}px bold`;
    game.dts.push(deltaTime);
    if (game.dts.length > 60)
        game.dts.shift();
    const dtAvg = game.dts.reduce((a, b) => a + b, 0) / game.dts.length;
    const labels = [];
    labels.push(`FPS: ${Math.floor(1 / dtAvg)}`);
    switch (game.ws.readyState) {
        case WebSocket.CONNECTING:
            {
                labels.push('Connecting...');
            }
            break;
        case WebSocket.OPEN:
            {
                labels.push(`Ping: ${game.wasmClient.ping_msecs()}ms`);
                labels.push(`Players: ${game.wasmClient.players_count()}`);
            }
            break;
        case WebSocket.CLOSING:
        case WebSocket.CLOSED:
            {
                labels.push(`Offline`);
            }
            break;
    }
    const shadowOffset = fontSize * 0.06;
    const padding = 70;
    for (let i = 0; i < labels.length; ++i) {
        ctx.fillStyle = "black";
        ctx.fillText(labels[i], padding, padding + fontSize * i);
        ctx.fillStyle = "white";
        ctx.fillText(labels[i], padding + shadowOffset, padding - shadowOffset + fontSize * i);
    }
}
export function arrayBufferAsMessageInWasm(wasmClient, buffer) {
    const wasmBufferSize = buffer.byteLength + UINT32_SIZE;
    const wasmBufferPtr = wasmClient.allocate_temporary_buffer(wasmBufferSize);
    new DataView(wasmClient.memory.buffer, wasmBufferPtr, UINT32_SIZE).setUint32(0, wasmBufferSize, true);
    new Uint8ClampedArray(wasmClient.memory.buffer, wasmBufferPtr + UINT32_SIZE, wasmBufferSize - UINT32_SIZE).set(new Uint8ClampedArray(buffer));
    return wasmBufferPtr;
}
function createDisplay(wasmClient, backImageWidth, backImageHeight) {
    wasmClient.resize_display(backImageWidth, backImageHeight);
    const gameCanvas = document.getElementById("game");
    if (gameCanvas === null)
        throw new Error("No canvas with id `game` is found");
    const factor = 80;
    gameCanvas.width = 16 * factor;
    gameCanvas.height = 9 * factor;
    const ctx = gameCanvas.getContext("2d");
    if (ctx === null)
        throw new Error("2D context is not supported");
    ctx.imageSmoothingEnabled = false;
    const backCanvas = new OffscreenCanvas(backImageWidth, backImageHeight);
    const backCtx = backCanvas.getContext("2d");
    if (backCtx === null)
        throw new Error("2D context is not supported");
    backCtx.imageSmoothingEnabled = false;
    return {
        ctx,
        backCtx,
    };
}
function displaySwapBackImageData(display, wasmClient) {
    const backImageWidth = display.backCtx.canvas.width;
    const backImageHeight = display.backCtx.canvas.height;
    const backImagePixels = wasmClient.pixels_of_display();
    const backImageData = new Uint8ClampedArray(wasmClient.memory.buffer, backImagePixels, backImageWidth * backImageHeight * 4);
    display.backCtx.putImageData(new ImageData(backImageData, backImageWidth), 0, 0);
    display.ctx.drawImage(display.backCtx.canvas, 0, 0, display.ctx.canvas.width, display.ctx.canvas.height);
}
var AssetSound;
(function (AssetSound) {
    AssetSound[AssetSound["BOMB_BLAST"] = 0] = "BOMB_BLAST";
    AssetSound[AssetSound["BOMB_RICOCHET"] = 1] = "BOMB_RICOCHET";
    AssetSound[AssetSound["ITEM_PICKUP"] = 2] = "ITEM_PICKUP";
})(AssetSound || (AssetSound = {}));
async function instantiateWasmClient(url) {
    const wasm = await WebAssembly.instantiateStreaming(fetch(url), {
        "env": {
            "fmodf": (x, y) => x % y,
            "fminf": Math.min,
            "fmaxf": Math.max,
            "platform_atan2f": Math.atan2,
            "platform_random": Math.random,
            "platform_write": (buffer, buffer_len) => {
                console.log(new TextDecoder().decode(new Uint8ClampedArray(game.wasmClient.memory.buffer, buffer, buffer_len)));
            },
            "platform_is_offline_mode": () => game.ws.readyState != WebSocket.OPEN,
            "platform_play_sound": (sound, player_position_x, player_position_y, object_position_x, object_position_y) => {
                function clamp(value, min, max) {
                    return Math.min(Math.max(value, min), max);
                }
                const maxVolume = 1;
                const dx = player_position_x - object_position_x;
                const dy = player_position_y - object_position_y;
                const distanceToPlayer = Math.sqrt(dx * dx + dy * dy);
                switch (sound) {
                    case AssetSound.BOMB_BLAST:
                        game.assets.bombBlastSound.volume = clamp(maxVolume / distanceToPlayer, 0.0, 1.0);
                        game.assets.bombBlastSound.currentTime = 0;
                        game.assets.bombBlastSound.play();
                        break;
                    case AssetSound.BOMB_RICOCHET:
                        game.assets.bombRicochetSound.volume = clamp(maxVolume / distanceToPlayer, 0.0, 1.0);
                        game.assets.bombRicochetSound.currentTime = 0;
                        game.assets.bombRicochetSound.play();
                        break;
                    case AssetSound.ITEM_PICKUP:
                        game.assets.itemPickupSound.volume = clamp(maxVolume / distanceToPlayer, 0.0, 1.0);
                        game.assets.itemPickupSound.currentTime = 0;
                        game.assets.itemPickupSound.play();
                        break;
                }
            },
            platform_send_message: (message) => {
                if (message === 0)
                    return;
                if (game.ws.readyState !== WebSocket.OPEN)
                    return;
                const size = new Uint32Array(game.wasmClient.memory.buffer, message, 1)[0];
                if (size === 0)
                    return;
                game.ws.send(new Uint8Array(game.wasmClient.memory.buffer, message + UINT32_SIZE, size - UINT32_SIZE));
            },
            platform_now_msecs: () => performance.now(),
        }
    });
    const wasmClient = {
        wasm,
        memory: wasm.instance.exports.memory,
        _initialize: wasm.instance.exports._initialize,
        allocate_temporary_buffer: wasm.instance.exports.allocate_temporary_buffer,
        players_count: wasm.instance.exports.players_count,
        unregister_all_other_players: wasm.instance.exports.unregister_all_other_players,
        key_down: wasm.instance.exports.key_down,
        key_up: wasm.instance.exports.key_up,
        render_game: wasm.instance.exports.render_game,
        ping_msecs: wasm.instance.exports.ping_msecs,
        process_message: wasm.instance.exports.process_message,
        resize_display: wasm.instance.exports.resize_display,
        pixels_of_display: wasm.instance.exports.pixels_of_display,
    };
    wasmClient._initialize();
    return wasmClient;
}
async function createGame() {
    const wasmClient = await instantiateWasmClient("client.wasm");
    const itemPickupSound = new Audio("assets/sounds/bomb-pickup.ogg");
    const bombRicochetSound = new Audio("assets/sounds/ricochet.wav");
    const bombBlastSound = new Audio("assets/sounds/blast.ogg");
    const assets = {
        bombRicochetSound,
        itemPickupSound,
        bombBlastSound,
    };
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.hostname}:${SERVER_PORT}`);
    if (window.location.hostname === 'tsoding.github.io')
        ws.close();
    const display = createDisplay(wasmClient, SCREEN_WIDTH, SCREEN_HEIGHT);
    const game = { ws, assets, dts: [], wasmClient, display };
    ws.binaryType = 'arraybuffer';
    ws.addEventListener("close", (event) => {
        console.log("WEBSOCKET CLOSE", event);
        game.wasmClient.unregister_all_other_players();
    });
    ws.addEventListener("error", (event) => {
        console.log("WEBSOCKET ERROR", event);
    });
    ws.addEventListener("message", (event) => {
        if (!(event.data instanceof ArrayBuffer)) {
            console.error("Received bogus-amogus message from server. Expected binary data", event);
            ws?.close();
            return;
        }
        const eventDataPtr = arrayBufferAsMessageInWasm(wasmClient, event.data);
        if (!game.wasmClient.process_message(eventDataPtr)) {
            ws?.close();
            return;
        }
    });
    ws.addEventListener("open", (event) => {
        console.log("WEBSOCKET OPEN", event);
    });
    return game;
}
(async () => {
    game = await createGame();
    window.addEventListener("keydown", (e) => {
        if (!e.repeat)
            game.wasmClient.key_down(e.keyCode);
    });
    window.addEventListener("keyup", (e) => {
        if (!e.repeat)
            game.wasmClient.key_up(e.keyCode);
    });
    let prevTimestamp = 0;
    const frame = (timestamp) => {
        const deltaTime = (timestamp - prevTimestamp) / 1000;
        const time = timestamp / 1000;
        prevTimestamp = timestamp;
        game.wasmClient.render_game(deltaTime, time);
        displaySwapBackImageData(game.display, game.wasmClient);
        renderDebugInfo(game.display.ctx, deltaTime, game);
        window.requestAnimationFrame(frame);
    };
    window.requestAnimationFrame((timestamp) => {
        prevTimestamp = timestamp;
        window.requestAnimationFrame(frame);
    });
})();
//# sourceMappingURL=client.mjs.map