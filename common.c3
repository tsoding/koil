module common;

fn bool *allocate_scene(int width, int height) @extern("allocate_scene") @wasm {
    bool[] scene = mem::new_array(bool, width*height);
    foreach (&c: scene) *c = false;
    return &scene[0];
}
