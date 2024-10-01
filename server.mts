import {readFileSync} from 'fs';
import {WebSocketServer, WebSocket} from 'ws';
import * as common from './common.mjs'
import {Player, Vector2} from './common.mjs';

const SERVER_FPS = 60;
const SERVER_TOTAL_LIMIT = 2000;
const SERVER_SINGLE_IP_LIMIT = 10;

// IMPORTANT: This must be synchronized with the StatEntry in server.c3 until server.mts is fully rewritten in C3.
enum StatEntry {
    UPTIME,
    TICKS_COUNT,
    TICK_TIMES,
    MESSAGES_SENT,
    MESSAGES_RECEIVED,
    TICK_MESSAGES_SENT,
    TICK_MESSAGES_RECEIVED,
    BYTES_SENT,
    BYTES_RECEIVED,
    TICK_BYTE_SENT,
    TICK_BYTE_RECEIVED,
    PLAYERS_CURRENTLY,
    PLAYERS_JOINED,
    PLAYERS_LEFT,
    BOGUS_AMOGUS_MESSAGES,
    PLAYERS_REJECTED,
    COUNT,
}

interface PlayerOnServer extends Player {
    ws: WebSocket,
    remoteAddress: string,
    newMoving: number,
}

const wasmServer = await instantiateWasmServer('server.wasm');
const players = new Map<number, PlayerOnServer>();
const connectionLimits = new Map<string, number>();
let idCounter = 0;
let bytesReceivedWithinTick = 0;
let messagesRecievedWithinTick = 0;
const wss = new WebSocketServer({
    port: common.SERVER_PORT,
})
const joinedIds = new Set<number>()
const leftIds = new Set<number>()
const pingIds = new Map<number, number>()
const level = common.createLevel(wasmServer);

wss.on("connection", (ws, req) => {
    ws.binaryType = 'arraybuffer';

    if (players.size >= SERVER_TOTAL_LIMIT) {
        wasmServer.stats_inc_counter(StatEntry.PLAYERS_REJECTED, 1);
        ws.close();
        return;
    }

    if (req.socket.remoteAddress === undefined) {
        // NOTE: something weird happened the client does not have a remote address
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
    const x = 0;//Math.random()*(common.WORLD_WIDTH - common.PLAYER_SIZE);
    const y = 0;//Math.random()*(common.WORLD_HEIGHT - common.PLAYER_SIZE);
    const position = new Vector2(x, y);
    const hue = Math.floor(Math.random()*360);
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
    }
    players.set(id, player);
    // console.log(`Player ${id} connected`);
    joinedIds.add(id);
    wasmServer.stats_inc_counter(StatEntry.PLAYERS_JOINED, 1);
    wasmServer.stats_inc_counter(StatEntry.PLAYERS_CURRENTLY, 1);
    ws.addEventListener("message", (event) => {
        wasmServer.stats_inc_counter(StatEntry.MESSAGES_RECEIVED, 1);
        messagesRecievedWithinTick += 1;

        if (!(event.data instanceof ArrayBuffer)){
            wasmServer.stats_inc_counter(StatEntry.BOGUS_AMOGUS_MESSAGES, 1);
            // console.log(`Received bogus-amogus message from client ${id}:`, message)
            ws.close();
            return;
        }

        const view = new DataView(event.data);
        wasmServer.stats_inc_counter(StatEntry.BYTES_RECEIVED, view.byteLength)
        bytesReceivedWithinTick += view.byteLength;
        if (common.AmmaMovingStruct.verify(view)) {
            // console.log(`Received message from player ${id}`, message)
            const direction = common.AmmaMovingStruct.direction.read(view);
            const start = common.AmmaMovingStruct.start.read(view);
            if (start) {
                player.newMoving |= (1<<direction);
            } else {
                player.newMoving &= ~(1<<direction);
            }
        } else if (common.AmmaThrowingStruct.verify(view)) {
            wasmServer.throw_bomb_on_server_side(player.position.x, player.position.y, player.direction, level.bombsPtr);
        } else if (common.PingStruct.verify(view)) {
            pingIds.set(id, common.PingStruct.timestamp.read(view));
        } else {
            // console.log(`Received bogus-amogus message from client ${id}:`, view)
            wasmServer.stats_inc_counter(StatEntry.BOGUS_AMOGUS_MESSAGES, 1);
            ws.close();
            return;
        }
    });
    ws.on("close", () => {
        // console.log(`Player ${id} disconnected`);
        let count = connectionLimits.get(remoteAddress);
        if (count !== undefined) {
            if (count <= 1) {
                connectionLimits.delete(remoteAddress);
            } else {
                connectionLimits.set(remoteAddress, count - 1);
            }
        }
        players.delete(id);
        wasmServer.stats_inc_counter(StatEntry.PLAYERS_LEFT, 1);
        wasmServer.stats_inc_counter(StatEntry.PLAYERS_CURRENTLY, -1);
        if (!joinedIds.delete(id)) {
            leftIds.add(id);
        }
    })
})

let previousTimestamp = performance.now();
function tick() {
    const timestamp = performance.now();
    const deltaTime = (timestamp - previousTimestamp)/1000
    previousTimestamp = timestamp;
    let messageSentCounter = 0;
    let bytesSentCounter = 0;

    if (joinedIds.size > 0) {
        // Initialize joined player
        {
            // Reconstructing the state of the other players batch
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
                    common.PlayerStruct.hue.write(playerView, player.hue/360*256);
                    common.PlayerStruct.moving.write(playerView, player.moving);
                    index += 1;
                })
            }

            // Reconstructing the state of items batch
            const bufferItemsState = (() => {
                const message = wasmServer.reconstruct_state_of_items(level.itemsPtr);
                const size = new DataView(wasmServer.memory.buffer, message, common.UINT32_SIZE).getUint32(0, true);
                return new Uint8ClampedArray(wasmServer.memory.buffer, message + common.UINT32_SIZE, size - common.UINT32_SIZE);
            })();

            // Greeting all the joined players and notifying them about other players
            joinedIds.forEach((joinedId) => {
                const joinedPlayer = players.get(joinedId);
                if (joinedPlayer !== undefined) { // This should never happen, but we handling none existing ids for more robustness
                    // The greetings
                    const view = new DataView(new ArrayBuffer(common.HelloStruct.size));
                    common.HelloStruct.kind.write(view, common.MessageKind.Hello);
                    common.HelloStruct.id.write(view, joinedPlayer.id);
                    common.HelloStruct.x.write(view, joinedPlayer.position.x);
                    common.HelloStruct.y.write(view, joinedPlayer.position.y);
                    common.HelloStruct.direction.write(view, joinedPlayer.direction);
                    common.HelloStruct.hue.write(view, Math.floor(joinedPlayer.hue/360*256));
                    joinedPlayer.ws.send(view);
                    bytesSentCounter += view.byteLength;
                    messageSentCounter += 1

                    // Reconstructing the state of the other players
                    joinedPlayer.ws.send(bufferPlayersState);
                    bytesSentCounter += bufferPlayersState.byteLength;
                    messageSentCounter += 1

                    // Reconstructing the state of items
                    joinedPlayer.ws.send(bufferItemsState);
                    bytesSentCounter += bufferItemsState.byteLength;
                    messageSentCounter += 1

                    // TODO: Reconstructing the state of bombs
                }
            })
        }

        // Notifying old player about who joined
        {
            const count = joinedIds.size;
            const buffer = common.PlayersJoinedHeaderStruct.allocateAndInit(count);

            let index = 0;
            joinedIds.forEach((joinedId) => {
                const joinedPlayer = players.get(joinedId);
                if (joinedPlayer !== undefined) { // This should never happen, but we handling none existing ids for more robustness
                    const playerView = common.PlayersJoinedHeaderStruct.item(buffer, index);
                    common.PlayerStruct.id.write(playerView, joinedPlayer.id);
                    common.PlayerStruct.x.write(playerView, joinedPlayer.position.x);
                    common.PlayerStruct.y.write(playerView, joinedPlayer.position.y);
                    common.PlayerStruct.direction.write(playerView, joinedPlayer.direction);
                    common.PlayerStruct.hue.write(playerView, joinedPlayer.hue/360*256);
                    common.PlayerStruct.moving.write(playerView, joinedPlayer.moving);
                    index += 1;
                }
            });

            players.forEach((player) => {
                if (!joinedIds.has(player.id)) { // Joined player should already know about themselves
                    player.ws.send(buffer);
                    bytesSentCounter += buffer.byteLength;
                    messageSentCounter += 1
                }
            })
        }
    }

    // Notifying about whom left
    if (leftIds.size > 0) {
        const count = leftIds.size;
        const buffer = common.PlayersLeftHeaderStruct.allocateAndInit(count);
        let index = 0;
        leftIds.forEach((leftId) => {
            common.PlayersLeftHeaderStruct.item(buffer, index).setUint32(0, leftId, true);
            index += 1;
        })
        players.forEach((player) => {
            player.ws.send(buffer);
            bytesSentCounter += buffer.byteLength;
            messageSentCounter += 1
        })
    }

    // Notify about moving player
    {
        let count = 0;
        players.forEach((player) => {
            if (player.newMoving !== player.moving) {
                count += 1;
            }
        })
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

    // Notifying about thrown bombs
    const bufferBombsThrown = (() => {
        const message = wasmServer.thrown_bombs_as_batch_message(level.bombsPtr);
        if (message === 0) return null;
        const size = new DataView(wasmServer.memory.buffer, message, common.UINT32_SIZE).getUint32(0, true);
        return new Uint8ClampedArray(wasmServer.memory.buffer, message + common.UINT32_SIZE, size - common.UINT32_SIZE);
    })();

    if (bufferBombsThrown !== null) {
        players.forEach((player) => {
            player.ws.send(bufferBombsThrown);
            bytesSentCounter += bufferBombsThrown.byteLength;
            messageSentCounter += 1;
        })
    }

    // Simulating the world for one server tick.
    {
        players.forEach((player) => {
            common.updatePlayer(wasmServer, player, level.scenePtr, deltaTime);
            wasmServer.collect_items_by_player_at(player.position.x, player.position.y, level.itemsPtr);
        });

        const bufferItemsCollected = (() => {
            const message = wasmServer.collected_items_as_batch_message(level.itemsPtr);
            if (message === 0) return null;
            const size = new DataView(wasmServer.memory.buffer, message, common.UINT32_SIZE).getUint32(0, true);
            return new Uint8ClampedArray(wasmServer.memory.buffer, message + common.UINT32_SIZE, size - common.UINT32_SIZE);
        })();

        if (bufferItemsCollected !== null) {
            players.forEach((player) => {
                player.ws.send(bufferItemsCollected);
                bytesSentCounter += bufferItemsCollected.byteLength;
                messageSentCounter += 1;
            });
        }

        wasmServer.update_bombs_on_server_side(level.scenePtr, deltaTime, level.bombsPtr);
        const bufferBombsExploded = (() => {
            const message = wasmServer.exploded_bombs_as_batch_message(level.bombsPtr);
            if (message === 0) return null;
            const size = new DataView(wasmServer.memory.buffer, message, common.UINT32_SIZE).getUint32(0, true);
            return new Uint8ClampedArray(wasmServer.memory.buffer, message + common.UINT32_SIZE, size - common.UINT32_SIZE);
        })();
        
        if (bufferBombsExploded !== null) {
            players.forEach((player) => {
                player.ws.send(bufferBombsExploded);
                bytesSentCounter += bufferBombsExploded.byteLength;
                messageSentCounter += 1;
            })
        }
    }

    // Sending out pings
    pingIds.forEach((timestamp, id) => {
        const player = players.get(id);
        if (player !== undefined) { // This MAY happen. A player may send a ping and leave.
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
    wasmServer.stats_push_sample(StatEntry.TICK_TIMES, tickTime/1000);
    wasmServer.stats_inc_counter(StatEntry.MESSAGES_SENT, messageSentCounter);
    wasmServer.stats_push_sample(StatEntry.TICK_MESSAGES_SENT, messageSentCounter);
    wasmServer.stats_push_sample(StatEntry.TICK_MESSAGES_RECEIVED, messagesRecievedWithinTick);
    wasmServer.stats_inc_counter(StatEntry.BYTES_SENT, bytesSentCounter);
    wasmServer.stats_push_sample(StatEntry.TICK_BYTE_SENT, bytesSentCounter);
    wasmServer.stats_push_sample(StatEntry.TICK_BYTE_RECEIVED, bytesReceivedWithinTick);

    joinedIds.clear();
    leftIds.clear();
    pingIds.clear();
    bytesReceivedWithinTick = 0;
    messagesRecievedWithinTick = 0;

    // TODO: serve the stats over a separate websocket, so a separate html page can poll it once in a while
    wasmServer.stats_print_per_n_ticks(SERVER_FPS);

    wasmServer.reset_temp_mark();
    setTimeout(tick, Math.max(0, 1000/SERVER_FPS - tickTime));
}

interface WasmServer extends common.WasmCommon {
    stats_inc_counter: (entry: number, delta: number) => void,
    stats_push_sample: (entry: number, sample: number) => void,
    stats_print_per_n_ticks: (n: number) => void,
    reconstruct_state_of_items: (items: number) => number,
    collect_items_by_player_at: (player_position_x: number, player_position_y: number, items: number) => void,
    collected_items_as_batch_message: (items: number) => number,
    throw_bomb: (player_position_x: number, player_position_y: number, player_direction: number, bombs: number) => number,
    throw_bomb_on_server_side: (player_position_x: number, player_position_y: number, player_direction: number, bombs: number) => number,
    thrown_bombs_as_batch_message: (bombs: number) => number,
    update_bombs_on_server_side: (scene: number, delta_time: number, bombs: number) => void,
    exploded_bombs_as_batch_message: (bombs: number) => number,
}

function platform_now_secs(): number {
    return Math.floor(Date.now()/1000);
}

// NOTE: This implicitly adds newline, but given how we using this
// function in server.c3 it's actually fine. This function is called
// once per io::printn() anyway.
function platform_write(buffer: number, buffer_len: number) {
    console.log(new TextDecoder().decode(new Uint8ClampedArray(wasmServer.memory.buffer, buffer, buffer_len)));
}

async function instantiateWasmServer(path: string): Promise<WasmServer> {
    const wasm = await WebAssembly.instantiate(readFileSync(path), {
        "env": {platform_now_secs, platform_write},
    });
    const wasmCommon = common.makeWasmCommon(wasm);
    wasmCommon._initialize();
    return {
        ...wasmCommon,
        stats_inc_counter: wasm.instance.exports.stats_inc_counter as (entry: number) => void,
        stats_push_sample: wasm.instance.exports.stats_push_sample as (entry: number, sample: number) => void,
        stats_print_per_n_ticks: wasm.instance.exports.stats_print_per_n_ticks as (n: number) => void,
        reconstruct_state_of_items: wasm.instance.exports.reconstruct_state_of_items as (items: number) => number,
        collect_items_by_player_at: wasm.instance.exports.collect_items_by_player_at as (player_position_x: number, player_position_y: number, items: number) => void,
        collected_items_as_batch_message: wasm.instance.exports.collected_items_as_batch_message as (items: number) => number,
        throw_bomb: wasm.instance.exports.throw_bomb as (player_position_x: number, player_position_y: number, player_direction: number, bombs: number) => number,
        throw_bomb_on_server_side: wasm.instance.exports.throw_bomb_on_server_side as (player_position_x: number, player_position_y: number, player_direction: number, bombs: number) => number,
        thrown_bombs_as_batch_message: wasm.instance.exports.thrown_bombs_as_batch_message as (bombs: number) => number,
        update_bombs_on_server_side: wasm.instance.exports.update_bombs_on_server_side as (scene: number, delta_time: number, bombs: number) => void,
        exploded_bombs_as_batch_message: wasm.instance.exports.exploded_bombs_as_batch_message as (bombs: number) => number
    };
}

setTimeout(tick, 1000/SERVER_FPS);

console.log(`Listening to ws://0.0.0.0:${common.SERVER_PORT}`)
