import { readFileSync } from 'fs';
import { WebSocketServer } from 'ws';
import * as common from './common.mjs';
import { Vector2 } from './common.mjs';
const SERVER_FPS = 60;
const SERVER_TOTAL_LIMIT = 2000;
const SERVER_SINGLE_IP_LIMIT = 10;
var StatEntry;
(function (StatEntry) {
    StatEntry[StatEntry["UPTIME"] = 0] = "UPTIME";
    StatEntry[StatEntry["TICKS_COUNT"] = 1] = "TICKS_COUNT";
    StatEntry[StatEntry["TICK_TIMES"] = 2] = "TICK_TIMES";
    StatEntry[StatEntry["MESSAGES_SENT"] = 3] = "MESSAGES_SENT";
    StatEntry[StatEntry["MESSAGES_RECEIVED"] = 4] = "MESSAGES_RECEIVED";
    StatEntry[StatEntry["TICK_MESSAGES_SENT"] = 5] = "TICK_MESSAGES_SENT";
    StatEntry[StatEntry["TICK_MESSAGES_RECEIVED"] = 6] = "TICK_MESSAGES_RECEIVED";
    StatEntry[StatEntry["BYTES_SENT"] = 7] = "BYTES_SENT";
    StatEntry[StatEntry["BYTES_RECEIVED"] = 8] = "BYTES_RECEIVED";
    StatEntry[StatEntry["TICK_BYTE_SENT"] = 9] = "TICK_BYTE_SENT";
    StatEntry[StatEntry["TICK_BYTE_RECEIVED"] = 10] = "TICK_BYTE_RECEIVED";
    StatEntry[StatEntry["PLAYERS_CURRENTLY"] = 11] = "PLAYERS_CURRENTLY";
    StatEntry[StatEntry["PLAYERS_JOINED"] = 12] = "PLAYERS_JOINED";
    StatEntry[StatEntry["PLAYERS_LEFT"] = 13] = "PLAYERS_LEFT";
    StatEntry[StatEntry["BOGUS_AMOGUS_MESSAGES"] = 14] = "BOGUS_AMOGUS_MESSAGES";
    StatEntry[StatEntry["PLAYERS_REJECTED"] = 15] = "PLAYERS_REJECTED";
    StatEntry[StatEntry["COUNT"] = 16] = "COUNT";
})(StatEntry || (StatEntry = {}));
const wasmServer = await instantiateWasmServer('server.wasm');
wasmServer._initialize();
const players = new Map();
const connectionLimits = new Map();
let idCounter = 0;
let bytesReceivedWithinTick = 0;
let messagesRecievedWithinTick = 0;
const wss = new WebSocketServer({
    port: common.SERVER_PORT,
});
const joinedIds = new Set();
const leftIds = new Set();
const pingIds = new Map();
const bombsThrown = new Set();
const level = common.createLevel(wasmServer);
wss.on("connection", (ws, req) => {
    ws.binaryType = 'arraybuffer';
    if (players.size >= SERVER_TOTAL_LIMIT) {
        wasmServer.stats_inc_counter(StatEntry.PLAYERS_REJECTED, 1);
        ws.close();
        return;
    }
    if (req.socket.remoteAddress === undefined) {
        wasmServer.stats_inc_counter(StatEntry.PLAYERS_REJECTED, 1);
        ws.close();
        return;
    }
    const remoteAddress = req.socket.remoteAddress;
    {
        let count = connectionLimits.get(remoteAddress) || 0;
        if (count >= SERVER_SINGLE_IP_LIMIT) {
            wasmServer.stats_inc_counter(StatEntry.PLAYERS_REJECTED, 1);
            ws.close();
            return;
        }
        connectionLimits.set(remoteAddress, count + 1);
    }
    const id = idCounter++;
    const x = 0;
    const y = 0;
    const position = new Vector2(x, y);
    const hue = Math.floor(Math.random() * 360);
    const player = {
        ws,
        remoteAddress,
        id,
        position,
        direction: 0,
        moving: 0,
        newMoving: 0,
        hue,
        moved: false,
    };
    players.set(id, player);
    joinedIds.add(id);
    wasmServer.stats_inc_counter(StatEntry.PLAYERS_JOINED, 1);
    wasmServer.stats_inc_counter(StatEntry.PLAYERS_CURRENTLY, 1);
    ws.addEventListener("message", (event) => {
        wasmServer.stats_inc_counter(StatEntry.MESSAGES_RECEIVED, 1);
        messagesRecievedWithinTick += 1;
        if (!(event.data instanceof ArrayBuffer)) {
            wasmServer.stats_inc_counter(StatEntry.BOGUS_AMOGUS_MESSAGES, 1);
            ws.close();
            return;
        }
        const view = new DataView(event.data);
        wasmServer.stats_inc_counter(StatEntry.BYTES_RECEIVED, view.byteLength);
        bytesReceivedWithinTick += view.byteLength;
        if (common.AmmaMovingStruct.verify(view)) {
            const direction = common.AmmaMovingStruct.direction.read(view);
            const start = common.AmmaMovingStruct.start.read(view);
            if (start) {
                player.newMoving |= (1 << direction);
            }
            else {
                player.newMoving &= ~(1 << direction);
            }
        }
        else if (common.AmmaThrowingStruct.verify(view)) {
            const index = common.throwBomb(player, level.bombs);
            if (index !== null) {
                bombsThrown.add(index);
            }
        }
        else if (common.PingStruct.verify(view)) {
            pingIds.set(id, common.PingStruct.timestamp.read(view));
        }
        else {
            wasmServer.stats_inc_counter(StatEntry.BOGUS_AMOGUS_MESSAGES, 1);
            ws.close();
            return;
        }
    });
    ws.on("close", () => {
        let count = connectionLimits.get(remoteAddress);
        if (count !== undefined) {
            if (count <= 1) {
                connectionLimits.delete(remoteAddress);
            }
            else {
                connectionLimits.set(remoteAddress, count - 1);
            }
        }
        players.delete(id);
        wasmServer.stats_inc_counter(StatEntry.PLAYERS_LEFT, 1);
        wasmServer.stats_inc_counter(StatEntry.PLAYERS_CURRENTLY, -1);
        if (!joinedIds.delete(id)) {
            leftIds.add(id);
        }
    });
});
let previousTimestamp = performance.now();
function tick() {
    const timestamp = performance.now();
    const deltaTime = (timestamp - previousTimestamp) / 1000;
    previousTimestamp = timestamp;
    let messageSentCounter = 0;
    let bytesSentCounter = 0;
    if (joinedIds.size > 0) {
        {
            const playersCount = players.size;
            const bufferPlayersState = common.PlayersJoinedHeaderStruct.allocateAndInit(playersCount);
            {
                let index = 0;
                players.forEach((player) => {
                    const playerView = common.PlayersJoinedHeaderStruct.item(bufferPlayersState, index);
                    common.PlayerStruct.id.write(playerView, player.id);
                    common.PlayerStruct.x.write(playerView, player.position.x);
                    common.PlayerStruct.y.write(playerView, player.position.y);
                    common.PlayerStruct.direction.write(playerView, player.direction);
                    common.PlayerStruct.hue.write(playerView, player.hue / 360 * 256);
                    common.PlayerStruct.moving.write(playerView, player.moving);
                    index += 1;
                });
            }
            let itemsCount = 0;
            level.items.forEach((item) => {
                if (item.alive)
                    itemsCount += 1;
            });
            const bufferItemsState = common.ItemsSpawnedHeaderStruct.allocateAndInit(itemsCount);
            {
                let index = 0;
                level.items.forEach((item, itemIndex) => {
                    if (item.alive) {
                        const itemSpawnedView = common.ItemsSpawnedHeaderStruct.item(bufferItemsState, index);
                        common.ItemSpawnedStruct.itemKind.write(itemSpawnedView, item.kind);
                        common.ItemSpawnedStruct.itemIndex.write(itemSpawnedView, itemIndex);
                        common.ItemSpawnedStruct.x.write(itemSpawnedView, item.position.x);
                        common.ItemSpawnedStruct.y.write(itemSpawnedView, item.position.y);
                        index += 1;
                    }
                });
            }
            joinedIds.forEach((joinedId) => {
                const joinedPlayer = players.get(joinedId);
                if (joinedPlayer !== undefined) {
                    const view = new DataView(new ArrayBuffer(common.HelloStruct.size));
                    common.HelloStruct.kind.write(view, common.MessageKind.Hello);
                    common.HelloStruct.id.write(view, joinedPlayer.id);
                    common.HelloStruct.x.write(view, joinedPlayer.position.x);
                    common.HelloStruct.y.write(view, joinedPlayer.position.y);
                    common.HelloStruct.direction.write(view, joinedPlayer.direction);
                    common.HelloStruct.hue.write(view, Math.floor(joinedPlayer.hue / 360 * 256));
                    joinedPlayer.ws.send(view);
                    bytesSentCounter += view.byteLength;
                    messageSentCounter += 1;
                    joinedPlayer.ws.send(bufferPlayersState);
                    bytesSentCounter += bufferPlayersState.byteLength;
                    messageSentCounter += 1;
                    joinedPlayer.ws.send(bufferItemsState);
                    bytesSentCounter += bufferItemsState.byteLength;
                    messageSentCounter += 1;
                }
            });
        }
        {
            const count = joinedIds.size;
            const buffer = common.PlayersJoinedHeaderStruct.allocateAndInit(count);
            let index = 0;
            joinedIds.forEach((joinedId) => {
                const joinedPlayer = players.get(joinedId);
                if (joinedPlayer !== undefined) {
                    const playerView = common.PlayersJoinedHeaderStruct.item(buffer, index);
                    common.PlayerStruct.id.write(playerView, joinedPlayer.id);
                    common.PlayerStruct.x.write(playerView, joinedPlayer.position.x);
                    common.PlayerStruct.y.write(playerView, joinedPlayer.position.y);
                    common.PlayerStruct.direction.write(playerView, joinedPlayer.direction);
                    common.PlayerStruct.hue.write(playerView, joinedPlayer.hue / 360 * 256);
                    common.PlayerStruct.moving.write(playerView, joinedPlayer.moving);
                    index += 1;
                }
            });
            players.forEach((player) => {
                if (!joinedIds.has(player.id)) {
                    player.ws.send(buffer);
                    bytesSentCounter += buffer.byteLength;
                    messageSentCounter += 1;
                }
            });
        }
    }
    if (leftIds.size > 0) {
        const count = leftIds.size;
        const buffer = common.PlayersLeftHeaderStruct.allocateAndInit(count);
        let index = 0;
        leftIds.forEach((leftId) => {
            common.PlayersLeftHeaderStruct.item(buffer, index).setUint32(0, leftId, true);
            index += 1;
        });
        players.forEach((player) => {
            player.ws.send(buffer);
            bytesSentCounter += buffer.byteLength;
            messageSentCounter += 1;
        });
    }
    {
        let count = 0;
        players.forEach((player) => {
            if (player.newMoving !== player.moving) {
                count += 1;
            }
        });
        if (count > 0) {
            const buffer = common.PlayersMovingHeaderStruct.allocateAndInit(count);
            let index = 0;
            players.forEach((player) => {
                if (player.newMoving !== player.moving) {
                    player.moving = player.newMoving;
                    const playerView = common.PlayersMovingHeaderStruct.item(buffer, index);
                    common.PlayerStruct.id.write(playerView, player.id);
                    common.PlayerStruct.x.write(playerView, player.position.x);
                    common.PlayerStruct.y.write(playerView, player.position.y);
                    common.PlayerStruct.direction.write(playerView, player.direction);
                    common.PlayerStruct.moving.write(playerView, player.moving);
                    index += 1;
                }
            });
            players.forEach((player) => {
                player.ws.send(buffer);
                bytesSentCounter += buffer.byteLength;
                messageSentCounter += 1;
            });
        }
    }
    bombsThrown.forEach((index) => {
        const bomb = level.bombs[index];
        const view = new DataView(new ArrayBuffer(common.BombSpawnedStruct.size));
        common.BombSpawnedStruct.kind.write(view, common.MessageKind.BombSpawned);
        common.BombSpawnedStruct.index.write(view, index);
        common.BombSpawnedStruct.x.write(view, bomb.position.x);
        common.BombSpawnedStruct.y.write(view, bomb.position.y);
        common.BombSpawnedStruct.z.write(view, bomb.position.z);
        common.BombSpawnedStruct.dx.write(view, bomb.velocity.x);
        common.BombSpawnedStruct.dy.write(view, bomb.velocity.y);
        common.BombSpawnedStruct.dz.write(view, bomb.velocity.z);
        common.BombSpawnedStruct.lifetime.write(view, bomb.lifetime);
        players.forEach((player) => {
            player.ws.send(view);
            bytesSentCounter += view.byteLength;
            messageSentCounter += 1;
        });
    });
    {
        let collectedItemIds = [];
        players.forEach((player) => {
            common.updatePlayer(wasmServer, player, level.scene, deltaTime);
            level.items.forEach((item, itemIndex) => {
                if (item.alive) {
                    if (common.collectItem(player, item)) {
                        collectedItemIds.push(itemIndex);
                    }
                }
            });
        });
        const bufferItemsCollected = common.ItemsCollectedBatchStruct.allocateAndInit(collectedItemIds.length);
        for (let i = 0; i < collectedItemIds.length; ++i) {
            common.ItemsCollectedBatchStruct.item(bufferItemsCollected, i).setUint32(0, collectedItemIds[i], true);
        }
        players.forEach((player) => {
            player.ws.send(bufferItemsCollected);
            bytesSentCounter += bufferItemsCollected.byteLength;
            messageSentCounter += 1;
        });
        for (let index = 0; index < level.bombs.length; ++index) {
            const bomb = level.bombs[index];
            if (bomb.lifetime > 0) {
                common.updateBomb(wasmServer, bomb, level.scene, deltaTime);
                if (bomb.lifetime <= 0) {
                    const view = new DataView(new ArrayBuffer(common.BombExplodedStruct.size));
                    common.BombExplodedStruct.kind.write(view, common.MessageKind.BombExploded);
                    common.BombExplodedStruct.index.write(view, index);
                    common.BombExplodedStruct.x.write(view, bomb.position.x);
                    common.BombExplodedStruct.y.write(view, bomb.position.y);
                    common.BombExplodedStruct.z.write(view, bomb.position.z);
                    players.forEach((player) => {
                        player.ws.send(view);
                        bytesSentCounter += view.byteLength;
                        messageSentCounter += 1;
                    });
                }
            }
        }
    }
    pingIds.forEach((timestamp, id) => {
        const player = players.get(id);
        if (player !== undefined) {
            const view = new DataView(new ArrayBuffer(common.PongStruct.size));
            common.PongStruct.kind.write(view, common.MessageKind.Pong);
            common.PongStruct.timestamp.write(view, timestamp);
            player.ws.send(view);
            bytesSentCounter += view.byteLength;
            messageSentCounter += 1;
        }
    });
    const tickTime = performance.now() - timestamp;
    wasmServer.stats_inc_counter(StatEntry.TICKS_COUNT, 1);
    wasmServer.stats_push_sample(StatEntry.TICK_TIMES, tickTime / 1000);
    wasmServer.stats_inc_counter(StatEntry.MESSAGES_SENT, messageSentCounter);
    wasmServer.stats_push_sample(StatEntry.TICK_MESSAGES_SENT, messageSentCounter);
    wasmServer.stats_push_sample(StatEntry.TICK_MESSAGES_RECEIVED, messagesRecievedWithinTick);
    wasmServer.stats_inc_counter(StatEntry.BYTES_SENT, bytesSentCounter);
    wasmServer.stats_push_sample(StatEntry.TICK_BYTE_SENT, bytesSentCounter);
    wasmServer.stats_push_sample(StatEntry.TICK_BYTE_RECEIVED, bytesReceivedWithinTick);
    joinedIds.clear();
    leftIds.clear();
    pingIds.clear();
    bombsThrown.clear();
    bytesReceivedWithinTick = 0;
    messagesRecievedWithinTick = 0;
    wasmServer.stats_print_per_n_ticks(SERVER_FPS);
    setTimeout(tick, Math.max(0, 1000 / SERVER_FPS - tickTime));
}
function js_now_secs() {
    return Math.floor(Date.now() / 1000);
}
function js_write(buffer, buffer_len) {
    console.log(new TextDecoder().decode(new Uint8ClampedArray(wasmServer.memory.buffer, buffer, buffer_len)));
}
async function instantiateWasmServer(path) {
    const wasm = await WebAssembly.instantiate(readFileSync(path), {
        "env": { js_now_secs, js_write },
    });
    return {
        wasm,
        memory: wasm.instance.exports.memory,
        _initialize: wasm.instance.exports._initialize,
        allocate_scene: wasm.instance.exports.allocate_scene,
        stats_inc_counter: wasm.instance.exports.stats_inc_counter,
        stats_push_sample: wasm.instance.exports.stats_push_sample,
        stats_print_per_n_ticks: wasm.instance.exports.stats_print_per_n_ticks,
    };
}
setTimeout(tick, 1000 / SERVER_FPS);
console.log(`Listening to ws://0.0.0.0:${common.SERVER_PORT}`);
//# sourceMappingURL=server.mjs.map