// TODO: very naive implementation of quick sort. Maybe make it better at some point when it's actually needed.
#include <stdint.h>
#include "sort.h"

static void memswap(void *a, void *b, size_t size)
{
    uint8_t *pa = a;
    uint8_t *pb = b;
    for (; size > 0; --size, ++pa, ++pb) {
        uint8_t t = *pa;
        *pa = *pb;
        *pb = t;
    }
}

static size_t quick_sort_partition(void *items, size_t count, size_t size, int (*compar)(const void *a, const void *b))
{
    uint8_t *items_bytes = (uint8_t*)items;

    size_t pivot = 0;

    for (size_t i = 1; i < count; ++i) {
        if (compar(items_bytes + (i)*size, items_bytes + (pivot)*size) < 0) {
            memswap(items_bytes + (pivot+1)*size, items_bytes + (i)*size, size);
            memswap(items_bytes + (pivot)*size, items_bytes + (pivot+1)*size, size);
            pivot += 1;
        }
    }

    return pivot;
}

void quick_sort(void *items, size_t count, size_t size, int (*compar)(const void *a, const void *b))
{
    if (count <= 1) return;
    uint8_t *items_bytes = (uint8_t*)items;
    size_t pivot = quick_sort_partition(items, count, size, compar);
    quick_sort(items_bytes, pivot, size, compar);
    quick_sort(items_bytes + (pivot + 1)*size, count - pivot - 1, size, compar);
}
