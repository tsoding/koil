import * as common from './common.mjs';
import {
    Vector2, Scene, Player,
    updatePlayer,
    SERVER_PORT,
    clamp, properMod
} from './common.mjs';

const NEAR_CLIPPING_PLANE = 0.1;
const FOV = Math.PI*0.5;
const SCREEN_FACTOR = 30;
const SCREEN_WIDTH = Math.floor(16*SCREEN_FACTOR);
const SCREEN_HEIGHT = Math.floor(9*SCREEN_FACTOR);
const BOMB_PARTICLE_COUNT = 50
const MINIMAP = false;
const SPRITE_ANGLES_COUNT = 8;
const CONTROL_KEYS: {[key: string]: common.Moving} = {
    'ArrowLeft'  : common.Moving.TurningLeft,
    'ArrowRight' : common.Moving.TurningRight,
    'ArrowUp'    : common.Moving.MovingForward,
    'ArrowDown'  : common.Moving.MovingBackward,
    'KeyA'       : common.Moving.TurningLeft,
    'KeyD'       : common.Moving.TurningRight,
    'KeyW'       : common.Moving.MovingForward,
    'KeyS'       : common.Moving.MovingBackward,
};

interface Camera {
    position: Vector2;
    direction: number;
    fovLeft: Vector2;
    fovRight: Vector2;
}

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
            labels.push(`Ping: ${game.ping.toFixed(2)}ms`);
            labels.push(`Players: ${game.players.size}`);
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
    minimap: WasmImage;
    backImage: WasmImage;
    zBufferPtr: number;
}

interface WasmClient extends common.WasmCommon {
    allocate_pixels: (width: number, height: number) => number,
    allocate_zbuffer: (width: number) => number,
    allocate_sprite_pool: () => number,
    reset_sprite_pool: (sprite_pool: number) => void,
    render_floor_and_ceiling: (pixels: number, pixels_width: number, pixels_height: number, position_x: number, position_y: number, direction: number) => void,
    render_column_of_wall: (display: number, display_width: number, display_height: number, zbuffer: number, cell: number, cell_width: number, cell_height: number, x: number, px: number, py: number, cx: number, cy: number) => void,
    render_walls: (display: number, display_width: number, display_height: number, zbuffer: number, wall: number, wall_width: number, wall_height: number, position_x: number, position_y: number, direction: number, scene: number, scene_width: number, scene_height: number) => void;
    render_minimap: (display: number, display_width: number, display_height: number,
                     camera_position_x: number, camera_position_y: number, camera_direction: number,
                     player_position_x: number, player_position_y: number,
                     scene: number, scene_width: number, scene_height: number,
                     sprite_pool: number) => void;
    cull_and_sort_sprites: (camera_position_x: number, camera_position_y: number, camera_direction: number, sprite_pool: number) => void;
    push_sprite: (sprite_pool: number,
                  image_pixels: number, image_width: number, image_height: number,
                  x: number, y: number, z: number,
                  scale: number,
                  crop_position_x: number, crop_position_y: number,
                  crop_size_x: number, crop_size_y: number) => void;
    render_sprites: (display: number, display_width: number, display_height: number, zbuffer: number, sprite_pool: number) => void,
    allocate_particle_pool: () => number,
    emit_particle: (source_x: number, source_y: number, source_z: number, particle_pool: number) => void,
    update_particles: (image_pixels: number, image_width: number, image_height: number, sprite_pool: number, deltaTime: number, scene: number, scene_width: number, scene_height: number, particle_pool: number) => void
    kill_all_items: (items: number) => void,
    verify_items_collected_batch_message: (message: number) => boolean,
    apply_items_collected_batch_message_to_level_items: (message: number, items: number) => boolean,
    verify_items_spawned_batch_message: (message: number) => boolean,
    apply_items_spawned_batch_message_to_level_items: (message: number, items: number) => boolean,
    render_items: (sprite_pool: number, items: number, time: number, key_image_pixels: number, key_image_width: number, key_image_height: number, bomb_image_pixels: number, bomb_image_width: number, bomb_image_height: number) => void,
    update_items_offline: (items: number, player_position_x: number, player_position_y: number) => void,
}

function createDisplay(ctx: CanvasRenderingContext2D, wasmClient: WasmClient, backImageWidth: number, backImageHeight: number): Display {
    const minimapWidth = backImageWidth*0.03;
    const minimapHeight = backImageHeight*0.03;
    const minimapPtr = wasmClient.allocate_pixels(minimapWidth, minimapHeight);
    const backImagePtr: number = wasmClient.allocate_pixels(backImageWidth, backImageHeight);
    const zBufferPtr: number = wasmClient.allocate_zbuffer(backImageWidth);
    const backCanvas = new OffscreenCanvas(backImageWidth, backImageHeight);
    const backCtx = backCanvas.getContext("2d");
    if (backCtx === null) throw new Error("2D context is not supported");
    backCtx.imageSmoothingEnabled = false;
    return {
        ctx,
        backCtx,
        backImage: {
            ptr: backImagePtr,
            width: backImageWidth,
            height: backImageHeight,
        },
        minimap: {
            ptr: minimapPtr,
            width: minimapWidth,
            height: minimapHeight,
        },
        zBufferPtr,
    };
}

function displaySwapBackImageData(display: Display, wasmClient: WasmClient) {
    const backImageData = new Uint8ClampedArray(wasmClient.memory.buffer, display.backImage.ptr, display.backImage.width*display.backImage.height*4);
    display.backCtx.putImageData(new ImageData(backImageData, display.backImage.width), 0, 0);
    display.ctx.drawImage(display.backCtx.canvas, 0, 0, display.ctx.canvas.width, display.ctx.canvas.height);
}

function updateCamera(player: Player, camera: Camera) {
    const halfFov = FOV*0.5;
    const fovLen = NEAR_CLIPPING_PLANE/Math.cos(halfFov);
    camera.position.copy(player.position);
    camera.direction = properMod(player.direction, 2*Math.PI);
    camera.fovLeft.setPolar(camera.direction-halfFov, fovLen).add(camera.position);
    camera.fovRight.setPolar(camera.direction+halfFov, fovLen).add(camera.position);
}

function updateItems(wasmClient: WasmClient, ws: WebSocket, spritePoolPtr: number, time: number, me: Player, itemsPtr: number, assets: Assets) {
    // Rendering the items as sprites
    wasmClient.render_items(spritePoolPtr, itemsPtr, time, assets.keyImage.ptr, assets.keyImage.width, assets.keyImage.height, assets.bombImage.ptr, assets.bombImage.width, assets.bombImage.height);

    // Offline mode. Updating items state without asking the server.
    if (ws.readyState != WebSocket.OPEN) {
        wasmClient.update_items_offline(itemsPtr, me.position.x, me.position.y);
    }
}

function playSound(sound: HTMLAudioElement, playerPosition: Vector2, objectPosition: Vector2) {
    const maxVolume = 1;
    const distanceToPlayer = objectPosition.distanceTo(playerPosition);
    sound.volume = clamp(maxVolume / distanceToPlayer, 0.0, 1.0);
    sound.currentTime = 0;
    sound.play();
}

function explodeBomb(wasmClient: WasmClient, bomb: common.Bomb, player: Player, assets: Assets, particlesPtr: number) {
    playSound(assets.bombBlastSound, player.position, bomb.position.clone2());
    for (let i = 0; i < BOMB_PARTICLE_COUNT; ++i) {
        wasmClient.emit_particle(bomb.position.x, bomb.position.y, bomb.position.z, particlesPtr);
    }
}

function updateBombs(wasmClient: WasmClient, ws: WebSocket, spritePoolPtr: number, player: Player, bombs: Array<common.Bomb>, particlesPtr: number, scene: Scene, deltaTime: number, assets: Assets) {
    for (let bomb of bombs) {
        if (bomb.lifetime > 0) {
            wasmClient.push_sprite(spritePoolPtr, assets.bombImage.ptr, assets.bombImage.width, assets.bombImage.height, bomb.position.x, bomb.position.y, bomb.position.z, common.BOMB_SCALE, 0, 0, assets.bombImage.width, assets.bombImage.height);
            if (common.updateBomb(wasmClient, bomb, scene, deltaTime)) {
                playSound(assets.bombRicochetSound, player.position, bomb.position.clone2());
            }

            if (ws.readyState != WebSocket.OPEN && bomb.lifetime <= 0) {
                explodeBomb(wasmClient, bomb, player, assets, particlesPtr)
            }
        }
    }
}

interface Assets {
    wallImage: WasmImage,
    keyImage: WasmImage,
    bombImage: WasmImage,
    playerImage: WasmImage,
    particleImage: WasmImage,
    nullImage: WasmImage,
    bombRicochetSound: HTMLAudioElement,
    itemPickupSound: HTMLAudioElement,
    bombBlastSound: HTMLAudioElement
}

interface Game {
    camera: Camera,
    ws: WebSocket,
    me: Player,
    players: Map<number, Player>,
    spritePoolPtr: number,
    particlesPtr: number,
    assets: Assets,
    ping: number,
    dts: number[],
    level: common.Level,
    wasmClient: WasmClient,
}

async function loadImage(url: string): Promise<HTMLImageElement> {
    const image = new Image();
    image.src = url;
    return new Promise((resolve, reject) => {
        image.onload = () => resolve(image);
        image.onerror = reject;
    });
}

class WasmImage {
    ptr: number;
    width: number;
    height: number;
    constructor(ptr: number, width: number, height: number) {
        this.ptr = ptr;
        this.width = width;
        this.height = height;
    }
}

async function loadWasmImage(wasmClient: WasmClient, url: string): Promise<WasmImage> {
    const image = await loadImage(url);
    const canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("2d canvas is not supported");
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, image.width, image.height);
    const ptr = wasmClient.allocate_pixels(image.width, image.height);
    new Uint8ClampedArray(wasmClient.memory.buffer, ptr, image.width*image.height*4).set(imageData.data);
    return new WasmImage(ptr, image.width, image.height);
}

async function instantiateWasmClient(url: string): Promise<WasmClient> {
    const wasm = await WebAssembly.instantiateStreaming(fetch(url), {
        // TODO: add js_write
        "env": common.make_environment({
            "fmodf": (x: number, y: number) => x%y,
            "fminf": Math.min,
            "fmaxf": Math.max,
            "js_random": Math.random,
        })
    })

    const wasmCommon = common.makeWasmCommon(wasm);
    wasmCommon._initialize();

    return {
        ...wasmCommon,
        allocate_pixels: wasm.instance.exports.allocate_pixels as (width: number, height: number) => number,
        allocate_zbuffer: wasm.instance.exports.allocate_zbuffer as (width: number) => number,
        allocate_sprite_pool: wasm.instance.exports.allocate_sprite_pool as () => number,
        reset_sprite_pool: wasm.instance.exports.reset_sprite_pool as (sprite_pool: number) => void,
        render_floor_and_ceiling: wasm.instance.exports.render_floor_and_ceiling as (position_x: number, position_y: number, direction: number) => void,
        render_column_of_wall: wasm.instance.exports.render_column_of_wall as (display: number, display_width: number, display_height: number, zbuffer: number, cell: number, cell_width: number, cell_height: number, x: number, px: number, py: number, cx: number, cy: number) => void,
        render_walls: wasm.instance.exports.render_walls as (display: number, display_width: number, display_height: number, zbuffer: number, wall: number, wall_width: number, wall_height: number, position_x: number, position_y: number, direction: number, scene: number, scene_width: number, scene_height: number) => void,
        render_minimap: wasm.instance.exports.render_minimap as (display: number, display_width: number, display_height: number, camera_position_x: number, camera_position_y: number, camera_direction: number, player_position_x: number, player_position_y: number, scene: number, scene_width: number, scene_height: number, sprite_pool: number) => void,
        cull_and_sort_sprites: wasm.instance.exports.cull_and_sort_sprites as (camera_position_x: number, camera_position_y: number, camera_direction: number, sprite_pool: number) => void,
        push_sprite: wasm.instance.exports.push_sprite as (sprite_pool: number, image_pixels: number, image_width: number, image_height: number, x: number, y: number, z: number, scale: number, crop_position_x: number, crop_position_y: number, crop_size_x: number, crop_size_y: number) => void,
        render_sprites: wasm.instance.exports.render_sprites as (display: number, display_width: number, display_height: number, zbuffer: number, sprite_pool: number) => void,
        allocate_particle_pool: wasm.instance.exports.allocate_particle_pool as () => number,
        emit_particle: wasm.instance.exports.emit_particle as (source_x: number, source_y: number, source_z: number, particle_pool: number) => void,
        update_particles: wasm.instance.exports.update_particles as (image_pixels: number, image_width: number, image_height: number, sprite_pool: number, deltaTime: number, scene: number, scene_width: number, scene_height: number, particle_pool: number) => void,
        kill_all_items: wasm.instance.exports.kill_all_items as (items: number) => void,
        verify_items_collected_batch_message: wasm.instance.exports.verify_items_collected_batch_message as (message: number) => boolean,
        apply_items_collected_batch_message_to_level_items: wasm.instance.exports.apply_items_collected_batch_message_to_level_items as (message: number, items: number) => boolean,
        verify_items_spawned_batch_message: wasm.instance.exports.verify_items_spawned_batch_message as (message: number) => boolean,
        apply_items_spawned_batch_message_to_level_items: wasm.instance.exports.apply_items_spawned_batch_message_to_level_items as (message: number, items: number) => boolean,
        render_items: wasm.instance.exports.render_items as (sprite_pool: number, items: number, time: number, key_image_pixels: number, key_image_width: number, key_image_height: number, bomb_image_pixels: number, bomb_image_width: number, bomb_image_height: number) => void,
        update_items_offline: wasm.instance.exports.update_items_offline as (items: number, player_position_x: number, player_position_y: number) => void,
    };
}

function arrayBufferAsMessageInWasm(wasmClient: WasmClient, buffer: ArrayBuffer): number {
    const wasmBufferSize = buffer.byteLength + common.UINT32_SIZE;
    const wasmBufferPtr = wasmClient.allocate_temporary_buffer(wasmBufferSize);
    new DataView(wasmClient.memory.buffer, wasmBufferPtr, common.UINT32_SIZE).setUint32(0, wasmBufferSize, true);
    new Uint8ClampedArray(wasmClient.memory.buffer, wasmBufferPtr + common.UINT32_SIZE, wasmBufferSize - common.UINT32_SIZE).set(new Uint8ClampedArray(buffer));
    return wasmBufferPtr;
}

async function createGame(): Promise<Game> {
    const wasmClient = await instantiateWasmClient("client.wasm");

    const [
        wallImage,
        keyImage,
        bombImage,
        playerImage,
        particleImage,
        nullImage,
    ] = await Promise.all([
        loadWasmImage(wasmClient, "assets/images/custom/wall.png"),
        loadWasmImage(wasmClient, "assets/images/custom/key.png"),
        loadWasmImage(wasmClient, "assets/images/custom/bomb.png"),
        loadWasmImage(wasmClient, "assets/images/custom/player.png"),
        loadWasmImage(wasmClient, "assets/images/custom/particle.png"),
        loadWasmImage(wasmClient, "assets/images/custom/null.png"),
    ]);

    const itemPickupSound = new Audio("assets/sounds/bomb-pickup.ogg");
    const bombRicochetSound = new Audio("assets/sounds/ricochet.wav");
    const bombBlastSound = new Audio("assets/sounds/blast.ogg");
    const assets = {
        wallImage,
        keyImage,
        bombImage,
        playerImage,
        particleImage,
        nullImage,
        bombRicochetSound,
        itemPickupSound,
        bombBlastSound,
    }

    const particlesPtr = wasmClient.allocate_particle_pool();
    const spritePoolPtr = wasmClient.allocate_sprite_pool();

    const players = new Map<number, Player>();

    const camera: Camera = {
        position: new Vector2(),
        direction: 0,
        fovLeft: new Vector2(),
        fovRight: new Vector2(),
    };
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
    const me = {
        id: 0,
        position: new Vector2(),
        direction: 0,
        moving: 0,
        hue: 0,
    };
    const level = common.createLevel(wasmClient);
    // TODO: make a better initialization of the items on client
    // The problem is that on the server all the items must be alive,
    // but on the client we first need them to be dead so we can recieve
    // the actual state of the items from the server.
    wasmClient.kill_all_items(level.itemsPtr);
    const game: Game = {
        camera, ws, me, ping: 0, players, particlesPtr, assets, spritePoolPtr, dts: [],
        level, wasmClient
    };

    ws.binaryType = 'arraybuffer';
    ws.addEventListener("close", (event) => {
        console.log("WEBSOCKET CLOSE", event)
        game.players.clear();
    });
    ws.addEventListener("error", (event) => {
        // TODO: reconnect on errors
        console.log("WEBSOCKET ERROR", event)
    });
    ws.addEventListener("message", (event) => {
        // console.log('Received message', event);
        if (!(event.data instanceof ArrayBuffer)) {
            console.error("Received bogus-amogus message from server. Expected binary data", event);
            ws?.close();
        }
        const eventDataPtr = arrayBufferAsMessageInWasm(wasmClient, event.data);
        const view = new DataView(event.data);
        if (common.HelloStruct.verify(view)) {
            game.me = {
                id: common.HelloStruct.id.read(view),
                position: new Vector2(common.HelloStruct.x.read(view), common.HelloStruct.y.read(view)),
                direction: common.HelloStruct.direction.read(view),
                moving: 0,
                hue: common.HelloStruct.hue.read(view)/256*360,
            }
            players.set(game.me.id, game.me)
        } else if (common.PlayersJoinedHeaderStruct.verify(view)) {
            const count = common.PlayersJoinedHeaderStruct.count(view);
            for (let i = 0; i < count; ++i) {
                const playerView = common.PlayersJoinedHeaderStruct.item(event.data, i);
                const id = common.PlayerStruct.id.read(playerView);
                const player = players.get(id);
                if (player !== undefined) {
                    player.position.x = common.PlayerStruct.x.read(playerView);
                    player.position.y = common.PlayerStruct.y.read(playerView);
                    player.direction = common.PlayerStruct.direction.read(playerView);
                    player.moving = common.PlayerStruct.moving.read(playerView);
                    player.hue = common.PlayerStruct.hue.read(playerView)/256*360;
                } else {
                    const x = common.PlayerStruct.x.read(playerView);
                    const y = common.PlayerStruct.y.read(playerView);
                    players.set(id, {
                        id,
                        position: new Vector2(x, y),
                        direction: common.PlayerStruct.direction.read(playerView),
                        moving: common.PlayerStruct.moving.read(playerView),
                        hue: common.PlayerStruct.hue.read(playerView)/256*360,
                    });
                }
            }
        } else if (common.PlayersLeftHeaderStruct.verify(view)) {
            const count = common.PlayersLeftHeaderStruct.count(view);
            for (let i = 0; i < count; ++i) {
                const id = common.PlayersLeftHeaderStruct.item(event.data, i).getUint32(0, true);
                players.delete(id);
            }
        } else if (common.PlayersMovingHeaderStruct.verify(view)) {
            const count = common.PlayersMovingHeaderStruct.count(view);
            for (let i = 0; i < count; ++i) {
                const playerView = common.PlayersMovingHeaderStruct.item(event.data, i);

                const id = common.PlayerStruct.id.read(playerView);
                const player = players.get(id);
                if (player === undefined) {
                    console.error(`Received bogus-amogus message from server. We don't know anything about player with id ${id}`)
                    ws?.close();
                    return;
                }
                player.moving = common.PlayerStruct.moving.read(playerView);
                player.position.x = common.PlayerStruct.x.read(playerView);
                player.position.y = common.PlayerStruct.y.read(playerView);
                player.direction = common.PlayerStruct.direction.read(playerView);
            }
        } else if (common.PongStruct.verify(view)) {
            game.ping = performance.now() - common.PongStruct.timestamp.read(view);
        } else if (wasmClient.verify_items_collected_batch_message(eventDataPtr)) {
            if (!wasmClient.apply_items_collected_batch_message_to_level_items(eventDataPtr, game.level.itemsPtr)) {
                ws?.close();
                return;
            }
        } else if (wasmClient.verify_items_spawned_batch_message(eventDataPtr)) {
            if (!wasmClient.apply_items_spawned_batch_message_to_level_items(eventDataPtr, game.level.itemsPtr)) {
                ws?.close();
                return;
            }
        } else if (common.BombsSpawnedHeaderStruct.verify(view)) {
            const count = common.BombsSpawnedHeaderStruct.count(view);

            for (let index = 0; index < count; ++index) {
                const bombSpawnedView = common.BombsSpawnedHeaderStruct.item(event.data, index);
                const bombIndex = common.BombSpawnedStruct.bombIndex.read(bombSpawnedView);
                if (!(0 <= bombIndex && bombIndex < game.level.bombs.length)) {
                    console.error(`Received bogus-amogus BombSpawned message from server. Invalid index ${bombIndex}`);
                    ws?.close();
                    return;
                }
                game.level.bombs[bombIndex].lifetime = common.BombSpawnedStruct.lifetime.read(bombSpawnedView);
                game.level.bombs[bombIndex].position.x = common.BombSpawnedStruct.x.read(bombSpawnedView);
                game.level.bombs[bombIndex].position.y = common.BombSpawnedStruct.y.read(bombSpawnedView);
                game.level.bombs[bombIndex].position.z = common.BombSpawnedStruct.z.read(bombSpawnedView);
                game.level.bombs[bombIndex].velocity.x = common.BombSpawnedStruct.dx.read(bombSpawnedView);
                game.level.bombs[bombIndex].velocity.y = common.BombSpawnedStruct.dy.read(bombSpawnedView);
                game.level.bombs[bombIndex].velocity.z = common.BombSpawnedStruct.dz.read(bombSpawnedView);
            }
        } else if (common.BombsExplodedHeaderStruct.verify(view)) {
            const count = common.BombsExplodedHeaderStruct.count(view);

            for (let index = 0; index < count; ++index) {
                const bombExplodedView = common.BombsExplodedHeaderStruct.item(event.data, index);
                const bombIndex = common.BombExplodedStruct.bombIndex.read(bombExplodedView);
                if (!(0 <= bombIndex && bombIndex < game.level.bombs.length)) {
                    console.error(`Received bogus-amogus BombExploded message from server. Invalid index ${bombIndex}`);
                    ws?.close();
                    return;
                }
                game.level.bombs[bombIndex].lifetime = 0.0;
                game.level.bombs[bombIndex].position.x = common.BombExplodedStruct.x.read(bombExplodedView);
                game.level.bombs[bombIndex].position.y = common.BombExplodedStruct.y.read(bombExplodedView);
                game.level.bombs[bombIndex].position.z = common.BombExplodedStruct.z.read(bombExplodedView);
                explodeBomb(wasmClient, level.bombs[bombIndex], me, assets, particlesPtr);
            }
        } else {
            console.error("Received bogus-amogus message from server.", view)
            ws?.close();
        }
    });
    ws.addEventListener("open", (event) => {
        console.log("WEBSOCKET OPEN", event)
    });

    return game;
}

function spriteAngleIndex(cameraPosition: Vector2, entity: Player): number {
    return Math.floor(properMod(properMod(entity.direction, 2*Math.PI) - properMod(entity.position.clone().sub(cameraPosition).angle(), 2*Math.PI) - Math.PI + Math.PI/8, 2*Math.PI)/(2*Math.PI)*SPRITE_ANGLES_COUNT);
}

function renderGame(display: Display, deltaTime: number, time: number, game: Game) {
    game.wasmClient.reset_sprite_pool(game.spritePoolPtr);

    game.players.forEach((player) => {
        if (player !== game.me) updatePlayer(game.wasmClient, player, game.level.scene, deltaTime)
    });
    updatePlayer(game.wasmClient, game.me, game.level.scene, deltaTime);
    updateCamera(game.me, game.camera);
    updateItems(game.wasmClient, game.ws, game.spritePoolPtr, time, game.me, game.level.itemsPtr, game.assets);
    updateBombs(game.wasmClient, game.ws, game.spritePoolPtr, game.me, game.level.bombs, game.particlesPtr, game.level.scene, deltaTime, game.assets);
    game.wasmClient.update_particles(game.assets.particleImage.ptr, game.assets.particleImage.width, game.assets.particleImage.height, game.spritePoolPtr, deltaTime, game.level.scene.wallsPtr, game.level.scene.width, game.level.scene.height, game.particlesPtr);

    game.players.forEach((player) => {
        if (player !== game.me) {
            const index = spriteAngleIndex(game.camera.position, player);
            game.wasmClient.push_sprite(game.spritePoolPtr, game.assets.playerImage.ptr, game.assets.playerImage.width, game.assets.playerImage.height, player.position.x, player.position.y, 1, 1, 55*index, 0, 55, 55);
        }
    })

    game.wasmClient.render_floor_and_ceiling(display.backImage.ptr, display.backImage.width, display.backImage.height, game.camera.position.x, game.camera.position.y, game.camera.direction);
    game.wasmClient.render_walls(display.backImage.ptr, display.backImage.width, display.backImage.height, display.zBufferPtr, game.assets.wallImage.ptr, game.assets.wallImage.width, game.assets.wallImage.height, game.camera.position.x, game.camera.position.y, game.camera.direction, game.level.scene.wallsPtr, game.level.scene.width, game.level.scene.height);
    game.wasmClient.cull_and_sort_sprites(game.camera.position.x, game.camera.position.y, game.camera.direction, game.spritePoolPtr)
    game.wasmClient.render_sprites(display.backImage.ptr, display.backImage.width, display.backImage.height, display.zBufferPtr, game.spritePoolPtr)
    displaySwapBackImageData(display, game.wasmClient);

    if (MINIMAP) game.wasmClient.render_minimap(display.minimap.ptr, display.minimap.width, display.minimap.height, game.camera.position.x, game.camera.position.y, game.camera.direction, game.me.position.x, game.me.position.y, game.level.scene.wallsPtr, game.level.scene.width, game.level.scene.height, game.spritePoolPtr);
    renderDebugInfo(display.ctx, deltaTime, game);
}

(async () => {
    const gameCanvas = document.getElementById("game") as (HTMLCanvasElement | null);
    if (gameCanvas === null) throw new Error("No canvas with id `game` is found");
    const factor = 80;
    gameCanvas.width = 16*factor;
    gameCanvas.height = 9*factor;
    const ctx = gameCanvas.getContext("2d");
    if (ctx === null) throw new Error("2D context is not supported");
    ctx.imageSmoothingEnabled = false;

    const game = await createGame();
    const display = createDisplay(ctx, game.wasmClient, SCREEN_WIDTH, SCREEN_HEIGHT);

    window.addEventListener("keydown", (e) => {
        if (!e.repeat) {
            const direction = CONTROL_KEYS[e.code];
            if (direction !== undefined) {
                if (game.ws.readyState === WebSocket.OPEN) {
                    const view = new DataView(new ArrayBuffer(common.AmmaMovingStruct.size));
                    common.AmmaMovingStruct.kind.write(view, common.MessageKind.AmmaMoving);
                    common.AmmaMovingStruct.start.write(view, 1);
                    common.AmmaMovingStruct.direction.write(view, direction);
                    game.ws.send(view);
                } else {
                    game.me.moving |= 1<<direction;
                }
            } else if (e.code === 'Space') {
                if (game.ws.readyState === WebSocket.OPEN) {
                    const view = new DataView(new ArrayBuffer(common.AmmaThrowingStruct.size));
                    common.AmmaThrowingStruct.kind.write(view, common.MessageKind.AmmaThrowing);
                    game.ws.send(view);
                } else {
                    common.throwBomb(game.me, game.level.bombs);
                }
            }
        }
    });
    // TODO: When the window loses the focus, reset all the controls
    window.addEventListener("keyup", (e) => {
        if (!e.repeat) {
            const direction = CONTROL_KEYS[e.code];
            if (direction !== undefined) {
                if (game.ws.readyState === WebSocket.OPEN) {
                    const view = new DataView(new ArrayBuffer(common.AmmaMovingStruct.size));
                    common.AmmaMovingStruct.kind.write(view, common.MessageKind.AmmaMoving);
                    common.AmmaMovingStruct.start.write(view, 0);
                    common.AmmaMovingStruct.direction.write(view, direction);
                    game.ws.send(view);
                } else {
                    game.me.moving &= ~(1<<direction);
                }
            }
        }
    });

    const PING_COOLDOWN = 60;
    let prevTimestamp = 0;
    let pingCooldown = PING_COOLDOWN;
    const frame = (timestamp: number) => {
        const deltaTime = (timestamp - prevTimestamp)/1000;
        const time = timestamp/1000;
        prevTimestamp = timestamp;
        renderGame(display, deltaTime, time, game);
        if (game.ws.readyState == WebSocket.OPEN) {
            pingCooldown -= 1;
            if (pingCooldown <= 0) {
                const view = new DataView(new ArrayBuffer(common.PingStruct.size));
                common.PingStruct.kind.write(view, common.MessageKind.Ping);
                common.PingStruct.timestamp.write(view, performance.now());
                game.ws.send(view);
                pingCooldown = PING_COOLDOWN;
            }
        }
        game.wasmClient.reset_temp_mark();
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
// TODO: Load assets asynchronously
//   While a texture is loading, replace it with a color tile.
// TODO: Mobile controls
// TODO: "magnet" items into the player
// TODO: Blast particles should fade out as they age
// TODO: Bomb collision should take into account the bomb's size
// TODO: Try lighting with normal maps that come with some of the assets
// TODO: Try cel shading the walls (using normals and stuff)
// TODO: sound don't mix properly
//   Right now same sounds are just stopped and replaced instantly. Which generally does not sound good.
//   We need to fix them properly.
//   Consider looking into Web Audio API https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
