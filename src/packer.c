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

String_Builder pack;
Assets assets;

int main()
{
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

    printf("Asset[] assets = {\n");
    for (size_t i = 0; i < assets.count; ++i) {
        Asset asset = assets.items[i];
        printf("    {\"%s\", %zu, %zu, %zu},\n", asset.filename, asset.offset, asset.width, asset.height);
    }
    printf("};\n");

    printf("char[*] pack = {");
    String_View pack_view = sb_to_sv(pack);
    for (size_t i = 0; i < pack_view.count; ++i) {
        printf("%u,", (unsigned char)pack_view.data[i]);
    }
    printf("};\n");

    return 0;
}
