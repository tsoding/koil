import std::math;
import std::sort;
import common;

const float NEAR_CLIPPING_PLANE = 0.1;
const float FAR_CLIPPING_PLANE = 10.0;
const float FOV = math::PI*0.5;
const float EPS = 1e-6;
const usz SPRITE_POOL_CAPACITY = 1000;
const usz PARTICLE_POOL_CAPACITY = 1000;
const float PARTICLE_LIFETIME = 1.0f;
const float PARTICLE_MAX_SPEED = 8;
const float PARTICLE_DAMP = 0.8;
const float PARTICLE_SCALE = 0.05;

const bool MINIMAP_SPRITES = true;
const float MINIMAP_SPRITE_SIZE = 0.2;
const float MINIMAP_SCALE = 0.07;

def Color = char[<4>];

// TODO: Use std::math::random instead (when you finally figure out how to use it)
extern fn float js_random();

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
    IVector2 crop_position;
    IVector2 crop_size;

    float dist;  // Actual distance.
    float pdist; // Perpendicular distance.
    float t;     // Normalized horizontal position on the screen
}

struct SpritePool {
    Sprite[SPRITE_POOL_CAPACITY] items;
    int length;
    Sprite*[SPRITE_POOL_CAPACITY] visible_items;
    int visible_length;
}

fn SpritePool *allocate_sprite_pool() @extern("allocate_sprite_pool") @wasm {
    return mem::new(SpritePool);
}

fn void reset_sprite_pool(SpritePool *sprite_pool) @extern("reset_sprite_pool") @wasm {
    sprite_pool.length = 0;
    sprite_pool.visible_length = 0;
}

fn Vector2 from_polar(float angle, float len) {
    return {math::cos(angle)*len, math::sin(angle)*len};
}

struct Particle {
    float lifetime;
    // TODO: Use Vector3 instead
    Vector2 position;
    float position_z;
    Vector2 velocity;
    float velocity_z;
}

struct ParticlePool {
    Particle[PARTICLE_POOL_CAPACITY] items;
    int length;
}

fn ParticlePool *allocate_particle_pool() @extern("allocate_particle_pool") @wasm {
    return mem::new(ParticlePool);
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

fn void cull_and_sort_sprites(float camera_position_x, float camera_position_y, float camera_direction,
                              SpritePool *sprite_pool) @extern("cull_and_sort_sprites") @wasm {
    Camera camera = { .position = {camera_position_x, camera_position_y}, .direction = camera_direction };
    camera.update();

    Vector2 dir = from_polar(camera_direction, 1.0f);
    Vector2 fov = camera.fovRight - camera.fovLeft;

    sprite_pool.visible_length = 0;
    for (int i = 0; i < sprite_pool.length; ++i) {
        Sprite *sprite = &sprite_pool.items[i];

        Vector2 sp = sprite.position - camera.position;
        float spl = sp.length();
        if (spl <= NEAR_CLIPPING_PLANE) continue; // Sprite is too close
        if (spl >= FAR_CLIPPING_PLANE) continue;  // Sprite is too far

        float cos = sp.dot(dir)/spl;
        // TODO: @perf the sprites that are invisible on the screen but within FOV 180° are not culled
        // It may or may not impact the performance of renderSprites()
        if (cos < 0) continue;  // Sprite is outside of the maximal FOV 180°
        sprite.dist = NEAR_CLIPPING_PLANE/cos;
        sp = (sp.normalize()*sprite.dist) + camera.position - camera.fovLeft;
        sprite.t = sp.length()/fov.length()*math::copysign(1.0f, sp.dot(fov));
        sprite.pdist = (sprite.position - camera.position).dot(dir);

        // TODO: I'm not sure if these checks are necessary considering the `spl <= NEAR_CLIPPING_PLANE` above
        if (sprite.pdist < NEAR_CLIPPING_PLANE) continue;
        if (sprite.pdist >= FAR_CLIPPING_PLANE) continue;

        sprite_pool.visible_items[sprite_pool.visible_length++] = sprite;
    }

    quicksort(sprite_pool.visible_items[0..sprite_pool.visible_length-1],
              fn int(Sprite *a, Sprite *b) => (int)math::copysign(1.0f, b.pdist - a.pdist));
}

fn void push_sprite(SpritePool *sprite_pool,
                    Color *image_pixels, int image_width, int image_height,
                    float x, float y, float z,
                    float scale,
                    int crop_position_x, int crop_position_y,
                    int crop_size_x, int crop_size_y) @extern("push_sprite") @wasm {
    if (sprite_pool.length >= SPRITE_POOL_CAPACITY) return;

    usz last = sprite_pool.length;

    sprite_pool.items[last].image.pixels = image_pixels;
    sprite_pool.items[last].image.width = image_width;
    sprite_pool.items[last].image.height = image_height;
    sprite_pool.items[last].position.x = x;
    sprite_pool.items[last].position.y = y;
    sprite_pool.items[last].z = z;
    sprite_pool.items[last].scale = scale;
    sprite_pool.items[last].pdist = 0;
    sprite_pool.items[last].dist = 0;
    sprite_pool.items[last].t = 0;
    sprite_pool.items[last].crop_position.x = crop_position_x;
    sprite_pool.items[last].crop_position.y = crop_position_y;
    sprite_pool.items[last].crop_size.x = crop_size_x;
    sprite_pool.items[last].crop_size.y = crop_size_y;

    sprite_pool.length += 1;
}

fn void render_sprites(Color *display, int display_width, int display_height, float *zbuffer,
                       SpritePool *sprite_pool) @extern("render_sprites") @wasm {
    for (int i = 0; i < sprite_pool.visible_length; ++i) {
        Sprite *sprite = sprite_pool.visible_items[i];
        float cx = display_width*sprite.t;
        float cy = display_height*0.5f;
        float maxSpriteSize = display_height/sprite.pdist;
        float spriteSize = maxSpriteSize*sprite.scale;
        int x1 = (int)math::floor(cx - spriteSize*0.5f);
        int x2 = (int)math::floor(x1 + spriteSize - 1.0f);
        int bx1 = math::max(0, x1);
        int bx2 = math::min(display_width-1, x2);
        int y1 = (int)math::floor(cy + maxSpriteSize*0.5f - maxSpriteSize*sprite.z);
        int y2 = (int)math::floor(y1 + spriteSize - 1);
        int by1 = math::max(0, y1);
        int by2 = math::min(display_height-1, y2);

        Color *src = sprite.image.pixels;
        Color *dest = display;
        for (int x = bx1; x <= bx2; ++x) {
            if (sprite.pdist < zbuffer[x]) {
                for (int y = by1; y <= by2; ++y) {
                    int tx = (int)math::floor((float)(x - x1)/spriteSize*sprite.crop_size.x);
                    int ty = (int)math::floor((float)(y - y1)/spriteSize*sprite.crop_size.y);
                    int srcP = (ty + sprite.crop_position.y)*sprite.image.width + (tx + sprite.crop_position.x);
                    int destP = y*display_width + x;
                    float alpha = src[srcP].a/255.0f;
                    dest[destP].r = (char)(dest[destP].r*(1 - alpha) + src[srcP].r*alpha);
                    dest[destP].g = (char)(dest[destP].g*(1 - alpha) + src[srcP].g*alpha);
                    dest[destP].b = (char)(dest[destP].b*(1 - alpha) + src[srcP].b*alpha);
                }
            }
        }
    }
}

fn void emit_particle(float source_x, float source_y, float source_z, ParticlePool *particle_pool) @extern("emit_particle") @wasm {
    foreach (&particle: particle_pool.items) {
        if (particle.lifetime <= 0) {
            particle.lifetime = PARTICLE_LIFETIME;

            particle.position.x = source_x;
            particle.position.y = source_y;
            particle.position_z = source_z;

            float angle = js_random()*2.0f*(float)math::PI;
            particle.velocity.x = math::cos(angle);
            particle.velocity.y = math::sin(angle);
            particle.velocity_z = js_random()*0.5f + 0.5f;

            float velocity_mag = PARTICLE_MAX_SPEED*js_random();
            particle.velocity *= velocity_mag;
            particle.velocity_z *= velocity_mag;
            break;
        }
    }
}

fn void update_particles(Color *image_pixels, int image_width, int image_height,
                         SpritePool *sprite_pool,
                         float deltaTime,
                         bool *scene, int scene_width, int scene_height,
                         ParticlePool *particle_pool) @extern("update_particles") @wasm {
    foreach (&particle: particle_pool.items) {
        if (particle.lifetime > 0) {
            particle.lifetime -= deltaTime;
            particle.velocity_z -= common::BOMB_GRAVITY*deltaTime;

            Vector2 new_position = particle.position + particle.velocity*deltaTime;
            if (common::scene_get_tile(scene, scene_width, scene_height, new_position)) {
                float dx = math::abs(math::floor(particle.position.x) - math::floor(new_position.x));
                float dy = math::abs(math::floor(particle.position.y) - math::floor(new_position.y));

                if (dx > 0) particle.velocity.x *= -1;
                if (dy > 0) particle.velocity.y *= -1;
                particle.velocity *= PARTICLE_DAMP;
            } else {
                particle.position = new_position;
            }

            float nz = particle.position_z + particle.velocity_z*deltaTime;
            if (nz < PARTICLE_SCALE || nz > 1.0) {
                particle.velocity_z *= -1;
                particle.velocity *= PARTICLE_DAMP;
            } else {
                particle.position_z = nz;
            }

            if (particle.lifetime > 0) {
                push_sprite(sprite_pool,
                            image_pixels, image_width, image_height,
                            particle.position.x, particle.position.y, particle.position_z,
                            PARTICLE_SCALE,
                            0, 0, image_width, image_height);
            }
        }
    }
}
