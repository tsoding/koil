module server::platform;
import std::io::os;
import server::stats;
import common::platform;

extern fn uint send_message(uint player_id, void *message) @extern("platform_send_message");
extern fn uint now_msecs() @extern("platform_now_msecs");

fn void entry() @init(2048) @private {
    // NOTE: ideally we need to override os::native_fputc_fn as well
    // because io::printn uses it to print newline at the end of the
    // message. But since js_write() in server.mts is implemented as a
    // single console.log(), that newline is added implicitly anyway.
    os::native_fwrite_fn = fn usz!(void* f, char[] buffer) {
        common::platform::write(&buffer[0], buffer.len);
        return buffer.len;
    };
    stats::stats[StatEntry.UPTIME].timer.started_at = platform::now_msecs();
    common::temp_mark = allocator::temp().used;
    common::load_default_scene();
    server::previous_timestamp = platform::now_msecs();
}
