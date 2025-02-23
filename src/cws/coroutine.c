#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>
#include <string.h>

#include <poll.h>
#include <unistd.h>
#include <sys/mman.h>

#include "coroutine.h"

// TODO: make the STACK_CAPACITY customizable by the user
//#define STACK_CAPACITY (4*1024)
#define STACK_CAPACITY (1024*getpagesize())

// Initial capacity of a dynamic array
#ifndef DA_INIT_CAP
#define DA_INIT_CAP 256
#endif

// Append an item to a dynamic array
#define da_append(da, item)                                                          \
    do {                                                                             \
        if ((da)->count >= (da)->capacity) {                                         \
            (da)->capacity = (da)->capacity == 0 ? DA_INIT_CAP : (da)->capacity*2;   \
            (da)->items = realloc((da)->items, (da)->capacity*sizeof(*(da)->items)); \
            assert((da)->items != NULL && "Buy more RAM lol");                       \
        }                                                                            \
                                                                                     \
        (da)->items[(da)->count++] = (item);                                         \
    } while (0)

#define da_remove_unordered(da, i)                   \
    do {                                             \
        size_t j = (i);                              \
        assert(j < (da)->count);                     \
        (da)->items[j] = (da)->items[--(da)->count]; \
    } while(0)

#define UNUSED(x) (void)(x)
#define TODO(message) do { fprintf(stderr, "%s:%d: TODO: %s\n", __FILE__, __LINE__, message); abort(); } while(0)
#define UNREACHABLE(message) do { fprintf(stderr, "%s:%d: UNREACHABLE: %s\n", __FILE__, __LINE__, message); abort(); } while(0)

typedef struct {
    void *rsp;
    void *stack_base;
} Context;

typedef struct {
    Context *items;
    size_t count;
    size_t capacity;
} Contexts;

typedef struct {
    size_t *items;
    size_t count;
    size_t capacity;
} Indices;

typedef struct {
    struct pollfd *items;
    size_t count;
    size_t capacity;
} Polls;

// TODO: coroutines library probably does not work well in multithreaded environment
static size_t current     = 0;
static Indices active     = {0};
static Indices dead       = {0};
static Contexts contexts  = {0};
static Indices asleep     = {0};
static Polls polls        = {0};

// TODO: ARM support
//   Requires modifications in all the @arch places

typedef enum {
    SM_NONE = 0,
    SM_READ,
    SM_WRITE,
} Sleep_Mode;

// Linux x86_64 call convention
// %rdi, %rsi, %rdx, %rcx, %r8, and %r9

void __attribute__((naked)) coroutine_yield(void)
{
    // @arch
    asm(
    "    pushq %rdi\n"
    "    pushq %rbp\n"
    "    pushq %rbx\n"
    "    pushq %r12\n"
    "    pushq %r13\n"
    "    pushq %r14\n"
    "    pushq %r15\n"
    "    movq %rsp, %rdi\n"     // rsp
    "    movq $0, %rsi\n"       // sm = SM_NONE
    "    jmp coroutine_switch_context\n");
}

void __attribute__((naked)) coroutine_sleep_read(int fd)
{
    (void) fd;
    // @arch
    asm(
    "    pushq %rdi\n"
    "    pushq %rbp\n"
    "    pushq %rbx\n"
    "    pushq %r12\n"
    "    pushq %r13\n"
    "    pushq %r14\n"
    "    pushq %r15\n"
    "    movq %rdi, %rdx\n"     // fd
    "    movq %rsp, %rdi\n"     // rsp
    "    movq $1, %rsi\n"       // sm = SM_READ
    "    jmp coroutine_switch_context\n");
}

void __attribute__((naked)) coroutine_sleep_write(int fd)
{
    (void) fd;
    // @arch
    asm(
    "    pushq %rdi\n"
    "    pushq %rbp\n"
    "    pushq %rbx\n"
    "    pushq %r12\n"
    "    pushq %r13\n"
    "    pushq %r14\n"
    "    pushq %r15\n"
    "    movq %rdi, %rdx\n"     // fd
    "    movq %rsp, %rdi\n"     // rsp
    "    movq $2, %rsi\n"       // sm = SM_WRITE
    "    jmp coroutine_switch_context\n");
}

void __attribute__((naked)) coroutine_restore_context(void *rsp)
{
    // @arch
    (void)rsp;
    asm(
    "    movq %rdi, %rsp\n"
    "    popq %r15\n"
    "    popq %r14\n"
    "    popq %r13\n"
    "    popq %r12\n"
    "    popq %rbx\n"
    "    popq %rbp\n"
    "    popq %rdi\n"
    "    ret\n");
}

void coroutine_switch_context(void *rsp, Sleep_Mode sm, int fd)
{
    contexts.items[active.items[current]].rsp = rsp;

    switch (sm) {
    case SM_NONE: current += 1; break;
    case SM_READ: {
        da_append(&asleep, active.items[current]);
        struct pollfd pfd = {.fd = fd, .events = POLLRDNORM,};
        da_append(&polls, pfd);
        da_remove_unordered(&active, current);
    } break;

    case SM_WRITE: {
        da_append(&asleep, active.items[current]);
        struct pollfd pfd = {.fd = fd, .events = POLLWRNORM,};
        da_append(&polls, pfd);
        da_remove_unordered(&active, current);
    } break;

    default: UNREACHABLE("coroutine_switch_context");
    }

    if (polls.count > 0) {
        int timeout = active.count == 0 ? -1 : 0;
        int result = poll(polls.items, polls.count, timeout);
        if (result < 0) TODO("poll");

        for (size_t i = 0; i < polls.count;) {
            if (polls.items[i].revents) {
                size_t id = asleep.items[i];
                da_remove_unordered(&polls, i);
                da_remove_unordered(&asleep, i);
                da_append(&active, id);
            } else {
                ++i;
            }
        }
    }

    assert(active.count > 0);
    current %= active.count;
    coroutine_restore_context(contexts.items[active.items[current]].rsp);
}

// TODO: think how to get rid of coroutine_init() call at all
void coroutine_init(void)
{
    if (contexts.count != 0) return;
    da_append(&contexts, (Context){0});
    da_append(&active, 0);
}

void coroutine__finish_current(void)
{
    if (active.items[current] == 0) {
        UNREACHABLE("Main Coroutine with id == 0 should never reach this place");
    }

    da_append(&dead, active.items[current]);
    da_remove_unordered(&active, current);

    if (polls.count > 0) {
        int timeout = active.count == 0 ? -1 : 0;
        int result = poll(polls.items, polls.count, timeout);
        if (result < 0) TODO("poll");

        for (size_t i = 0; i < polls.count;) {
            if (polls.items[i].revents) {
                size_t id = asleep.items[i];
                da_remove_unordered(&polls, i);
                da_remove_unordered(&asleep, i);
                da_append(&active, id);
            } else {
                ++i;
            }
        }
    }

    assert(active.count > 0);
    current %= active.count;
    coroutine_restore_context(contexts.items[active.items[current]].rsp);
}

void coroutine_go(void (*f)(void*), void *arg)
{
    size_t id;
    if (dead.count > 0) {
        id = dead.items[--dead.count];
    } else {
        da_append(&contexts, ((Context){0}));
        id = contexts.count-1;
        contexts.items[id].stack_base = mmap(NULL, STACK_CAPACITY, PROT_WRITE|PROT_READ, MAP_PRIVATE|MAP_STACK|MAP_ANONYMOUS|MAP_GROWSDOWN, -1, 0);
        assert(contexts.items[id].stack_base != MAP_FAILED);
    }

    void **rsp = (void**)((char*)contexts.items[id].stack_base + STACK_CAPACITY);
    // @arch
    *(--rsp) = coroutine__finish_current;
    *(--rsp) = f;
    *(--rsp) = arg; // push rdi
    *(--rsp) = 0;   // push rbx
    *(--rsp) = 0;   // push rbp
    *(--rsp) = 0;   // push r12
    *(--rsp) = 0;   // push r13
    *(--rsp) = 0;   // push r14
    *(--rsp) = 0;   // push r15
    contexts.items[id].rsp = rsp;

    da_append(&active, id);
}

size_t coroutine_id(void)
{
    return active.items[current];
}

size_t coroutine_alive(void)
{
    return active.count;
}

void coroutine_wake_up(size_t id)
{
    // @speed coroutine_wake_up is linear
    for (size_t i = 0; i < asleep.count; ++i) {
        if (asleep.items[i] == id) {
            da_remove_unordered(&asleep, id);
            da_remove_unordered(&polls, id);
            da_append(&active, id);
            return;
        }
    }
}
