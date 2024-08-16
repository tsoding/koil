import { WebSocketServer } from 'ws';
import * as common from './common.mjs';
var Stats;
(function (Stats) {
    const AVERAGE_CAPACITY = 30;
    const stats = {};
    function average(samples) {
        return samples.reduce((a, b) => a + b, 0) / samples.length;
    }
    function pluralNumber(num, singular, plural) {
        return num === 1 ? singular : plural;
    }
    function displayTimeInterval(diffMs) {
        const result = [];
        const diffSecs = Math.floor(diffMs / 1000);
        const days = Math.floor(diffSecs / 60 / 60 / 24);
        if (days > 0)
            result.push(`${days} ${pluralNumber(days, 'day', 'days')}`);
        const hours = Math.floor(diffSecs / 60 / 60 % 24);
        if (hours > 0)
            result.push(`${hours} ${pluralNumber(hours, 'hour', 'hours')}`);
        const mins = Math.floor(diffSecs / 60 % 60);
        if (mins > 0)
            result.push(`${mins} ${pluralNumber(mins, 'min', 'mins')}`);
        const secs = Math.floor(diffSecs % 60);
        if (secs > 0)
            result.push(`${secs} ${pluralNumber(secs, 'sec', 'secs')}`);
        return result.length === 0 ? '0 secs' : result.join(' ');
    }
    function getStat(stat) {
        switch (stat.kind) {
            case 'counter': return stat.counter.toString();
            case 'average': return average(stat.samples).toString();
            case 'timer': return displayTimeInterval(Date.now() - stat.startedAt);
        }
    }
    function registerCounter(name, description) {
        const stat = {
            kind: 'counter',
            counter: 0,
            description,
        };
        stats[name] = stat;
        return stat;
    }
    function pushSample(sample) {
        while (this.samples.length > AVERAGE_CAPACITY)
            this.samples.shift();
        this.samples.push(sample);
    }
    function registerAverage(name, description) {
        const stat = {
            kind: 'average',
            samples: [],
            description,
            pushSample,
        };
        stats[name] = stat;
        return stat;
    }
    function registerTimer(name, description) {
        const stat = {
            kind: 'timer',
            startedAt: 0,
            description,
        };
        stats[name] = stat;
        return stat;
    }
    function print() {
        console.log("Stats:");
        for (let key in stats) {
            console.log(`  ${stats[key].description}`, getStat(stats[key]));
        }
    }
    Stats.print = print;
    Stats.uptime = registerTimer("uptime", "Uptime");
    Stats.ticksCount = registerCounter("ticksCount", "Ticks count");
    Stats.tickTimes = registerAverage("tickTimes", "Average time to process a tick");
    Stats.messagesSent = registerCounter("messagesSent", "Total messages sent");
    Stats.messagesReceived = registerCounter("messagesReceived", "Total messages received");
    Stats.tickMessagesSent = registerAverage("tickMessagesSent", "Average messages sent per tick");
    Stats.tickMessagesReceived = registerAverage("tickMessagesReceived", "Average messages received per tick");
    Stats.bytesSent = registerCounter("bytesSent", "Total bytes sent");
    Stats.bytesReceived = registerCounter("bytesReceived", "Total bytes received");
    Stats.tickByteSent = registerAverage("tickByteSent", "Average bytes sent per tick");
    Stats.tickByteReceived = registerAverage("tickByteReceived", "Average bytes received per tick");
    Stats.playersCurrently = registerCounter("playersCurrently", "Currently players");
    Stats.playersJoined = registerCounter("playersJoined", "Total players joined");
    Stats.playersLeft = registerCounter("playersLeft", "Total players left");
    Stats.bogusAmogusMessages = registerCounter("bogusAmogusMessages", "Total bogus-amogus messages");
    Stats.playersRejected = registerCounter("playersRejected", "Total players rejected");
})(Stats || (Stats = {}));
const SERVER_FPS = 60;
const SERVER_TOTAL_LIMIT = 2000;
const SERVER_SINGLE_IP_LIMIT = 10;
class PlayerOnServerClass extends common.PlayerClass {
    ws;
    remoteAddress;
    newMoving;
    constructor(ws, remoteAddress, id, x, y, direction, moving, newMoving, hue) {
        super(id, x, y, direction, moving, hue);
        this.ws = ws;
        this.remoteAddress = remoteAddress;
        this.newMoving = newMoving;
    }
    toDataView(view, structType) {
        structType.id.write(view, this.id);
        structType.x.write(view, this.position.x);
        structType.y.write(view, this.position.y);
        structType.direction.write(view, this.direction);
        structType.hue.write(view, this.hue / 360 * 256);
        if ('moving' in structType) {
            structType.moving.write(view, this.moving);
        }
        if ('kind' in structType) {
            structType.kind.write(view, common.MessageKind.Hello);
        }
    }
}
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
wss.on("connection", (ws, req) => {
    ws.binaryType = 'arraybuffer';
    if (players.size >= SERVER_TOTAL_LIMIT) {
        Stats.playersRejected.counter += 1;
        ws.close();
        return;
    }
    if (req.socket.remoteAddress === undefined) {
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
    const x = 0;
    const y = 0;
    const hue = Math.floor(Math.random() * 360);
    const player = new PlayerOnServerClass(ws, remoteAddress, id, x, y, 0, 0, 0, hue);
    players.set(id, player);
    joinedIds.add(id);
    Stats.playersJoined.counter += 1;
    Stats.playersCurrently.counter += 1;
    ws.addEventListener("message", (event) => {
        Stats.messagesReceived.counter += 1;
        messagesRecievedWithinTick += 1;
        if (!(event.data instanceof ArrayBuffer)) {
            Stats.bogusAmogusMessages.counter += 1;
            ws.close();
            return;
        }
        const view = new DataView(event.data);
        Stats.bytesReceived.counter += view.byteLength;
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
        else if (common.PingStruct.verify(view)) {
            pingIds.set(id, common.PingStruct.timestamp.read(view));
        }
        else {
            Stats.bogusAmogusMessages.counter += 1;
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
        Stats.playersLeft.counter += 1;
        Stats.playersCurrently.counter -= 1;
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
            const count = players.size;
            const buffer = new ArrayBuffer(common.PlayersJoinedHeaderStruct.size + count * common.PlayerStruct.size);
            const headerView = new DataView(buffer, 0, common.PlayersJoinedHeaderStruct.size);
            common.PlayersJoinedHeaderStruct.kind.write(headerView, common.MessageKind.PlayerJoined);
            let index = 0;
            players.forEach((player) => {
                const playerView = new DataView(buffer, common.PlayersJoinedHeaderStruct.size + index * common.PlayerStruct.size);
                player.toDataView(playerView, common.PlayerStruct);
                index += 1;
            });
            joinedIds.forEach((joinedId) => {
                const joinedPlayer = players.get(joinedId);
                if (joinedPlayer !== undefined) {
                    const view = new DataView(new ArrayBuffer(common.HelloStruct.size));
                    joinedPlayer.toDataView(view, common.HelloStruct);
                    joinedPlayer.ws.send(view);
                    bytesSentCounter += view.byteLength;
                    messageSentCounter += 1;
                    joinedPlayer.ws.send(buffer);
                    bytesSentCounter += buffer.byteLength;
                    messageSentCounter += 1;
                }
            });
        }
        {
            const count = joinedIds.size;
            const buffer = new ArrayBuffer(common.PlayersJoinedHeaderStruct.size + count * common.PlayerStruct.size);
            const headerView = new DataView(buffer, 0, common.PlayersJoinedHeaderStruct.size);
            common.PlayersJoinedHeaderStruct.kind.write(headerView, common.MessageKind.PlayerJoined);
            let index = 0;
            joinedIds.forEach((joinedId) => {
                const joinedPlayer = players.get(joinedId);
                if (joinedPlayer !== undefined) {
                    const playerView = new DataView(buffer, common.PlayersJoinedHeaderStruct.size + index * common.PlayerStruct.size);
                    joinedPlayer.toDataView(playerView, common.PlayerStruct);
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
        const view = common.PlayersLeftHeaderStruct.allocateAndInit(count);
        let index = 0;
        leftIds.forEach((leftId) => {
            common.PlayersLeftHeaderStruct.items(index).id.write(view, leftId);
            index += 1;
        });
        players.forEach((player) => {
            player.ws.send(view);
            bytesSentCounter += view.byteLength;
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
            const buffer = new ArrayBuffer(common.PlayersMovingHeaderStruct.size + count * common.PlayerStruct.size);
            const headerView = new DataView(buffer, 0, common.PlayersMovingHeaderStruct.size);
            common.PlayersMovingHeaderStruct.kind.write(headerView, common.MessageKind.PlayerMoving);
            let index = 0;
            players.forEach((player) => {
                if (player.newMoving !== player.moving) {
                    player.moving = player.newMoving;
                    const playerView = new DataView(buffer, common.PlayersMovingHeaderStruct.size + index * common.PlayerStruct.size);
                    player.toDataView(playerView, common.PlayerStruct);
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
    players.forEach((player) => common.updatePlayer(player, common.SCENE, deltaTime));
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
    Stats.ticksCount.counter += 1;
    Stats.tickTimes.pushSample(tickTime / 1000);
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
    if (Stats.ticksCount.counter % SERVER_FPS === 0) {
        Stats.print();
    }
    setTimeout(tick, Math.max(0, 1000 / SERVER_FPS - tickTime));
}
Stats.uptime.startedAt = Date.now();
setTimeout(tick, 1000 / SERVER_FPS);
console.log(`Listening to ws://0.0.0.0:${common.SERVER_PORT}`);
//# sourceMappingURL=server.mjs.map