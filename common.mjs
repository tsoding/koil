export const SERVER_PORT = 6970;
export const WORLD_FACTOR = 200;
export const WORLD_WIDTH = 4 * WORLD_FACTOR;
export const WORLD_HEIGHT = 3 * WORLD_FACTOR;
export const PLAYER_SIZE = 30;
export const PLAYER_SPEED = 500;
export var Direction;
(function (Direction) {
    Direction[Direction["Left"] = 0] = "Left";
    Direction[Direction["Right"] = 1] = "Right";
    Direction[Direction["Up"] = 2] = "Up";
    Direction[Direction["Down"] = 3] = "Down";
    Direction[Direction["Count"] = 4] = "Count";
})(Direction || (Direction = {}));
export const DIRECTION_VECTORS = (() => {
    console.assert(Direction.Count == 4, "The definition of Direction have changed");
    const vectors = Array(Direction.Count);
    vectors[Direction.Left] = { x: -1, y: 0 };
    vectors[Direction.Right] = { x: 1, y: 0 };
    vectors[Direction.Up] = { x: 0, y: -1 };
    vectors[Direction.Down] = { x: 0, y: 1 };
    return vectors;
})();
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
    const x = allocFloat32Field(allocator);
    const y = allocFloat32Field(allocator);
    const hue = allocUint8Field(allocator);
    const size = allocator.size;
    const verify = verifier(kind, MessageKind.Hello, size);
    return { kind, id, x, y, hue, size, verify };
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
    const x = allocFloat32Field(allocator);
    const y = allocFloat32Field(allocator);
    const hue = allocUint8Field(allocator);
    const moving = allocUint8Field(allocator);
    const size = allocator.size;
    return { id, x, y, hue, moving, size };
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
    let dx = 0;
    let dy = 0;
    for (let dir = 0; dir < Direction.Count; dir += 1) {
        if ((player.moving >> dir) & 1) {
            dx += DIRECTION_VECTORS[dir].x;
            dy += DIRECTION_VECTORS[dir].y;
        }
    }
    const l = dx * dx + dy * dy;
    if (l !== 0) {
        dx /= l;
        dy /= l;
    }
    player.x = properMod(player.x + dx * PLAYER_SPEED * deltaTime, WORLD_WIDTH);
    player.y = properMod(player.y + dy * PLAYER_SPEED * deltaTime, WORLD_HEIGHT);
}
//# sourceMappingURL=common.mjs.map