#include <stdint.h>
#include "common.h"
#include "sort.h"

#define EPS 1e-6f
#define FAR_CLIPPING_PLANE 10.0f
#define NEAR_CLIPPING_PLANE 0.1f
#define FOV (PI*0.5f)
#define SCENE_FLOOR1   (Color) {0x17, 0x29, 0x29, 0xff}
#define SCENE_FLOOR2   (Color) {0x2f, 0x41, 0x41, 0xff}
#define SCENE_CEILING1 (Color) {0x29, 0x17, 0x17, 0xff}
#define SCENE_CEILING2 (Color) {0x41, 0x2f, 0x2f, 0xff}
#define SPRITE_POOL_CAPACITY 1000
#define PARTICLE_POOL_CAPACITY 1000
#define PARTICLE_LIFETIME 1.0f
#define PARTICLE_MAX_SPEED 8.0f
#define PARTICLE_DAMP 0.8f
#define PARTICLE_SCALE 0.05f
#define ITEM_AMP 0.07f
#define ITEM_FREQ 0.7f
#define BOMB_PARTICLE_COUNT 50

// WARNING! Must be synchronized with AssetSound in client.mts
typedef enum {
    BOMB_BLAST,
    BOMB_RICOCHET,
    ITEM_PICKUP,
} AssetSound;

float platform_random(void);
void platform_play_sound(AssetSound sound, float player_position_x, float player_position_y, float object_position_x, float object_position_y);
bool platform_is_offline_mode();

typedef struct {
    Vector2 position;
    float direction;
    Vector2 fovLeft;
    Vector2 fovRight;
} Camera;

void camera_update(Camera *camera);

typedef struct {
    uint8_t r;
    uint8_t g;
    uint8_t b;
    uint8_t a;
} Color;

typedef struct {
    size_t width;
    size_t height;
    Color *pixels;
} Image;

typedef struct {
    Image image;
    float *zbuffer;
} Display;

Display display = {0};
Player me = {0};

float snap(float x, float dx) {
    if (dx > 0) return __builtin_ceilf(x + __builtin_copysign(1.0f, dx)*EPS);
    if (dx < 0) return __builtin_floorf(x + __builtin_copysign(1.0f, dx)*EPS);
    return x;
}

Vector2 ray_step(Vector2 p1, Vector2 p2) {
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
            p3 = (Vector2){x3, y3};
        }

        if (k != 0) {
            float y3 = snap(p2.y, dy);
            float x3 = (y3 - c)/k;
            Vector2 p3t = {x3, y3};
            if (vector2_distance(p2, p3t) < vector2_distance(p2, p3)) {
                p3 = p3t;
            }
        }
    } else {
        float y3 = snap(p2.y, dy);
        float x3 = p2.x;
        p3 = (Vector2) {x3, y3};
    }

    return p3;
}

void camera_update(Camera *camera) {
    float halfFov = FOV*0.5;
    float fovLen = NEAR_CLIPPING_PLANE/__builtin_cos(halfFov);
    camera->fovLeft  = vector2_add(vector2_from_polar(camera->direction-halfFov, fovLen), camera->position);
    camera->fovRight = vector2_add(vector2_from_polar(camera->direction+halfFov, fovLen), camera->position);
}

Color *pixels_of_display() {
    return &display.image.pixels[0];
}

Color scene_get_floor(Vector2 p) {
    if (((int)__builtin_floorf(p.x) + (int)__builtin_floorf(p.y))%2 == 0) {
        return SCENE_FLOOR1;
    } else {
        return SCENE_FLOOR2;
    }
}

Color scene_get_ceiling(Vector2 p) {
    if (((int)__builtin_floorf(p.x) + (int)__builtin_floorf(p.y))%2 == 0) {
        return SCENE_CEILING1;
    } else {
        return SCENE_CEILING2;
    }
}

int maxi(int a, int b) {
    if (a > b) return a;
    return b;
}

int mini(int a, int b) {
    if (a < b) return a;
    return b;
}

int clampi(int x, int lo, int hi) {
    if (x < lo) x = lo;
    if (x > hi) x = hi;
    return x;
}

void render_floor_and_ceiling(Image *display) {
    Camera camera = { .position = {me.position.x, me.position.y}, .direction = me.direction };
    camera_update(&camera);

    int pz = display->height/2;
    float bp = vector2_length(vector2_sub(camera.fovLeft, camera.position));
    for (int y = display->height/2; y < (int)display->height; ++y) {
        int sz = display->height - y - 1;

        int ap = pz - sz;
        float b = (bp/ap)*pz/NEAR_CLIPPING_PLANE;
        Vector2 t1 = vector2_add(vector2_mul(vector2_normalize(vector2_sub(camera.fovLeft, camera.position)), vector2_xx(b)), camera.position);
        Vector2 t2 = vector2_add(vector2_mul(vector2_normalize(vector2_sub(camera.fovRight, camera.position)), vector2_xx(b)), camera.position);

        // TODO: Render rows up until FAR_CLIPPING_PLANE
        //   There is a small bug with how we are projecting the floor and ceiling which makes it non-trivial.
        //   I think we are projecting it too far, and the only reason it works is because we have no
        //   specific textures at specific places anywhere. So it works completely accidentally.
        //   We need to fix this bug first.
        //
        //   But if we manage to do that, this optimization should give a decent speed up 'cause we can render
        //   fewer rows.

        for (int x = 0; x < (int)display->width; ++x) {
            Vector2 t = vector2_lerp(t1, t2, (float)x/display->width);

            float fog = vector2_length(vector2_sub(t, camera.position));

            Color floor_color = scene_get_floor(t);
            display->pixels[y*display->width + x].r = clampi(floor_color.r*fog, 0, 255);
            display->pixels[y*display->width + x].g = clampi(floor_color.g*fog, 0, 255);
            display->pixels[y*display->width + x].b = clampi(floor_color.b*fog, 0, 255);
            display->pixels[y*display->width + x].a = 255;

            Color ceiling_color = scene_get_ceiling(t);
            display->pixels[sz*display->width + x].r = clampi(ceiling_color.r*fog, 0, 255);
            display->pixels[sz*display->width + x].g = clampi(ceiling_color.g*fog, 0, 255);
            display->pixels[sz*display->width + x].b = clampi(ceiling_color.b*fog, 0, 255);
            display->pixels[sz*display->width + x].a = 255;
        }
    }
}

void render_column_of_wall(Image *display, float *zbuffer, Image *cell, int x, Vector2 p, Vector2 c) {
    float strip_height = display->height/zbuffer[x];
    float u = 0;
    Vector2 t = vector2_sub(p, c);
    if (__builtin_fabsf(t.x) < EPS && t.y > 0) {
        u = t.y;
    } else if (__builtin_fabsf(t.x - 1) < EPS && t.y > 0) {
        u = 1 - t.y;
    } else if (__builtin_fabsf(t.y) < EPS && t.x > 0) {
        u = 1 - t.x;
    } else {
        u = t.x;
    }

    float y1f = (display->height - strip_height)*0.5f;
    int y1 = (int)__builtin_ceilf(y1f);
    int y2 = (int)__builtin_floorf(y1 + strip_height);
    int by1 = maxi(0, y1);
    int by2 = mini((int)display->height, y2);
    int tx = (int)__builtin_floorf(u*cell->width);
    float sh = cell->height / strip_height;
    float shadow = __builtin_fminf(1.0f/zbuffer[x]*4.0f, 1.0f);
    for (int y = by1; y < by2; ++y) {
        int ty = (int)__builtin_floorf((y - y1f)*sh);
        int destP = y*display->width + x;
        int srcP = ty*cell->width + tx;
        display->pixels[destP].r = (char)(cell->pixels[srcP].r);
        display->pixels[destP].g = (char)(cell->pixels[srcP].g*shadow);
        display->pixels[destP].b = (char)(cell->pixels[srcP].b*shadow);
    }
}

Vector2 hitting_cell(Vector2 p1, Vector2 p2) {
    return vector2_floor(vector2_add(p2, vector2_mul(vector2_copysign((Vector2) {1.0f, 1.0f}, vector2_sub(p2, p1)), vector2_xx(EPS))));
}

Vector2 cast_ray(Vector2 p1, Vector2 p2) {
    Vector2 start = p1;
    while (vector2_distance(start, p1) < FAR_CLIPPING_PLANE) {
        Vector2 c = hitting_cell(p1, p2);
        if (scene_get_tile(c)) break;
        Vector2 p3 = ray_step(p1, p2);
        p1 = p2;
        p2 = p3;
    }
    return p2;
}

void render_walls(Image *display, float *zbuffer, Image *wall) {
    Camera camera = { .position = {me.position.x, me.position.y}, .direction = me.direction };
    camera_update(&camera);

    Vector2 d = vector2_from_polar(camera.direction, 1.0f);
    for (int x = 0; x < (int)display->width; ++x) {
        Vector2 p = cast_ray(camera.position, vector2_lerp(camera.fovLeft, camera.fovRight, (float)x/display->width));
        Vector2 c = hitting_cell(camera.position, p);
        Vector2 v = vector2_sub(p, camera.position);
        zbuffer[x] = vector2_dot(v, d);
        if (scene_get_tile(c)) render_column_of_wall(display, zbuffer, wall, x, p, c);
    }
}

typedef struct {
    Image *image;
    // TODO: Use Vector3 instead
    // We can't do it right now due to some alignment restriction stuff
    Vector2 position;
    float z;
    float scale;
    IVector2 crop_position;
    IVector2 crop_size;

    float dist;  // Actual distance.
    float pdist; // Perpendicular distance.
    float t;     // Normalized horizontal position on the screen
} Sprite;

typedef struct {
    Sprite items[SPRITE_POOL_CAPACITY];
    int length;
    Sprite* visible_items[SPRITE_POOL_CAPACITY];
    int visible_length;
} SpritePool;

int sprite_pdist_compare(const void *ap, const void *bp) {
    Sprite * const *a = ap;
    Sprite * const *b = bp;
    return (int)__builtin_copysign(1.0f, (*b)->pdist - (*a)->pdist);
}

void cull_and_sort_sprites(SpritePool *sprite_pool) {
    Camera camera = { .position = {me.position.x, me.position.y}, .direction = me.direction };
    camera_update(&camera);

    Vector2 dir = vector2_from_polar(camera.direction, 1.0f);
    Vector2 fov = vector2_sub(camera.fovRight, camera.fovLeft);

    sprite_pool->visible_length = 0;
    for (int i = 0; i < sprite_pool->length; ++i) {
        Sprite *sprite = &sprite_pool->items[i];

        Vector2 sp = vector2_sub(sprite->position, camera.position);
        float spl = vector2_length(sp);
        if (spl <= NEAR_CLIPPING_PLANE) continue; // Sprite is too close
        if (spl >= FAR_CLIPPING_PLANE) continue;  // Sprite is too far

        float cos = vector2_dot(sp, dir)/spl;
        // TODO: @perf the sprites that are invisible on the screen but within FOV 180° are not culled
        // It may or may not impact the performance of renderSprites()
        if (cos < 0) continue;  // Sprite is outside of the maximal FOV 180°
        sprite->dist = NEAR_CLIPPING_PLANE/cos;
        sp = vector2_sub(vector2_add(vector2_mul(vector2_normalize(sp),vector2_xx(sprite->dist)), camera.position), camera.fovLeft);
        sprite->t = vector2_length(sp)/vector2_length(fov)*__builtin_copysign(1.0f, vector2_dot(sp, fov));
        sprite->pdist = vector2_dot(vector2_sub(sprite->position, camera.position), dir);

        // TODO: I'm not sure if these checks are necessary considering the `spl <= NEAR_CLIPPING_PLANE` above
        if (sprite->pdist < NEAR_CLIPPING_PLANE) continue;
        if (sprite->pdist >= FAR_CLIPPING_PLANE) continue;

        sprite_pool->visible_items[sprite_pool->visible_length++] = sprite;
    }

    quick_sort(sprite_pool->visible_items, sprite_pool->visible_length, sizeof(sprite_pool->visible_items[0]), sprite_pdist_compare);
}

void push_sprite(SpritePool *sprite_pool, Image *image, Vector3 position, float scale, IVector2 crop_position, IVector2 crop_size) {
    if (sprite_pool->length >= SPRITE_POOL_CAPACITY) return;

    size_t last = sprite_pool->length;

    sprite_pool->items[last].image = image;
    sprite_pool->items[last].position = (Vector2){position.x, position.y};
    sprite_pool->items[last].z = position.z;
    sprite_pool->items[last].scale = scale;
    sprite_pool->items[last].pdist = 0;
    sprite_pool->items[last].dist = 0;
    sprite_pool->items[last].t = 0;
    sprite_pool->items[last].crop_position = crop_position;
    sprite_pool->items[last].crop_size = crop_size;

    sprite_pool->length += 1;
}

void render_sprites(Image *display, float *zbuffer, SpritePool *sprite_pool) {
    for (int i = 0; i < sprite_pool->visible_length; ++i) {
        Sprite *sprite = sprite_pool->visible_items[i];
        float cx = display->width*sprite->t;
        float cy = display->height*0.5f;
        float maxSpriteSize = display->height/sprite->pdist;
        float spriteSize = maxSpriteSize*sprite->scale;
        int x1 = (int)__builtin_floorf(cx - spriteSize*0.5f);
        int x2 = (int)__builtin_floorf(x1 + spriteSize - 1.0f);
        int bx1 = maxi(0, x1);
        int bx2 = mini(display->width-1, x2);
        int y1 = (int)__builtin_floorf(cy + maxSpriteSize*0.5f - maxSpriteSize*sprite->z);
        int y2 = (int)__builtin_floorf(y1 + spriteSize - 1);
        int by1 = maxi(0, y1);
        int by2 = mini(display->height-1, y2);

        Color *src = &sprite->image->pixels[0];
        Color *dest = &display->pixels[0];
        for (int x = bx1; x <= bx2; ++x) {
            if (sprite->pdist < zbuffer[x]) {
                for (int y = by1; y <= by2; ++y) {
                    int tx = (int)__builtin_floorf((float)(x - x1)/spriteSize*sprite->crop_size.x);
                    int ty = (int)__builtin_floorf((float)(y - y1)/spriteSize*sprite->crop_size.y);
                    int srcP = (ty + sprite->crop_position.y)*sprite->image->width + (tx + sprite->crop_position.x);
                    int destP = y*display->width + x;
                    float alpha = src[srcP].a/255.0f;
                    dest[destP].r = (char)(dest[destP].r*(1 - alpha) + src[srcP].r*alpha);
                    dest[destP].g = (char)(dest[destP].g*(1 - alpha) + src[srcP].g*alpha);
                    dest[destP].b = (char)(dest[destP].b*(1 - alpha) + src[srcP].b*alpha);
                }
            }
        }
    }
}

typedef struct {
    float lifetime;
    // TODO: Use Vector3 instead
    // We can't do it right now due to some alignment restriction stuff
    Vector2 position;
    float position_z;
    Vector2 velocity;
    float velocity_z;
} Particle;

typedef struct {
    Particle items[PARTICLE_POOL_CAPACITY];
} ParticlePool;

ParticlePool particle_pool = {0};

void emit_particle(Vector3 source, ParticlePool *particle_pool) {
    for (size_t i = 0; i < PARTICLE_POOL_CAPACITY; ++i) {
        Particle *particle = &particle_pool->items[i];
        if (particle->lifetime <= 0) {
            particle->lifetime = PARTICLE_LIFETIME;

            particle->position = (Vector2) {source.x, source.y};
            particle->position_z = source.z;

            float angle = platform_random()*2.0f*PI;
            particle->velocity.x = __builtin_cosf(angle);
            particle->velocity.y = __builtin_sinf(angle);
            particle->velocity_z = platform_random()*0.5f + 0.5f;

            float velocity_mag = PARTICLE_MAX_SPEED*platform_random();
            particle->velocity = vector2_mul(particle->velocity, vector2_xx(velocity_mag));
            particle->velocity_z *= velocity_mag;
            break;
        }
    }
}

void update_particles(Image *image, SpritePool *sprite_pool, float deltaTime, ParticlePool *particle_pool) {
    for (size_t i = 0; i < PARTICLE_POOL_CAPACITY; ++i) {
        Particle *particle = &particle_pool->items[i];
        if (particle->lifetime > 0) {
            particle->lifetime -= deltaTime;
            particle->velocity_z -= BOMB_GRAVITY*deltaTime;

            Vector2 new_position = vector2_add(particle->position, vector2_mul(particle->velocity, vector2_xx(deltaTime)));
            if (scene_get_tile(new_position)) {
                float dx = __builtin_fabsf(__builtin_floorf(particle->position.x) - __builtin_floorf(new_position.x));
                float dy = __builtin_fabsf(__builtin_floorf(particle->position.y) - __builtin_floorf(new_position.y));

                if (dx > 0) particle->velocity.x *= -1;
                if (dy > 0) particle->velocity.y *= -1;
                particle->velocity = vector2_mul(particle->velocity, vector2_xx(PARTICLE_DAMP));
            } else {
                particle->position = new_position;
            }

            float nz = particle->position_z + particle->velocity_z*deltaTime;
            if (nz < PARTICLE_SCALE || nz > 1.0) {
                particle->velocity_z *= -1;
                particle->velocity = vector2_mul(particle->velocity, vector2_xx(PARTICLE_DAMP));
            } else {
                particle->position_z = nz;
            }

            if (particle->lifetime > 0) {
                push_sprite(sprite_pool,
                            image,
                            (Vector3){particle->position.x, particle->position.y, particle->position_z},
                            PARTICLE_SCALE,
                            (IVector2){0, 0}, (IVector2){image->width, image->height});
            }
        }
    }
}

void kill_all_items(Item* items, size_t items_count) {
    for (size_t i = 0; i < items_count; ++i) {
        items[i].alive = false;
    }
}

void render_items(SpritePool *sprite_pool, Item* items, size_t items_count, float time, Image *key_image, Image *bomb_image) {
    for (size_t i = 0; i < items_count; ++i) {
        Item *item = &items[i];
        if (item->alive) {
            float z = 0.25f + ITEM_AMP - ITEM_AMP*__builtin_sinf(ITEM_FREQ*PI*time + item->position.x + item->position.y);
            switch (item->kind) {
                case ITEM_KEY:
                    push_sprite(sprite_pool, key_image, (Vector3){item->position.x, item->position.y, z}, 0.25f, (IVector2){0, 0}, (IVector2){key_image->width, key_image->height});
                    break;
                case ITEM_BOMB:
                    push_sprite(sprite_pool, bomb_image, (Vector3){item->position.x, item->position.y, z}, 0.25f, (IVector2){0, 0}, (IVector2){bomb_image->width, bomb_image->height});
                    break;
            }
        }
    }
}

void update_items_offline(Item *items, size_t items_count) {
    for (size_t item_index = 0; item_index < items_count; ++item_index) {
        Item *item = &items[item_index];
        if (collect_item(me, item)) {
            platform_play_sound(ITEM_PICKUP, me.position.x, me.position.y, item->position.x, item->position.y);
        }
    }
}

void update_items(SpritePool *sprite_pool, float time, Item *items, size_t items_count, Image *key_image, Image *bomb_image) {
    // Rendering the items as sprites
    render_items(sprite_pool, items, items_count, time, key_image, bomb_image);

    // Offline mode. Updating items state without asking the server.
    if (platform_is_offline_mode()) {
        update_items_offline(items, items_count);
    }
}

void explode_bomb(Vector3 bomb_position, Vector2 player_position, ParticlePool *particle_pool) {
    platform_play_sound(BOMB_BLAST, player_position.x, player_position.y, bomb_position.x, bomb_position.y);
    for (int i = 0; i < BOMB_PARTICLE_COUNT; ++i) {
        emit_particle(bomb_position, particle_pool);
    }
}
