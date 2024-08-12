import * as game from './game.mjs';
import * as common from './common.mjs';

const DIRECTION_KEYS: {[key: string]: common.Moving} = {
    'ArrowLeft'  : common.Moving.TurningLeft,
    'ArrowRight' : common.Moving.TurningRight,
    'ArrowUp'    : common.Moving.MovingForward,
    'ArrowDown'  : common.Moving.MovingBackward,
    'KeyA'       : common.Moving.TurningLeft,
    'KeyD'       : common.Moving.TurningRight,
    'KeyW'       : common.Moving.MovingForward,
    'KeyS'       : common.Moving.MovingBackward,
};

const SCREEN_FACTOR = 30;
const SCREEN_WIDTH = Math.floor(16*SCREEN_FACTOR);
const SCREEN_HEIGHT = Math.floor(9*SCREEN_FACTOR);

(async () => {
    const gameCanvas = document.getElementById("game") as (HTMLCanvasElement | null);
    if (gameCanvas === null) throw new Error("No canvas with id `game` is found");
    const factor = 80;
    gameCanvas.width = 16*factor;
    gameCanvas.height = 9*factor;
    const ctx = gameCanvas.getContext("2d");
    if (ctx === null) throw new Error("2D context is not supported");
    ctx.imageSmoothingEnabled = false;

    // TODO: bring hotreloading back
    // TODO: hot reloading should not break if the game crashes

    const display = game.createDisplay(ctx, SCREEN_WIDTH, SCREEN_HEIGHT);
    const gameState = await game.createGame();

    window.addEventListener("keydown", (e) => {
        if (!e.repeat) {
            const direction = DIRECTION_KEYS[e.code];
            if (direction !== undefined) {
                gameState.player.moving |= (1<<direction);
            }
        }
    });
    // TODO: When the window loses the focus, reset all the controls
    window.addEventListener("keyup", (e) => {
        if (!e.repeat) {
            const direction = DIRECTION_KEYS[e.code];
            if (direction !== undefined) {
                gameState.player.moving &= ~(1<<direction);
            }
        }
    });

    let prevTimestamp = 0;
    const frame = (timestamp: number) => {
        const deltaTime = (timestamp - prevTimestamp)/1000;
        const time = timestamp/1000;
        prevTimestamp = timestamp;
        game.renderGame(display, deltaTime, time, gameState);
        window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame((timestamp) => {
        prevTimestamp = timestamp;
        window.requestAnimationFrame(frame);
    });
})();
// TODO: Hot reload assets
// TODO: Load assets asynchronously
//   While a texture is loading, replace it with a color tile.
// TODO: Mobile controls
