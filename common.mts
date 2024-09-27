export const SERVER_PORT = 6970;
export const PLAYER_SIZE = 0.5;
export const PLAYER_SPEED = 2;
export const PLAYER_RADIUS = 0.5;

export class Vector2 {
    x: number;
    y: number;
    constructor(x: number = 0, y: number = 0) {
        this.x = x;
        this.y = y;
    }
    setPolar(angle: number, len: number = 1): this {
        this.x = Math.cos(angle)*len;
        this.y = Math.sin(angle)*len;
        return this;
    }
    clone(): Vector2 {
        return new Vector2(this.x, this.y)
    }
    copy(that: Vector2): this {
        this.x = that.x;
        this.y = that.y;
        return this;
    }
    set(x: number, y: number): this {
        this.x = x;
        this.y = y;
        return this;
    }
    setScalar(scalar: number): this {
        this.x = scalar;
        this.y = scalar;
        return this;
    }
    add(that: Vector2): this {
        this.x += that.x;
        this.y += that.y;
        return this;
    }
    sub(that: Vector2): this {
        this.x -= that.x;
        this.y -= that.y;
        return this;
    }
    div(that: Vector2): this {
        this.x /= that.x;
        this.y /= that.y;
        return this;
    }
    mul(that: Vector2): this {
        this.x *= that.x;
        this.y *= that.y;
        return this;
    }
    sqrLength(): number {
        return this.x*this.x + this.y*this.y;
    }
    length(): number {
        return Math.sqrt(this.sqrLength());
    }
    angle(): number {
        return Math.atan2(this.y, this.x);
    }
    scale(value: number): this {
        this.x *= value;
        this.y *= value;
        return this;
    }
    norm(): this {
        const l = this.length();
        return l === 0 ? this : this.scale(1/l);
    }
    rot90(): this {
        const oldX = this.x;
        this.x = -this.y;
        this.y = oldX;
        return this;
    }
    sqrDistanceTo(that: Vector2): number {
        const dx = that.x - this.x;
        const dy = that.y - this.y;
        return dx*dx + dy*dy;
    }
    distanceTo(that: Vector2): number {
        return Math.sqrt(this.sqrDistanceTo(that));
    }
    lerp(that: Vector2, t: number): this {
        this.x += (that.x - this.x)*t;
        this.y += (that.y - this.y)*t;
        return this;
    }
    dot(that: Vector2): number {
        return this.x*that.x + this.y*that.y;
    }
    map(f: (x: number) => number): this {
        this.x = f(this.x);
        this.y = f(this.y);
        return this;
    }
}

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

// IMPORTANT: This must be synchronized with the MessageKind in common.c3 until common.mts is fully rewritten in C3.
export enum MessageKind {
    Hello,
    PlayerJoined,
    PlayerLeft,
    PlayerMoving,
    AmmaMoving,
    AmmaThrowing,
    Ping,
    Pong,
    ItemSpawned,
    ItemCollected,
    BombSpawned,
    BombExploded,
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

export function BatchMessageStruct<Item extends { size: number }>(messageKind: MessageKind, itemType: Item) {
    const allocator  = { size: 0 };
    const kind       = allocUint8Field(allocator);
    const headerSize = allocator.size;
    const verify = (view: DataView) =>
        view.byteLength >= headerSize &&
        (view.byteLength - headerSize)%itemType.size === 0 &&
        kind.read(view) == messageKind;
    const count = (view: DataView) => (view.byteLength - headerSize)/itemType.size
    const item = (buffer: ArrayBuffer, index: number): DataView => {
        return new DataView(buffer, headerSize + index*itemType.size);
    }
    const allocateAndInit = (countItems: number): ArrayBuffer => {
        const buffer = new ArrayBuffer(headerSize + itemType.size*countItems);
        const view = new DataView(buffer);
        kind.write(view, messageKind);
        return buffer;
    }
    return {kind, headerSize, verify, count, item, itemType, allocateAndInit};
};

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
    const direction = allocFloat32Field(allocator);
    const hue      = allocUint8Field(allocator);
    const size     = allocator.size;
    const verify = verifier(kind, MessageKind.Hello, size);
    return {kind, id, x, y, direction, hue, size, verify}
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

export const AmmaThrowingStruct = (() => {
    const allocator = { size: 0 };
    const kind      = allocUint8Field(allocator);
    const size      = allocator.size;
    const verify    = verifier(kind, MessageKind.AmmaThrowing, size);
    return {kind, size, verify}
})();

// [kind] [count] [id] [x] [y] [moving] [id] [x] [y] [moving] [id] [x] [y] [moving]
//                ^

export const PlayerStruct = (() => {
    const allocator = { size: 0 };
    const id     = allocUint32Field(allocator);
    const x      = allocFloat32Field(allocator);
    const y      = allocFloat32Field(allocator);
    const direction = allocFloat32Field(allocator);
    const hue    = allocUint8Field(allocator);
    const moving = allocUint8Field(allocator);
    const size   = allocator.size;
    return {id, x, y, direction, hue, moving, size};
})();

export const PlayersJoinedHeaderStruct = BatchMessageStruct(MessageKind.PlayerJoined, PlayerStruct);
export const PlayersMovingHeaderStruct = BatchMessageStruct(MessageKind.PlayerMoving, PlayerStruct);
export const PlayersLeftHeaderStruct = BatchMessageStruct(MessageKind.PlayerLeft, { size: UINT32_SIZE });

// It's such mod that properMod(-1, 100) === 99
export function properMod(a: number, b: number): number {
    return (a%b + b)%b;
}

export function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

export interface WasmCommon {
    wasm: WebAssembly.WebAssemblyInstantiatedSource,
    memory: WebAssembly.Memory,
    _initialize: () => void,
    allocate_items: () => number,
    reset_temp_mark: () => void,
    allocate_temporary_buffer: (size: number) => number,
    allocate_bombs: () => number,
    throw_bomb: (player_position_x: number, player_position_y: number, player_direction: number, bombs: number) => number,
    scene_can_rectangle_fit_here: (scene: number, px: number, py: number, sx: number, sy: number) => boolean,
    allocate_default_scene: () => number,
}

export function makeWasmCommon(wasm: WebAssembly.WebAssemblyInstantiatedSource): WasmCommon {
    return {
        wasm,
        memory: wasm.instance.exports.memory  as WebAssembly.Memory,
        _initialize: wasm.instance.exports._initialize as () => void,
        allocate_items: wasm.instance.exports.allocate_items as () => number,
        reset_temp_mark: wasm.instance.exports.reset_temp_mark as () => void,
        allocate_temporary_buffer: wasm.instance.exports.allocate_temporary_buffer as (size: number) => number,
        allocate_bombs: wasm.instance.exports.allocate_bombs as () => number,
        throw_bomb: wasm.instance.exports.throw_bomb as (player_position_x: number, player_position_y: number, player_direction: number, bombs: number) => number,
        scene_can_rectangle_fit_here: wasm.instance.exports.scene_can_rectangle_fit_here as (scenePtr: number, px: number, py: number, sx: number, sy: number) => boolean,
        allocate_default_scene: wasm.instance.exports.allocate_default_scene as () => number,
    }
}

// NOTE: This is basically the part of the state of the Game that is shared 
// between Client and Server and constantly synced over the network.
export interface Level {
    scenePtr: number,
    itemsPtr: number,
    bombsPtr: number,
}

export function createLevel(wasmCommon: WasmCommon): Level {
    const scenePtr = wasmCommon.allocate_default_scene();
    const itemsPtr = wasmCommon.allocate_items();
    const bombsPtr = wasmCommon.allocate_bombs();
    return {scenePtr, itemsPtr, bombsPtr};
}

export function updatePlayer(wasmCommon: WasmCommon, player: Player, scenePtr: number, deltaTime: number) {
    const controlVelocity = new Vector2();
    let angularVelocity = 0.0;
    if ((player.moving>>Moving.MovingForward)&1) {
        controlVelocity.add(new Vector2().setPolar(player.direction, PLAYER_SPEED))
    }
    if ((player.moving>>Moving.MovingBackward)&1) {
        controlVelocity.sub(new Vector2().setPolar(player.direction, PLAYER_SPEED))
    }
    if ((player.moving>>Moving.TurningLeft)&1) {
        angularVelocity -= Math.PI;
    }
    if ((player.moving>>Moving.TurningRight)&1) {
        angularVelocity += Math.PI;
    }
    player.direction = player.direction + angularVelocity*deltaTime;

    const nx = player.position.x + controlVelocity.x*deltaTime;
    if (wasmCommon.scene_can_rectangle_fit_here(scenePtr, nx, player.position.y, PLAYER_SIZE, PLAYER_SIZE)) {
        player.position.x = nx;
    }
    const ny = player.position.y + controlVelocity.y*deltaTime;
    if (wasmCommon.scene_can_rectangle_fit_here(scenePtr, player.position.x, ny, PLAYER_SIZE, PLAYER_SIZE)) {
        player.position.y = ny;
    }
}
