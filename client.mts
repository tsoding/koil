import * as common from './common.mjs';
import {SERVER_PORT} from './common.mjs';

const SCREEN_FACTOR = 30;
const SCREEN_WIDTH = Math.floor(16*SCREEN_FACTOR);
const SCREEN_HEIGHT = Math.floor(9*SCREEN_FACTOR);

let game: Game;

function renderDebugInfo(ctx: CanvasRenderingContext2D, deltaTime: number, game: Game) {
    const fontSize = 28;
    ctx.font = `${fontSize}px bold`

    game.dts.push(deltaTime);
    if (game.dts.length > 60) // can be any number of frames
        game.dts.shift();

    const dtAvg = game.dts.reduce((a, b) => a + b, 0)/game.dts.length;

    const labels = [];
    labels.push(`FPS: ${Math.floor(1/dtAvg)}`)
    switch (game.ws.readyState) {
        case WebSocket.CONNECTING: {
            labels.push('Connecting...');
        } break;
        case WebSocket.OPEN: {
            labels.push(`Ping: ${game.wasmClient.ping_msecs()}ms`);
            labels.push(`Players: ${game.wasmClient.players_count()}`);
        } break;
        case WebSocket.CLOSING:
        case WebSocket.CLOSED: {
            labels.push(`Offline`);
        } break;
    }

    const shadowOffset = fontSize*0.06
    const padding = 70
    for (let i = 0; i < labels.length; ++i) {
        ctx.fillStyle = "black"
        ctx.fillText(labels[i], padding, padding + fontSize*i);
        ctx.fillStyle = "white"
        ctx.fillText(labels[i], padding + shadowOffset, padding - shadowOffset + fontSize*i);
    }
}

interface Display {
    ctx: CanvasRenderingContext2D;
    backCtx: OffscreenCanvasRenderingContext2D;
}

interface WasmClient extends common.WasmCommon {
    players_count: () => number,
    unregister_all_other_players: () => void,
    key_down: (key_code: number) => void,
    key_up: (key_code: number) => void,
    // TODO: render_game() should be actually called something like tick() cause that's what it is
    render_game: (delta_time: number, time: number) => void,
    ping_msecs: () => number,
    process_message: (message: number) => boolean,
    resize_display: (width: number, height: number) => void,
    pixels_of_display: () => number,
}

function createDisplay(wasmClient: WasmClient, backImageWidth: number, backImageHeight: number): Display {
    wasmClient.resize_display(backImageWidth, backImageHeight);

    const gameCanvas = document.getElementById("game") as (HTMLCanvasElement | null);
    if (gameCanvas === null) throw new Error("No canvas with id `game` is found");
    const factor = 80;
    gameCanvas.width = 16*factor;
    gameCanvas.height = 9*factor;
    const ctx = gameCanvas.getContext("2d");
    if (ctx === null) throw new Error("2D context is not supported");
    ctx.imageSmoothingEnabled = false;

    const backCanvas = new OffscreenCanvas(backImageWidth, backImageHeight);
    const backCtx = backCanvas.getContext("2d");
    if (backCtx === null) throw new Error("2D context is not supported");
    backCtx.imageSmoothingEnabled = false;
    return {
        ctx,
        backCtx,
    };
}

function displaySwapBackImageData(display: Display, wasmClient: WasmClient) {
    const backImageWidth = display.backCtx.canvas.width;
    const backImageHeight = display.backCtx.canvas.height;
    const backImagePixels = wasmClient.pixels_of_display();
    const backImageData = new Uint8ClampedArray(wasmClient.memory.buffer, backImagePixels, backImageWidth*backImageHeight*4);
    display.backCtx.putImageData(new ImageData(backImageData, backImageWidth), 0, 0);
    display.ctx.drawImage(display.backCtx.canvas, 0, 0, display.ctx.canvas.width, display.ctx.canvas.height);
}

// TODO: bake sounds into client.wasm same way we do with pictures
interface Assets {
    bombRicochetSound: HTMLAudioElement,
    itemPickupSound: HTMLAudioElement,
    bombBlastSound: HTMLAudioElement
}

interface Game {
    ws: WebSocket,
    assets: Assets,
    dts: number[],
    wasmClient: WasmClient,
    display: Display,
}

// WARNING! Must be synchronized with AssetSound in client.c3
enum AssetSound {
    BOMB_BLAST,
    BOMB_RICOCHET,
    ITEM_PICKUP,
}

async function instantiateWasmClient(url: string): Promise<WasmClient> {
    const wasm = await WebAssembly.instantiateStreaming(fetch(url), {
        "env": {
            "fmodf": (x: number, y: number) => x%y,
            "fminf": Math.min,
            "fmaxf": Math.max,
            "platform_atan2f": Math.atan2,
            "platform_random": Math.random,
            // NOTE: This implicitly adds newline, but given how we using this
            // function in client.c3 it's actually fine. This function is called
            // once per io::printn() anyway.
            "platform_write": (buffer: number, buffer_len: number) => {
                console.log(new TextDecoder().decode(new Uint8ClampedArray(game.wasmClient.memory.buffer, buffer, buffer_len)));
            },
            "platform_is_offline_mode": () => game.ws.readyState != WebSocket.OPEN,
            "platform_play_sound": (sound: number, player_position_x: number, player_position_y: number, object_position_x: number, object_position_y: number) => {
                function clamp(value: number, min: number, max: number) {
                    return Math.min(Math.max(value, min), max);
                }

                const maxVolume = 1;
                const dx = player_position_x - object_position_x;
                const dy = player_position_y - object_position_y;
                const distanceToPlayer = Math.sqrt(dx*dx + dy*dy);
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
            platform_send_message: (message: number) => {
                if (message === 0) return;  // null message
                if (game.ws.readyState !== WebSocket.OPEN) return; // offline
                const size = new Uint32Array(game.wasmClient.memory.buffer, message, 1)[0];
                if (size === 0) return;     // empty emssage
                game.ws.send(new Uint8Array(game.wasmClient.memory.buffer, message + common.UINT32_SIZE, size - common.UINT32_SIZE));
            },
            platform_now_msecs: () => performance.now(),
        }
    })

    const wasmCommon = common.makeWasmCommon(wasm);
    wasmCommon._initialize();

    return {
        ...wasmCommon,
        players_count: wasm.instance.exports.players_count as () => number,
        unregister_all_other_players: wasm.instance.exports.unregister_all_other_players as () => void,
        key_down: wasm.instance.exports.key_down as (key_code: number) => void,
        key_up: wasm.instance.exports.key_up as (key_code: number) => void,
        render_game: wasm.instance.exports.render_game as (delta_time: number, time: number) => void,
        ping_msecs: wasm.instance.exports.ping_msecs as () => number,
        process_message: wasm.instance.exports.process_message as (message: number) => boolean,
        resize_display: wasm.instance.exports.resize_display as (width: number, height: number) => void,
        pixels_of_display: wasm.instance.exports.pixels_of_display as () => number,
    };
}

async function createGame(): Promise<Game> {
    const wasmClient = await instantiateWasmClient("client.wasm");

    const itemPickupSound = new Audio("assets/sounds/bomb-pickup.ogg");
    const bombRicochetSound = new Audio("assets/sounds/ricochet.wav");
    const bombBlastSound = new Audio("assets/sounds/blast.ogg");
    const assets = {
        bombRicochetSound,
        itemPickupSound,
        bombBlastSound,
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.hostname}:${SERVER_PORT}`);
    // HACK: This application is deployed to GitHub Pages for the demo
    // purposes. Unfortunately, GitHub Pages only allow hosting static
    // assets, so we can only operate in Offline Mode. At the same
    // time, tsoding.github.io accepts WebSocket connection on the
    // port 6970 and later times out on the shandshake which results
    // in the client displaying "Connecting..." for the whole time,
    // which does not look good in the demo. So if we are on
    // tsoding.github.io we just instantly close the connection.
    if (window.location.hostname === 'tsoding.github.io') ws.close();
    const display = createDisplay(wasmClient, SCREEN_WIDTH, SCREEN_HEIGHT);
    const game: Game = {ws, assets, dts: [], wasmClient, display};

    ws.binaryType = 'arraybuffer';
    ws.addEventListener("close", (event) => {
        console.log("WEBSOCKET CLOSE", event)
        game.wasmClient.unregister_all_other_players();
    });
    ws.addEventListener("error", (event) => {
        // TODO: reconnect on errors
        console.log("WEBSOCKET ERROR", event)
    });
    ws.addEventListener("message", (event) => {
        if (!(event.data instanceof ArrayBuffer)) {
            console.error("Received bogus-amogus message from server. Expected binary data", event);
            ws?.close();
            return;
        }
        const eventDataPtr = common.arrayBufferAsMessageInWasm(wasmClient, event.data);
        // console.log(`Received message from server`, new Uint8ClampedArray(event.data));
        if (!game.wasmClient.process_message(eventDataPtr)) {
            ws?.close();
            return;
        }
    });
    ws.addEventListener("open", (event) => {
        console.log("WEBSOCKET OPEN", event)
    });

    return game;
}

(async () => {
    game = await createGame();

    window.addEventListener("keydown", (e) => {
        if (!e.repeat) game.wasmClient.key_down(e.keyCode);
    });
    // TODO: When the window loses the focus, reset all the controls
    window.addEventListener("keyup", (e) => {
        if (!e.repeat) game.wasmClient.key_up(e.keyCode);
    });

    let prevTimestamp = 0;
    const frame = (timestamp: number) => {
        const deltaTime = (timestamp - prevTimestamp)/1000;
        const time = timestamp/1000;
        prevTimestamp = timestamp;

        game.wasmClient.render_game(deltaTime, time);
        displaySwapBackImageData(game.display, game.wasmClient);
        renderDebugInfo(game.display.ctx, deltaTime, game);

        window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame((timestamp) => {
        prevTimestamp = timestamp;
        window.requestAnimationFrame(frame);
    });
})();
// TODO: bring hotreloading back
//   - hot reloading should not break if the game crashes
//   - hot reload assets as well
// TODO: Mobile controls
// TODO: Sound don't mix properly
//   Right now same sounds are just stopped and replaced instantly. Which generally does not sound good.
//   We need to fix them properly.
//   Consider looking into Web Audio API https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
