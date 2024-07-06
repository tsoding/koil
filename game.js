const EPS = 1e-6;
const NEAR_CLIPPING_PLANE = 0.1;
const FAR_CLIPPING_PLANE = 10.0;
const FOV = Math.PI * 0.5;
const COS_OF_HALF_FOV = Math.cos(FOV * 0.5);
const PLAYER_STEP_LEN = 0.5;
const PLAYER_SPEED = 2;
const PLAYER_RADIUS = 0.5;
const ITEM_FREQ = 1.0;
const ITEM_AMP = 0.03;
const MINIMAP_SPRITES = false;
const MINIMAP_PLAYER_SIZE = 0.5;
const MINIMAP_SPRITE_SIZE = 0.3;
const MINIMAP_SCALE = 0.03;
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
    setAngle(angle, len = 1) {
        this.x = Math.cos(angle) * len;
        this.y = Math.sin(angle) * len;
        return this;
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
export class Vector3 {
    x;
    y;
    z;
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
    clone() {
        return new Vector3(this.x, this.y, this.z);
    }
    clone2() {
        return new Vector2(this.x, this.y);
    }
    copy(that) {
        this.x = that.x;
        this.y = that.y;
        this.z = that.z;
        return this;
    }
    copy2(that, z) {
        this.x = that.x;
        this.y = that.y;
        this.z = z;
        return this;
    }
    setScalar(scalar) {
        this.x = scalar;
        this.y = scalar;
        this.z = scalar;
        return this;
    }
    add(that) {
        this.x += that.x;
        this.y += that.y;
        this.z += that.z;
        return this;
    }
    sub(that) {
        this.x -= that.x;
        this.y -= that.y;
        this.z -= that.z;
        return this;
    }
    div(that) {
        this.x /= that.x;
        this.y /= that.y;
        this.z /= that.z;
        return this;
    }
    mul(that) {
        this.x *= that.x;
        this.y *= that.y;
        this.z *= that.z;
        return this;
    }
    sqrLength() {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }
    length() {
        return Math.sqrt(this.sqrLength());
    }
    scale(value) {
        this.x *= value;
        this.y *= value;
        this.z *= value;
        return this;
    }
    norm() {
        const l = this.length();
        return l === 0 ? this : this.scale(1 / l);
    }
    sqrDistanceTo(that) {
        const dx = that.x - this.x;
        const dy = that.y - this.y;
        const dz = that.z - this.z;
        return dx * dx + dy * dy + dz * dz;
    }
    distanceTo(that) {
        return Math.sqrt(this.sqrDistanceTo(that));
    }
    lerp(that, t) {
        this.x += (that.x - this.x) * t;
        this.y += (that.y - this.y) * t;
        this.z += (that.z - this.z) * t;
        return this;
    }
    dot(that) {
        return this.x * that.x + this.y * that.y + this.z * that.z;
    }
    map(f) {
        this.x = f(this.x);
        this.y = f(this.y);
        this.z = f(this.z);
        return this;
    }
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
const SCENE_FLOOR1 = new RGBA(0.094, 0.094 + 0.07, 0.094 + 0.07, 1.0);
const SCENE_FLOOR2 = new RGBA(0.188, 0.188 + 0.07, 0.188 + 0.07, 1.0);
const SCENE_CEILING1 = new RGBA(0.094 + 0.07, 0.094, 0.094, 1.0);
const SCENE_CEILING2 = new RGBA(0.188 + 0.07, 0.188, 0.188, 1.0);
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
function sceneCanRectangleFitHere(scene, px, py, sx, sy) {
    const x1 = Math.floor(px - sx * 0.5);
    const x2 = Math.floor(px + sx * 0.5);
    const y1 = Math.floor(py - sy * 0.5);
    const y2 = Math.floor(py + sy * 0.5);
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
    const p = new Vector2().setAngle(player.direction, NEAR_CLIPPING_PLANE).add(player.position);
    const wing = p.clone().sub(player.position).rot90().norm().scale(l);
    const p1 = p.clone().sub(wing);
    const p2 = p.clone().add(wing);
    return [p1, p2];
}
function renderMinimap(ctx, player, scene, sprites) {
    ctx.save();
    const cellSize = ctx.canvas.width * MINIMAP_SCALE;
    const gridSize = sceneSize(scene);
    ctx.translate(ctx.canvas.width * 0.03, ctx.canvas.height * 0.03);
    ctx.scale(cellSize, cellSize);
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
    ctx.fillRect(player.position.x - MINIMAP_PLAYER_SIZE * 0.5, player.position.y - MINIMAP_PLAYER_SIZE * 0.5, MINIMAP_PLAYER_SIZE, MINIMAP_PLAYER_SIZE);
    const [p1, p2] = playerFovRange(player);
    ctx.strokeStyle = "magenta";
    strokeLine(ctx, p1, p2);
    strokeLine(ctx, player.position, p1);
    strokeLine(ctx, player.position, p2);
    if (MINIMAP_SPRITES) {
        ctx.fillStyle = "red";
        ctx.strokeStyle = "yellow";
        const sp = new Vector2();
        const dir = new Vector2().setAngle(player.direction);
        strokeLine(ctx, player.position, player.position.clone().add(dir));
        for (let sprite of sprites) {
            ctx.fillRect(sprite.position.x - MINIMAP_SPRITE_SIZE * 0.5, sprite.position.y - MINIMAP_SPRITE_SIZE * 0.5, MINIMAP_SPRITE_SIZE, MINIMAP_SPRITE_SIZE);
            sp.copy(sprite.position).sub(player.position);
            strokeLine(ctx, player.position, player.position.clone().add(sp));
            const spl = sp.length();
            if (spl <= NEAR_CLIPPING_PLANE)
                continue;
            if (spl >= FAR_CLIPPING_PLANE)
                continue;
            const dot = sp.dot(dir) / spl;
            ctx.fillStyle = "white";
            ctx.font = "0.5px bold";
            ctx.fillText(`${dot}`, player.position.x, player.position.y);
            if (!(COS_OF_HALF_FOV <= dot))
                continue;
            const dist = NEAR_CLIPPING_PLANE / dot;
            sp.norm().scale(dist).add(player.position);
            ctx.fillRect(sp.x - MINIMAP_SPRITE_SIZE * 0.5, sp.y - MINIMAP_SPRITE_SIZE * 0.5, MINIMAP_SPRITE_SIZE, MINIMAP_SPRITE_SIZE);
        }
    }
    ctx.restore();
}
const dts = [];
function renderFPS(ctx, deltaTime) {
    ctx.font = "48px bold";
    ctx.fillStyle = "white";
    dts.push(deltaTime);
    if (dts.length > 60)
        dts.shift();
    const dtAvg = dts.reduce((a, b) => a + b, 0) / dts.length;
    ctx.fillText(`${Math.floor(1 / dtAvg)}`, 100, 100);
}
function renderWalls(display, player, scene) {
    const [r1, r2] = playerFovRange(player);
    const d = new Vector2().setAngle(player.direction);
    for (let x = 0; x < display.backImageData.width; ++x) {
        const p = castRay(scene, player.position, r1.clone().lerp(r2, x / display.backImageData.width));
        const c = hittingCell(player.position, p);
        const cell = sceneGetTile(scene, c);
        const v = p.clone().sub(player.position);
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
            let u = 0;
            const t = p.clone().sub(c);
            if (Math.abs(t.x) < EPS && t.y > 0) {
                u = t.y;
            }
            else if (Math.abs(t.x - 1) < EPS && t.y > 0) {
                u = 1 - t.y;
            }
            else if (Math.abs(t.y) < EPS && t.x > 0) {
                u = 1 - t.x;
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
            const shadow = Math.min(1 / display.zBuffer[x] * 4, 1);
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
function renderFloorAndCeiling(imageData, player) {
    const pz = imageData.height / 2;
    const [p1, p2] = playerFovRange(player);
    const t = new Vector2();
    const t1 = new Vector2();
    const t2 = new Vector2();
    const bp = t1.copy(p1).sub(player.position).length();
    for (let y = Math.floor(imageData.height / 2); y < imageData.height; ++y) {
        const sz = imageData.height - y - 1;
        const ap = pz - sz;
        const b = (bp / ap) * pz / NEAR_CLIPPING_PLANE;
        t1.copy(p1).sub(player.position).norm().scale(b).add(player.position);
        t2.copy(p2).sub(player.position).norm().scale(b).add(player.position);
        for (let x = 0; x < imageData.width; ++x) {
            t.copy(t1).lerp(t2, x / imageData.width);
            const floorTile = sceneGetFloor(t);
            if (floorTile instanceof RGBA) {
                const destP = (y * imageData.width + x) * 4;
                const shadow = player.position.distanceTo(t) * 255;
                imageData.data[destP + 0] = floorTile.r * shadow;
                imageData.data[destP + 1] = floorTile.g * shadow;
                imageData.data[destP + 2] = floorTile.b * shadow;
            }
            const ceilingTile = sceneGetCeiling(t);
            if (ceilingTile instanceof RGBA) {
                const destP = (sz * imageData.width + x) * 4;
                const shadow = player.position.distanceTo(t) * 255;
                imageData.data[destP + 0] = ceilingTile.r * shadow;
                imageData.data[destP + 1] = ceilingTile.g * shadow;
                imageData.data[destP + 2] = ceilingTile.b * shadow;
            }
        }
    }
}
function displaySwapBackImageData(display) {
    display.backCtx.putImageData(display.backImageData, 0, 0);
    display.ctx.drawImage(display.backCtx.canvas, 0, 0, display.ctx.canvas.width, display.ctx.canvas.height);
}
const visibleSprites = [];
function renderSprites(display, player, spritePool) {
    const sp = new Vector2();
    const dir = new Vector2().setAngle(player.direction);
    const [p1, p2] = playerFovRange(player);
    visibleSprites.length = 0;
    for (let i = 0; i < spritePool.count; ++i) {
        const sprite = spritePool.sprites[i];
        sp.copy(sprite.position).sub(player.position);
        const spl = sp.length();
        if (spl <= NEAR_CLIPPING_PLANE)
            continue;
        if (spl >= FAR_CLIPPING_PLANE)
            continue;
        const dot = sp.dot(dir) / spl;
        if (!(COS_OF_HALF_FOV <= dot))
            continue;
        const dist = NEAR_CLIPPING_PLANE / dot;
        sp.norm().scale(dist).add(player.position);
        sprite.t = p1.distanceTo(sp) / p1.distanceTo(p2);
        sprite.pdist = sprite.position.clone().sub(player.position).dot(dir);
        if (sprite.pdist < NEAR_CLIPPING_PLANE)
            continue;
        if (sprite.pdist >= FAR_CLIPPING_PLANE)
            continue;
        visibleSprites.push(sprite);
    }
    visibleSprites.sort((a, b) => b.pdist - a.pdist);
    for (let sprite of visibleSprites) {
        const cx = display.backImageData.width * sprite.t;
        const cy = display.backImageData.height * 0.5;
        const maxSpriteSize = display.backImageData.height / sprite.pdist;
        const spriteSize = maxSpriteSize * sprite.scale;
        const x1 = Math.floor(cx - spriteSize * 0.5);
        const x2 = Math.floor(x1 + spriteSize - 1);
        const bx1 = Math.max(0, x1);
        const bx2 = Math.min(display.backImageData.width - 1, x2);
        const y1 = Math.floor(cy + maxSpriteSize * 0.5 - maxSpriteSize * sprite.z);
        const y2 = Math.floor(y1 + spriteSize - 1);
        const by1 = Math.max(0, y1);
        const by2 = Math.min(display.backImageData.height - 1, y2);
        const src = sprite.imageData.data;
        const dest = display.backImageData.data;
        for (let x = bx1; x <= bx2; ++x) {
            if (sprite.pdist < display.zBuffer[x]) {
                for (let y = by1; y <= by2; ++y) {
                    const tx = Math.floor((x - x1) / spriteSize * sprite.imageData.width);
                    const ty = Math.floor((y - y1) / spriteSize * sprite.imageData.height);
                    const srcP = (ty * sprite.imageData.width + tx) * 4;
                    const destP = (y * display.backImageData.width + x) * 4;
                    const alpha = src[srcP + 3] / 255;
                    dest[destP + 0] = dest[destP + 0] * (1 - alpha) + src[srcP + 0] * alpha;
                    dest[destP + 1] = dest[destP + 1] * (1 - alpha) + src[srcP + 1] * alpha;
                    dest[destP + 2] = dest[destP + 2] * (1 - alpha) + src[srcP + 2] * alpha;
                }
            }
        }
    }
}
function pushSprite(spritePool, imageData, position, z, scale) {
    if (spritePool.sprites.length <= spritePool.count) {
        spritePool.sprites.push({
            imageData,
            position,
            z,
            scale,
            pdist: 0,
            t: 0,
        });
    }
    else {
        spritePool.sprites[spritePool.count].imageData = imageData;
        spritePool.sprites[spritePool.count].position = position;
        spritePool.sprites[spritePool.count].z = z;
        spritePool.sprites[spritePool.count].scale = scale;
    }
    spritePool.count += 1;
}
export function createSpritePool() {
    return {
        sprites: [],
        count: 0,
    };
}
export function allocateBombs(capacity) {
    let bomb = [];
    for (let i = 0; i < capacity; ++i) {
        bomb.push({
            position: new Vector3(),
            velocity: new Vector3(),
            lifetime: 0,
        });
    }
    return bomb;
}
const BOMB_THROW_VELOCITY = 5;
const GRAVITY = new Vector3(0, 0, -10);
export function throwBomb(player, bombs) {
    for (let bomb of bombs) {
        if (bomb.lifetime <= 0) {
            bomb.lifetime = 5.0;
            bomb.position.copy2(player.position, 0.6);
            bomb.velocity.x = Math.cos(player.direction);
            bomb.velocity.y = Math.sin(player.direction);
            bomb.velocity.z = 0.5;
            bomb.velocity.scale(BOMB_THROW_VELOCITY);
            break;
        }
    }
}
export function renderGame(display, deltaTime, time, player, scene, spritePool, items, bombs, bombImageData, bombRicochet, itemPickup) {
    player.velocity.setScalar(0);
    let angularVelocity = 0.0;
    if (player.movingForward) {
        player.velocity.add(new Vector2().setAngle(player.direction, PLAYER_SPEED));
    }
    if (player.movingBackward) {
        player.velocity.sub(new Vector2().setAngle(player.direction, PLAYER_SPEED));
    }
    if (player.turningLeft) {
        angularVelocity -= Math.PI;
    }
    if (player.turningRight) {
        angularVelocity += Math.PI;
    }
    player.direction = player.direction + angularVelocity * deltaTime;
    const nx = player.position.x + player.velocity.x * deltaTime;
    if (sceneCanRectangleFitHere(scene, nx, player.position.y, MINIMAP_PLAYER_SIZE, MINIMAP_PLAYER_SIZE)) {
        player.position.x = nx;
    }
    const ny = player.position.y + player.velocity.y * deltaTime;
    if (sceneCanRectangleFitHere(scene, player.position.x, ny, MINIMAP_PLAYER_SIZE, MINIMAP_PLAYER_SIZE)) {
        player.position.y = ny;
    }
    for (let item of items) {
        if (item.alive) {
            if (player.position.sqrDistanceTo(item.position) < PLAYER_RADIUS * PLAYER_RADIUS) {
                itemPickup.currentTime = 0;
                itemPickup.play();
                item.alive = false;
            }
        }
    }
    spritePool.count = 0;
    for (let bomb of bombs) {
        if (bomb.lifetime > 0) {
            bomb.lifetime -= deltaTime;
            bomb.velocity.z += GRAVITY.z * deltaTime;
            const nx = bomb.position.x + bomb.velocity.x * deltaTime;
            const ny = bomb.position.y + bomb.velocity.y * deltaTime;
            const BOMB_DAMP = 0.8;
            if (sceneIsWall(scene, new Vector2(nx, ny))) {
                const dx = Math.abs(Math.floor(bomb.position.x) - Math.floor(nx));
                const dy = Math.abs(Math.floor(bomb.position.y) - Math.floor(ny));
                if (dx > 0)
                    bomb.velocity.x *= -1;
                if (dy > 0)
                    bomb.velocity.y *= -1;
                bomb.velocity.scale(BOMB_DAMP);
                if (bomb.velocity.length() > 1) {
                    bombRicochet.currentTime = 0;
                    bombRicochet.play();
                }
            }
            else {
                bomb.position.x = nx;
                bomb.position.y = ny;
            }
            const nz = bomb.position.z + bomb.velocity.z * deltaTime;
            if (nz < 0.25 || nz > 1.0) {
                bomb.velocity.z *= -1;
                bomb.velocity.scale(BOMB_DAMP);
                if (bomb.velocity.length() > 1) {
                    bombRicochet.currentTime = 0;
                    bombRicochet.play();
                }
            }
            else {
                bomb.position.z = nz;
            }
            if (bomb.lifetime <= 0) {
            }
            else {
                pushSprite(spritePool, bombImageData, bomb.position.clone2(), bomb.position.z, 0.25);
            }
        }
    }
    for (let item of items) {
        if (item.alive) {
            pushSprite(spritePool, item.imageData, item.position, 0.25 + ITEM_AMP - ITEM_AMP * Math.sin(ITEM_FREQ * Math.PI * time + item.position.x + item.position.y), 0.25);
        }
    }
    renderFloorAndCeiling(display.backImageData, player);
    renderWalls(display, player, scene);
    renderSprites(display, player, spritePool);
    displaySwapBackImageData(display);
    renderFPS(display.ctx, deltaTime);
}
//# sourceMappingURL=game.js.map