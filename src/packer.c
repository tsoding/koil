#include <stdio.h>

#include "common.h"

#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"
#define NOB_IMPLEMENTATION
#define NOB_STRIP_PREFIX
#include "nob.h"

const char *IMAGE_FILES[] = {
    "assets/images/custom/bomb.png",
    "assets/images/custom/key.png",
    "assets/images/custom/null.png",
    "assets/images/custom/particle.png",
    "assets/images/custom/player.png",
    "assets/images/custom/wall.png",
};

String_Builder pack = {0};
Assets assets = {0};
String_Builder out = {0};

int main(int argc, char **argv)
{
    const char *program_name = shift(argv, argc);

    if (argc <= 0) {
        fprintf(stderr, "Usage: %s <output>\n", program_name);
        fprintf(stderr, "ERROR: no output file path is provided\n");
        return 1;
    }
    const char *output_path = shift(argv, argc);

    for (size_t i = 0; i < ARRAY_LEN(IMAGE_FILES); ++i) {
        const char *filename = IMAGE_FILES[i];
        int x, y;
        int comp = 4;
        stbi_uc *pixels = stbi_load(filename, &x, &y, NULL, comp);
        if (pixels == NULL) {
            fprintf(stderr, "ERROR: could not load file %s\n", filename);
            return 1;
        }
        int size = x*y*comp;
        size_t offset = pack.count;
        da_append(&assets, ((Asset){filename, offset, x, y}));
        sb_append_buf(&pack, pixels, size);
    }

    sb_appendf(&out, "Asset assets[] = {\n");
    for (size_t i = 0; i < assets.count; ++i) {
        Asset asset = assets.items[i];
        sb_appendf(&out, "    {\"%s\", %zu, %zu, %zu},\n", asset.filename, asset.offset, asset.width, asset.height);
    }
    sb_appendf(&out, "};\n");
    sb_appendf(&out, "#define assets_count %zu\n", assets.count);

    sb_appendf(&out, "unsigned char pack[] = {\n");
    String_View pack_view = sb_to_sv(pack);
    size_t width = 15;
    for (size_t i = 0; i < pack_view.count;) {
        sb_appendf(&out, "    ");
        for (size_t j = 0; j < width && i < pack_view.count; ++j, ++i) {
            sb_appendf(&out, "0x%02X,", (unsigned char)pack_view.data[i]);
        }
        sb_appendf(&out, "\n");
    }
    sb_appendf(&out, "};\n");
    sb_appendf(&out, "#define pack_count %zu\n", pack_view.count);

    if (!write_entire_file(output_path, out.items, out.count)) return 1;
    return 0;
}
