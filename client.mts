import * as common from './common.mjs';
import {
    Vector2, Vector3, Scene, Player,
    updatePlayer,
    SERVER_PORT,
    clamp, properMod
} from './common.mjs';

const NEAR_CLIPPING_PLANE = 0.1;
const FOV = Math.PI*0.5;

const SCREEN_FACTOR = 30;
const SCREEN_WIDTH = Math.floor(16*SCREEN_FACTOR);
const SCREEN_HEIGHT = Math.floor(9*SCREEN_FACTOR);

const ITEM_FREQ = 0.7;
const ITEM_AMP = 0.07;

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

interface SpritePool {
    ptr: number,
}

function createSpritePool(wasmClient: WasmClient): SpritePool {
    const ptr = wasmClient.allocate_sprite_pool();
    return {ptr};
}

interface Camera {
    position: Vector2;
    direction: number;
    fovLeft: Vector2;
    fovRight: Vector2;
}

function renderMinimap(wasmClient: WasmClient, display: Display, camera: Camera, player: Player, scene: Scene, spritePool: SpritePool) {
    wasmClient.render_minimap(display.minimap.ptr, display.minimap.width, display.minimap.height,
                              camera.position.x, camera.position.y, camera.direction,
                              player.position.x, player.position.y,
                              scene.wallsPtr, scene.width, scene.height,
                              spritePool.ptr);
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

function pushSprite(wasmClient: WasmClient, spritePool: SpritePool, image: WasmImage, position: Vector2, z: number, scale: number, cropPosition?: Vector2, cropSize?: Vector2) {
    const cropPosition1 = new Vector2();
    const cropSize1 = new Vector2();

    if (cropPosition === undefined) {
        cropPosition1.set(0, 0);
    } else {
        cropPosition1.copy(cropPosition);
    }
    if (cropSize === undefined) {
        cropSize1.set(image.width, image.height).sub(cropPosition1);
    } else {
        cropSize1.copy(cropSize);
    }

    wasmClient.push_sprite(spritePool.ptr,
                           image.ptr, image.width, image.height,
                           position.x, position.y, z,
                           scale,
                           cropPosition1.x, cropPosition1.y,
                           cropSize1.x, cropSize1.y);
}

function updateCamera(player: Player, camera: Camera) {
    const halfFov = FOV*0.5;
    const fovLen = NEAR_CLIPPING_PLANE/Math.cos(halfFov);
    camera.position.copy(player.position);
    camera.direction = properMod(player.direction, 2*Math.PI);
    camera.fovLeft.setPolar(camera.direction-halfFov, fovLen).add(camera.position);
    camera.fovRight.setPolar(camera.direction+halfFov, fovLen).add(camera.position);
}

function spriteOfItemKind(itemKind: common.ItemKind, assets: Assets): WasmImage {
    switch (itemKind) {
    case common.ItemKind.Key: return assets.keyImage;
    case common.ItemKind.Bomb: return assets.bombImage;
    default: return assets.nullImage;
    }
}

function updateItems(wasmClient: WasmClient, ws: WebSocket, spritePool: SpritePool, time: number, me: Player, items: Array<common.Item>, assets: Assets) {
    // Rendering the items as sprites
    for (let item of items) {
        if (item.alive) {
            pushSprite(wasmClient, spritePool, spriteOfItemKind(item.kind, assets), item.position, 0.25 + ITEM_AMP - ITEM_AMP*Math.sin(ITEM_FREQ*Math.PI*time + item.position.x + item.position.y), 0.25);
        }
    }

    // Offline mode. Updating items state without asking the server.
    if (ws.readyState != WebSocket.OPEN) {
        for (let item of items) {
            if (common.collectItem(me, item)) {
                playSound(assets.itemPickupSound, me.position, item.position);
            }
        }
    }
}

function updateParticles(wasmClient: WasmClient, assets: Assets, spritePool: SpritePool, deltaTime: number, scene: Scene, particlesPtr: number) {
    wasmClient.update_particles(assets.particleImage.ptr, assets.particleImage.width, assets.particleImage.height, spritePool.ptr, deltaTime, scene.wallsPtr, scene.width, scene.height, particlesPtr);
}

function emitParticle(wasmClient: WasmClient, source: Vector3, particlesPtr: number) {
    wasmClient.emit_particle(source.x, source.y, source.z, particlesPtr);
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
        emitParticle(wasmClient, bomb.position, particlesPtr);
    }
}

function updateBombs(wasmClient: WasmClient, ws: WebSocket, spritePool: SpritePool, player: Player, bombs: Array<common.Bomb>, particlesPtr: number, scene: Scene, deltaTime: number, assets: Assets) {
    for (let bomb of bombs) {
        if (bomb.lifetime > 0) {
            pushSprite(wasmClient, spritePool, assets.bombImage, new Vector2(bomb.position.x, bomb.position.y), bomb.position.z, common.BOMB_SCALE)
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
    spritePool: SpritePool,
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
        "env": common.make_environment({
            "fmodf": (x: number, y: number) => x%y,
            "fminf": Math.min,
            "fmaxf": Math.max,
            "js_random": Math.random,
        })
    })

    return {
        wasm,
        memory: wasm.instance.exports.memory as WebAssembly.Memory,
        _initialize: wasm.instance.exports._initialize as () => void,
        allocate_scene: wasm.instance.exports.allocate_scene as (width: number, height: number) => number,
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
    };
}

async function createGame(): Promise<Game> {
    const wasmClient = await instantiateWasmClient("client.wasm");
    wasmClient._initialize();

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
    const spritePool = createSpritePool(wasmClient);

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
    for (const item of level.items) item.alive = false;
    const game: Game = {
        camera, ws, me, ping: 0, players, particlesPtr, assets, spritePool, dts: [],
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
                const playerView = new DataView(event.data, common.PlayersJoinedHeaderStruct.size + i*common.PlayerStruct.size, common.PlayerStruct.size);
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
                const id = common.PlayersLeftHeaderStruct.items(i).id.read(view);
                players.delete(id);
            }
        } else if (common.PlayersMovingHeaderStruct.verify(view)) {
            const count = common.PlayersMovingHeaderStruct.count(view);
            for (let i = 0; i < count; ++i) {
                const playerView = new DataView(event.data, common.PlayersMovingHeaderStruct.size + i*common.PlayerStruct.size, common.PlayerStruct.size);

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
        } else if (common.ItemCollectedStruct.verify(view)) {
            const index = common.ItemCollectedStruct.index.read(view);
            if (!(0 <= index && index < game.level.items.length)) {
                console.error(`Received bogus-amogus ItemCollected message from server. Invalid index ${index}`);
                ws?.close();
                return;
            }
            if (game.level.items[index].alive) {
                game.level.items[index].alive = false;
                playSound(assets.itemPickupSound, game.me.position, game.level.items[index].position);
            }
        } else if (common.ItemSpawnedStruct.verify(view)) {
            const index = common.ItemSpawnedStruct.index.read(view);
            if (!(0 <= index && index < game.level.items.length)) {
                console.error(`Received bogus-amogus ItemSpawned message from server. Invalid index ${index}`);
                ws?.close();
                return;
            }
            game.level.items[index].alive = true;
            game.level.items[index].kind = common.ItemSpawnedStruct.itemKind.read(view);
            game.level.items[index].position.x = common.ItemSpawnedStruct.x.read(view);
            game.level.items[index].position.y = common.ItemSpawnedStruct.y.read(view);
        } else if (common.BombSpawnedStruct.verify(view)) {
            const index = common.BombSpawnedStruct.index.read(view);
            if (!(0 <= index && index < game.level.bombs.length)) {
                console.error(`Received bogus-amogus BombSpawned message from server. Invalid index ${index}`);
                ws?.close();
                return;
            }
            game.level.bombs[index].lifetime = common.BombSpawnedStruct.lifetime.read(view);
            game.level.bombs[index].position.x = common.BombSpawnedStruct.x.read(view);
            game.level.bombs[index].position.y = common.BombSpawnedStruct.y.read(view);
            game.level.bombs[index].position.z = common.BombSpawnedStruct.z.read(view);
            game.level.bombs[index].velocity.x = common.BombSpawnedStruct.dx.read(view);
            game.level.bombs[index].velocity.y = common.BombSpawnedStruct.dy.read(view);
            game.level.bombs[index].velocity.z = common.BombSpawnedStruct.dz.read(view);
        } else if (common.BombExplodedStruct.verify(view)) {
            const index = common.BombExplodedStruct.index.read(view);
            if (!(0 <= index && index < game.level.bombs.length)) {
                console.error(`Received bogus-amogus BombExploded message from server. Invalid index ${index}`);
                ws?.close();
                return;
            }
            game.level.bombs[index].lifetime = 0.0;
            game.level.bombs[index].position.x = common.BombExplodedStruct.x.read(view);
            game.level.bombs[index].position.y = common.BombExplodedStruct.y.read(view);
            game.level.bombs[index].position.z = common.BombExplodedStruct.z.read(view);
            explodeBomb(wasmClient, level.bombs[index], me, assets, particlesPtr);
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
    game.wasmClient.reset_sprite_pool(game.spritePool.ptr);

    game.players.forEach((player) => {
        if (player !== game.me) updatePlayer(game.wasmClient, player, game.level.scene, deltaTime)
    });
    updatePlayer(game.wasmClient, game.me, game.level.scene, deltaTime);
    updateCamera(game.me, game.camera);
    updateItems(game.wasmClient, game.ws, game.spritePool, time, game.me, game.level.items, game.assets);
    updateBombs(game.wasmClient, game.ws, game.spritePool, game.me, game.level.bombs, game.particlesPtr, game.level.scene, deltaTime, game.assets);
    updateParticles(game.wasmClient, game.assets, game.spritePool, deltaTime, game.level.scene, game.particlesPtr)

    game.players.forEach((player) => {
        if (player !== game.me) {
            const index = spriteAngleIndex(game.camera.position, player);
            pushSprite(game.wasmClient, game.spritePool, game.assets.playerImage, player.position, 1, 1, new Vector2(55*index, 0), new Vector2(55, 55));
        }
    })

    game.wasmClient.render_floor_and_ceiling(display.backImage.ptr, display.backImage.width, display.backImage.height, game.camera.position.x, game.camera.position.y, game.camera.direction);
    game.wasmClient.render_walls(
        display.backImage.ptr, display.backImage.width, display.backImage.height, display.zBufferPtr,
        game.assets.wallImage.ptr, game.assets.wallImage.width, game.assets.wallImage.height,
        game.camera.position.x, game.camera.position.y, game.camera.direction,
        game.level.scene.wallsPtr, game.level.scene.width, game.level.scene.height);
    game.wasmClient.cull_and_sort_sprites(game.camera.position.x, game.camera.position.y, game.camera.direction, game.spritePool.ptr)
    game.wasmClient.render_sprites(display.backImage.ptr, display.backImage.width, display.backImage.height, display.zBufferPtr, game.spritePool.ptr)
    displaySwapBackImageData(display, game.wasmClient);

    if (MINIMAP) renderMinimap(game.wasmClient, display, game.camera, game.me, game.level.scene, game.spritePool);
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

    // TODO: bring hotreloading back
    // TODO: hot reloading should not break if the game crashes

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
        window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame((timestamp) => {
        prevTimestamp = timestamp;
        window.requestAnimationFrame(frame);
    });
})();
// TODO: Hot reload assets
// TODO: Load assets asynchronously
//   While a texture is loading, replace it with a color tile.
// TODO: Mobile controls
// TODO: "magnet" items into the player
// TODO: Blast particles should fade out as they age
// TODO: Bomb collision should take into account its size
// TODO: Try lighting with normal maps that come with some of the assets
// TODO: Try cel shading the walls (using normals and stuff)
// TODO: sound don't mix properly
//   Right now same sounds are just stopped and replaced instantly. Which generally does not sound good.
//   We need to fix them properly
// TODO: consider looking into Web Audio API https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
