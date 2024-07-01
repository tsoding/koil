"use strict";
async function loadImage(url) {
    const image = new Image();
    image.src = url;
    return new Promise((resolve, reject) => {
        image.onload = () => resolve(image);
        image.onerror = reject;
    });
}
async function loadImageData(url) {
    const image = await loadImage(url);
    const canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    if (ctx === null)
        throw new Error("2d canvas is not supported");
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, image.width, image.height);
}
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
    const [typescript, wall1, wall2, wall3, wall4] = await Promise.all([
        loadImageData("assets/images/Typescript_logo_2020.png").catch(() => game.RGBA.purple()),
        loadImageData("assets/images/opengameart/wezu_tex_cc_by/wall1_color.png").catch(() => game.RGBA.purple()),
        loadImageData("assets/images/opengameart/wezu_tex_cc_by/wall2_color.png").catch(() => game.RGBA.purple()),
        loadImageData("assets/images/opengameart/wezu_tex_cc_by/wall3_color.png").catch(() => game.RGBA.purple()),
        loadImageData("assets/images/opengameart/wezu_tex_cc_by/wall4_color.png").catch(() => game.RGBA.purple()),
    ]);
    let game = await import("./game.js");
    const scene = game.createScene([
        [null, null, typescript, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, null],
        [null, null, null],
        [null, null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, null],
    ]);
    const player = game.createPlayer(game.sceneSize(scene).mul(new game.Vector2(0.63, 0.63)), Math.PI * 1.25);
    const isDev = window.location.hostname === "localhost";
    if (isDev) {
        const ws = new WebSocket("ws://localhost:6970");
        ws.addEventListener("message", async (event) => {
            if (event.data === "reload") {
                console.log("Hot reloading module");
                game = await import("./game.js?date=" + new Date().getTime());
            }
        });
    }
    const backImageData = new ImageData(game.SCREEN_WIDTH, game.SCREEN_HEIGHT);
    const backCanvas = new OffscreenCanvas(game.SCREEN_WIDTH, game.SCREEN_HEIGHT);
    const backCtx = backCanvas.getContext("2d");
    if (backCtx === null)
        throw new Error("2D context is not supported");
    backCtx.imageSmoothingEnabled = false;
    let movingForward = false;
    let movingBackward = false;
    let turningLeft = false;
    let turningRight = false;
    window.addEventListener("keydown", (e) => {
        if (!e.repeat) {
            switch (e.code) {
                case 'KeyW':
                    movingForward = true;
                    break;
                case 'KeyS':
                    movingBackward = true;
                    break;
                case 'KeyA':
                    turningLeft = true;
                    break;
                case 'KeyD':
                    turningRight = true;
                    break;
            }
        }
    });
    window.addEventListener("keyup", (e) => {
        if (!e.repeat) {
            switch (e.code) {
                case 'KeyW':
                    movingForward = false;
                    break;
                case 'KeyS':
                    movingBackward = false;
                    break;
                case 'KeyA':
                    turningLeft = false;
                    break;
                case 'KeyD':
                    turningRight = false;
                    break;
            }
        }
    });
    let prevTimestamp = 0;
    const frame = (timestamp) => {
        const deltaTime = (timestamp - prevTimestamp) / 1000;
        prevTimestamp = timestamp;
        let velocity = game.Vector2.zero();
        let angularVelocity = 0.0;
        if (movingForward) {
            velocity = velocity.add(game.Vector2.angle(player.direction).scale(game.PLAYER_SPEED));
        }
        if (movingBackward) {
            velocity = velocity.sub(game.Vector2.angle(player.direction).scale(game.PLAYER_SPEED));
        }
        if (turningLeft) {
            angularVelocity -= Math.PI;
        }
        if (turningRight) {
            angularVelocity += Math.PI;
        }
        player.direction = player.direction + angularVelocity * deltaTime;
        const nx = player.position.x + velocity.x * deltaTime;
        if (game.sceneCanRectangleFitHere(scene, new game.Vector2(nx, player.position.y), game.Vector2.scalar(game.PLAYER_SIZE))) {
            player.position.x = nx;
        }
        const ny = player.position.y + velocity.y * deltaTime;
        if (game.sceneCanRectangleFitHere(scene, new game.Vector2(player.position.x, ny), game.Vector2.scalar(game.PLAYER_SIZE))) {
            player.position.y = ny;
        }
        game.renderGameIntoImageData(ctx, backCtx, backImageData, deltaTime, player, scene);
        window.requestAnimationFrame(frame);
    };
    window.requestAnimationFrame((timestamp) => {
        prevTimestamp = timestamp;
        window.requestAnimationFrame(frame);
    });
})();
// TODO: Try lighting with normal maps that come with some of the assets
// TODO: Load assets asynchronously
//   While a texture is loading, replace it with a color tile.
//# sourceMappingURL=index.js.map