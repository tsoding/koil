const EPS = 1e-6;
const NEAR_CLIPPING_PLANE = 0.1;
const FAR_CLIPPING_PLANE = 20.0;
const FOV = Math.PI*0.5;
const SCREEN_FACTOR = 20;
const SCREEN_WIDTH = Math.floor(16*SCREEN_FACTOR);
const SCREEN_HEIGHT = Math.floor(9*SCREEN_FACTOR);
const PLAYER_STEP_LEN = 0.5;
const PLAYER_SPEED = 2;
const PLAYER_SIZE = 0.5

class RGBA {
    r: number;
    g: number;
    b: number;
    a: number;
    constructor(r: number, g: number, b: number, a: number) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }
    static red(): RGBA {
        return new RGBA(1, 0, 0, 1);
    }
    static green(): RGBA {
        return new RGBA(0, 1, 0, 1);
    }
    static blue(): RGBA {
        return new RGBA(0, 0, 1, 1);
    }
    static yellow(): RGBA {
        return new RGBA(1, 1, 0, 1);
    }
    static purple(): RGBA {
        return new RGBA(1, 0, 1, 1);
    }
    static cyan(): RGBA {
        return new RGBA(0, 1, 1, 1);
    }
    brightness(factor: number): RGBA {
        return new RGBA(factor*this.r, factor*this.g, factor*this.b, this.a);
    }
    toStyle(): string {
        return `rgba(`
            +`${Math.floor(this.r*255)}, `
            +`${Math.floor(this.g*255)}, `
            +`${Math.floor(this.b*255)}, `
            +`${this.a})`;
    }
}

class Vector2 {
    x: number;
    y: number;
    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }
    static zero(): Vector2 {
        return new Vector2(0, 0);
    }
    static scalar(value: number): Vector2 {
        return new Vector2(value, value);
    }
    static angle(angle: number): Vector2 {
        return new Vector2(Math.cos(angle), Math.sin(angle));
    }
    add(that: Vector2): Vector2 {
        return new Vector2(this.x + that.x, this.y + that.y);
    }
    sub(that: Vector2): Vector2 {
        return new Vector2(this.x - that.x, this.y - that.y);
    }
    div(that: Vector2): Vector2 {
        return new Vector2(this.x/that.x, this.y/that.y);
    }
    mul(that: Vector2): Vector2 {
        return new Vector2(this.x*that.x, this.y*that.y);
    }
    length(): number {
        return Math.sqrt(this.x*this.x + this.y*this.y);
    }
    sqrLength(): number {
        return this.x*this.x + this.y*this.y;
    }
    norm(): Vector2 {
        const l = this.length();
        if (l === 0) return new Vector2(0, 0);
        return new Vector2(this.x/l, this.y/l);
    }
    scale(value: number): Vector2 {
        return new Vector2(this.x*value, this.y*value);
    }
    rot90(): Vector2 {
        return new Vector2(-this.y, this.x);
    }
    sqrDistanceTo(that: Vector2): number {
        return that.sub(this).sqrLength();
    }
    lerp(that: Vector2, t: number): Vector2 {
        return that.sub(this).scale(t).add(this);
    }
    dot(that: Vector2): number {
        return this.x*that.x + this.y*that.y;
    }
    map(f: (x: number) => number): Vector2 {
        return new Vector2(f(this.x), f(this.y));
    }
    array(): [number, number] {
        return [this.x, this.y];
    }
}

function canvasSize(ctx: CanvasRenderingContext2D): Vector2 {
    return new Vector2(ctx.canvas.width, ctx.canvas.height);
}

function fillCircle(ctx: CanvasRenderingContext2D, center: Vector2, radius: number) {
    ctx.beginPath();
    ctx.arc(...center.array(), radius, 0, 2*Math.PI);
    ctx.fill();
}

function strokeLine(ctx: CanvasRenderingContext2D, p1: Vector2, p2: Vector2) {
    ctx.beginPath();
    ctx.moveTo(...p1.array());
    ctx.lineTo(...p2.array());
    ctx.stroke();
}

function snap(x: number, dx: number): number {
    if (dx > 0) return Math.ceil(x + Math.sign(dx)*EPS);
    if (dx < 0) return Math.floor(x + Math.sign(dx)*EPS);
    return x;
}

function hittingCell(p1: Vector2, p2: Vector2): Vector2 {
    const d = p2.sub(p1);
    return new Vector2(Math.floor(p2.x + Math.sign(d.x)*EPS),
                       Math.floor(p2.y + Math.sign(d.y)*EPS));
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
    let p3 = p2;
    const d = p2.sub(p1);
    if (d.x !== 0) {
        const k = d.y/d.x;
        const c = p1.y - k*p1.x;

        {
            const x3 = snap(p2.x, d.x);
            const y3 = x3*k + c;
            p3 = new Vector2(x3, y3);
        }

        if (k !== 0) {
            const y3 = snap(p2.y, d.y);
            const x3 = (y3 - c)/k;
            const p3t = new Vector2(x3, y3);
            if (p2.sqrDistanceTo(p3t) < p2.sqrDistanceTo(p3)) {
                p3 = p3t;
            }
        }
    } else {
        const y3 = snap(p2.y, d.y);
        const x3 = p2.x;
        p3 = new Vector2(x3, y3);
    }

    return p3;
}

type Tile = RGBA | ImageData | null;

class Scene {
    walls: Array<Tile>;
    width: number;
    height: number;
    floor1: RGBA;
    floor2: RGBA;
    ceiling1: RGBA;
    ceiling2: RGBA;
    constructor(walls: Array<Array<Tile>>) {
        this.floor1 = new RGBA(0.094, 0.094, 0.094, 1.0);
        this.floor2 = new RGBA(0.188, 0.188, 0.188, 1.0);
        this.ceiling1 = RGBA.red();
        this.ceiling2 = RGBA.blue();
        this.height = walls.length;
        this.width = Number.MIN_VALUE;
        for (let row of walls) {
            this.width = Math.max(this.width, row.length);
        }
        this.walls = [];
        for (let row of walls) {
            this.walls = this.walls.concat(row);
            for (let i = 0; i < this.width - row.length; ++i) {
                this.walls.push(null);
            }
        }
    }
    size(): Vector2 {
        return new Vector2(this.width, this.height);
    }
    contains(p: Vector2): boolean {
        return 0 <= p.x && p.x < this.width && 0 <= p.y && p.y < this.height;
    }
    getWall(p: Vector2): Tile | undefined {
        if (!this.contains(p)) return undefined;
        const fp = p.map(Math.floor);
        return this.walls[fp.y*this.width + fp.x];
    }
    getFloor(p: Vector2): Tile | undefined {
        const t = p.map(Math.floor);
        if ((t.x + t.y)%2 == 0) {
            return this.floor1;
        } else {
            return this.floor2;
        }
    }
    getCeiling(p: Vector2): Tile | undefined {
        const t = p.map(Math.floor);
        if ((t.x + t.y)%2 == 0) {
            return this.ceiling1;
        } else {
            return this.ceiling2;
        }
    }
    isWall(p: Vector2): boolean {
        const c = this.getWall(p);
        return c !== null && c !== undefined;
    }

    canRectangleFitHere(position: Vector2, size: Vector2): boolean {
        const halfSize = size.scale(0.5);
        const leftTopCorner = position.sub(halfSize).map(Math.floor);
        const rightBottomCorner = position.add(halfSize).map(Math.floor);
        for (let x = leftTopCorner.x; x <= rightBottomCorner.x; ++x) {
            for (let y = leftTopCorner.y; y <= rightBottomCorner.y; ++y) {
                if (this.isWall(new Vector2(x, y))) {
                    return false;
                }
            }
        }
        return true;
    }
}

function castRay(scene: Scene, p1: Vector2, p2: Vector2): Vector2 {
    let start = p1;
    while (start.sqrDistanceTo(p1) < FAR_CLIPPING_PLANE*FAR_CLIPPING_PLANE) {
        const c = hittingCell(p1, p2);
        if (scene.isWall(c)) break;
        const p3 = rayStep(p1, p2);
        p1 = p2;
        p2 = p3;
    }
    return p2;
}

class Player {
    position: Vector2;
    direction: number;
    constructor(position: Vector2, direction: number) {
        this.position = position;
        this.direction = direction;
    }
    fovRange(): [Vector2, Vector2] {
        const l = Math.tan(FOV*0.5)*NEAR_CLIPPING_PLANE;
        const p = this.position.add(Vector2.angle(this.direction).scale(NEAR_CLIPPING_PLANE));
        const p1 = p.sub(p.sub(this.position).rot90().norm().scale(l));
        const p2 = p.add(p.sub(this.position).rot90().norm().scale(l));
        return [p1, p2];
    }
}

function renderMinimap(ctx: CanvasRenderingContext2D, player: Player, position: Vector2, size: Vector2, scene: Scene) {
    ctx.save();

    const gridSize = scene.size();

    ctx.translate(...position.array());
    ctx.scale(...size.div(gridSize).array());

    ctx.fillStyle = "#181818";
    ctx.fillRect(0, 0, ...gridSize.array());

    ctx.lineWidth = 0.1;
    for (let y = 0; y < gridSize.y; ++y) {
        for (let x = 0; x < gridSize.x; ++x) {
            const cell = scene.getWall(new Vector2(x, y));
            if (cell instanceof RGBA) {
                ctx.fillStyle = cell.toStyle();
                ctx.fillRect(x, y, 1, 1);
            } else if (cell instanceof ImageData) {
                // TODO: Render ImageData tiles
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
    // fillCircle(ctx, player.position, 0.2);
    ctx.fillRect(player.position.x - PLAYER_SIZE*0.5,
                 player.position.y - PLAYER_SIZE*0.5,
                 PLAYER_SIZE, PLAYER_SIZE);

    const [p1, p2] = player.fovRange();
    ctx.strokeStyle = "magenta";
    strokeLine(ctx, p1, p2);
    strokeLine(ctx, player.position, p1);
    strokeLine(ctx, player.position, p2);

    ctx.restore();
}

function renderWallsToImageData(imageData: ImageData, player: Player, scene: Scene) {
    const [r1, r2] = player.fovRange();
    for (let x = 0; x < SCREEN_WIDTH; ++x) {
        const p = castRay(scene, player.position, r1.lerp(r2, x/SCREEN_WIDTH));
        const c = hittingCell(player.position, p);
        const cell = scene.getWall(c);
        if (cell instanceof RGBA) {
            const v = p.sub(player.position);
            const d = Vector2.angle(player.direction)
            const stripHeight = SCREEN_HEIGHT/v.dot(d);
            const color = cell.brightness(1/v.dot(d));
            for (let dy = 0; dy < Math.ceil(stripHeight); ++dy) {
                const y = Math.floor((SCREEN_HEIGHT - stripHeight)*0.5) + dy;
                imageData.data[(y*SCREEN_WIDTH + x)*4 + 0] = color.r*255;
                imageData.data[(y*SCREEN_WIDTH + x)*4 + 1] = color.g*255;
                imageData.data[(y*SCREEN_WIDTH + x)*4 + 2] = color.b*255;
                imageData.data[(y*SCREEN_WIDTH + x)*4 + 3] = color.a*255;
            }
        } else if (cell instanceof ImageData) {
            const v = p.sub(player.position);
            const d = Vector2.angle(player.direction)
            const stripHeight = SCREEN_HEIGHT/v.dot(d);

            let u = 0;
            const t = p.sub(c);
            if ((Math.abs(t.x) < EPS || Math.abs(t.x - 1) < EPS) && t.y > 0) {
                u = t.y;
            } else {
                u = t.x;
            }

            for (let dy = 0; dy < Math.ceil(stripHeight); ++dy) {
                const tx = Math.floor(u*cell.width);
                const ty = Math.floor(dy/Math.ceil(stripHeight)*cell.height);

                const y = Math.floor((SCREEN_HEIGHT - stripHeight)*0.5) + dy;
                imageData.data[(y*SCREEN_WIDTH + x)*4 + 0] = cell.data[(ty*cell.width + tx)*4 + 0]/v.dot(d);
                imageData.data[(y*SCREEN_WIDTH + x)*4 + 1] = cell.data[(ty*cell.width + tx)*4 + 1]/v.dot(d);
                imageData.data[(y*SCREEN_WIDTH + x)*4 + 2] = cell.data[(ty*cell.width + tx)*4 + 2]/v.dot(d);
                imageData.data[(y*SCREEN_WIDTH + x)*4 + 3] = cell.data[(ty*cell.width + tx)*4 + 3];
            }
        }
    }
}

function renderCeilingIntoImageData(imageData: ImageData, player: Player, scene: Scene) {
    const pz = SCREEN_HEIGHT/2;
    const [p1, p2] = player.fovRange();
    const bp = p1.sub(player.position).length();
    for (let y = SCREEN_HEIGHT/2; y < SCREEN_HEIGHT; ++y) {
        const sz = SCREEN_HEIGHT - y - 1;

        const ap = pz - sz;
        const b = (bp/ap)*pz/NEAR_CLIPPING_PLANE;
        const t1 = player.position.add(p1.sub(player.position).norm().scale(b));
        const t2 = player.position.add(p2.sub(player.position).norm().scale(b));

        for (let x = 0; x < SCREEN_WIDTH; ++x) {
            const t = t1.lerp(t2, x/SCREEN_WIDTH);
            const tile = scene.getCeiling(t);
            if (tile instanceof RGBA) {
                const color = tile.brightness(1/Math.sqrt(player.position.sqrDistanceTo(t)));
                imageData.data[(sz*SCREEN_WIDTH + x)*4 + 0] = color.r*255;
                imageData.data[(sz*SCREEN_WIDTH + x)*4 + 1] = color.g*255;
                imageData.data[(sz*SCREEN_WIDTH + x)*4 + 2] = color.b*255;
                imageData.data[(sz*SCREEN_WIDTH + x)*4 + 3] = color.a*255;
            }
        }
    }
}

function renderFloorIntoImageData(imageData: ImageData, player: Player, scene: Scene) {
    const pz = SCREEN_HEIGHT/2;
    const [p1, p2] = player.fovRange();
    const bp = p1.sub(player.position).length();
    for (let y = SCREEN_HEIGHT/2; y < SCREEN_HEIGHT; ++y) {
        const sz = SCREEN_HEIGHT - y - 1;

        const ap = pz - sz;
        const b = (bp/ap)*pz/NEAR_CLIPPING_PLANE;
        const t1 = player.position.add(p1.sub(player.position).norm().scale(b));
        const t2 = player.position.add(p2.sub(player.position).norm().scale(b));

        for (let x = 0; x < SCREEN_WIDTH; ++x) {
            const t = t1.lerp(t2, x/SCREEN_WIDTH);
            const tile = scene.getFloor(t);
            if (tile instanceof RGBA) {
                const color = tile.brightness(1/Math.sqrt(player.position.sqrDistanceTo(t)));
                imageData.data[(y*SCREEN_WIDTH + x)*4 + 0] = color.r*255;
                imageData.data[(y*SCREEN_WIDTH + x)*4 + 1] = color.g*255;
                imageData.data[(y*SCREEN_WIDTH + x)*4 + 2] = color.b*255;
                imageData.data[(y*SCREEN_WIDTH + x)*4 + 3] = color.a*255;
            }
        }
    }
}

function renderGameIntoImageData(ctx: CanvasRenderingContext2D, backCtx: OffscreenCanvasRenderingContext2D, backImageData: ImageData, deltaTime: number, player: Player, scene: Scene) {
    const minimapPosition = Vector2.zero().add(canvasSize(ctx).scale(0.03));
    const cellSize = ctx.canvas.width*0.03;
    const minimapSize = scene.size().scale(cellSize);

    backImageData.data.fill(255);
    renderFloorIntoImageData(backImageData, player, scene);
    renderCeilingIntoImageData(backImageData, player, scene);
    renderWallsToImageData(backImageData, player, scene);
    backCtx.putImageData(backImageData, 0, 0);
    ctx.drawImage(backCtx.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height);

    renderMinimap(ctx, player, minimapPosition, minimapSize, scene);

    ctx.font = "48px bold"
    ctx.fillStyle = "white"
    ctx.fillText(`${Math.floor(1/deltaTime)}`, 100, 100);
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

function testBackCanvas(ctx: CanvasRenderingContext2D) {
    const w = 16;
    const h = 9;
    const backImageData = new ImageData(w, h)
    const backCanvas = new OffscreenCanvas(w, h);
    const backCtx = backCanvas.getContext("2d");
    if (backCtx === null) throw new Error("2D context is not supported");
    backCtx.imageSmoothingEnabled = false;
    for (let y = 0; y < h; ++y) {
        for (let x = 0; x < w; ++x) {
            if ((x + y)%2 == 0) {
                backImageData.data[(y*w + x)*4 + 0] = 255; // red
                backImageData.data[(y*w + x)*4 + 1] = 0;   // green
                backImageData.data[(y*w + x)*4 + 2] = 0;   // blue
                backImageData.data[(y*w + x)*4 + 3] = 255; // alpha
            } else {
                backImageData.data[(y*w + x)*4 + 0] = 255; // red
                backImageData.data[(y*w + x)*4 + 1] = 255; // green
                backImageData.data[(y*w + x)*4 + 2] = 255; // blue
                backImageData.data[(y*w + x)*4 + 3] = 255; // alpha
            }
        }
    }
    backCtx.putImageData(backImageData, 0, 0);
    ctx.drawImage(backCanvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
}

(async () => {
    const game = document.getElementById("game") as (HTMLCanvasElement | null);
    if (game === null) throw new Error("No canvas with id `game` is found");
    const factor = 80;
    game.width = 16*factor;
    game.height = 9*factor;
    const ctx = game.getContext("2d");
    if (ctx === null) throw new Error("2D context is not supported");
    ctx.imageSmoothingEnabled = false;

    const backImageData = new ImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
    const backCanvas = new OffscreenCanvas(SCREEN_WIDTH, SCREEN_HEIGHT);
    const backCtx = backCanvas.getContext("2d");
    if (backCtx === null) throw new Error("2D context is not supported");
    backCtx.imageSmoothingEnabled = false;

    const wall1 = await loadImageData("assets/images/opengameart/wezu_tex_cc_by/wall1_color.png").catch(() => RGBA.purple());
    const wall2 = await loadImageData("assets/images/opengameart/wezu_tex_cc_by/wall2_color.png").catch(() => RGBA.purple());
    const wall3 = await loadImageData("assets/images/opengameart/wezu_tex_cc_by/wall3_color.png").catch(() => RGBA.purple());
    const wall4 = await loadImageData("assets/images/opengameart/wezu_tex_cc_by/wall4_color.png").catch(() => RGBA.purple());

    const scene: Scene = new Scene([
        [null, null,  wall1, wall1, null, null, null, null, null],
        [null, null,   null, wall3, null, null, null, null, null],
        [null, wall1, wall2, wall1, null, null, null, null, null],
        [null, null,   null,  null, null, null, null, null, null],
        [null, null,   null],
        [null, null,   wall4,  null, null, null, null, null, null],
        [null, null,   null,  null, null, null, null, null, null],
    ]);

    const player = new Player(
        scene.size().mul(new Vector2(0.63, 0.63)),
        Math.PI*1.25);
    let movingForward = false;
    let movingBackward = false;
    let turningLeft = false;
    let turningRight = false;

    window.addEventListener("keydown", (e) => {
        if (!e.repeat) {
            switch (e.code) {
                case 'KeyW': movingForward  = true; break;
                case 'KeyS': movingBackward = true; break;
                case 'KeyA': turningLeft    = true; break;
                case 'KeyD': turningRight   = true; break;
            }
        }
    });
    window.addEventListener("keyup", (e) => {
        if (!e.repeat) {
            switch (e.code) {
                case 'KeyW': movingForward  = false; break;
                case 'KeyS': movingBackward = false; break;
                case 'KeyA': turningLeft    = false; break;
                case 'KeyD': turningRight   = false; break;
            }
        }
    });

    let prevTimestamp = 0;
    const frame = (timestamp: number) => {
        const deltaTime = (timestamp - prevTimestamp)/1000;
        prevTimestamp = timestamp;
        let velocity = Vector2.zero();
        let angularVelocity = 0.0;
        if (movingForward) {
            velocity = velocity.add(Vector2.angle(player.direction).scale(PLAYER_SPEED))
        }
        if (movingBackward) {
            velocity = velocity.sub(Vector2.angle(player.direction).scale(PLAYER_SPEED))
        }
        if (turningLeft) {
            angularVelocity -= Math.PI;
        }
        if (turningRight) {
            angularVelocity += Math.PI;
        }
        player.direction = player.direction + angularVelocity*deltaTime;
        const nx = player.position.x + velocity.x*deltaTime;
        if (scene.canRectangleFitHere(new Vector2(nx, player.position.y), Vector2.scalar(PLAYER_SIZE))) {
            player.position.x = nx;
        }
        const ny = player.position.y + velocity.y*deltaTime;
        if (scene.canRectangleFitHere(new Vector2(player.position.x, ny), Vector2.scalar(PLAYER_SIZE))) {
            player.position.y = ny;
        }
        renderGameIntoImageData(ctx, backCtx, backImageData, deltaTime, player, scene);
        window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame((timestamp) => {
        prevTimestamp = timestamp;
        window.requestAnimationFrame(frame);
    });
})()
// TODO: Try lighting with normal maps that come with some of the assets
// TODO: Load assets asynchronously
//   While a texture is loading, replace it with a color tile.
