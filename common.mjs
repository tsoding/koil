export const SERVER_PORT = 6970;
export const PLAYER_SIZE = 0.5;
export const PLAYER_SPEED = 2;
export const PLAYER_RADIUS = 0.5;
export const BOMB_LIFETIME = 2;
export const BOMB_THROW_VELOCITY = 5;
export const BOMB_GRAVITY = 10;
export const BOMB_DAMP = 0.8;
export const BOMB_SCALE = 0.25;
export class Vector2 {
    x;
    y;
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }
    setPolar(angle, len = 1) {
        this.x = Math.cos(angle) * len;
        this.y = Math.sin(angle) * len;
        return this;
    }
    clone() {
        return new Vector2(this.x, this.y);
    }
    copy(that) {
        this.x = that.x;
        this.y = that.y;
        return this;
    }
    set(x, y) {
        this.x = x;
        this.y = y;
        return this;
    }
    setScalar(scalar) {
        this.x = scalar;
        this.y = scalar;
        return this;
    }
    add(that) {
        this.x += that.x;
        this.y += that.y;
        return this;
    }
    sub(that) {
        this.x -= that.x;
        this.y -= that.y;
        return this;
    }
    div(that) {
        this.x /= that.x;
        this.y /= that.y;
        return this;
    }
    mul(that) {
        this.x *= that.x;
        this.y *= that.y;
        return this;
    }
    sqrLength() {
        return this.x * this.x + this.y * this.y;
    }
    length() {
        return Math.sqrt(this.sqrLength());
    }
    angle() {
        return Math.atan2(this.y, this.x);
    }
    scale(value) {
        this.x *= value;
        this.y *= value;
        return this;
    }
    norm() {
        const l = this.length();
        return l === 0 ? this : this.scale(1 / l);
    }
    rot90() {
        const oldX = this.x;
        this.x = -this.y;
        this.y = oldX;
        return this;
    }
    sqrDistanceTo(that) {
        const dx = that.x - this.x;
        const dy = that.y - this.y;
        return dx * dx + dy * dy;
    }
    distanceTo(that) {
        return Math.sqrt(this.sqrDistanceTo(that));
    }
    lerp(that, t) {
        this.x += (that.x - this.x) * t;
        this.y += (that.y - this.y) * t;
        return this;
    }
    dot(that) {
        return this.x * that.x + this.y * that.y;
    }
    map(f) {
        this.x = f(this.x);
        this.y = f(this.y);
        return this;
    }
}
export class Vector3 {
    x;
    y;
    z;
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
    clone() {
        return new Vector3(this.x, this.y, this.z);
    }
    clone2() {
        return new Vector2(this.x, this.y);
    }
    copy(that) {
        this.x = that.x;
        this.y = that.y;
        this.z = that.z;
        return this;
    }
    copy2(that, z) {
        this.x = that.x;
        this.y = that.y;
        this.z = z;
        return this;
    }
    setScalar(scalar) {
        this.x = scalar;
        this.y = scalar;
        this.z = scalar;
        return this;
    }
    add(that) {
        this.x += that.x;
        this.y += that.y;
        this.z += that.z;
        return this;
    }
    sub(that) {
        this.x -= that.x;
        this.y -= that.y;
        this.z -= that.z;
        return this;
    }
    div(that) {
        this.x /= that.x;
        this.y /= that.y;
        this.z /= that.z;
        return this;
    }
    mul(that) {
        this.x *= that.x;
        this.y *= that.y;
        this.z *= that.z;
        return this;
    }
    sqrLength() {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }
    length() {
        return Math.sqrt(this.sqrLength());
    }
    scale(value) {
        this.x *= value;
        this.y *= value;
        this.z *= value;
        return this;
    }
    norm() {
        const l = this.length();
        return l === 0 ? this : this.scale(1 / l);
    }
    sqrDistanceTo(that) {
        const dx = that.x - this.x;
        const dy = that.y - this.y;
        const dz = that.z - this.z;
        return dx * dx + dy * dy + dz * dz;
    }
    distanceTo(that) {
        return Math.sqrt(this.sqrDistanceTo(that));
    }
    lerp(that, t) {
        this.x += (that.x - this.x) * t;
        this.y += (that.y - this.y) * t;
        this.z += (that.z - this.z) * t;
        return this;
    }
    dot(that) {
        return this.x * that.x + this.y * that.y + this.z * that.z;
    }
    map(f) {
        this.x = f(this.x);
        this.y = f(this.y);
        this.z = f(this.z);
        return this;
    }
}
export var Moving;
(function (Moving) {
    Moving[Moving["MovingForward"] = 0] = "MovingForward";
    Moving[Moving["MovingBackward"] = 1] = "MovingBackward";
    Moving[Moving["TurningLeft"] = 2] = "TurningLeft";
    Moving[Moving["TurningRight"] = 3] = "TurningRight";
    Moving[Moving["Count"] = 4] = "Count";
})(Moving || (Moving = {}));
export var MessageKind;
(function (MessageKind) {
    MessageKind[MessageKind["Hello"] = 0] = "Hello";
    MessageKind[MessageKind["PlayerJoined"] = 1] = "PlayerJoined";
    MessageKind[MessageKind["PlayerLeft"] = 2] = "PlayerLeft";
    MessageKind[MessageKind["PlayerMoving"] = 3] = "PlayerMoving";
    MessageKind[MessageKind["AmmaMoving"] = 4] = "AmmaMoving";
    MessageKind[MessageKind["AmmaThrowing"] = 5] = "AmmaThrowing";
    MessageKind[MessageKind["Ping"] = 6] = "Ping";
    MessageKind[MessageKind["Pong"] = 7] = "Pong";
    MessageKind[MessageKind["ItemSpawned"] = 8] = "ItemSpawned";
    MessageKind[MessageKind["ItemCollected"] = 9] = "ItemCollected";
    MessageKind[MessageKind["BombSpawned"] = 10] = "BombSpawned";
    MessageKind[MessageKind["BombExploded"] = 11] = "BombExploded";
})(MessageKind || (MessageKind = {}));
export const UINT8_SIZE = 1;
export const UINT16_SIZE = 2;
export const UINT32_SIZE = 4;
export const FLOAT32_SIZE = 4;
function allocUint8Field(allocator) {
    const offset = allocator.size;
    const size = UINT8_SIZE;
    allocator.size += size;
    return {
        offset,
        size,
        read: (view) => view.getUint8(offset),
        write: (view, value) => view.setUint8(offset, value)
    };
}
function allocUint32Field(allocator) {
    const offset = allocator.size;
    const size = UINT32_SIZE;
    allocator.size += size;
    return {
        offset,
        size,
        read: (view) => view.getUint32(offset, true),
        write: (view, value) => view.setUint32(offset, value, true)
    };
}
function allocFloat32Field(allocator) {
    const offset = allocator.size;
    const size = FLOAT32_SIZE;
    allocator.size += size;
    return {
        offset,
        size,
        read: (view) => view.getFloat32(offset, true),
        write: (view, value) => view.setFloat32(offset, value, true)
    };
}
function verifier(kindField, kind, size) {
    return (view) => view.byteLength == size &&
        kindField.read(view) == kind;
}
export function BatchMessageStruct(messageKind, itemType) {
    const allocator = { size: 0 };
    const kind = allocUint8Field(allocator);
    const headerSize = allocator.size;
    const verify = (view) => view.byteLength >= headerSize &&
        (view.byteLength - headerSize) % itemType.size === 0 &&
        kind.read(view) == messageKind;
    const count = (view) => (view.byteLength - headerSize) / itemType.size;
    const item = (buffer, index) => {
        return new DataView(buffer, headerSize + index * itemType.size);
    };
    const allocateAndInit = (countItems) => {
        const buffer = new ArrayBuffer(headerSize + itemType.size * countItems);
        const view = new DataView(buffer);
        kind.write(view, messageKind);
        return buffer;
    };
    return { kind, headerSize, verify, count, item, itemType, allocateAndInit };
}
;
export const PingStruct = (() => {
    const allocator = { size: 0 };
    const kind = allocUint8Field(allocator);
    const timestamp = allocUint32Field(allocator);
    const size = allocator.size;
    const verify = verifier(kind, MessageKind.Ping, size);
    return { kind, timestamp, size, verify };
})();
export const PongStruct = (() => {
    const allocator = { size: 0 };
    const kind = allocUint8Field(allocator);
    const timestamp = allocUint32Field(allocator);
    const size = allocator.size;
    const verify = verifier(kind, MessageKind.Pong, size);
    return { kind, timestamp, size, verify };
})();
export const HelloStruct = (() => {
    const allocator = { size: 0 };
    const kind = allocUint8Field(allocator);
    const id = allocUint32Field(allocator);
    const x = allocFloat32Field(allocator);
    const y = allocFloat32Field(allocator);
    const direction = allocFloat32Field(allocator);
    const hue = allocUint8Field(allocator);
    const size = allocator.size;
    const verify = verifier(kind, MessageKind.Hello, size);
    return { kind, id, x, y, direction, hue, size, verify };
})();
export const AmmaMovingStruct = (() => {
    const allocator = { size: 0 };
    const kind = allocUint8Field(allocator);
    const direction = allocUint8Field(allocator);
    const start = allocUint8Field(allocator);
    const size = allocator.size;
    const verify = verifier(kind, MessageKind.AmmaMoving, size);
    return { kind, direction, start, size, verify };
})();
export const AmmaThrowingStruct = (() => {
    const allocator = { size: 0 };
    const kind = allocUint8Field(allocator);
    const size = allocator.size;
    const verify = verifier(kind, MessageKind.AmmaThrowing, size);
    return { kind, size, verify };
})();
export const PlayerStruct = (() => {
    const allocator = { size: 0 };
    const id = allocUint32Field(allocator);
    const x = allocFloat32Field(allocator);
    const y = allocFloat32Field(allocator);
    const direction = allocFloat32Field(allocator);
    const hue = allocUint8Field(allocator);
    const moving = allocUint8Field(allocator);
    const size = allocator.size;
    return { id, x, y, direction, hue, moving, size };
})();
export const PlayersJoinedHeaderStruct = BatchMessageStruct(MessageKind.PlayerJoined, PlayerStruct);
export const PlayersMovingHeaderStruct = BatchMessageStruct(MessageKind.PlayerMoving, PlayerStruct);
export const PlayersLeftHeaderStruct = BatchMessageStruct(MessageKind.PlayerLeft, { size: UINT32_SIZE });
export function properMod(a, b) {
    return (a % b + b) % b;
}
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
export function sceneContains(scene, p) {
    return 0 <= p.x && p.x < scene.width && 0 <= p.y && p.y < scene.height;
}
export function sceneGetTile(walls, scene, p) {
    if (!sceneContains(scene, p))
        return false;
    return walls[Math.floor(p.y) * scene.width + Math.floor(p.x)] !== 0;
}
export function sceneCanRectangleFitHere(wasmCommon, scene, px, py, sx, sy) {
    const x1 = Math.floor(px - sx * 0.5);
    const x2 = Math.floor(px + sx * 0.5);
    const y1 = Math.floor(py - sy * 0.5);
    const y2 = Math.floor(py + sy * 0.5);
    const walls = new Uint8ClampedArray(wasmCommon.memory.buffer, scene.wallsPtr, scene.width * scene.height);
    for (let x = x1; x <= x2; ++x) {
        for (let y = y1; y <= y2; ++y) {
            if (sceneGetTile(walls, scene, new Vector2(x, y))) {
                return false;
            }
        }
    }
    return true;
}
export function makeWasmCommon(wasm) {
    return {
        wasm,
        memory: wasm.instance.exports.memory,
        _initialize: wasm.instance.exports._initialize,
        allocate_scene: wasm.instance.exports.allocate_scene,
        allocate_items: wasm.instance.exports.allocate_items,
        reset_temp_mark: wasm.instance.exports.reset_temp_mark,
        allocate_temporary_buffer: wasm.instance.exports.allocate_temporary_buffer,
        allocate_bombs: wasm.instance.exports.allocate_bombs,
        throw_bomb: wasm.instance.exports.throw_bomb,
    };
}
export function createScene(walls, wasmCommon) {
    const scene = {
        height: walls.length,
        width: Number.MIN_VALUE,
        wallsPtr: 0,
    };
    for (let row of walls) {
        scene.width = Math.max(scene.width, row.length);
    }
    scene.wallsPtr = wasmCommon.allocate_scene(scene.width, scene.height);
    const wallsData = new Uint8ClampedArray(wasmCommon.memory.buffer, scene.wallsPtr, scene.width * scene.height);
    for (let y = 0; y < walls.length; ++y) {
        for (let x = 0; x < walls[y].length; ++x) {
            wallsData[y * scene.width + x] = Number(walls[y][x]);
        }
    }
    return scene;
}
export function createLevel(wasmCommon) {
    const scene = createScene([
        [false, false, true, true, true, false, false],
        [false, false, false, false, false, true, false],
        [true, false, false, false, false, true, false],
        [true, false, false, false, false, true, false],
        [true],
        [false, true, true, true, false, false, false],
        [false, false, false, false, false, false, false],
    ], wasmCommon);
    const itemsPtr = wasmCommon.allocate_items();
    const bombsPtr = wasmCommon.allocate_bombs();
    return { scene, itemsPtr, bombsPtr };
}
export function updatePlayer(wasmCommon, player, scene, deltaTime) {
    const controlVelocity = new Vector2();
    let angularVelocity = 0.0;
    if ((player.moving >> Moving.MovingForward) & 1) {
        controlVelocity.add(new Vector2().setPolar(player.direction, PLAYER_SPEED));
    }
    if ((player.moving >> Moving.MovingBackward) & 1) {
        controlVelocity.sub(new Vector2().setPolar(player.direction, PLAYER_SPEED));
    }
    if ((player.moving >> Moving.TurningLeft) & 1) {
        angularVelocity -= Math.PI;
    }
    if ((player.moving >> Moving.TurningRight) & 1) {
        angularVelocity += Math.PI;
    }
    player.direction = player.direction + angularVelocity * deltaTime;
    const nx = player.position.x + controlVelocity.x * deltaTime;
    if (sceneCanRectangleFitHere(wasmCommon, scene, nx, player.position.y, PLAYER_SIZE, PLAYER_SIZE)) {
        player.position.x = nx;
    }
    const ny = player.position.y + controlVelocity.y * deltaTime;
    if (sceneCanRectangleFitHere(wasmCommon, scene, player.position.x, ny, PLAYER_SIZE, PLAYER_SIZE)) {
        player.position.y = ny;
    }
}
//# sourceMappingURL=common.mjs.map