import std::math;
import common;

const float NEAR_CLIPPING_PLANE = 0.1;
const float FAR_CLIPPING_PLANE = 10.0;
const float FOV = math::PI*0.5;
const float EPS = 1e-6;
const usz SPRITE_POOL_CAPACITY = 100;

const bool MINIMAP_SPRITES = true;
const float MINIMAP_SPRITE_SIZE = 0.2;
const float MINIMAP_SCALE = 0.07;

def Color = char[<4>];

struct Image {
    Color *pixels;
    int width;
    int height;
}

struct Sprite {
    Image image;
    // TODO: Use Vector3 instead
    Vector2 position;
    float z;
    float scale;
    Vector2 crop_position;
    Vector2 crop_size;

    float dist;  // Actual distance.
    float pdist; // Perpendicular distance.
    float t;     // Normalized horizontal position on the screen
}

struct SpritePool {
    Sprite[SPRITE_POOL_CAPACITY] items;
    int length;
    Sprite[SPRITE_POOL_CAPACITY] visible_items;
    int visible_length;
}

fn Sprite *allocate_sprite_pool() @extern("allocate_sprite_pool") @wasm {
    return mem::new(Sprite);
}

fn void reset_sprite_pool(SpritePool *sprite_pool) @extern("reset_sprite_pool") @wasm {
    sprite_pool.length = 0;
    sprite_pool.visible_length = 0;
}

fn Vector2 from_polar(float angle, float len) {
    return {math::cos(angle)*len, math::sin(angle)*len};
}

struct Camera {
    Vector2 position;
    float direction;
    Vector2 fovLeft;
    Vector2 fovRight;
}

fn void Camera.update(Camera *camera) {
    float halfFov = FOV*0.5;
    float fovLen = NEAR_CLIPPING_PLANE/math::cos(halfFov);
    camera.fovLeft = from_polar(camera.direction-halfFov, fovLen) + camera.position;
    camera.fovRight = from_polar(camera.direction+halfFov, fovLen) + camera.position;
}

fn Color* allocate_pixels(int width, int height) @extern("allocate_pixels") @wasm
{
    Color[] pixels = mem::new_array(Color, width*height);
    return &pixels[0];
}

fn float *allocate_zbuffer(int width) @extern("allocate_zbuffer") @wasm
{
    float[] zbuffer = mem::new_array(float, width);
    return &zbuffer[0];
}

const Color SCENE_FLOOR1   = {0x17, 0x29, 0x29, 0xff};
const Color SCENE_FLOOR2   = {0x2f, 0x41, 0x41, 0xff};
const Color SCENE_CEILING1 = {0x29, 0x17, 0x17, 0xff};
const Color SCENE_CEILING2 = {0x41, 0x2f, 0x2f, 0xff};

fn Color sceneGetFloor(Vector2 p) {
    if ((p.x.floor() + p.y.floor())%2 == 0) {
        return SCENE_FLOOR1;
    } else {
        return SCENE_FLOOR2;
    }
}

fn Color sceneGetCeiling(Vector2 p) {
    if ((p.x.floor() + p.y.floor())%2 == 0) {
        return SCENE_CEILING1;
    } else {
        return SCENE_CEILING2;
    }
}

fn void render_floor_and_ceiling(Color *pixels, int pixels_width, int pixels_height, float position_x, float position_y, float direction) @extern("render_floor_and_ceiling") @wasm {
    Camera camera = { .position = {position_x, position_y}, .direction = direction };
    camera.update();

    int pz = pixels_height/2;
    float bp = (camera.fovLeft - camera.position).length();
    for (int y = pixels_height/2; y < pixels_height; ++y) {
        int sz = pixels_height - y - 1;

        int ap = pz - sz;
        float b = (bp/ap)*pz/NEAR_CLIPPING_PLANE;
        Vector2 t1 = (camera.fovLeft - camera.position).normalize()*b + camera.position;
        Vector2 t2 = (camera.fovRight - camera.position).normalize()*b + camera.position;

        // TODO: Render rows up until FAR_CLIPPING_PLANE
        //   There is a small bug with how we are projecting the floor and ceiling which makes it non-trivial.
        //   I think we are projecting it too far, and the only reason it works is because we have no
        //   specific textures at specific places anywhere. So it works completely accidentally.
        //   We need to fix this bug first.
        //
        //   But if we manage to do that, this optimization should give a decent speed up 'cause we can render
        //   fewer rows.

        for (int x = 0; x < pixels_width; ++x) {
            Vector2 t = t1.lerp(t2, (float)x/pixels_width);

            float fog = (t - camera.position).length();
            float[<3>] low = 0;
            float[<3>] high = 255;
            pixels[y*pixels_width + x] = {(char[<3>])((float[<3>])sceneGetFloor(t).rgb*fog).clamp(low, high), 255};
            pixels[sz*pixels_width + x] = {(char[<3>])((float[<3>])sceneGetCeiling(t).rgb*fog).clamp(low, high), 255};
        }
    }
}

fn void render_column_of_wall(Color *display, int display_width, int display_height, float *zbuffer,
                              Color *cell, int cell_width, int cell_height,
                              int x, float px, float py, float cx, float cy) @extern("render_column_of_wall") @wasm {
    float strip_height = display_height/zbuffer[x];
    float u = 0;
    Vector2 p = {px, py};
    Vector2 c = {cx, cy};
    Vector2 t = p - c;
    if (math::abs(t.x) < EPS && t.y > 0) {
        u = t.y;
    } else if (math::abs(t.x - 1) < EPS && t.y > 0) {
        u = 1 - t.y;
    } else if (math::abs(t.y) < EPS && t.x > 0) {
        u = 1 - t.x;
    } else {
        u = t.x;
    }

    float y1f = (display_height - strip_height)*0.5f; 
    int y1 = (int)math::ceil(y1f);
    int y2 = (int)math::floor(y1 + strip_height);
    int by1 = math::max(0, y1);
    int by2 = math::min(display_height, y2);
    int tx = (int)math::floor(u*cell_width);
    float sh = cell_height / strip_height;
    float shadow = math::min(1.0f/zbuffer[x]*4.0f, 1.0f);
    for (int y = by1; y < by2; ++y) {
        int ty = (int)math::floor((y - y1f)*sh);
        int destP = y*display_width + x;
        int srcP = ty*cell_width + tx;
        display[destP].r = (char)(cell[srcP].r);
        display[destP].g = (char)(cell[srcP].g*shadow);
        display[destP].b = (char)(cell[srcP].b*shadow);
    }
}

fn Vector2 hitting_cell(Vector2 p1, Vector2 p2) {
    float dx = p2.x - p1.x;
    float dy = p2.y - p1.y;
    return Vector2{math::floor(p2.x + math::copysign(1.0f, dx)*EPS),
                   math::floor(p2.y + math::copysign(1.0f, dy)*EPS)};
}

fn float snap(float x, float dx) {
    if (dx > 0) return math::ceil(x + math::copysign(1.0f, dx)*EPS);
    if (dx < 0) return math::floor(x + math::copysign(1.0f, dx)*EPS);
    return x;
}

fn Vector2 ray_step(Vector2 p1, Vector2 p2) {
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
    Vector2 p3 = p2;
    float dx = p2.x - p1.x;
    float dy = p2.y - p1.y;
    if (dx != 0) {
        float k = dy/dx;
        float c = p1.y - k*p1.x;

        {
            float x3 = snap(p2.x, dx);
            float y3 = x3*k + c;
            p3 = {x3, y3};
        }

        if (k != 0) {
            float y3 = snap(p2.y, dy);
            float x3 = (y3 - c)/k;
            Vector2 p3t = {x3, y3};
            if (p2.distance(p3t) < p2.distance(p3)) {
                p3 = p3t;
            }
        }
    } else {
        float y3 = snap(p2.y, dy);
        float x3 = p2.x;
        p3 = {x3, y3};
    }

    return p3;
}

fn Vector2 cast_ray(bool *scene, int scene_width, int scene_height, Vector2 p1, Vector2 p2) {
    Vector2 start = p1;
    while (start.distance(p1) < FAR_CLIPPING_PLANE) {
        Vector2 c = hitting_cell(p1, p2);
        if (common::scene_get_tile(scene, scene_width, scene_height, c)) break;
        Vector2 p3 = ray_step(p1, p2);
        p1 = p2;
        p2 = p3;
    }
    return p2;
}

fn void render_walls(Color *display, int display_width, int display_height, float *zbuffer,
                     Color *wall, int wall_width, int wall_height,
                     float position_x, float position_y, float direction,
                     bool *scene, int scene_width, int scene_height) @extern("render_walls") @wasm {
    Camera camera = { .position = {position_x, position_y}, .direction = direction };
    camera.update();

    Vector2 d = from_polar(direction, 1.0f);
    for (int x = 0; x < display_width; ++x) {
        Vector2 p = cast_ray(scene, scene_width, scene_height, camera.position, camera.fovLeft.lerp(camera.fovRight, (float)x/display_width));
        Vector2 c = hitting_cell(camera.position, p);
        Vector2 v = p - camera.position;
        zbuffer[x] = v.dot(d);
        if (common::scene_get_tile(scene, scene_width, scene_height, c)) {
            render_column_of_wall(display, display_width, display_height, zbuffer, wall, wall_width, wall_height, x, p.x, p.y, c.x, c.y);
        }
    }
}

// TODO: @translate
fn void render_minimap(Color *display, int display_width, int display_height,
                       float camera_position_x, float camera_position_y, float camera_direction,
                       float player_position_x, float player_position_y,
                       bool *scene, int scene_width, int scene_height,
                       SpritePool *sprite_pool) @extern("render_minimap") @wasm {
    // ctx.save();

    // // A couple of temporary vectors
    // const p1 = new Vector2();
    // const p2 = new Vector2();

    // const cellSize = ctx.canvas.width*MINIMAP_SCALE;

    // ctx.translate(ctx.canvas.width*0.03, ctx.canvas.height*0.03);
    // ctx.scale(cellSize, cellSize);

    // ctx.fillStyle = "#181818";
    // ctx.fillRect(0, 0, scene.width, scene.height);

    // ctx.lineWidth = 0.05;
    // const walls = new Uint8ClampedArray(wasmCommon.memory.buffer, scene.wallsPtr, scene.width*scene.height);
    // for (let y = 0; y < scene.height; ++y) {
    //     for (let x = 0; x < scene.width; ++x) {
    //         if (sceneGetTile(walls, scene, p1.set(x, y))) {
    //             ctx.fillStyle = "blue";
    //             ctx.fillRect(x, y, 1, 1);
    //         }
    //     }
    // }

    // // Grid
    // ctx.strokeStyle = "#303030";
    // for (let x = 0; x <= scene.width; ++x) {
    //     strokeLine(ctx, p1.set(x, 0), p2.set(x, scene.height));
    // }
    // for (let y = 0; y <= scene.height; ++y) {
    //     strokeLine(ctx, p1.set(0, y), p2.set(scene.width, y));
    // }

    // ctx.fillStyle = "magenta";
    // ctx.fillRect(player.position.x - PLAYER_SIZE*0.5,
    //              player.position.y - PLAYER_SIZE*0.5,
    //              PLAYER_SIZE, PLAYER_SIZE);

    // ctx.strokeStyle = "magenta";
    // strokeLine(ctx, camera.fovLeft, camera.fovRight);
    // strokeLine(ctx, camera.position, camera.fovLeft);
    // strokeLine(ctx, camera.position, camera.fovRight);

    // if (MINIMAP_SPRITES) {
    //     ctx.strokeStyle = "yellow";
    //     ctx.fillStyle = "white"
    //     for (let i = 0; i < spritePool.length; ++i) {
    //         const sprite = spritePool.items[i];
    //         ctx.fillRect(sprite.position.x - MINIMAP_SPRITE_SIZE*0.5,
    //                      sprite.position.y - MINIMAP_SPRITE_SIZE*0.5,
    //                      MINIMAP_SPRITE_SIZE, MINIMAP_SPRITE_SIZE);

    //     }

    //     const sp = new Vector2();
    //     for (let sprite of visibleSprites) {
    //         strokeLine(ctx, player.position, sprite.position);
    //         sp.copy(sprite.position).sub(player.position).norm().scale(sprite.dist).add(player.position);
    //         ctx.fillRect(sp.x - MINIMAP_SPRITE_SIZE*0.5,
    //                      sp.y - MINIMAP_SPRITE_SIZE*0.5,
    //                      MINIMAP_SPRITE_SIZE, MINIMAP_SPRITE_SIZE);
    //     }
    // }

    // ctx.restore();
}

// TODO: @translate
fn void cull_and_sort_sprites(float camera_position_x, float camera_position_y, float camera_direction,
                              SpritePool *sprite_pool) @extern("cull_and_sort_sprites") @wasm {
    // const sp = new Vector2();
    // const dir = new Vector2().setPolar(camera.direction);
    // const fov = camera.fovRight.clone().sub(camera.fovLeft);

    // visibleSprites.length = 0;
    // for (let i = 0; i < spritePool.length; ++i) {
    //     const sprite = spritePool.items[i];

    //     sp.copy(sprite.position).sub(camera.position);
    //     const spl = sp.length();
    //     if (spl <= NEAR_CLIPPING_PLANE) continue; // Sprite is too close
    //     if (spl >= FAR_CLIPPING_PLANE) continue;  // Sprite is too far

    //     const cos = sp.dot(dir)/spl;
    //     // TODO: @perf the sprites that are invisible on the screen but within FOV 180° are not culled
    //     // It may or may not impact the performance of renderSprites()
    //     if (cos < 0) continue;  // Sprite is outside of the maximal FOV 180°
    //     sprite.dist = NEAR_CLIPPING_PLANE/cos;
    //     sp.norm().scale(sprite.dist).add(camera.position).sub(camera.fovLeft);
    //     sprite.t = sp.length()/fov.length()*Math.sign(sp.dot(fov));
    //     sprite.pdist = sprite.position.clone().sub(camera.position).dot(dir);

    //     // TODO: I'm not sure if these checks are necessary considering the `spl <= NEAR_CLIPPING_PLANE` above
    //     if (sprite.pdist < NEAR_CLIPPING_PLANE) continue;
    //     if (sprite.pdist >= FAR_CLIPPING_PLANE) continue;

    //     visibleSprites.push(sprite);
    // }

    // visibleSprites.sort((a, b) => b.pdist - a.pdist);
}

// TODO: @translate
fn void push_sprite(SpritePool *sprite_pool,
                    Color *image_pixels, int image_width, int image_height,
                    float x, float y, float z,
                    float scale,
                    float crop_position_x, float crop_position_y,
                    float crop_size_x, float crop_size_y) @extern("push_sprite") @wasm {
    // if (spritePool.length >= spritePool.items.length) {
    //     spritePool.items.push({
    //         image,
    //         position: new Vector2(),
    //         z,
    //         scale,
    //         pdist: 0,
    //         dist: 0,
    //         t: 0,
    //         cropPosition: new Vector2(),
    //         cropSize: new Vector2(),
    //     })
    // }

    // const last = spritePool.length;

    // spritePool.items[last].image = image;
    // spritePool.items[last].position.copy(position);
    // spritePool.items[last].z = z;
    // spritePool.items[last].scale = scale;
    // spritePool.items[last].pdist = 0;
    // spritePool.items[last].dist = 0;
    // spritePool.items[last].t = 0;

    // if (image instanceof WasmImage) {
    //     if (cropPosition === undefined) {
    //         spritePool.items[last].cropPosition.set(0, 0);
    //     } else {
    //         spritePool.items[last].cropPosition.copy(cropPosition);
    //     }
    //     if (cropSize === undefined) {
    //         spritePool.items[last]
    //             .cropSize
    //             .set(image.width, image.height)
    //             .sub(spritePool.items[last].cropPosition);
    //     } else {
    //         spritePool.items[last].cropSize.copy(cropSize);
    //     }
    // } else {
    //     spritePool.items[last].cropPosition.set(0, 0);
    //     spritePool.items[last].cropSize.set(0, 0);
    // }

    // spritePool.length += 1;
}

// TODO: @translate
fn void render_sprites(Color *display, int display_width, int display_height, SpritePool *sprite_pool) @extern("render_sprites") @wasm {
    // const backImageData = new Uint8ClampedArray(wasmClient.memory.buffer, display.backImagePtr, display.backImageWidth*display.backImageHeight*4);
    // const zBuffer = new Float32Array(wasmClient.memory.buffer, display.zBufferPtr, display.backImageWidth);
    // for (let sprite of sprites) {
    //     const cx = display.backImageWidth*sprite.t;
    //     const cy = display.backImageHeight*0.5;
    //     const maxSpriteSize = display.backImageHeight/sprite.pdist;
    //     const spriteSize = maxSpriteSize*sprite.scale;
    //     const x1 = Math.floor(cx - spriteSize*0.5);
    //     const x2 = Math.floor(x1 + spriteSize - 1);
    //     const bx1 = Math.max(0, x1);
    //     const bx2 = Math.min(display.backImageWidth-1, x2);
    //     const y1 = Math.floor(cy + maxSpriteSize*0.5 - maxSpriteSize*sprite.z);
    //     const y2 = Math.floor(y1 + spriteSize - 1);
    //     const by1 = Math.max(0, y1);
    //     const by2 = Math.min(display.backImageHeight-1, y2);

    //     const src = new Uint8ClampedArray(wasmClient.memory.buffer, sprite.image.ptr, sprite.image.width*sprite.image.height*4);
    //     const dest = backImageData;
    //     for (let x = bx1; x <= bx2; ++x) {
    //         if (sprite.pdist < zBuffer[x]) {
    //             for (let y = by1; y <= by2; ++y) {
    //                 const tx = Math.floor((x - x1)/spriteSize*sprite.cropSize.x);
    //                 const ty = Math.floor((y - y1)/spriteSize*sprite.cropSize.y);
    //                 const srcP = ((ty + sprite.cropPosition.y)*sprite.image.width + (tx + sprite.cropPosition.x))*4;
    //                 const destP = (y*display.backImageWidth + x)*4;
    //                 const alpha = src[srcP + 3]/255;
    //                 dest[destP + 0] = dest[destP + 0]*(1 - alpha) + src[srcP + 0]*alpha;
    //                 dest[destP + 1] = dest[destP + 1]*(1 - alpha) + src[srcP + 1]*alpha;
    //                 dest[destP + 2] = dest[destP + 2]*(1 - alpha) + src[srcP + 2]*alpha;
    //             }
    //         }
    //     }
    // }
}
