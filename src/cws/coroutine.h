#ifndef COROUTINE_H_
#define COROUTINE_H_

// # What is a Coroutine?
//
// Coroutine is a lightweight user space thread with its own stack that can
// suspend its execution and switch to another coroutine (see coroutine_yield()
// function). Coroutines do not run in parallel but rather cooperatively switch
// between each other whenever they feel like it.
//
// Coroutines are useful in cases when all your program does majority of the
// time is waiting on IO. So with coroutines you have an opportunity to do
// coroutine_yield() and go do something else. It is not useful to split up
// heavy CPU computations because they all going to be executed on a single
// thread. Use proper threads for that (pthreads on POSIX).
//
// Good use cases for coroutines are usually Network Applications and UI.
// Anything with a slow Async IO.
//
// # How does it work?
//
// Each coroutine has its own separate call stack. Every time a new coroutine is
// created with coroutine_go() a new call stack is allocated in dynamic memory.
// The library manages a global array of coroutine stacks and switches between
// them (on x86_64 literally swaps out the value of the RSP register) on every
// coroutine_yield(), coroutine_sleep_read(), or coroutine_sleep_write().

#ifdef __cplusplus
extern "C" {
#endif // __cplusplus

// TODO: consider making coroutine.h an stb-style single header library

// Initialize the coroutine runtime. Must be called before using any other
// functions of this API. After the initialization the currently running code is
// considered the main coroutine with the id = 0. Should not be called twice.
// TODO: Allow calling it twice, 'cause why not?!
void coroutine_init(void);

// Switch to the next coroutine. The execution will continue starting from
// coroutine_yield() (or any other flavor of it like coroutine_sleep_read() or
// coroutine_sleep_write) call of another coroutine.
void coroutine_yield(void);

// Create a new coroutine. This function does not automatically switch to the
// new coroutine, but continues executing in the current coroutine. The
// execution of the new coroutine will start as soon as the scheduler gets to it
// handling the chains of coroutine_yield()-s.
void coroutine_go(void (*f)(void*), void *arg);

// The id of the current coroutine.
size_t coroutine_id(void);

// How many coroutines are currently alive. Could be used by the main coroutine
// to wait until all the "child" coroutines have died. It may also continue from
// the call of coroutine_sleep_read() and coroutine_sleep_write() if the
// corresponding coroutine was woken up.
size_t coroutine_alive(void);

// Put the current coroutine to sleep until the non-blocking socket `fd` has
// avaliable data to read. Trying to read from fd after coroutine_sleep_read()
// may still cause EAGAIN, if the coroutine was woken up by coroutine_wake_up
// before the socket became available for reading. You may treat this function
// as a flavor of coroutine_yield().
void coroutine_sleep_read(int fd);

// Put the current coroutine to sleep until the non-blocking socket `fd` is
// ready to accept data to write. Trying to write to fd after
// coroutine_sleep_write() may still cause EAGAIN, if the coroutine was woken up
// by coroutine_wake_up before the socket became available for writing. You may
// treat this function as a flavor of coroutine_yield().
void coroutine_sleep_write(int fd);

// Wake up coroutine by id if it is currently sleeping due to
// coroutine_sleep_read() or coroutine_sleep_write() calls.
void coroutine_wake_up(size_t id);

// TODO: implement sleeping by timeout
// TODO: add timeouts to coroutine_sleep_read() and coroutine_sleep_write()

#ifdef __cplusplus
}
#endif // __cplusplus

#endif // COROUTINE_H_
