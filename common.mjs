import { Vector2 } from './vector.mjs';
export const SERVER_PORT = 6970;
export const WORLD_FACTOR = 200;
export const WORLD_WIDTH = 4 * WORLD_FACTOR;
export const WORLD_HEIGHT = 3 * WORLD_FACTOR;
export const PLAYER_SIZE = 30;
export const PLAYER_SPEED = 500;
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
    MessageKind[MessageKind["Ping"] = 5] = "Ping";
    MessageKind[MessageKind["Pong"] = 6] = "Pong";
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
function allocUint16Field(allocator) {
    const offset = allocator.size;
    const size = UINT16_SIZE;
    allocator.size += size;
    return {
        offset,
        size,
        read: (view) => view.getUint16(offset),
        write: (view, value) => view.setUint16(offset, value)
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
    const x_ = allocFloat32Field(allocator);
    const y_ = allocFloat32Field(allocator);
    const direction = allocFloat32Field(allocator);
    const hue = allocUint8Field(allocator);
    const size = allocator.size;
    const verify = verifier(kind, MessageKind.Hello, size);
    return { kind, id, x_, y_, direction, hue, size, verify };
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
export const PlayerStruct = (() => {
    const allocator = { size: 0 };
    const id = allocUint32Field(allocator);
    const x_ = allocFloat32Field(allocator);
    const y_ = allocFloat32Field(allocator);
    const direction = allocFloat32Field(allocator);
    const hue = allocUint8Field(allocator);
    const moving = allocUint8Field(allocator);
    const size = allocator.size;
    return { id, x_, y_, direction, hue, moving, size };
})();
export const PlayersJoinedHeaderStruct = (() => {
    const allocator = { size: 0 };
    const kind = allocUint8Field(allocator);
    const size = allocator.size;
    const itemSize = PlayerStruct.size;
    const verify = (view) => view.byteLength >= size &&
        (view.byteLength - size) % itemSize === 0 &&
        kind.read(view) == MessageKind.PlayerJoined;
    const count = (view) => (view.byteLength - size) / itemSize;
    return { kind, count, size, verify };
})();
export const PlayersMovingHeaderStruct = (() => {
    const allocator = { size: 0 };
    const kind = allocUint8Field(allocator);
    const size = allocator.size;
    const itemSize = PlayerStruct.size;
    const verify = (view) => view.byteLength >= size &&
        (view.byteLength - size) % itemSize === 0 &&
        kind.read(view) == MessageKind.PlayerMoving;
    const count = (view) => (view.byteLength - size) / itemSize;
    return { kind, count, size, verify };
})();
export const PlayersLeftHeaderStruct = (() => {
    const allocator = { size: 0 };
    const kind = allocUint8Field(allocator);
    const headerSize = allocator.size;
    const itemSize = UINT32_SIZE;
    const items = (index) => {
        return {
            id: {
                read: (view) => view.getUint32(headerSize + index * itemSize, true),
                write: (view, value) => view.setUint32(headerSize + index * itemSize, value, true)
            }
        };
    };
    const verify = (view) => view.byteLength >= headerSize &&
        (view.byteLength - headerSize) % itemSize === 0 &&
        kind.read(view) === MessageKind.PlayerLeft;
    const allocateAndInit = (countItems) => {
        const buffer = new ArrayBuffer(headerSize + itemSize * countItems);
        const view = new DataView(buffer);
        kind.write(view, MessageKind.PlayerLeft);
        return view;
    };
    const count = (view) => (view.byteLength - headerSize) / itemSize;
    return { kind, count, items, itemSize, headerSize, verify, allocateAndInit };
})();
function properMod(a, b) {
    return (a % b + b) % b;
}
export function updatePlayer(player, deltaTime) {
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
    player.position.add(controlVelocity.scale(deltaTime));
    player.position.x = properMod(player.position.x, WORLD_WIDTH);
    player.position.y = properMod(player.position.y, WORLD_HEIGHT);
}
//# sourceMappingURL=common.mjs.map