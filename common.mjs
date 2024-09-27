export const SERVER_PORT = 6970;
export const PLAYER_SIZE = 0.5;
export const PLAYER_SPEED = 2;
export const PLAYER_RADIUS = 0.5;
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
export function makeWasmCommon(wasm) {
    return {
        wasm,
        memory: wasm.instance.exports.memory,
        _initialize: wasm.instance.exports._initialize,
        allocate_items: wasm.instance.exports.allocate_items,
        reset_temp_mark: wasm.instance.exports.reset_temp_mark,
        allocate_temporary_buffer: wasm.instance.exports.allocate_temporary_buffer,
        allocate_bombs: wasm.instance.exports.allocate_bombs,
        throw_bomb: wasm.instance.exports.throw_bomb,
        scene_can_rectangle_fit_here: wasm.instance.exports.scene_can_rectangle_fit_here,
        allocate_default_scene: wasm.instance.exports.allocate_default_scene,
    };
}
export function createLevel(wasmCommon) {
    const scenePtr = wasmCommon.allocate_default_scene();
    const itemsPtr = wasmCommon.allocate_items();
    const bombsPtr = wasmCommon.allocate_bombs();
    return { scenePtr, itemsPtr, bombsPtr };
}
export function updatePlayer(wasmCommon, player, scenePtr, deltaTime) {
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
    if (wasmCommon.scene_can_rectangle_fit_here(scenePtr, nx, player.position.y, PLAYER_SIZE, PLAYER_SIZE)) {
        player.position.x = nx;
    }
    const ny = player.position.y + controlVelocity.y * deltaTime;
    if (wasmCommon.scene_can_rectangle_fit_here(scenePtr, player.position.x, ny, PLAYER_SIZE, PLAYER_SIZE)) {
        player.position.y = ny;
    }
}
//# sourceMappingURL=common.mjs.map