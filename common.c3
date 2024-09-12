module common;
import std::math;

const float BOMB_GRAVITY = 10;

def Vector2 = float[<2>];
def IVector2 = int[<2>];
def Vector3 = float[<3>];
def Vector4 = float[<4>];

fn bool scene_get_tile(bool *scene, int scene_width, int scene_height, Vector2 p) {
    int x = (int)math::floor(p.x);
    int y = (int)math::floor(p.y);
    if (!(0 <= x && x < scene_width && 0 <= y && y < scene_height)) return false;
    return scene[y*scene_width + x];
}

fn bool *allocate_scene(int width, int height) @extern("allocate_scene") @wasm {
    bool[] scene = mem::new_array(bool, width*height);
    foreach (&c: scene) *c = false;
    return &scene[0];
}
