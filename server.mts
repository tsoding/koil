import {WebSocketServer, WebSocket} from 'ws';
import * as common from './common.mjs'
import {Player} from './common.mjs';

namespace Stats {
    const AVERAGE_CAPACITY = 30;

    export interface Counter {
        kind: 'counter',
        counter: number,
        description: string,
    }

    export interface Average {
        kind: 'average';
        samples: Array<number>;
        description: string;
        pushSample(sample: number): void;
    }

    export interface Timer {
        kind: 'timer',
        startedAt: number,
        description: string,
    }

    type Stat = Counter | Average | Timer;
    type Stats = {[key: string]: Stat}
    const stats: Stats = {}

    function average(samples: Array<number>): number {
        return samples.reduce((a, b) => a + b, 0)/samples.length
    }

    function pluralNumber(num: number, singular: string, plural: string): string {
        return num === 1 ? singular : plural;
    }

    function displayTimeInterval(diffMs: number): string {
        const result = []
        const diffSecs = Math.floor(diffMs/1000);

        const days = Math.floor(diffSecs/60/60/24)
        if (days > 0) result.push(`${days} ${pluralNumber(days, 'day', 'days')}`);
        const hours = Math.floor(diffSecs/60/60%24);
        if (hours > 0) result.push(`${hours} ${pluralNumber(hours, 'hour', 'hours')}`);
        const mins = Math.floor(diffSecs/60%60);
        if (mins > 0) result.push(`${mins} ${pluralNumber(mins, 'min', 'mins')}`);
        const secs = Math.floor(diffSecs%60);
        if (secs > 0) result.push(`${secs} ${pluralNumber(secs, 'sec', 'secs')}`);
        return result.length === 0 ? '0 secs' : result.join(' ');
    }

    function getStat(stat: Stat): string {
        switch (stat.kind) {
            case 'counter': return stat.counter.toString();
            case 'average': return average(stat.samples).toString();
            case 'timer':   return displayTimeInterval(Date.now() - stat.startedAt);
        }
    }

    function registerCounter(name: string, description: string): Counter {
        const stat: Counter = {
            kind: 'counter',
            counter: 0,
            description,
        }
        stats[name] = stat;
        return stat;
    }

    function pushSample(this: Average, sample: number) {
        while (this.samples.length > AVERAGE_CAPACITY) this.samples.shift();
        this.samples.push(sample);
    }

    function registerAverage(name: string, description: string): Average {
        const stat: Average = {
            kind: 'average',
            samples: [],
            description,
            pushSample,
        }
        stats[name] = stat;
        return stat;
    }

    function registerTimer(name: string, description: string): Timer {
        const stat: Timer = {
            kind: 'timer',
            startedAt: 0,
            description,
        }
        stats[name] = stat;
        return stat;
    }

    export function print() {
        console.log("Stats:")
        for (let key in stats) {
            console.log(`  ${stats[key].description}`, getStat(stats[key]));
        }
    }

    export const uptime               = registerTimer  ("uptime",               "Uptime");
    export const ticksCount           = registerCounter("ticksCount",           "Ticks count");
    export const tickTimes            = registerAverage("tickTimes",            "Average time to process a tick");
    export const messagesSent         = registerCounter("messagesSent",         "Total messages sent");
    export const messagesReceived     = registerCounter("messagesReceived",     "Total messages received");
    export const tickMessagesSent     = registerAverage("tickMessagesSent",     "Average messages sent per tick");
    export const tickMessagesReceived = registerAverage("tickMessagesReceived", "Average messages received per tick");
    export const bytesSent            = registerCounter("bytesSent",            "Total bytes sent");
    export const bytesReceived        = registerCounter("bytesReceived",        "Total bytes received");
    export const tickByteSent         = registerAverage("tickByteSent",         "Average bytes sent per tick");
    export const tickByteReceived     = registerAverage("tickByteReceived",     "Average bytes received per tick");
    export const playersCurrently     = registerCounter("playersCurrently",     "Currently players");
    export const playersJoined        = registerCounter("playersJoined",        "Total players joined");
    export const playersLeft          = registerCounter("playersLeft",          "Total players left");
    export const bogusAmogusMessages  = registerCounter("bogusAmogusMessages",  "Total bogus-amogus messages");
    export const playersRejected      = registerCounter("playersRejected",      "Total players rejected");
}

const SERVER_FPS = 60;
const SERVER_TOTAL_LIMIT = 2000;
const SERVER_SINGLE_IP_LIMIT = 10;

interface PlayerOnServer extends Player {
    ws: WebSocket,
    remoteAddress: string,
    newMoving: number,
}

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

wss.on("connection", (ws, req) => {
    ws.binaryType = 'arraybuffer';

    if (players.size >= SERVER_TOTAL_LIMIT) {
        Stats.playersRejected.counter += 1
        ws.close();
        return;
    }

    if (req.socket.remoteAddress === undefined) {
        // NOTE: something weird happened the client does not have a remote address
        Stats.playersRejected.counter += 1;
        ws.close();
        return;
    }

    const remoteAddress = req.socket.remoteAddress;

    {
        let count = connectionLimits.get(remoteAddress) || 0;
        if (count >= SERVER_SINGLE_IP_LIMIT) {
            Stats.playersRejected.counter += 1;
            ws.close();
            return;
        }
        connectionLimits.set(remoteAddress, count + 1);
    }

    const id = idCounter++;
    const x = Math.random()*(common.WORLD_WIDTH - common.PLAYER_SIZE);
    const y = Math.random()*(common.WORLD_HEIGHT - common.PLAYER_SIZE);
    const hue = Math.floor(Math.random()*360);
    const player = {
        ws,
        remoteAddress,
        id,
        x,
        y,
        moving: 0,
        newMoving: 0,
        hue,
        moved: false,
    }
    players.set(id, player);
    // console.log(`Player ${id} connected`);
    joinedIds.add(id);
    Stats.playersJoined.counter += 1;
    Stats.playersCurrently.counter += 1;
    ws.addEventListener("message", (event) => {
        Stats.messagesReceived.counter += 1;
        messagesRecievedWithinTick += 1;

        if (!(event.data instanceof ArrayBuffer)){
            Stats.bogusAmogusMessages.counter += 1;
            // console.log(`Received bogus-amogus message from client ${id}:`, message)
            ws.close();
            return;
        }

        const view = new DataView(event.data);
        Stats.bytesReceived.counter += view.byteLength;
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
        } else if (common.PingStruct.verify(view)) {
            pingIds.set(id, common.PingStruct.timestamp.read(view));
        } else {
            // console.log(`Received bogus-amogus message from client ${id}:`, message)
            Stats.bogusAmogusMessages.counter += 1;
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
        Stats.playersLeft.counter += 1;
        Stats.playersCurrently.counter -= 1;
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
            const count = players.size;
            const buffer = new ArrayBuffer(common.PlayersJoinedHeaderStruct.size + count*common.PlayerStruct.size);
            const headerView = new DataView(buffer, 0, common.PlayersJoinedHeaderStruct.size);
            common.PlayersJoinedHeaderStruct.kind.write(headerView, common.MessageKind.PlayerJoined);

            // Reconstructing the state of the other players
            let index = 0;
            players.forEach((player) => {
                const playerView = new DataView(buffer, common.PlayersJoinedHeaderStruct.size + index*common.PlayerStruct.size);
                common.PlayerStruct.id.write(playerView, player.id);
                common.PlayerStruct.x.write(playerView, player.x);
                common.PlayerStruct.y.write(playerView, player.y);
                common.PlayerStruct.hue.write(playerView, player.hue/360*256);
                common.PlayerStruct.moving.write(playerView, player.moving);
                index += 1;
            })

            // Greeting all the joined players and notifying them about other players
            joinedIds.forEach((joinedId) => {
                const joinedPlayer = players.get(joinedId);
                if (joinedPlayer !== undefined) { // This should never happen, but we handling none existing ids for more robustness
                    // The greetings
                    const view = new DataView(new ArrayBuffer(common.HelloStruct.size));
                    common.HelloStruct.kind.write(view, common.MessageKind.Hello);
                    common.HelloStruct.id.write(view, joinedPlayer.id);
                    common.HelloStruct.x.write(view, joinedPlayer.x);
                    common.HelloStruct.y.write(view, joinedPlayer.y);
                    common.HelloStruct.hue.write(view, Math.floor(joinedPlayer.hue/360*256));
                    joinedPlayer.ws.send(view);
                    bytesSentCounter += view.byteLength;
                    messageSentCounter += 1

                    // Reconstructing the state of the other players
                    joinedPlayer.ws.send(buffer);
                    bytesSentCounter += buffer.byteLength;
                    messageSentCounter += 1
                }
            })
        }

        // Notifying old player about who joined
        {
            const count = joinedIds.size;
            const buffer = new ArrayBuffer(common.PlayersJoinedHeaderStruct.size + count*common.PlayerStruct.size);
            const headerView = new DataView(buffer, 0, common.PlayersJoinedHeaderStruct.size);
            common.PlayersJoinedHeaderStruct.kind.write(headerView, common.MessageKind.PlayerJoined);

            let index = 0;
            joinedIds.forEach((joinedId) => {
                const joinedPlayer = players.get(joinedId);
                if (joinedPlayer !== undefined) { // This should never happen, but we handling none existing ids for more robustness
                    const playerView = new DataView(buffer, common.PlayersJoinedHeaderStruct.size + index*common.PlayerStruct.size);
                    common.PlayerStruct.id.write(playerView, joinedPlayer.id);
                    common.PlayerStruct.x.write(playerView, joinedPlayer.x);
                    common.PlayerStruct.y.write(playerView, joinedPlayer.y);
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
        const view = common.PlayersLeftHeaderStruct.allocateAndInit(count);
        let index = 0;
        leftIds.forEach((leftId) => {
            common.PlayersLeftHeaderStruct.items(index).id.write(view, leftId)
            index += 1;
        })
        players.forEach((player) => {
            player.ws.send(view);
            bytesSentCounter += view.byteLength;
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
            const buffer = new ArrayBuffer(common.PlayersMovingHeaderStruct.size + count*common.PlayerStruct.size);
            const headerView = new DataView(buffer, 0, common.PlayersMovingHeaderStruct.size);
            common.PlayersMovingHeaderStruct.kind.write(headerView, common.MessageKind.PlayerMoving);

            let index = 0;
            players.forEach((player) => {
                if (player.newMoving !== player.moving) {
                    player.moving = player.newMoving;
                    const playerView = new DataView(buffer, common.PlayersMovingHeaderStruct.size + index*common.PlayerStruct.size);
                    common.PlayerStruct.id.write(playerView, player.id);
                    common.PlayerStruct.x.write(playerView, player.x);
                    common.PlayerStruct.y.write(playerView, player.y);
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

    // Simulating the world for one server tick.
    players.forEach((player) => common.updatePlayer(player, deltaTime))

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
    Stats.ticksCount.counter += 1;
    Stats.tickTimes.pushSample(tickTime/1000);
    Stats.messagesSent.counter += messageSentCounter;
    Stats.tickMessagesSent.pushSample(messageSentCounter);
    Stats.tickMessagesReceived.pushSample(messagesRecievedWithinTick);
    Stats.bytesSent.counter += bytesSentCounter;
    Stats.tickByteSent.pushSample(bytesSentCounter);
    Stats.tickByteReceived.pushSample(bytesReceivedWithinTick);

    joinedIds.clear();
    leftIds.clear();
    pingIds.clear();
    bytesReceivedWithinTick = 0;
    messagesRecievedWithinTick = 0;

    if (Stats.ticksCount.counter%SERVER_FPS === 0) {
        // TODO: serve the stats over a separate websocket, so a separate html page can poll it once in a while
        Stats.print()
    }

    setTimeout(tick, Math.max(0, 1000/SERVER_FPS - tickTime));
}
Stats.uptime.startedAt = Date.now()
setTimeout(tick, 1000/SERVER_FPS);

console.log(`Listening to ws://0.0.0.0:${common.SERVER_PORT}`)
