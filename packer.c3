import common;
import std::io;
import std::io::file;
import std::collections::list;

extern fn char *stbi_load(ZString filename, int *x, int *y, int *comp, int req_comp);

const String[] IMAGE_FILES = {
    "assets/images/custom/bomb.png",
    "assets/images/custom/key.png",
    "assets/images/custom/null.png",
    "assets/images/custom/particle.png",
    "assets/images/custom/player.png",
    "assets/images/custom/wall.png",
};

DString pack;
Assets assets;

fn int main() {
    foreach(filename: IMAGE_FILES) {
        int x, y;
        int comp = 4;
        char *pixels = stbi_load((ZString)filename, &x, &y, null, comp);
        int size = x*y*comp;
        usz offset = pack.len();
        assets.push({filename, offset, x, y});
        pack.append_chars((String)pixels[0..size-1]);
        if (pixels == null) {
            io::printf("ERROR: could not load file %s\n", filename);
            return 1;
        }
    }

    io::printfn("Asset[] assets = {");
    foreach (asset: assets) {
        io::printfn("    {\"%s\", %d, %d, %d},", asset.filename, asset.offset, asset.width, asset.height);
    }
    io::printfn("};");

    io::printf("char[*] pack = {");
    String pack_view = pack.str_view();
    for (usz i = 0; i < pack_view.len; ++i) {
        io::printf("%d,", pack_view[i]);
    }
    io::printfn("};");
    return 0;
}
