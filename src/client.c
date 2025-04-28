#include "common.h"

#define EPS 1e-6f
#define NEAR_CLIPPING_PLANE 0.1f
#define FOV (PI*0.5f)
#define SCENE_FLOOR1   (Color) {0x17, 0x29, 0x29, 0xff}
#define SCENE_FLOOR2   (Color) {0x2f, 0x41, 0x41, 0xff}
#define SCENE_CEILING1 (Color) {0x29, 0x17, 0x17, 0xff}
#define SCENE_CEILING2 (Color) {0x41, 0x2f, 0x2f, 0xff}

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
