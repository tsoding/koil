import * as common from './common.mts';
import {
    RGBA, Vector2, Vector3, Scene, Player,
    sceneGetTile, updatePlayer,
    PLAYER_SIZE, SERVER_PORT,
    clamp, properMod
} from './common.mts';

const EPS = 1e-6;
const NEAR_CLIPPING_PLANE = 0.1;
const FAR_CLIPPING_PLANE = 10.0;
const FOV = Math.PI*0.5;

const SCREEN_FACTOR = 30;
const SCREEN_WIDTH = Math.floor(16*SCREEN_FACTOR);
const SCREEN_HEIGHT = Math.floor(9*SCREEN_FACTOR);

const SCENE_FLOOR1 = new RGBA(0.094, 0.094 + 0.07, 0.094 + 0.07, 1.0);
const SCENE_FLOOR2 = new RGBA(0.188, 0.188 + 0.07, 0.188 + 0.07, 1.0);
const SCENE_CEILING1 = new RGBA(0.094 + 0.07, 0.094, 0.094, 1.0);
const SCENE_CEILING2 = new RGBA(0.188 + 0.07, 0.188, 0.188, 1.0);

const ITEM_FREQ = 0.7;
const ITEM_AMP = 0.07;

const BOMB_PARTICLE_COUNT = 50

const PARTICLE_LIFETIME = 1.0;
const PARTICLE_DAMP = 0.8;
const PARTICLE_SCALE = 0.05;
const PARTICLE_MAX_SPEED = 8;
const PARTICLE_COLOR = new RGBA(1, 0.5, 0.15, 1);

const MINIMAP = false;
const MINIMAP_SPRITES = true;
const MINIMAP_SPRITE_SIZE = 0.2;
const MINIMAP_SCALE = 0.07;

const SPRITE_ANGLES_COUNT = 8;

const CONTROL_KEYS: {[key: string]: common.Moving} = {
    'ArrowLeft'  : common.Moving.TurningLeft,
    'ArrowRight' : common.Moving.TurningRight,
    'ArrowUp'    : common.Moving.MovingForward,
    'ArrowDown'  : common.Moving.MovingBackward,
    'KeyA'       : common.Moving.TurningLeft,
    'KeyD'       : common.Moving.TurningRight,
    'KeyW'       : common.Moving.MovingForward,
    'KeyS'       : common.Moving.MovingBackward,
};

interface SpritePool {
    items: Array<Sprite>,
    length: number,
}

function createSpritePool(): SpritePool {
    return {
        items: [],
        length: 0,
    }
}

function resetSpritePool(spritePool: SpritePool) {
    spritePool.length = 0;
}

function strokeLine(ctx: CanvasRenderingContext2D, p1: Vector2, p2: Vector2) {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
}

function snap(x: number, dx: number): number {
    if (dx > 0) return Math.ceil(x + Math.sign(dx)*EPS);
    if (dx < 0) return Math.floor(x + Math.sign(dx)*EPS);
    return x;
}

function hittingCell(p1: Vector2, p2: Vector2): Vector2 {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return new Vector2(Math.floor(p2.x + Math.sign(dx)*EPS),
                       Math.floor(p2.y + Math.sign(dy)*EPS));
}

function rayStep(p1: Vector2, p2: Vector2): Vector2 {
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
    let p3 = p2.clone();
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    if (dx !== 0) {
        const k = dy/dx;
        const c = p1.y - k*p1.x;

        {
            const x3 = snap(p2.x, dx);
            const y3 = x3*k + c;
            p3.set(x3, y3);
        }

        if (k !== 0) {
            const y3 = snap(p2.y, dy);
            const x3 = (y3 - c)/k;
            const p3t = new Vector2(x3, y3);
            if (p2.sqrDistanceTo(p3t) < p2.sqrDistanceTo(p3)) {
                p3.copy(p3t);
            }
        }
    } else {
        const y3 = snap(p2.y, dy);
        const x3 = p2.x;
        p3.set(x3, y3);
    }

    return p3;
}

type Tile = RGBA | ImageData | null;

function sceneGetFloor(p: Vector2): Tile | undefined {
    if ((Math.floor(p.x) + Math.floor(p.y))%2 == 0) {
        return SCENE_FLOOR1;
    } else {
        return SCENE_FLOOR2;
    }
}

function sceneGetCeiling(p: Vector2): Tile | undefined {
    if ((Math.floor(p.x) + Math.floor(p.y))%2 == 0) {
        return SCENE_CEILING1;
    } else {
        return SCENE_CEILING2;
    }
}

function castRay(scene: Scene, p1: Vector2, p2: Vector2): Vector2 {
    let start = p1;
    while (start.sqrDistanceTo(p1) < FAR_CLIPPING_PLANE*FAR_CLIPPING_PLANE) {
        const c = hittingCell(p1, p2);
        if (sceneGetTile(scene, c)) break;
        const p3 = rayStep(p1, p2);
        p1 = p2;
        p2 = p3;
    }
    return p2;
}

interface Camera {
    position: Vector2;
    direction: number;
    fovLeft: Vector2;
    fovRight: Vector2;
}

function renderMinimap(ctx: CanvasRenderingContext2D, camera: Camera, player: Player, scene: Scene, spritePool: SpritePool, visibleSprites: Array<Sprite>) {
    ctx.save();

    // A couple of temporary vectors
    const p1 = new Vector2();
    const p2 = new Vector2();

    const cellSize = ctx.canvas.width*MINIMAP_SCALE;

    ctx.translate(ctx.canvas.width*0.03, ctx.canvas.height*0.03);
    ctx.scale(cellSize, cellSize);

    ctx.fillStyle = "#181818";
    ctx.fillRect(0, 0, scene.width, scene.height);

    ctx.lineWidth = 0.05;
    for (let y = 0; y < scene.height; ++y) {
        for (let x = 0; x < scene.width; ++x) {
            if (sceneGetTile(scene, p1.set(x, y))) {
                ctx.fillStyle = "blue";
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }

    // Grid
    ctx.strokeStyle = "#303030";
    for (let x = 0; x <= scene.width; ++x) {
        strokeLine(ctx, p1.set(x, 0), p2.set(x, scene.height));
    }
    for (let y = 0; y <= scene.height; ++y) {
        strokeLine(ctx, p1.set(0, y), p2.set(scene.width, y));
    }

    ctx.fillStyle = "magenta";
    ctx.fillRect(player.position.x - PLAYER_SIZE*0.5,
                 player.position.y - PLAYER_SIZE*0.5,
                 PLAYER_SIZE, PLAYER_SIZE);

    ctx.strokeStyle = "magenta";
    strokeLine(ctx, camera.fovLeft, camera.fovRight);
    strokeLine(ctx, camera.position, camera.fovLeft);
    strokeLine(ctx, camera.position, camera.fovRight);

    if (MINIMAP_SPRITES) {
        ctx.strokeStyle = "yellow";
        ctx.fillStyle = "white"
        for (let i = 0; i < spritePool.length; ++i) {
            const sprite = spritePool.items[i];
            ctx.fillRect(sprite.position.x - MINIMAP_SPRITE_SIZE*0.5,
                         sprite.position.y - MINIMAP_SPRITE_SIZE*0.5,
                         MINIMAP_SPRITE_SIZE, MINIMAP_SPRITE_SIZE);

        }

        const sp = new Vector2();
        for (let sprite of visibleSprites) {
            strokeLine(ctx, player.position, sprite.position);
            sp.copy(sprite.position).sub(player.position).norm().scale(sprite.dist).add(player.position);
            ctx.fillRect(sp.x - MINIMAP_SPRITE_SIZE*0.5,
                         sp.y - MINIMAP_SPRITE_SIZE*0.5,
                         MINIMAP_SPRITE_SIZE, MINIMAP_SPRITE_SIZE);
        }
    }

    ctx.restore();
}

function renderDebugInfo(ctx: CanvasRenderingContext2D, deltaTime: number, game: Game) {
    const fontSize = 28;
    ctx.font = `${fontSize}px bold`

    game.dts.push(deltaTime);
    if (game.dts.length > 60) // can be any number of frames
        game.dts.shift();

    const dtAvg = game.dts.reduce((a, b) => a + b, 0)/game.dts.length;

    const labels = [];
    labels.push(`FPS: ${Math.floor(1/dtAvg)}`)
    switch (game.ws.readyState) {
        case WebSocket.CONNECTING: {
            labels.push('Connecting...');
        } break;
        case WebSocket.OPEN: {
            labels.push(`Ping: ${game.ping.toFixed(2)}ms`);
            labels.push(`Players: ${game.players.size}`);
        } break;
        case WebSocket.CLOSING:
        case WebSocket.CLOSED: {
            labels.push(`Offline`);
        } break;
    }

    const shadowOffset = fontSize*0.06
    const padding = 70
    for (let i = 0; i < labels.length; ++i) {
        ctx.fillStyle = "black"
        ctx.fillText(labels[i], padding, padding + fontSize*i);
        ctx.fillStyle = "white"
        ctx.fillText(labels[i], padding + shadowOffset, padding - shadowOffset + fontSize*i);
    }
}

function renderColumnOfWall(display: Display, cell: Tile, x: number, p: Vector2, c: Vector2) {
    if (cell instanceof RGBA) {
        const stripHeight = display.backImageData.height/display.zBuffer[x];
        const shadow = 1/display.zBuffer[x]*2;
        for (let dy = 0; dy < Math.ceil(stripHeight); ++dy) {
            const y = Math.floor((display.backImageData.height - stripHeight)*0.5) + dy;
            const destP = (y*display.backImageData.width + x)*4;
            display.backImageData.data[destP + 0] = cell.r*shadow*255;
            display.backImageData.data[destP + 1] = cell.g*shadow*255;
            display.backImageData.data[destP + 2] = cell.b*shadow*255;
        }
    } else if (cell instanceof ImageData) {
        const stripHeight = display.backImageData.height/display.zBuffer[x];

        let u = 0;
        const t = p.clone().sub(c);
        if (Math.abs(t.x) < EPS && t.y > 0) {
            u = t.y;
        } else if (Math.abs(t.x - 1) < EPS && t.y > 0) {
            u = 1 - t.y;
        } else if (Math.abs(t.y) < EPS && t.x > 0) {
            u = 1 - t.x;
        } else {
            u = t.x;
        }

        const y1f = (display.backImageData.height - stripHeight) * 0.5;
        const y1 = Math.ceil(y1f);
        const y2 = Math.floor(y1 + stripHeight);
        const by1 = Math.max(0, y1);
        const by2 = Math.min(display.backImageData.height, y2);
        const tx = Math.floor(u*cell.width);
        const sh = cell.height / stripHeight;
        const shadow = Math.min(1/display.zBuffer[x]*4, 1);
        for (let y = by1; y < by2; ++y) {
            const ty = Math.floor((y - y1f)*sh);
            const destP = (y*display.backImageData.width + x)*4;
            const srcP = (ty*cell.width + tx)*4;
            display.backImageData.data[destP + 0] = cell.data[srcP + 0]*shadow;
            display.backImageData.data[destP + 1] = cell.data[srcP + 1]*shadow;
            display.backImageData.data[destP + 2] = cell.data[srcP + 2]*shadow;
        }
    }
}

function renderWalls(display: Display, assets: Assets, camera: Camera, scene: Scene) {
    const d = new Vector2().setPolar(camera.direction)
    for (let x = 0; x < display.backImageData.width; ++x) {
        const p = castRay(scene, camera.position, camera.fovLeft.clone().lerp(camera.fovRight, x/display.backImageData.width));
        const c = hittingCell(camera.position, p);
        const v = p.clone().sub(camera.position);
        display.zBuffer[x] = v.dot(d);
        if (sceneGetTile(scene, c)) {
            renderColumnOfWall(display, assets.wallImageData, x, p, c);
        }
    }
}

function renderFloorAndCeiling(imageData: ImageData, camera: Camera) {
    const pz = imageData.height/2;
    const t = new Vector2();
    const t1 = new Vector2();
    const t2 = new Vector2();
    const bp = t1.copy(camera.fovLeft).sub(camera.position).length();
    for (let y = Math.floor(imageData.height/2); y < imageData.height; ++y) {
        const sz = imageData.height - y - 1;

        const ap = pz - sz;
        const b = (bp/ap)*pz/NEAR_CLIPPING_PLANE;
        t1.copy(camera.fovLeft).sub(camera.position).norm().scale(b).add(camera.position);
        t2.copy(camera.fovRight).sub(camera.position).norm().scale(b).add(camera.position);

        // TODO: Render rows up until FAR_CLIPPING_PLANE
        //   There is a small bug with how we are projecting the floor and ceiling which makes it non-trivial.
        //   I think we are projecting it too far, and the only reason it works is because we have no
        //   specific textures at specific places anywhere. So it works completely accidentally.
        //   We need to fix this bug first.
        //
        //   But if we manage to do that, this optimization should give a decent speed up 'cause we can render
        //   fewer rows.

        for (let x = 0; x < imageData.width; ++x) {
            t.copy(t1).lerp(t2, x/imageData.width);
            const floorTile = sceneGetFloor(t);
            if (floorTile instanceof RGBA) {
                const destP = (y*imageData.width + x)*4;
                const shadow = camera.position.distanceTo(t)*255;
                imageData.data[destP + 0] = floorTile.r*shadow;
                imageData.data[destP + 1] = floorTile.g*shadow;
                imageData.data[destP + 2] = floorTile.b*shadow;
            }
            const ceilingTile = sceneGetCeiling(t);
            if (ceilingTile instanceof RGBA) {
                const destP = (sz*imageData.width + x)*4;
                const shadow = camera.position.distanceTo(t)*255;
                imageData.data[destP + 0] = ceilingTile.r*shadow;
                imageData.data[destP + 1] = ceilingTile.g*shadow;
                imageData.data[destP + 2] = ceilingTile.b*shadow;
            }
        }
    }
}

interface Display {
    ctx: CanvasRenderingContext2D;
    backCtx: OffscreenCanvasRenderingContext2D;
    backImageData: ImageData;
    zBuffer: Array<number>;
}

function createDisplay(ctx: CanvasRenderingContext2D, width: number, height: number): Display {
    const backImageData = new ImageData(width, height);
    backImageData.data.fill(255);
    const backCanvas = new OffscreenCanvas(width, height);
    const backCtx = backCanvas.getContext("2d");
    if (backCtx === null) throw new Error("2D context is not supported");
    backCtx.imageSmoothingEnabled = false;
    return {
        ctx,
        backCtx,
        backImageData,
        zBuffer: Array(width).fill(0),
    };
}

function displaySwapBackImageData(display: Display) {
    display.backCtx.putImageData(display.backImageData, 0, 0);
    display.ctx.drawImage(display.backCtx.canvas, 0, 0, display.ctx.canvas.width, display.ctx.canvas.height);
}

interface Sprite {
    image: ImageData | RGBA;
    position: Vector2;
    z: number;
    scale: number;
    cropPosition: Vector2;
    cropSize: Vector2;

    dist: number;  // Actual distance.
    pdist: number; // Perpendicular distance.
    t: number;     // Normalized horizontal position on the screen
}

function cullAndSortSprites(camera: Camera, spritePool: SpritePool, visibleSprites: Array<Sprite>) {
    const sp = new Vector2();
    const dir = new Vector2().setPolar(camera.direction);
    const fov = camera.fovRight.clone().sub(camera.fovLeft);

    visibleSprites.length = 0;
    for (let i = 0; i < spritePool.length; ++i) {
        const sprite = spritePool.items[i];

        sp.copy(sprite.position).sub(camera.position);
        const spl = sp.length();
        if (spl <= NEAR_CLIPPING_PLANE) continue; // Sprite is too close
        if (spl >= FAR_CLIPPING_PLANE) continue;  // Sprite is too far

        const cos = sp.dot(dir)/spl;
        // TODO: @perf the sprites that are invisible on the screen but within FOV 180° are not culled
        // It may or may not impact the performance of renderSprites()
        if (cos < 0) continue;  // Sprite is outside of the maximal FOV 180°
        sprite.dist = NEAR_CLIPPING_PLANE/cos;
        sp.norm().scale(sprite.dist).add(camera.position).sub(camera.fovLeft);
        sprite.t = sp.length()/fov.length()*Math.sign(sp.dot(fov));
        sprite.pdist = sprite.position.clone().sub(camera.position).dot(dir);

        // TODO: I'm not sure if these checks are necessary considering the `spl <= NEAR_CLIPPING_PLANE` above
        if (sprite.pdist < NEAR_CLIPPING_PLANE) continue;
        if (sprite.pdist >= FAR_CLIPPING_PLANE) continue;

        visibleSprites.push(sprite);
    }

    visibleSprites.sort((a, b) => b.pdist - a.pdist);
}

function renderSprites(display: Display, sprites: Array<Sprite>) {
    for (let sprite of sprites) {
        const cx = display.backImageData.width*sprite.t;
        const cy = display.backImageData.height*0.5;
        const maxSpriteSize = display.backImageData.height/sprite.pdist;
        const spriteSize = maxSpriteSize*sprite.scale;
        const x1 = Math.floor(cx - spriteSize*0.5);
        const x2 = Math.floor(x1 + spriteSize - 1);
        const bx1 = Math.max(0, x1);
        const bx2 = Math.min(display.backImageData.width-1, x2);
        const y1 = Math.floor(cy + maxSpriteSize*0.5 - maxSpriteSize*sprite.z);
        const y2 = Math.floor(y1 + spriteSize - 1);
        const by1 = Math.max(0, y1);
        const by2 = Math.min(display.backImageData.height-1, y2);

        if (sprite.image instanceof ImageData) {
            const src = sprite.image.data;
            const dest = display.backImageData.data;
            for (let x = bx1; x <= bx2; ++x) {
                if (sprite.pdist < display.zBuffer[x]) {
                    for (let y = by1; y <= by2; ++y) {
                        const tx = Math.floor((x - x1)/spriteSize*sprite.cropSize.x);
                        const ty = Math.floor((y - y1)/spriteSize*sprite.cropSize.y);
                        const srcP = ((ty + sprite.cropPosition.y)*sprite.image.width + (tx + sprite.cropPosition.x))*4;
                        const destP = (y*display.backImageData.width + x)*4;
                        const alpha = src[srcP + 3]/255;
                        dest[destP + 0] = dest[destP + 0]*(1 - alpha) + src[srcP + 0]*alpha;
                        dest[destP + 1] = dest[destP + 1]*(1 - alpha) + src[srcP + 1]*alpha;
                        dest[destP + 2] = dest[destP + 2]*(1 - alpha) + src[srcP + 2]*alpha;
                    }
                }
            }
        } else if (sprite.image instanceof RGBA) {
            const dest = display.backImageData.data;
            for (let x = bx1; x <= bx2; ++x) {
                if (sprite.pdist < display.zBuffer[x]) {
                    for (let y = by1; y <= by2; ++y) {
                        const destP = (y*display.backImageData.width + x)*4;
                        const alpha = sprite.image.a;
                        dest[destP + 0] = dest[destP + 0]*(1 - alpha) + sprite.image.r*255*alpha;
                        dest[destP + 1] = dest[destP + 1]*(1 - alpha) + sprite.image.g*255*alpha;
                        dest[destP + 2] = dest[destP + 2]*(1 - alpha) + sprite.image.b*255*alpha;
                    }
                }
            }
        }
    }
}

function pushSprite(spritePool: SpritePool, image: RGBA | ImageData, position: Vector2, z: number, scale: number, cropPosition?: Vector2, cropSize?: Vector2) {
    if (spritePool.length >= spritePool.items.length) {
        spritePool.items.push({
            image,
            position: new Vector2(),
            z,
            scale,
            pdist: 0,
            dist: 0,
            t: 0,
            cropPosition: new Vector2(),
            cropSize: new Vector2(),
        })
    }

    const last = spritePool.length;

    spritePool.items[last].image = image;
    spritePool.items[last].position.copy(position);
    spritePool.items[last].z = z;
    spritePool.items[last].scale = scale;
    spritePool.items[last].pdist = 0;
    spritePool.items[last].dist = 0;
    spritePool.items[last].t = 0;

    if (image instanceof ImageData) {
        if (cropPosition === undefined) {
            spritePool.items[last].cropPosition.set(0, 0);
        } else {
            spritePool.items[last].cropPosition.copy(cropPosition);
        }
        if (cropSize === undefined) {
            spritePool.items[last]
                .cropSize
                .set(image.width, image.height)
                .sub(spritePool.items[last].cropPosition);
        } else {
            spritePool.items[last].cropSize.copy(cropSize);
        }
    } else {
        spritePool.items[last].cropPosition.set(0, 0);
        spritePool.items[last].cropSize.set(0, 0);
    }

    spritePool.length += 1;
}

function updateCamera(player: Player, camera: Camera) {
    const halfFov = FOV*0.5;
    const fovLen = NEAR_CLIPPING_PLANE/Math.cos(halfFov);
    camera.position.copy(player.position);
    camera.direction = player.direction;
    camera.fovLeft.setPolar(camera.direction-halfFov, fovLen).add(camera.position);
    camera.fovRight.setPolar(camera.direction+halfFov, fovLen).add(camera.position);
}

function spriteOfItemKind(itemKind: common.ItemKind, assets: Assets): ImageData {
    switch (itemKind) {
    case common.ItemKind.Key: return assets.keyImageData;
    case common.ItemKind.Bomb: return assets.bombImageData;
    default: return assets.nullImageData;
    }
}

function updateItems(ws: WebSocket, spritePool: SpritePool, time: number, me: Player, items: Array<common.Item>, assets: Assets) {
    // Rendering the items as sprites
    for (let item of items) {
        if (item.alive) {
            pushSprite(spritePool, spriteOfItemKind(item.kind, assets), item.position, 0.25 + ITEM_AMP - ITEM_AMP*Math.sin(ITEM_FREQ*Math.PI*time + item.position.x + item.position.y), 0.25);
        }
    }

    // Offline mode. Updating items state without asking the server.
    if (ws.readyState != WebSocket.OPEN) {
        for (let item of items) {
            if (common.collectItem(me, item)) {
                playSound(assets.itemPickupSound, me.position, item.position);
            }
        }
    }
}

interface Particle {
    lifetime: number,
    position: Vector3,
    velocity: Vector3,
}

function allocateParticles(capacity: number): Array<Particle> {
    let bomb: Array<Particle> = []
    for (let i = 0; i < capacity; ++i) {
        bomb.push({
            position: new Vector3(),
            velocity: new Vector3(),
            lifetime: 0,
        })
    }
    return bomb
}

function updateParticles(spritePool: SpritePool, deltaTime: number, scene: Scene, particles: Array<Particle>) {
    for (let particle of particles) {
        if (particle.lifetime > 0) {
            particle.lifetime -= deltaTime;
            particle.velocity.z -= common.BOMB_GRAVITY*deltaTime;

            const nx = particle.position.x + particle.velocity.x*deltaTime;
            const ny = particle.position.y + particle.velocity.y*deltaTime;
            if (sceneGetTile(scene, new Vector2(nx, ny))) {
                const dx = Math.abs(Math.floor(particle.position.x) - Math.floor(nx));
                const dy = Math.abs(Math.floor(particle.position.y) - Math.floor(ny));

                if (dx > 0) particle.velocity.x *= -1;
                if (dy > 0) particle.velocity.y *= -1;
                particle.velocity.scale(PARTICLE_DAMP);
            } else {
                particle.position.x = nx;
                particle.position.y = ny;
            }

            const nz = particle.position.z + particle.velocity.z*deltaTime;
            if (nz < PARTICLE_SCALE || nz > 1.0) {
                particle.velocity.z *= -1
                particle.velocity.scale(PARTICLE_DAMP);
            } else {
                particle.position.z = nz;
            }

            if (particle.lifetime > 0) {
                pushSprite(spritePool, PARTICLE_COLOR, new Vector2(particle.position.x, particle.position.y), particle.position.z, PARTICLE_SCALE)
            }
        }
    }
}

function emitParticle(source: Vector3, particles: Array<Particle>) {
    for (let particle of particles) {
        if (particle.lifetime <= 0) {
            particle.lifetime = PARTICLE_LIFETIME;
            particle.position.copy(source);
            const angle = Math.random()*2*Math.PI;
            particle.velocity.x = Math.cos(angle);
            particle.velocity.y = Math.sin(angle);
            particle.velocity.z = Math.random()*0.5 + 0.5;
            particle.velocity.scale(PARTICLE_MAX_SPEED*Math.random());
            break;
        }
    }
}

function playSound(sound: HTMLAudioElement, playerPosition: Vector2, objectPosition: Vector2) {
    const maxVolume = 1;
    const distanceToPlayer = objectPosition.distanceTo(playerPosition);
    sound.volume = clamp(maxVolume / distanceToPlayer, 0.0, 1.0);
    sound.currentTime = 0;
    sound.play();
}

function explodeBomb(bomb: common.Bomb, player: Player, assets: Assets, particles: Array<Particle>) {
    playSound(assets.bombBlastSound, player.position, bomb.position.clone2());
    for (let i = 0; i < BOMB_PARTICLE_COUNT; ++i) {
        emitParticle(bomb.position, particles);
    }
}

function updateBombs(ws: WebSocket, spritePool: SpritePool, player: Player, bombs: Array<common.Bomb>, particles: Array<Particle>, scene: Scene, deltaTime: number, assets: Assets) {
    for (let bomb of bombs) {
        if (bomb.lifetime > 0) {
            pushSprite(spritePool, assets.bombImageData, new Vector2(bomb.position.x, bomb.position.y), bomb.position.z, common.BOMB_SCALE)
            if (common.updateBomb(bomb, scene, deltaTime)) {
                playSound(assets.bombRicochetSound, player.position, bomb.position.clone2());
            }

            if (ws.readyState != WebSocket.OPEN && bomb.lifetime <= 0) {
                explodeBomb(bomb, player, assets, particles)
            }
        }
    }
}

interface Assets {
    wallImageData: ImageData,
    keyImageData: ImageData,
    bombImageData: ImageData,
    playerImageData: ImageData,
    nullImageData: ImageData,
    bombRicochetSound: HTMLAudioElement,
    itemPickupSound: HTMLAudioElement,
    bombBlastSound: HTMLAudioElement
}

interface Game {
    camera: Camera,
    ws: WebSocket,
    me: Player,
    players: Map<number, Player>,
    visibleSprites: Array<Sprite>,
    spritePool: SpritePool,
    particles: Array<Particle>,
    assets: Assets,
    ping: number,
    dts: number[],
    level: common.Level,
}

async function loadImage(url: string): Promise<HTMLImageElement> {
    const image = new Image();
    image.src = url;
    return new Promise((resolve, reject) => {
        image.onload = () => resolve(image);
        image.onerror = reject;
    });
}

async function loadImageData(url: string): Promise<ImageData> {
    const image = await loadImage(url);
    const canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("2d canvas is not supported");
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, image.width, image.height);
}

async function createGame(): Promise<Game> {
    const [wallImageData, keyImageData, bombImageData, playerImageData, nullImageData] = await Promise.all([
        loadImageData("assets/images/custom/wall.png"),
        loadImageData("assets/images/custom/key.png"),
        loadImageData("assets/images/custom/bomb.png"),
        loadImageData("assets/images/custom/player.png"),
        loadImageData("assets/images/custom/null.png"),
    ]);
    const itemPickupSound = new Audio("assets/sounds/bomb-pickup.ogg");
    const bombRicochetSound = new Audio("assets/sounds/ricochet.wav");
    const bombBlastSound = new Audio("assets/sounds/blast.ogg");
    const assets = {
        wallImageData,
        keyImageData,
        bombImageData,
        playerImageData,
        nullImageData,
        bombRicochetSound,
        itemPickupSound,
        bombBlastSound,
    }

    const particles = allocateParticles(1000);
    const visibleSprites: Array<Sprite> = [];
    const spritePool = createSpritePool();

    const players = new Map<number, Player>();

    const camera: Camera = {
        position: new Vector2(),
        direction: 0,
        fovLeft: new Vector2(),
        fovRight: new Vector2(),
    };
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.hostname}:${SERVER_PORT}`);
    // HACK: This application is deployed to GitHub Pages for the demo
    // purposes. Unfortunately, GitHub Pages only allow hosting static
    // assets, so we can only operate in Offline Mode. At the same
    // time, tsoding.github.io accepts WebSocket connection on the
    // port 6970 and later times out on the shandshake which results
    // in the client displaying "Connecting..." for the whole time,
    // which does not look good in the demo. So if we are on
    // tsoding.github.io we just instantly close the connection.
    if (window.location.hostname === 'tsoding.github.io') ws.close();
    const me = {
        id: 0,
        position: new Vector2(),
        direction: 0,
        moving: 0,
        hue: 0,
    };
    const level = common.createLevel();
    // TODO: make a better initialization of the items on client
    for (const item of level.items) item.alive = false;
    const game: Game = {
        camera, ws, me, ping: 0, players, particles, assets, spritePool, visibleSprites, dts: [],
        level
    };

    ws.binaryType = 'arraybuffer';
    ws.addEventListener("close", (event) => {
        console.log("WEBSOCKET CLOSE", event)
        game.players.clear();
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
        if (common.HelloStruct.verify(view)) {
            game.me = {
                id: common.HelloStruct.id.read(view),
                position: new Vector2(common.HelloStruct.x.read(view), common.HelloStruct.y.read(view)),
                direction: common.HelloStruct.direction.read(view),
                moving: 0,
                hue: common.HelloStruct.hue.read(view)/256*360,
            }
            players.set(game.me.id, game.me)
        } else if (common.PlayersJoinedHeaderStruct.verify(view)) {
            const count = common.PlayersJoinedHeaderStruct.count(view);
            for (let i = 0; i < count; ++i) {
                const playerView = new DataView(event.data, common.PlayersJoinedHeaderStruct.size + i*common.PlayerStruct.size, common.PlayerStruct.size);
                const id = common.PlayerStruct.id.read(playerView);
                const player = players.get(id);
                if (player !== undefined) {
                    player.position.x = common.PlayerStruct.x.read(playerView);
                    player.position.y = common.PlayerStruct.y.read(playerView);
                    player.direction = common.PlayerStruct.direction.read(playerView);
                    player.moving = common.PlayerStruct.moving.read(playerView);
                    player.hue = common.PlayerStruct.hue.read(playerView)/256*360;
                } else {
                    const x = common.PlayerStruct.x.read(playerView);
                    const y = common.PlayerStruct.y.read(playerView);
                    players.set(id, {
                        id,
                        position: new Vector2(x, y),
                        direction: common.PlayerStruct.direction.read(playerView),
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
                player.position.x = common.PlayerStruct.x.read(playerView);
                player.position.y = common.PlayerStruct.y.read(playerView);
                player.direction = common.PlayerStruct.direction.read(playerView);
            }
        } else if (common.PongStruct.verify(view)) {
            game.ping = performance.now() - common.PongStruct.timestamp.read(view);
        } else if (common.ItemCollectedStruct.verify(view)) {
            const index = common.ItemCollectedStruct.index.read(view);
            if (!(0 <= index && index < game.level.items.length)) {
                console.error(`Received bogus-amogus ItemCollected message from server. Invalid index ${index}`);
                ws?.close();
                return;
            }
            if (game.level.items[index].alive) {
                game.level.items[index].alive = false;
                playSound(assets.itemPickupSound, game.me.position, game.level.items[index].position);
            }
        } else if (common.ItemSpawnedStruct.verify(view)) {
            const index = common.ItemSpawnedStruct.index.read(view);
            if (!(0 <= index && index < game.level.items.length)) {
                console.error(`Received bogus-amogus ItemSpawned message from server. Invalid index ${index}`);
                ws?.close();
                return;
            }
            game.level.items[index].alive = true;
            game.level.items[index].kind = common.ItemSpawnedStruct.itemKind.read(view);
            game.level.items[index].position.x = common.ItemSpawnedStruct.x.read(view);
            game.level.items[index].position.y = common.ItemSpawnedStruct.y.read(view);
        } else if (common.BombSpawnedStruct.verify(view)) {
            const index = common.BombSpawnedStruct.index.read(view);
            if (!(0 <= index && index < game.level.bombs.length)) {
                console.error(`Received bogus-amogus BombSpawned message from server. Invalid index ${index}`);
                ws?.close();
                return;
            }
            game.level.bombs[index].lifetime = common.BombSpawnedStruct.lifetime.read(view);
            game.level.bombs[index].position.x = common.BombSpawnedStruct.x.read(view);
            game.level.bombs[index].position.y = common.BombSpawnedStruct.y.read(view);
            game.level.bombs[index].position.z = common.BombSpawnedStruct.z.read(view);
            game.level.bombs[index].velocity.x = common.BombSpawnedStruct.dx.read(view);
            game.level.bombs[index].velocity.y = common.BombSpawnedStruct.dy.read(view);
            game.level.bombs[index].velocity.z = common.BombSpawnedStruct.dz.read(view);
        } else if (common.BombExplodedStruct.verify(view)) {
            const index = common.BombExplodedStruct.index.read(view);
            if (!(0 <= index && index < game.level.bombs.length)) {
                console.error(`Received bogus-amogus BombExploded message from server. Invalid index ${index}`);
                ws?.close();
                return;
            }
            game.level.bombs[index].lifetime = 0.0;
            game.level.bombs[index].position.x = common.BombExplodedStruct.x.read(view);
            game.level.bombs[index].position.y = common.BombExplodedStruct.y.read(view);
            game.level.bombs[index].position.z = common.BombExplodedStruct.z.read(view);
            explodeBomb(level.bombs[index], me, assets, particles);
        } else {
            console.error("Received bogus-amogus message from server.", view)
            ws?.close();
        }
    });
    ws.addEventListener("open", (event) => {
        console.log("WEBSOCKET OPEN", event)
    });

    return game;
}

function spriteAngleIndex(cameraPosition: Vector2, entity: Player): number {
    return Math.floor(properMod(properMod(entity.direction, 2*Math.PI) - properMod(entity.position.clone().sub(cameraPosition).angle(), 2*Math.PI) - Math.PI + Math.PI/8, 2*Math.PI)/(2*Math.PI)*SPRITE_ANGLES_COUNT);
}

function renderGame(display: Display, deltaTime: number, time: number, game: Game) {
    resetSpritePool(game.spritePool);

    game.players.forEach((player) => {
        if (player !== game.me) updatePlayer(player, game.level.scene, deltaTime)
    });
    updatePlayer(game.me, game.level.scene, deltaTime);
    updateCamera(game.me, game.camera);
    updateItems(game.ws, game.spritePool, time, game.me, game.level.items, game.assets);
    updateBombs(game.ws, game.spritePool, game.me, game.level.bombs, game.particles, game.level.scene, deltaTime, game.assets);
    updateParticles(game.spritePool, deltaTime, game.level.scene, game.particles)

    game.players.forEach((player) => {
        if (player !== game.me) {
            const index = spriteAngleIndex(game.camera.position, player);
            pushSprite(game.spritePool, game.assets.playerImageData, player.position, 1, 1, new Vector2(55*index, 0), new Vector2(55, 55));
        }
    })

    renderFloorAndCeiling(display.backImageData, game.camera);
    renderWalls(display, game.assets, game.camera, game.level.scene);
    cullAndSortSprites(game.camera, game.spritePool, game.visibleSprites);
    renderSprites(display, game.visibleSprites);
    displaySwapBackImageData(display);

    if (MINIMAP) renderMinimap(display.ctx, game.camera, game.me, game.level.scene, game.spritePool, game.visibleSprites);
    renderDebugInfo(display.ctx, deltaTime, game);
}

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

    const display = createDisplay(ctx, SCREEN_WIDTH, SCREEN_HEIGHT);
    const game = await createGame();

    window.addEventListener("keydown", (e) => {
        if (!e.repeat) {
            const direction = CONTROL_KEYS[e.code];
            if (direction !== undefined) {
                if (game.ws.readyState === WebSocket.OPEN) {
                    const view = new DataView(new ArrayBuffer(common.AmmaMovingStruct.size));
                    common.AmmaMovingStruct.kind.write(view, common.MessageKind.AmmaMoving);
                    common.AmmaMovingStruct.start.write(view, 1);
                    common.AmmaMovingStruct.direction.write(view, direction);
                    game.ws.send(view);
                } else {
                    game.me.moving |= 1<<direction;
                }
            } else if (e.code === 'Space') {
                if (game.ws.readyState === WebSocket.OPEN) {
                    const view = new DataView(new ArrayBuffer(common.AmmaThrowingStruct.size));
                    common.AmmaThrowingStruct.kind.write(view, common.MessageKind.AmmaThrowing);
                    game.ws.send(view);
                } else {
                    common.throwBomb(game.me, game.level.bombs);
                }
            }
        }
    });
    // TODO: When the window loses the focus, reset all the controls
    window.addEventListener("keyup", (e) => {
        if (!e.repeat) {
            const direction = CONTROL_KEYS[e.code];
            if (direction !== undefined) {
                if (game.ws.readyState === WebSocket.OPEN) {
                    const view = new DataView(new ArrayBuffer(common.AmmaMovingStruct.size));
                    common.AmmaMovingStruct.kind.write(view, common.MessageKind.AmmaMoving);
                    common.AmmaMovingStruct.start.write(view, 0);
                    common.AmmaMovingStruct.direction.write(view, direction);
                    game.ws.send(view);
                } else {
                    game.me.moving &= ~(1<<direction);
                }
            }
        }
    });

    const PING_COOLDOWN = 60;
    let prevTimestamp = 0;
    let pingCooldown = PING_COOLDOWN;
    const frame = (timestamp: number) => {
        const deltaTime = (timestamp - prevTimestamp)/1000;
        const time = timestamp/1000;
        prevTimestamp = timestamp;
        renderGame(display, deltaTime, time, game);
        if (game.ws.readyState == WebSocket.OPEN) {
            pingCooldown -= 1;
            if (pingCooldown <= 0) {
                const view = new DataView(new ArrayBuffer(common.PingStruct.size));
                common.PingStruct.kind.write(view, common.MessageKind.Ping);
                common.PingStruct.timestamp.write(view, performance.now());
                game.ws.send(view);
                pingCooldown = PING_COOLDOWN;
            }
        }
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
// TODO: "magnet" items into the player
// TODO: Blast particles should fade out as they age
// TODO: Bomb collision should take into account its size
// TODO: Try lighting with normal maps that come with some of the assets
// TODO: Try cel shading the walls (using normals and stuff)
// TODO: sound don't mix properly
//   Right now same sounds are just stopped and replaced instantly. Which generally does not sound good.
//   We need to fix them properly
// TODO: consider looking into Web Audio API https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
