#ifndef SORT_H_
#define SORT_H_

#include <stddef.h>

void quick_sort(void *items, size_t count, size_t size, int (*compar)(const void *a, const void *b));

#endif // SORT_H_
