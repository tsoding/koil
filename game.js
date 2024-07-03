// This module is the main logic of the game and when served via `npm run watch` should be 
// hot-reloadable without losing the state of the game. Anything outside of this module
// is only cold-reloadable by simply refreshing the whole page.
//
// The way we hot-reload modules is rather limited and does not allow to reload for instance
// classes. In case of Vector2 and RGBA we don't really care because they are not modified very
// often.
//
// TODO: maybe Vector2 and RBGA should be moved outside of this module for the above reason.
//
// Only simple functions that operate on objects that don't store any functions can be easily
// hot-reloaded. Examples are State and Player which we defined as interfaces.
const EPS = 1e-6;
const NEAR_CLIPPING_PLANE = 0.1;
const FAR_CLIPPING_PLANE = 20.0;
const FOV = Math.PI * 0.5;
const COS_OF_HALF_FOV = Math.cos(FOV * 0.5);
const PLAYER_STEP_LEN = 0.5;
const PLAYER_SPEED = 2;
const PLAYER_SIZE = 0.5;
const SPRITE_SIZE = 0.3;
export class RGBA {
    r;
    g;
    b;
    a;
    constructor(r, g, b, a) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }
    static red() {
        return new RGBA(1, 0, 0, 1);
    }
    static green() {
        return new RGBA(0, 1, 0, 1);
    }
    static blue() {
        return new RGBA(0, 0, 1, 1);
    }
    static yellow() {
        return new RGBA(1, 1, 0, 1);
    }
    static purple() {
        return new RGBA(1, 0, 1, 1);
    }
    static cyan() {
        return new RGBA(0, 1, 1, 1);
    }
    toStyle() {
        return `rgba(`
            + `${Math.floor(this.r * 255)}, `
            + `${Math.floor(this.g * 255)}, `
            + `${Math.floor(this.b * 255)}, `
            + `${this.a})`;
    }
}
export class Vector2 {
    x;
    y;
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }
    static scalar(value) {
        return new Vector2(value, value);
    }
    static angle(angle) {
        return new Vector2(Math.cos(angle), Math.sin(angle));
    }
    clone() {
        return new Vector2(this.x, this.y);
    }
    copy(that) {
        this.x = that.x;
        this.y = that.y;
        return this;
    }
    setScalar(scalar) {
        this.x = scalar;
        this.y = scalar;
        return this;
    }
    add(that) {
        this.x += that.x;
        this.y += that.y;
        return this;
    }
    sub(that) {
        this.x -= that.x;
        this.y -= that.y;
        return this;
    }
    div(that) {
        this.x /= that.x;
        this.y /= that.y;
        return this;
    }
    mul(that) {
        this.x *= that.x;
        this.y *= that.y;
        return this;
    }
    sqrLength() {
        return this.x * this.x + this.y * this.y;
    }
    length() {
        return Math.sqrt(this.sqrLength());
    }
    scale(value) {
        this.x *= value;
        this.y *= value;
        return this;
    }
    norm() {
        const l = this.length();
        return l === 0 ? this : this.scale(1 / l);
    }
    rot90() {
        const oldX = this.x;
        this.x = -this.y;
        this.y = oldX;
        return this;
    }
    sqrDistanceTo(that) {
        const dx = that.x - this.x;
        const dy = that.y - this.y;
        return dx * dx + dy * dy;
    }
    distanceTo(that) {
        return Math.sqrt(this.sqrDistanceTo(that));
    }
    lerp(that, t) {
        this.x += (that.x - this.x) * t;
        this.y += (that.y - this.y) * t;
        return this;
    }
    dot(that) {
        return this.x * that.x + this.y * that.y;
    }
    map(f) {
        this.x = f(this.x);
        this.y = f(this.y);
        return this;
    }
}
function canvasSize(ctx) {
    return new Vector2(ctx.canvas.width, ctx.canvas.height);
}
function strokeLine(ctx, p1, p2) {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
}
function snap(x, dx) {
    if (dx > 0)
        return Math.ceil(x + Math.sign(dx) * EPS);
    if (dx < 0)
        return Math.floor(x + Math.sign(dx) * EPS);
    return x;
}
function hittingCell(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return new Vector2(Math.floor(p2.x + Math.sign(dx) * EPS), Math.floor(p2.y + Math.sign(dy) * EPS));
}
function rayStep(p1, p2) {
    // y = k*x + c
    // x = (y - c)/k
    // 
    // p1 = (x1, y1)
    // p2 = (x2, y2)
    //
    // | y1 = k*x1 + c
    // | y2 = k*x2 + c
    //
    // dy = y2 - y1
    // dx = x2 - x1
    // c = y1 - k*x1
    // k = dy/dx
    let p3 = p2;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    if (dx !== 0) {
        const k = dy / dx;
        const c = p1.y - k * p1.x;
        {
            const x3 = snap(p2.x, dx);
            const y3 = x3 * k + c;
            p3 = new Vector2(x3, y3);
        }
        if (k !== 0) {
            const y3 = snap(p2.y, dy);
            const x3 = (y3 - c) / k;
            const p3t = new Vector2(x3, y3);
            if (p2.sqrDistanceTo(p3t) < p2.sqrDistanceTo(p3)) {
                p3 = p3t;
            }
        }
    }
    else {
        const y3 = snap(p2.y, dy);
        const x3 = p2.x;
        p3 = new Vector2(x3, y3);
    }
    return p3;
}
const SCENE_FLOOR1 = new RGBA(0.094, 0.094 + 0.05, 0.094 + 0.05, 1.0);
const SCENE_FLOOR2 = new RGBA(0.188, 0.188 + 0.05, 0.188 + 0.05, 1.0);
const SCENE_CEILING1 = new RGBA(0.094 + 0.05, 0.094, 0.094, 1.0);
const SCENE_CEILING2 = new RGBA(0.188 + 0.05, 0.188, 0.188, 1.0);
export function createScene(walls) {
    const scene = {
        height: walls.length,
        width: Number.MIN_VALUE,
        walls: [],
    };
    for (let row of walls) {
        scene.width = Math.max(scene.width, row.length);
    }
    for (let row of walls) {
        scene.walls = scene.walls.concat(row);
        for (let i = 0; i < scene.width - row.length; ++i) {
            scene.walls.push(null);
        }
    }
    return scene;
}
export function sceneSize(scene) {
    return new Vector2(scene.width, scene.height);
}
function sceneContains(scene, p) {
    return 0 <= p.x && p.x < scene.width && 0 <= p.y && p.y < scene.height;
}
function sceneGetTile(scene, p) {
    if (!sceneContains(scene, p))
        return undefined;
    return scene.walls[Math.floor(p.y) * scene.width + Math.floor(p.x)];
}
function sceneGetFloor(p) {
    if ((Math.floor(p.x) + Math.floor(p.y)) % 2 == 0) {
        return SCENE_FLOOR1;
    }
    else {
        return SCENE_FLOOR2;
    }
}
function sceneGetCeiling(p) {
    if ((Math.floor(p.x) + Math.floor(p.y)) % 2 == 0) {
        return SCENE_CEILING1;
    }
    else {
        return SCENE_CEILING2;
    }
}
function sceneIsWall(scene, p) {
    const c = sceneGetTile(scene, p);
    return c !== null && c !== undefined;
}
function sceneCanRectangleFitHere(scene, position, size) {
    const x1 = Math.floor(position.x - size.x * 0.5);
    const x2 = Math.floor(position.x + size.x * 0.5);
    const y1 = Math.floor(position.y - size.y * 0.5);
    const y2 = Math.floor(position.y + size.y * 0.5);
    for (let x = x1; x <= x2; ++x) {
        for (let y = y1; y <= y2; ++y) {
            if (sceneIsWall(scene, new Vector2(x, y))) {
                return false;
            }
        }
    }
    return true;
}
function castRay(scene, p1, p2) {
    let start = p1;
    while (start.sqrDistanceTo(p1) < FAR_CLIPPING_PLANE * FAR_CLIPPING_PLANE) {
        const c = hittingCell(p1, p2);
        if (sceneIsWall(scene, c))
            break;
        const p3 = rayStep(p1, p2);
        p1 = p2;
        p2 = p3;
    }
    return p2;
}
export function createPlayer(position, direction) {
    return {
        position: position,
        velocity: new Vector2(0, 0),
        direction: direction,
        movingForward: false,
        movingBackward: false,
        turningLeft: false,
        turningRight: false,
    };
}
function playerFovRange(player) {
    const l = Math.tan(FOV * 0.5) * NEAR_CLIPPING_PLANE;
    const p = player.position.clone().add(Vector2.angle(player.direction).scale(NEAR_CLIPPING_PLANE));
    const wing = p.clone().sub(player.position).rot90().norm().scale(l);
    const p1 = p.clone().sub(wing);
    const p2 = p.clone().add(wing);
    return [p1, p2];
}
function renderMinimap(ctx, player, position, size, scene, sprites) {
    ctx.save();
    const gridSize = sceneSize(scene);
    ctx.translate(position.x, position.y);
    ctx.scale(size.x / gridSize.x, size.y / gridSize.y);
    ctx.fillStyle = "#181818";
    ctx.fillRect(0, 0, gridSize.x, gridSize.y);
    ctx.lineWidth = 0.05;
    for (let y = 0; y < gridSize.y; ++y) {
        for (let x = 0; x < gridSize.x; ++x) {
            const cell = sceneGetTile(scene, new Vector2(x, y));
            if (cell instanceof RGBA) {
                ctx.fillStyle = cell.toStyle();
                ctx.fillRect(x, y, 1, 1);
            }
            else if (cell instanceof ImageData) {
                ctx.fillStyle = "blue";
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }
    ctx.strokeStyle = "#303030";
    for (let x = 0; x <= gridSize.x; ++x) {
        strokeLine(ctx, new Vector2(x, 0), new Vector2(x, gridSize.y));
    }
    for (let y = 0; y <= gridSize.y; ++y) {
        strokeLine(ctx, new Vector2(0, y), new Vector2(gridSize.x, y));
    }
    ctx.fillStyle = "magenta";
    ctx.fillRect(player.position.x - PLAYER_SIZE * 0.5, player.position.y - PLAYER_SIZE * 0.5, PLAYER_SIZE, PLAYER_SIZE);
    const [p1, p2] = playerFovRange(player);
    ctx.strokeStyle = "magenta";
    strokeLine(ctx, p1, p2);
    strokeLine(ctx, player.position, p1);
    strokeLine(ctx, player.position, p2);
    // Rendering the sprite projection
    if (0) {
        ctx.fillStyle = "red";
        ctx.strokeStyle = "yellow";
        const sp = new Vector2();
        const dir = Vector2.angle(player.direction);
        strokeLine(ctx, player.position, player.position.clone().add(dir));
        for (let sprite of sprites) {
            ctx.fillRect(sprite.position.x - SPRITE_SIZE * 0.5, sprite.position.y - SPRITE_SIZE * 0.5, SPRITE_SIZE, SPRITE_SIZE);
            sp.copy(sprite.position).sub(player.position);
            strokeLine(ctx, player.position, player.position.clone().add(sp));
            const spl = sp.length();
            if (spl === 0)
                continue;
            const dot = sp.dot(dir) / spl;
            if (!(COS_OF_HALF_FOV <= dot && dot <= 1.0))
                continue;
            const dist = NEAR_CLIPPING_PLANE / dot;
            sp.norm().scale(dist).add(player.position);
            const t = p1.distanceTo(sp) / p1.distanceTo(p2);
            ctx.fillRect(sp.x - SPRITE_SIZE * 0.5, sp.y - SPRITE_SIZE * 0.5, SPRITE_SIZE, SPRITE_SIZE);
            ctx.font = "0.5px bold";
            ctx.fillStyle = "white";
            ctx.fillText(`${t}`, sp.x, sp.y);
        }
    }
    ctx.restore();
}
function renderWalls(display, player, scene) {
    const [r1, r2] = playerFovRange(player);
    for (let x = 0; x < display.backImageData.width; ++x) {
        const p = castRay(scene, player.position, r1.clone().lerp(r2, x / display.backImageData.width));
        const c = hittingCell(player.position, p);
        const cell = sceneGetTile(scene, c);
        const v = p.clone().sub(player.position);
        const d = Vector2.angle(player.direction);
        display.zBuffer[x] = v.dot(d);
        if (cell instanceof RGBA) {
            const stripHeight = display.backImageData.height / display.zBuffer[x];
            const shadow = 1 / display.zBuffer[x] * 2;
            for (let dy = 0; dy < Math.ceil(stripHeight); ++dy) {
                const y = Math.floor((display.backImageData.height - stripHeight) * 0.5) + dy;
                const destP = (y * display.backImageData.width + x) * 4;
                display.backImageData.data[destP + 0] = cell.r * shadow * 255;
                display.backImageData.data[destP + 1] = cell.g * shadow * 255;
                display.backImageData.data[destP + 2] = cell.b * shadow * 255;
            }
        }
        else if (cell instanceof ImageData) {
            const stripHeight = display.backImageData.height / display.zBuffer[x];
            // const stripHeight = display.backImageData.height/player.position.distanceTo(p);
            let u = 0;
            const t = p.clone().sub(c);
            if ((Math.abs(t.x) < EPS || Math.abs(t.x - 1) < EPS) && t.y > 0) {
                u = t.y;
            }
            else {
                u = t.x;
            }
            const y1 = Math.floor((display.backImageData.height - stripHeight) * 0.5);
            const y2 = Math.floor(y1 + stripHeight);
            const by1 = Math.max(0, y1);
            const by2 = Math.min(display.backImageData.height - 1, y2);
            const tx = Math.floor(u * cell.width);
            const sh = (1 / Math.ceil(stripHeight)) * cell.height;
            const shadow = 1 / display.zBuffer[x] * 2;
            for (let y = by1; y <= by2; ++y) {
                const ty = Math.floor((y - y1) * sh);
                const destP = (y * display.backImageData.width + x) * 4;
                const srcP = (ty * cell.width + tx) * 4;
                display.backImageData.data[destP + 0] = cell.data[srcP + 0] * shadow;
                display.backImageData.data[destP + 1] = cell.data[srcP + 1] * shadow;
                display.backImageData.data[destP + 2] = cell.data[srcP + 2] * shadow;
            }
        }
    }
}
function renderCeiling(imageData, player) {
    const pz = imageData.height / 2;
    const [p1, p2] = playerFovRange(player);
    const bp = p1.clone().sub(player.position).length();
    for (let y = Math.floor(imageData.height / 2); y < imageData.height; ++y) {
        const sz = imageData.height - y - 1;
        const ap = pz - sz;
        const b = (bp / ap) * pz / NEAR_CLIPPING_PLANE;
        const t1 = player.position.clone().add(p1.clone().sub(player.position).norm().scale(b));
        const t2 = player.position.clone().add(p2.clone().sub(player.position).norm().scale(b));
        for (let x = 0; x < imageData.width; ++x) {
            const t = t1.clone().lerp(t2, x / imageData.width);
            const tile = sceneGetCeiling(t);
            if (tile instanceof RGBA) {
                const shadow = Math.sqrt(player.position.sqrDistanceTo(t));
                const destP = (sz * imageData.width + x) * 4;
                imageData.data[destP + 0] = tile.r * shadow * 255;
                imageData.data[destP + 1] = tile.g * shadow * 255;
                imageData.data[destP + 2] = tile.b * shadow * 255;
            }
        }
    }
}
function renderFloor(imageData, player) {
    const pz = imageData.height / 2;
    const [p1, p2] = playerFovRange(player);
    const bp = p1.clone().sub(player.position).length();
    for (let y = Math.floor(imageData.height / 2); y < imageData.height; ++y) {
        const sz = imageData.height - y - 1;
        const ap = pz - sz;
        const b = (bp / ap) * pz / NEAR_CLIPPING_PLANE;
        const t1 = player.position.clone().add(p1.clone().sub(player.position).norm().scale(b));
        const t2 = player.position.clone().add(p2.clone().sub(player.position).norm().scale(b));
        // TODO: render rows up until FAR_CLIPPING_PLANE
        for (let x = 0; x < imageData.width; ++x) {
            const t = t1.clone().lerp(t2, x / imageData.width);
            const tile = sceneGetFloor(t);
            if (tile instanceof RGBA) {
                const shadow = Math.sqrt(player.position.sqrDistanceTo(t));
                const destP = (y * imageData.width + x) * 4;
                imageData.data[destP + 0] = tile.r * shadow * 255;
                imageData.data[destP + 1] = tile.g * shadow * 255;
                imageData.data[destP + 2] = tile.b * shadow * 255;
            }
        }
    }
}
function clamp(mn, mx, v) {
    if (v < mn)
        return mn;
    if (v > mx)
        return mx;
    return v;
}
function renderSprites(display, player, sprites) {
    // TODO: z-sort the sprites
    const markSize = 100;
    const sp = new Vector2();
    const dir = Vector2.angle(player.direction);
    const [p1, p2] = playerFovRange(player);
    for (const sprite of sprites) {
        sp.copy(sprite.position).sub(player.position);
        const spl = sp.length();
        if (spl <= NEAR_CLIPPING_PLANE)
            continue;
        const dot = sp.dot(dir) / spl;
        if (!(COS_OF_HALF_FOV <= dot && dot <= 1.0))
            continue;
        const dist = NEAR_CLIPPING_PLANE / dot;
        sp.norm().scale(dist).add(player.position);
        const t = p1.distanceTo(sp) / p1.distanceTo(p2);
        const cx = Math.floor(display.backImageData.width * t);
        const cy = Math.floor(display.backImageData.height * 0.5);
        const pdist = sprite.position.clone().sub(player.position).dot(dir);
        const spriteSize = Math.floor(display.backImageData.height / pdist * 0.75);
        const x1 = clamp(0, display.backImageData.width - 1, Math.floor(cx - spriteSize * 0.5));
        const x2 = clamp(0, display.backImageData.width - 1, Math.floor(cx + spriteSize * 0.5));
        const y1 = clamp(0, display.backImageData.height - 1, Math.floor(cy - spriteSize * 0.5));
        const y2 = clamp(0, display.backImageData.height - 1, Math.floor(cy + spriteSize * 0.5));
        for (let x = x1; x <= x2; ++x) {
            if (pdist < display.zBuffer[x]) {
                for (let y = y1; y < y2; ++y) {
                    const tx = Math.floor((x - x1) / spriteSize * sprite.imageData.width);
                    const ty = Math.floor((y - y1) / spriteSize * sprite.imageData.height);
                    const srcP = (ty * sprite.imageData.width + tx) * 4;
                    const destP = (y * display.backImageData.width + x) * 4;
                    const alpha = sprite.imageData.data[srcP + 3] / 255;
                    display.backImageData.data[destP + 0] = sprite.imageData.data[srcP + 0] * alpha + display.backImageData.data[destP + 0] * (1 - alpha);
                    display.backImageData.data[destP + 1] = sprite.imageData.data[srcP + 1] * alpha + display.backImageData.data[destP + 1] * (1 - alpha);
                    display.backImageData.data[destP + 2] = sprite.imageData.data[srcP + 2] * alpha + display.backImageData.data[destP + 2] * (1 - alpha);
                }
            }
        }
    }
}
export function renderGame(display, deltaTime, player, scene, sprites) {
    player.velocity.setScalar(0);
    let angularVelocity = 0.0;
    if (player.movingForward) {
        player.velocity.add(Vector2.angle(player.direction).scale(PLAYER_SPEED));
    }
    if (player.movingBackward) {
        player.velocity.sub(Vector2.angle(player.direction).scale(PLAYER_SPEED));
    }
    if (player.turningLeft) {
        angularVelocity -= Math.PI;
    }
    if (player.turningRight) {
        angularVelocity += Math.PI;
    }
    player.direction = player.direction + angularVelocity * deltaTime;
    const nx = player.position.x + player.velocity.x * deltaTime;
    if (sceneCanRectangleFitHere(scene, new Vector2(nx, player.position.y), Vector2.scalar(PLAYER_SIZE))) {
        player.position.x = nx;
    }
    const ny = player.position.y + player.velocity.y * deltaTime;
    if (sceneCanRectangleFitHere(scene, new Vector2(player.position.x, ny), Vector2.scalar(PLAYER_SIZE))) {
        player.position.y = ny;
    }
    const minimapPosition = canvasSize(display.ctx).scale(0.03);
    const cellSize = display.ctx.canvas.width * 0.03;
    const minimapSize = sceneSize(scene).scale(cellSize);
    display.backImageData.data.fill(255);
    renderFloor(display.backImageData, player);
    renderCeiling(display.backImageData, player);
    renderWalls(display, player, scene);
    renderSprites(display, player, sprites);
    display.backCtx.putImageData(display.backImageData, 0, 0);
    display.ctx.drawImage(display.backCtx.canvas, 0, 0, display.ctx.canvas.width, display.ctx.canvas.height);
    renderMinimap(display.ctx, player, minimapPosition, minimapSize, scene, sprites);
    display.ctx.font = "48px bold";
    display.ctx.fillStyle = "white";
    display.ctx.fillText(`${Math.floor(1 / deltaTime)}`, 100, 100);
}
//# sourceMappingURL=game.js.map