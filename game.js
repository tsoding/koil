const EPS = 1e-6;
const NEAR_CLIPPING_PLANE = 0.1;
const FAR_CLIPPING_PLANE = 10.0;
const FOV = Math.PI * 0.5;
const COS_OF_HALF_FOV = Math.cos(FOV * 0.5);
const PLAYER_SPEED = 2;
const PLAYER_RADIUS = 0.5;
const ITEM_FREQ = 0.7;
const ITEM_AMP = 0.07;
const BOMB_LIFETIME = 2;
const BOMB_THROW_VELOCITY = 5;
const BOMB_GRAVITY = 10;
const BOMB_DAMP = 0.8;
const BOMB_SCALE = 0.25;
const BOMB_PARTICLE_COUNT = 50;
const PARTICLE_LIFETIME = 1.0;
const PARTICLE_DAMP = 0.8;
const PARTICLE_SCALE = 0.05;
const PARTICLE_MAX_SPEED = 8;
const MINIMAP = false;
const MINIMAP_SPRITES = false;
const MINIMAP_PLAYER_SIZE = 0.5;
const MINIMAP_SPRITE_SIZE = 0.3;
const MINIMAP_SCALE = 0.07;
function createSpritePool() {
    return {
        items: [],
        length: 0,
    };
}
function resetSpritePool(spritePool) {
    spritePool.length = 0;
}
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
    setPolar(angle, len = 1) {
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
    set(x, y) {
        this.x = x;
        this.y = y;
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
            p3 = new Vector2().set(x3, y3);
        }
        if (k !== 0) {
            const y3 = snap(p2.y, dy);
            const x3 = (y3 - c) / k;
            const p3t = new Vector2().set(x3, y3);
            if (p2.sqrDistanceTo(p3t) < p2.sqrDistanceTo(p3)) {
                p3 = p3t;
            }
        }
    }
    else {
        const y3 = snap(p2.y, dy);
        const x3 = p2.x;
        p3 = new Vector2().set(x3, y3);
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
function sceneSize(scene) {
    return new Vector2().set(scene.width, scene.height);
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
            if (sceneIsWall(scene, new Vector2().set(x, y))) {
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
        controlVelocity: new Vector2(),
        fovLeft: new Vector2(),
        fovRight: new Vector2(),
        direction: direction,
        movingForward: false,
        movingBackward: false,
        turningLeft: false,
        turningRight: false,
    };
}
function renderMinimap(ctx, player, scene) {
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
            const cell = sceneGetTile(scene, new Vector2().set(x, y));
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
        strokeLine(ctx, new Vector2().set(x, 0), new Vector2().set(x, gridSize.y));
    }
    for (let y = 0; y <= gridSize.y; ++y) {
        strokeLine(ctx, new Vector2().set(0, y), new Vector2().set(gridSize.x, y));
    }
    ctx.fillStyle = "magenta";
    ctx.fillRect(player.position.x - MINIMAP_PLAYER_SIZE * 0.5, player.position.y - MINIMAP_PLAYER_SIZE * 0.5, MINIMAP_PLAYER_SIZE, MINIMAP_PLAYER_SIZE);
    ctx.strokeStyle = "magenta";
    strokeLine(ctx, player.fovLeft, player.fovRight);
    strokeLine(ctx, player.position, player.fovLeft);
    strokeLine(ctx, player.position, player.fovRight);
    if (MINIMAP_SPRITES) {
        ctx.fillStyle = "red";
        ctx.strokeStyle = "yellow";
        const sp = new Vector2();
        const dir = new Vector2().setPolar(player.direction);
        strokeLine(ctx, player.position, player.position.clone().add(dir));
        ctx.fillStyle = "white";
        for (let i = 0; i < spritePool.length; ++i) {
            const sprite = spritePool.items[i];
            ctx.fillRect(sprite.position.x - MINIMAP_SPRITE_SIZE * 0.5, sprite.position.y - MINIMAP_SPRITE_SIZE * 0.5, MINIMAP_SPRITE_SIZE, MINIMAP_SPRITE_SIZE);
            sp.copy(sprite.position).sub(player.position);
            strokeLine(ctx, player.position, player.position.clone().add(sp));
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
    const d = new Vector2().setPolar(player.direction);
    for (let x = 0; x < display.backImageData.width; ++x) {
        const p = castRay(scene, player.position, player.fovLeft.clone().lerp(player.fovRight, x / display.backImageData.width));
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
    const t = new Vector2();
    const t1 = new Vector2();
    const t2 = new Vector2();
    const bp = t1.copy(player.fovLeft).sub(player.position).length();
    for (let y = Math.floor(imageData.height / 2); y < imageData.height; ++y) {
        const sz = imageData.height - y - 1;
        const ap = pz - sz;
        const b = (bp / ap) * pz / NEAR_CLIPPING_PLANE;
        t1.copy(player.fovLeft).sub(player.position).norm().scale(b).add(player.position);
        t2.copy(player.fovRight).sub(player.position).norm().scale(b).add(player.position);
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
const spritePool = createSpritePool();
const visibleSprites = [];
function renderSprites(display, player) {
    const sp = new Vector2();
    const dir = new Vector2().setPolar(player.direction);
    visibleSprites.length = 0;
    for (let i = 0; i < spritePool.length; ++i) {
        const sprite = spritePool.items[i];
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
        sprite.t = player.fovLeft.distanceTo(sp) / player.fovLeft.distanceTo(player.fovRight);
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
        if (sprite.image instanceof ImageData) {
            const src = sprite.image.data;
            const dest = display.backImageData.data;
            for (let x = bx1; x <= bx2; ++x) {
                if (sprite.pdist < display.zBuffer[x]) {
                    for (let y = by1; y <= by2; ++y) {
                        const tx = Math.floor((x - x1) / spriteSize * sprite.image.width);
                        const ty = Math.floor((y - y1) / spriteSize * sprite.image.height);
                        const srcP = (ty * sprite.image.width + tx) * 4;
                        const destP = (y * display.backImageData.width + x) * 4;
                        const alpha = src[srcP + 3] / 255;
                        dest[destP + 0] = dest[destP + 0] * (1 - alpha) + src[srcP + 0] * alpha;
                        dest[destP + 1] = dest[destP + 1] * (1 - alpha) + src[srcP + 1] * alpha;
                        dest[destP + 2] = dest[destP + 2] * (1 - alpha) + src[srcP + 2] * alpha;
                    }
                }
            }
        }
        else if (sprite.image instanceof RGBA) {
            const dest = display.backImageData.data;
            for (let x = bx1; x <= bx2; ++x) {
                if (sprite.pdist < display.zBuffer[x]) {
                    for (let y = by1; y <= by2; ++y) {
                        const destP = (y * display.backImageData.width + x) * 4;
                        const alpha = sprite.image.a;
                        dest[destP + 0] = dest[destP + 0] * (1 - alpha) + sprite.image.r * 255 * alpha;
                        dest[destP + 1] = dest[destP + 1] * (1 - alpha) + sprite.image.g * 255 * alpha;
                        dest[destP + 2] = dest[destP + 2] * (1 - alpha) + sprite.image.b * 255 * alpha;
                    }
                }
            }
        }
    }
}
function pushSprite(image, position, z, scale) {
    if (spritePool.length >= spritePool.items.length) {
        spritePool.items.push({
            image,
            position: position.clone(),
            z,
            scale,
            pdist: 0,
            t: 0,
        });
    }
    else {
        spritePool.items[spritePool.length].image = image;
        spritePool.items[spritePool.length].position.copy(position);
        spritePool.items[spritePool.length].z = z;
        spritePool.items[spritePool.length].scale = scale;
        spritePool.items[spritePool.length].pdist = 0;
        spritePool.items[spritePool.length].t = 0;
        spritePool.length += 1;
    }
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
export function throwBomb(player, bombs) {
    for (let bomb of bombs) {
        if (bomb.lifetime <= 0) {
            bomb.lifetime = BOMB_LIFETIME;
            bomb.position.copy2(player.position, 0.6);
            bomb.velocity.x = Math.cos(player.direction);
            bomb.velocity.y = Math.sin(player.direction);
            bomb.velocity.z = 0.5;
            bomb.velocity.scale(BOMB_THROW_VELOCITY);
            break;
        }
    }
}
function updatePlayer(player, scene, deltaTime) {
    player.controlVelocity.setScalar(0);
    let angularVelocity = 0.0;
    if (player.movingForward) {
        player.controlVelocity.add(new Vector2().setPolar(player.direction, PLAYER_SPEED));
    }
    if (player.movingBackward) {
        player.controlVelocity.sub(new Vector2().setPolar(player.direction, PLAYER_SPEED));
    }
    if (player.turningLeft) {
        angularVelocity -= Math.PI;
    }
    if (player.turningRight) {
        angularVelocity += Math.PI;
    }
    player.direction = player.direction + angularVelocity * deltaTime;
    const nx = player.position.x + player.controlVelocity.x * deltaTime;
    if (sceneCanRectangleFitHere(scene, nx, player.position.y, MINIMAP_PLAYER_SIZE, MINIMAP_PLAYER_SIZE)) {
        player.position.x = nx;
    }
    const ny = player.position.y + player.controlVelocity.y * deltaTime;
    if (sceneCanRectangleFitHere(scene, player.position.x, ny, MINIMAP_PLAYER_SIZE, MINIMAP_PLAYER_SIZE)) {
        player.position.y = ny;
    }
    const halfFov = FOV * 0.5;
    const fovLen = NEAR_CLIPPING_PLANE / Math.cos(halfFov);
    player.fovLeft.setPolar(player.direction - halfFov, fovLen).add(player.position);
    player.fovRight.setPolar(player.direction + halfFov, fovLen).add(player.position);
}
function spriteOfItemKind(itemKind, assets) {
    switch (itemKind) {
        case "key": return assets.keyImageData;
        case "bomb": return assets.bombImageData;
    }
}
function updateItems(time, player, items, assets) {
    for (let item of items) {
        if (item.alive) {
            if (player.position.sqrDistanceTo(item.position) < PLAYER_RADIUS * PLAYER_RADIUS) {
                playSound(assets.itemPickupSound, player.position, item.position);
                item.alive = false;
            }
        }
        if (item.alive) {
            pushSprite(spriteOfItemKind(item.kind, assets), item.position, 0.25 + ITEM_AMP - ITEM_AMP * Math.sin(ITEM_FREQ * Math.PI * time + item.position.x + item.position.y), 0.25);
        }
    }
}
export function allocateParticles(capacity) {
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
function updateParticles(deltaTime, scene, particles, assets) {
    for (let particle of particles) {
        if (particle.lifetime > 0) {
            particle.lifetime -= deltaTime;
            particle.velocity.z -= BOMB_GRAVITY * deltaTime;
            const nx = particle.position.x + particle.velocity.x * deltaTime;
            const ny = particle.position.y + particle.velocity.y * deltaTime;
            if (sceneIsWall(scene, new Vector2().set(nx, ny))) {
                const dx = Math.abs(Math.floor(particle.position.x) - Math.floor(nx));
                const dy = Math.abs(Math.floor(particle.position.y) - Math.floor(ny));
                if (dx > 0)
                    particle.velocity.x *= -1;
                if (dy > 0)
                    particle.velocity.y *= -1;
                particle.velocity.scale(PARTICLE_DAMP);
            }
            else {
                particle.position.x = nx;
                particle.position.y = ny;
            }
            const nz = particle.position.z + particle.velocity.z * deltaTime;
            if (nz < PARTICLE_SCALE || nz > 1.0) {
                particle.velocity.z *= -1;
                particle.velocity.scale(PARTICLE_DAMP);
            }
            else {
                particle.position.z = nz;
            }
            if (particle.lifetime <= 0) {
            }
            else {
                pushSprite(assets.particleImageData, new Vector2().set(particle.position.x, particle.position.y), particle.position.z, PARTICLE_SCALE);
            }
        }
    }
}
function emitParticle(source, particles) {
    for (let particle of particles) {
        if (particle.lifetime <= 0) {
            particle.lifetime = PARTICLE_LIFETIME;
            particle.position.copy(source);
            const angle = Math.random() * 2 * Math.PI;
            particle.velocity.x = Math.cos(angle);
            particle.velocity.y = Math.sin(angle);
            particle.velocity.z = Math.random() * 0.5 + 0.5;
            particle.velocity.scale(PARTICLE_MAX_SPEED * Math.random());
            break;
        }
    }
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
function playSound(sound, playerPosition, objectPosition) {
    const maxVolume = 1;
    const distanceToPlayer = objectPosition.distanceTo(playerPosition);
    sound.volume = clamp(maxVolume / distanceToPlayer, 0.0, 1.0);
    sound.currentTime = 0;
    sound.play();
}
function updateBombs(player, bombs, particles, scene, deltaTime, assets) {
    for (let bomb of bombs) {
        if (bomb.lifetime > 0) {
            bomb.lifetime -= deltaTime;
            bomb.velocity.z -= BOMB_GRAVITY * deltaTime;
            const nx = bomb.position.x + bomb.velocity.x * deltaTime;
            const ny = bomb.position.y + bomb.velocity.y * deltaTime;
            if (sceneIsWall(scene, new Vector2().set(nx, ny))) {
                const dx = Math.abs(Math.floor(bomb.position.x) - Math.floor(nx));
                const dy = Math.abs(Math.floor(bomb.position.y) - Math.floor(ny));
                if (dx > 0)
                    bomb.velocity.x *= -1;
                if (dy > 0)
                    bomb.velocity.y *= -1;
                bomb.velocity.scale(BOMB_DAMP);
                if (bomb.velocity.length() > 1) {
                    playSound(assets.bombRicochetSound, player.position, bomb.position.clone2());
                }
            }
            else {
                bomb.position.x = nx;
                bomb.position.y = ny;
            }
            const nz = bomb.position.z + bomb.velocity.z * deltaTime;
            if (nz < BOMB_SCALE || nz > 1.0) {
                bomb.velocity.z *= -1;
                bomb.velocity.scale(BOMB_DAMP);
                if (bomb.velocity.length() > 1) {
                    playSound(assets.bombRicochetSound, player.position, bomb.position.clone2());
                }
            }
            else {
                bomb.position.z = nz;
            }
            if (bomb.lifetime <= 0) {
                playSound(assets.bombBlastSound, player.position, bomb.position.clone2());
                for (let i = 0; i < BOMB_PARTICLE_COUNT; ++i) {
                    emitParticle(bomb.position, particles);
                }
            }
            else {
                pushSprite(assets.bombImageData, new Vector2().set(bomb.position.x, bomb.position.y), bomb.position.z, BOMB_SCALE);
            }
        }
    }
}
export function renderGame(display, deltaTime, time, player, scene, items, bombs, particles, assets) {
    resetSpritePool(spritePool);
    updatePlayer(player, scene, deltaTime);
    updateItems(time, player, items, assets);
    updateBombs(player, bombs, particles, scene, deltaTime, assets);
    updateParticles(deltaTime, scene, particles, assets);
    renderFloorAndCeiling(display.backImageData, player);
    renderWalls(display, player, scene);
    renderSprites(display, player);
    displaySwapBackImageData(display);
    if (MINIMAP)
        renderMinimap(display.ctx, player, scene);
    renderFPS(display.ctx, deltaTime);
}
//# sourceMappingURL=game.js.map