module common::platform;

extern fn void write(void *buffer, usz buffer_sz) @extern("platform_write");
extern fn float atan2f(float y, float x) @extern("platform_atan2f");
