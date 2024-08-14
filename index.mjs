import * as game from './game.mjs';
import * as common from './common.mjs';
const DIRECTION_KEYS = {
    'ArrowLeft': common.Moving.TurningLeft,
    'ArrowRight': common.Moving.TurningRight,
    'ArrowUp': common.Moving.MovingForward,
    'ArrowDown': common.Moving.MovingBackward,
    'KeyA': common.Moving.TurningLeft,
    'KeyD': common.Moving.TurningRight,
    'KeyW': common.Moving.MovingForward,
    'KeyS': common.Moving.MovingBackward,
};
const SCREEN_FACTOR = 30;
const SCREEN_WIDTH = Math.floor(16 * SCREEN_FACTOR);
const SCREEN_HEIGHT = Math.floor(9 * SCREEN_FACTOR);
(async () => {
    const gameCanvas = document.getElementById("game");
    if (gameCanvas === null)
        throw new Error("No canvas with id `game` is found");
    const factor = 80;
    gameCanvas.width = 16 * factor;
    gameCanvas.height = 9 * factor;
    const ctx = gameCanvas.getContext("2d");
    if (ctx === null)
        throw new Error("2D context is not supported");
    ctx.imageSmoothingEnabled = false;
    const display = game.createDisplay(ctx, SCREEN_WIDTH, SCREEN_HEIGHT);
    const gameState = await game.createGame();
    window.addEventListener("keydown", (e) => {
        if (gameState.ws !== undefined && gameState.me !== undefined) {
            if (!e.repeat) {
                const direction = DIRECTION_KEYS[e.code];
                if (direction !== undefined) {
                    const view = new DataView(new ArrayBuffer(common.AmmaMovingStruct.size));
                    common.AmmaMovingStruct.kind.write(view, common.MessageKind.AmmaMoving);
                    common.AmmaMovingStruct.start.write(view, 1);
                    common.AmmaMovingStruct.direction.write(view, direction);
                    gameState.ws.send(view);
                }
                else if (e.code === 'Space') {
                    game.throwBomb(gameState.me, gameState.bombs);
                }
            }
        }
    });
    window.addEventListener("keyup", (e) => {
        if (gameState.ws !== undefined && gameState.me !== undefined) {
            if (!e.repeat) {
                const direction = DIRECTION_KEYS[e.code];
                if (direction !== undefined) {
                    const view = new DataView(new ArrayBuffer(common.AmmaMovingStruct.size));
                    common.AmmaMovingStruct.kind.write(view, common.MessageKind.AmmaMoving);
                    common.AmmaMovingStruct.start.write(view, 0);
                    common.AmmaMovingStruct.direction.write(view, direction);
                    gameState.ws.send(view);
                }
            }
        }
    });
    let prevTimestamp = 0;
    const frame = (timestamp) => {
        const deltaTime = (timestamp - prevTimestamp) / 1000;
        const time = timestamp / 1000;
        prevTimestamp = timestamp;
        game.renderGame(display, deltaTime, time, gameState);
        window.requestAnimationFrame(frame);
    };
    window.requestAnimationFrame((timestamp) => {
        prevTimestamp = timestamp;
        window.requestAnimationFrame(frame);
    });
})();
//# sourceMappingURL=index.mjs.map