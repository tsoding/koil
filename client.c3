import std::math;
import common;

const float NEAR_CLIPPING_PLANE = 0.1;
const float FAR_CLIPPING_PLANE = 10.0;
const float FOV = math::PI*0.5;
const float EPS = 1e-6;

def Color = char[<4>];

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
