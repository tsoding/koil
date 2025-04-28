#include "common.h"

#define EPS 1e-6f
#define NEAR_CLIPPING_PLANE 0.1f
#define FOV (PI*0.5f)

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
