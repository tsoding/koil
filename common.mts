import {Vector2} from './vector.mjs';

export const SERVER_PORT = 6970;
const WORLD_FACTOR_ = 200;
export const WORLD_WIDTH_ = 4*WORLD_FACTOR_;
export const WORLD_HEIGHT_ = 3*WORLD_FACTOR_;
export const RAYCASTING_PLAYER_SIZE = 0.5;
export const RAYCASTING_PLAYER_SPEED = 2;

export enum Moving {
    MovingForward,
    MovingBackward,
    TurningLeft,
    TurningRight,
    Count,
}

export interface Player {
    id: number,
    position: Vector2,
    direction: number,
    moving: number,
    hue: number,
}

export enum MessageKind {
    Hello,
    PlayerJoined,
    PlayerLeft,
    PlayerMoving,
    AmmaMoving,
    Ping,
    Pong,
}

interface Field {
    offset: number,
    size: number,
    read(view: DataView): number;
    write(view: DataView, value: number): void;
}

export const UINT8_SIZE = 1;
export const UINT16_SIZE = 2;
export const UINT32_SIZE = 4;
export const FLOAT32_SIZE = 4;

function allocUint8Field(allocator: { size: number }): Field {
    const offset = allocator.size;
    const size = UINT8_SIZE;
    allocator.size += size;
    return {
        offset,
        size,
        read: (view) => view.getUint8(offset),
        write: (view, value) => view.setUint8(offset, value)
    }
}

function allocUint16Field(allocator: { size: number }): Field {
    const offset = allocator.size;
    const size = UINT16_SIZE;
    allocator.size += size;
    return {
        offset,
        size,
        read: (view) => view.getUint16(offset),
        write: (view, value) => view.setUint16(offset, value)
    }
}

function allocUint32Field(allocator: { size: number }): Field {
    const offset = allocator.size;
    const size = UINT32_SIZE;
    allocator.size += size;
    return {
        offset,
        size,
        read: (view) => view.getUint32(offset, true),
        write: (view, value) => view.setUint32(offset, value, true)
    }
}

function allocFloat32Field(allocator: { size: number }): Field {
    const offset = allocator.size;
    const size = FLOAT32_SIZE;
    allocator.size += size;
    return {
        offset,
        size,
        read: (view) => view.getFloat32(offset, true),
        write: (view, value) => view.setFloat32(offset, value, true)
    }
}

function verifier(kindField: Field, kind: number, size: number): (view: DataView) => boolean {
    return (view) =>
        view.byteLength == size &&
        kindField.read(view) == kind
}

export const PingStruct = (() => {
    const allocator = { size: 0 };
    const kind      = allocUint8Field(allocator);
    const timestamp = allocUint32Field(allocator);
    const size      = allocator.size;
    const verify    = verifier(kind, MessageKind.Ping, size);
    return {kind, timestamp, size, verify}
})();

export const PongStruct = (() => {
    const allocator = { size: 0 };
    const kind      = allocUint8Field(allocator);
    const timestamp = allocUint32Field(allocator);
    const size      = allocator.size;
    const verify    = verifier(kind, MessageKind.Pong, size);
    return {kind, timestamp, size, verify}
})();

export const HelloStruct = (() => {
    const allocator = { size: 0 };
    const kind     = allocUint8Field(allocator);
    const id       = allocUint32Field(allocator);
    const x_        = allocFloat32Field(allocator);
    const y_        = allocFloat32Field(allocator);
    const direction = allocFloat32Field(allocator);
    const hue      = allocUint8Field(allocator);
    const size     = allocator.size;
    const verify = verifier(kind, MessageKind.Hello, size);
    return {kind, id, x_, y_, direction, hue, size, verify}
})();

export const AmmaMovingStruct = (() => {
    const allocator = { size: 0 };
    const kind      = allocUint8Field(allocator);
    const direction = allocUint8Field(allocator);
    const start     = allocUint8Field(allocator);
    const size      = allocator.size;
    const verify    = verifier(kind, MessageKind.AmmaMoving, size);
    return {kind, direction, start, size, verify}
})();

// [kind] [count] [id] [x] [y] [moving] [id] [x] [y] [moving] [id] [x] [y] [moving]
//                ^

export const PlayerStruct = (() => {
    const allocator = { size: 0 };
    const id     = allocUint32Field(allocator);
    const x_      = allocFloat32Field(allocator);
    const y_      = allocFloat32Field(allocator);
    const direction = allocFloat32Field(allocator);
    const hue    = allocUint8Field(allocator);
    const moving = allocUint8Field(allocator);
    const size   = allocator.size;
    return {id, x_, y_, direction, hue, moving, size};
})();

export const PlayersJoinedHeaderStruct = (() => {
    const allocator = { size: 0 };
    const kind   = allocUint8Field(allocator);
    const size   = allocator.size;
    const itemSize = PlayerStruct.size;
    const verify = (view: DataView) =>
        view.byteLength >= size &&
        (view.byteLength - size)%itemSize === 0 &&
        kind.read(view) == MessageKind.PlayerJoined;
    const count = (view: DataView) => (view.byteLength - size)/itemSize
    return {kind, count, size, verify};
})();

export const PlayersMovingHeaderStruct = (() => {
    const allocator = { size: 0 };
    const kind   = allocUint8Field(allocator);
    const size   = allocator.size;
    const itemSize = PlayerStruct.size;
    const verify = (view: DataView) =>
        view.byteLength >= size &&
        (view.byteLength - size)%itemSize === 0 &&
        kind.read(view) == MessageKind.PlayerMoving;
    const count = (view: DataView) => (view.byteLength - size)/itemSize;
    return {kind, count, size, verify};
})();

export const PlayersLeftHeaderStruct = (() => {
    const allocator = { size: 0 };
    const kind = allocUint8Field(allocator);
    const headerSize = allocator.size;
    const itemSize = UINT32_SIZE;
    const items = (index: number) => {
        return {
            id: {
                read: (view: DataView): number => view.getUint32(headerSize + index*itemSize, true),
                write: (view: DataView, value: number): void => view.setUint32(headerSize + index*itemSize, value, true)
            }
        }
    }
    const verify = (view: DataView) =>
        view.byteLength >= headerSize &&
        (view.byteLength - headerSize)%itemSize === 0 &&
        kind.read(view) === MessageKind.PlayerLeft;
    const allocateAndInit = (countItems: number): DataView => {
        const buffer = new ArrayBuffer(headerSize + itemSize*countItems);
        const view = new DataView(buffer);
        kind.write(view, MessageKind.PlayerLeft);
        return view;
    }
    const count = (view: DataView) => (view.byteLength - headerSize)/itemSize
    return {kind, count, items, itemSize, headerSize, verify, allocateAndInit};
})();

function properMod(a: number, b: number): number {
    return (a%b + b)%b;
}

export interface Scene {
    walls: Array<boolean>;
    width: number;
    height: number;
}

export function sceneContains(scene: Scene, p: Vector2): boolean {
    return 0 <= p.x && p.x < scene.width && 0 <= p.y && p.y < scene.height;
}

export function sceneGetTile(scene: Scene, p: Vector2): boolean {
    if (!sceneContains(scene, p)) return false;
    return scene.walls[Math.floor(p.y)*scene.width + Math.floor(p.x)];
}

export function sceneCanRectangleFitHere(scene: Scene, px: number, py: number, sx: number, sy: number): boolean {
    const x1 = Math.floor(px - sx*0.5);
    const x2 = Math.floor(px + sx*0.5);
    const y1 = Math.floor(py - sy*0.5);
    const y2 = Math.floor(py + sy*0.5);
    for (let x = x1; x <= x2; ++x) {
        for (let y = y1; y <= y2; ++y) {
            if (sceneGetTile(scene, new Vector2(x, y))) {
                return false;
            }
        }
    }
    return true;
}

export function createScene(walls: Array<Array<boolean>>): Scene {
    const scene: Scene = {
        height: walls.length,
        width: Number.MIN_VALUE,
        walls: [],
    };
    for (let row of walls) {
        scene.width = Math.max(scene.width, row.length);
    }
    for (let row of walls) {
        scene.walls = scene.walls.concat(row);
        for (let i = 0; i < scene.width - row.length; ++i) {
            scene.walls.push(false);
        }
    }
    return scene;
}

export const SCENE = createScene([
    [ false, false, true, true, true, false, false],
    [ false, false, false, false, false, true, false],
    [ true, false, false, false, false, true, false],
    [ true,  false, false, false, false, true, false],
    [ true],
    [  false,  true, true, true, false, false, false],
    [  false,  false, false, false, false, false, false],
]);

export function updatePlayer(player: Player, scene: Scene, deltaTime: number) {
    const controlVelocity = new Vector2();
    let angularVelocity = 0.0;
    if ((player.moving>>Moving.MovingForward)&1) {
        controlVelocity.add(new Vector2().setPolar(player.direction, RAYCASTING_PLAYER_SPEED))
    }
    if ((player.moving>>Moving.MovingBackward)&1) {
        controlVelocity.sub(new Vector2().setPolar(player.direction, RAYCASTING_PLAYER_SPEED))
    }
    if ((player.moving>>Moving.TurningLeft)&1) {
        angularVelocity -= Math.PI;
    }
    if ((player.moving>>Moving.TurningRight)&1) {
        angularVelocity += Math.PI;
    }
    player.direction = player.direction + angularVelocity*deltaTime;

    const nx = player.position.x + controlVelocity.x*deltaTime;
    if (sceneCanRectangleFitHere(scene, nx, player.position.y, RAYCASTING_PLAYER_SIZE, RAYCASTING_PLAYER_SIZE)) {
        player.position.x = nx;
    }
    const ny = player.position.y + controlVelocity.y*deltaTime;
    if (sceneCanRectangleFitHere(scene, player.position.x, ny, RAYCASTING_PLAYER_SIZE, RAYCASTING_PLAYER_SIZE)) {
        player.position.y = ny;
    }
}
