#ifndef CLIENT_H_
#define CLIENT_H_

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

#endif // CLIENT_H_
