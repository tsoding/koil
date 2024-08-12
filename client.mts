import * as common from './common.mjs'
import type {Player} from './common.mjs';

const DIRECTION_KEYS: {[key: string]: common.Direction} = {
    'ArrowLeft'  : common.Direction.Left,
    'ArrowRight' : common.Direction.Right,
    'ArrowUp'    : common.Direction.Up,
    'ArrowDown'  : common.Direction.Down,
    'KeyA'       : common.Direction.Left,
    'KeyD'       : common.Direction.Right,
    'KeyS'       : common.Direction.Down,
    'KeyW'       : common.Direction.Up,
};

(async () => {
    const gameCanvas = document.getElementById('game') as HTMLCanvasElement | null;
    if (gameCanvas === null) throw new Error('No element with id `game`');
    gameCanvas.width = common.WORLD_WIDTH;
    gameCanvas.height = common.WORLD_HEIGHT;
    const ctx = gameCanvas.getContext("2d");
    if (ctx === null) throw new Error('2d canvas is not supported');

    let ws: WebSocket | undefined = new WebSocket(`ws://${window.location.hostname}:${common.SERVER_PORT}`);
    let me: Player | undefined = undefined;
    const players = new Map<number, Player>();
    let ping = 0;
    ws.binaryType = 'arraybuffer';
    ws.addEventListener("close", (event) => {
        console.log("WEBSOCKET CLOSE", event)
        ws = undefined
    });
    ws.addEventListener("error", (event) => {
        // TODO: reconnect on errors
        console.log("WEBSOCKET ERROR", event)
    });
    ws.addEventListener("message", (event) => {
        // console.log('Received message', event);
        if (!(event.data instanceof ArrayBuffer)) {
            console.error("Received bogus-amogus message from server. Expected binary data", event);
            ws?.close();
        }
        const view = new DataView(event.data);
        if (me === undefined) {
            if (common.HelloStruct.verify(view)) {
                me = {
                    id: common.HelloStruct.id.read(view),
                    x: common.HelloStruct.x.read(view),
                    y: common.HelloStruct.y.read(view),
                    moving: 0,
                    hue: common.HelloStruct.hue.read(view)/256*360,
                }
                players.set(me.id, me)
            } else {
                console.error("Received bogus-amogus message from server. Incorrect `Hello` message.", view)
                ws?.close();
            }
        } else {
            if (common.PlayersJoinedHeaderStruct.verify(view)) {
                const count = common.PlayersJoinedHeaderStruct.count(view);
                for (let i = 0; i < count; ++i) {
                    const playerView = new DataView(event.data, common.PlayersJoinedHeaderStruct.size + i*common.PlayerStruct.size, common.PlayerStruct.size);
                    const id = common.PlayerStruct.id.read(playerView);
                    const player = players.get(id);
                    if (player !== undefined) {
                        player.x = common.PlayerStruct.x.read(playerView);
                        player.y = common.PlayerStruct.y.read(playerView);
                        player.moving = common.PlayerStruct.moving.read(playerView);
                        player.hue = common.PlayerStruct.hue.read(playerView)/256*360;
                    } else {
                        players.set(id, {
                            id,
                            x: common.PlayerStruct.x.read(playerView),
                            y: common.PlayerStruct.y.read(playerView),
                            moving: common.PlayerStruct.moving.read(playerView),
                            hue: common.PlayerStruct.hue.read(playerView)/256*360,
                        });
                    }
                }
            } else if (common.PlayersLeftHeaderStruct.verify(view)) {
                const count = common.PlayersLeftHeaderStruct.count(view);
                for (let i = 0; i < count; ++i) {
                    const id = common.PlayersLeftHeaderStruct.items(i).id.read(view);
                    players.delete(id);
                }
            } else if (common.PlayersMovingHeaderStruct.verify(view)) {
                const count = common.PlayersMovingHeaderStruct.count(view);
                for (let i = 0; i < count; ++i) {
                    const playerView = new DataView(event.data, common.PlayersMovingHeaderStruct.size + i*common.PlayerStruct.size, common.PlayerStruct.size);

                    const id = common.PlayerStruct.id.read(playerView);
                    const player = players.get(id);
                    if (player === undefined) {
                        console.error(`Received bogus-amogus message from server. We don't know anything about player with id ${id}`)
                        ws?.close();
                        return;
                    }
                    player.moving = common.PlayerStruct.moving.read(playerView);
                    player.x = common.PlayerStruct.x.read(playerView);
                    player.y = common.PlayerStruct.y.read(playerView);
                }
            } else if (common.PongStruct.verify(view)) {
                ping = performance.now() - common.PongStruct.timestamp.read(view);
            } else {
                console.error("Received bogus-amogus message from server.", view)
                ws?.close();
            }
        }
    });
    ws.addEventListener("open", (event) => {
        console.log("WEBSOCKET OPEN", event)
    });

    const PING_COOLDOWN = 60;
    let previousTimestamp = 0;
    let pingCooldown = PING_COOLDOWN;
    const frame = (timestamp: number) => {
        const deltaTime = (timestamp - previousTimestamp)/1000;
        previousTimestamp = timestamp;

        ctx.fillStyle = '#202020';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        if (ws === undefined) {
            const label = "Disconnected";
            const size = ctx.measureText(label);
            ctx.font = "48px bold";
            ctx.fillStyle = 'white';
            ctx.fillText(label, ctx.canvas.width/2 - size.width/2, ctx.canvas.height/2);
        } else {
            players.forEach((player) => {
                if (me !== undefined && me.id !== player.id) {
                    common.updatePlayer(player, deltaTime);
                    ctx.fillStyle = `hsl(${player.hue} 70% 40%)`;
                    ctx.fillRect(player.x, player.y, common.PLAYER_SIZE, common.PLAYER_SIZE);
                }
            })

            if (me !== undefined) {
                common.updatePlayer(me, deltaTime);
                ctx.fillStyle = `hsl(${me.hue} 100% 40%)`;
                ctx.fillRect(me.x, me.y, common.PLAYER_SIZE, common.PLAYER_SIZE);

                ctx.strokeStyle = "white";
                ctx.lineWidth = 4;
                ctx.beginPath()
                ctx.strokeRect(me.x, me.y, common.PLAYER_SIZE, common.PLAYER_SIZE);
                ctx.stroke();
            }

            ctx.font = "18px bold";
            ctx.fillStyle = 'white';
            const padding = ctx.canvas.width*0.05;
            ctx.fillText(`Ping: ${ping.toFixed(2)}ms`, padding, padding);

            pingCooldown -= 1;
            if (pingCooldown <= 0) {
                const view = new DataView(new ArrayBuffer(common.PingStruct.size));
                common.PingStruct.kind.write(view, common.MessageKind.Ping);
                common.PingStruct.timestamp.write(view, performance.now());
                ws.send(view);
                pingCooldown = PING_COOLDOWN;
            }
        }
        window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame((timestamp) => {
        previousTimestamp = timestamp;
        window.requestAnimationFrame(frame);
    });

    window.addEventListener("keydown", (e) => {
        if (ws !== undefined && me !== undefined) {
            if (!e.repeat) {
                const direction = DIRECTION_KEYS[e.code];
                if (direction !== undefined) {
                    const view = new DataView(new ArrayBuffer(common.AmmaMovingStruct.size));
                    common.AmmaMovingStruct.kind.write(view, common.MessageKind.AmmaMoving);
                    common.AmmaMovingStruct.start.write(view, 1);
                    common.AmmaMovingStruct.direction.write(view, direction);
                    ws.send(view);
                }
            }
        }
    });
    window.addEventListener("keyup", (e) => {
        if (ws !== undefined && me !== undefined) {
            if (!e.repeat) {
                const direction = DIRECTION_KEYS[e.code];
                if (direction !== undefined) {
                    const view = new DataView(new ArrayBuffer(common.AmmaMovingStruct.size));
                    common.AmmaMovingStruct.kind.write(view, common.MessageKind.AmmaMoving);
                    common.AmmaMovingStruct.start.write(view, 0);
                    common.AmmaMovingStruct.direction.write(view, direction);
                    ws.send(view);
                }
            }
        }
    });
})()
