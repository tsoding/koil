export const SERVER_PORT = 6970;
export const WORLD_FACTOR = 200;
export const WORLD_WIDTH = 4*WORLD_FACTOR;
export const WORLD_HEIGHT = 3*WORLD_FACTOR;
export const PLAYER_SIZE = 30;
export const PLAYER_SPEED = 500;

export enum Direction {
    Left = 0,
    Right,
    Up,
    Down,
    Count,
}

export type Vector2 = {x: number, y: number};
export const DIRECTION_VECTORS: Vector2[] = (() => {
    console.assert(Direction.Count == 4, "The definition of Direction have changed");
    const vectors = Array(Direction.Count);
    vectors[Direction.Left]  = {x: -1, y: 0};
    vectors[Direction.Right] = {x: 1, y: 0};
    vectors[Direction.Up]    = {x: 0, y: -1};
    vectors[Direction.Down]  = {x: 0, y: 1};
    return vectors;
})()

export interface Player {
    id: number,
    x: number,
    y: number,
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
    const x        = allocFloat32Field(allocator);
    const y        = allocFloat32Field(allocator);
    const hue      = allocUint8Field(allocator);
    const size     = allocator.size;
    const verify = verifier(kind, MessageKind.Hello, size);
    return {kind, id, x, y, hue, size, verify}
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
    const x      = allocFloat32Field(allocator);
    const y      = allocFloat32Field(allocator);
    const hue    = allocUint8Field(allocator);
    const moving = allocUint8Field(allocator);
    const size   = allocator.size;
    return {id, x, y, hue, moving, size};
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

export function updatePlayer(player: Player, deltaTime: number) {
    let dx = 0;
    let dy = 0;
    for (let dir = 0; dir < Direction.Count; dir += 1) {
        if ((player.moving>>dir)&1) {
            dx += DIRECTION_VECTORS[dir].x;
            dy += DIRECTION_VECTORS[dir].y;
        }
    }
    const l = dx*dx + dy*dy;
    if (l !== 0) {
        dx /= l;
        dy /= l;
    }
    player.x = properMod(player.x + dx*PLAYER_SPEED*deltaTime, WORLD_WIDTH);
    player.y = properMod(player.y + dy*PLAYER_SPEED*deltaTime, WORLD_HEIGHT);
}
