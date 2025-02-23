// coroutine bindings for C3 (see coroutine.h for the API documentation)
module coroutine;
import std::net;

def CoroutineFn = fn void(void*);

extern fn void sleep_read(int fd) @extern("coroutine_sleep_read");
extern fn void sleep_write(int fd) @extern("coroutine_sleep_write");
extern fn void wake_up(usz id) @extern("coroutine_wake_up");
extern fn void init() @extern("coroutine_init");
extern fn void finish() @extern("coroutine_finish");
extern fn void yield() @extern("coroutine_yield");
extern fn void go(CoroutineFn f, void* arg = null) @extern("coroutine_go");
extern fn usz id() @extern("coroutine_id");
extern fn usz alive() @extern("coroutine_alive");
