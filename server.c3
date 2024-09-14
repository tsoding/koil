import std::io;
import std::math;
import std::collections::ringbuffer;
import common;

extern fn int js_now_secs();
extern fn void js_write(void *buffer, usz buffer_sz);

const usz AVERAGE_CAPACITY = 30;
def Samples = RingBuffer(<float, AVERAGE_CAPACITY>);

enum StatKind {
    COUNTER,
    AVERAGE,
    TIMER,
}

struct StatCounter {
    int value;
}

struct StatAverage {
    Samples samples;
}

struct StatTimer {
    uint started_at;
}

struct Stat {
    StatKind kind;
    String description;

    union {
        StatCounter counter;
        StatAverage average;
        StatTimer timer;
    }
}

// IMPORTANT: This must be synchronized with the StatEntry in server.mts until server.mts is fully rewritten in C3.
enum StatEntry: usz {
    UPTIME,
    TICKS_COUNT,
    TICK_TIMES,
    MESSAGES_SENT,
    MESSAGES_RECEIVED,
    TICK_MESSAGES_SENT,
    TICK_MESSAGES_RECEIVED,
    BYTES_SENT,
    BYTES_RECEIVED,
    TICK_BYTE_SENT,
    TICK_BYTE_RECEIVED,
    PLAYERS_CURRENTLY,
    PLAYERS_JOINED,
    PLAYERS_LEFT,
    BOGUS_AMOGUS_MESSAGES,
    PLAYERS_REJECTED,
    COUNT,
}

// TODO: Why do I have to cast to usz in here? Is there cleaner way to do this?
Stat[(usz)StatEntry.COUNT] stats = {
    [StatEntry.UPTIME] = {
        .kind = TIMER,
        .description = "Uptime"
    },
    [StatEntry.TICKS_COUNT] = {
        .kind = COUNTER,
        .description = "Ticks count"
    },
    [StatEntry.TICK_TIMES] = {
        .kind = AVERAGE,
        .description = "Average time to process a tick"
    },
    [StatEntry.MESSAGES_SENT] = {
        .kind = COUNTER,
        .description = "Total messages sent"
    },
    [StatEntry.MESSAGES_RECEIVED] = {
        .kind = COUNTER,
        .description = "Total messages received"
    },
    [StatEntry.TICK_MESSAGES_SENT] = {
        .kind = AVERAGE,
        .description = "Average messages sent per tick"
    },
    [StatEntry.TICK_MESSAGES_RECEIVED] = {
        .kind = AVERAGE,
        .description = "Average messages received per tick"
    },
    [StatEntry.BYTES_SENT] = {
        .kind = COUNTER,
        .description = "Total bytes sent"
    },
    [StatEntry.BYTES_RECEIVED] = {
        .kind = COUNTER,
        .description = "Total bytes received"
    },
    [StatEntry.TICK_BYTE_SENT] = {
        .kind = AVERAGE,
        .description = "Average bytes sent per tick"
    },
    [StatEntry.TICK_BYTE_RECEIVED] = {
        .kind = AVERAGE,
        .description = "Average bytes received per tick"
    },
    [StatEntry.PLAYERS_CURRENTLY] = {
        .kind = COUNTER,
        .description = "Currently players"
    },
    [StatEntry.PLAYERS_JOINED] = {
        .kind = COUNTER,
        .description = "Total players joined"
    },
    [StatEntry.PLAYERS_LEFT] = {
        .kind = COUNTER,
        .description = "Total players left"
    },
    [StatEntry.BOGUS_AMOGUS_MESSAGES] = {
        .kind = COUNTER,
        .description = "Total bogus-amogus messages"
    },
    [StatEntry.PLAYERS_REJECTED] = {
        .kind = COUNTER,
        .description = "Total players rejected"
    },
};

fn float Samples.average(&self) {
    float sum = 0;
    for (usz i = 0; i < self.written; ++i) {
        sum += self.get(i);
    }
    return sum/self.written;
}

fn String get_stat(Stat *stat) {
    switch (stat.kind) {
        case COUNTER: return string::tformat("%d", stat.counter.value);
        case AVERAGE: return string::tformat("%f", stat.average.samples.average());
        case TIMER:   return display_time_interval(js_now_secs() - stat.timer.started_at);
    }
}

fn String plural_number(int num, String singular, String plural) {
    return num == 1 ? singular : plural;
}

fn String display_time_interval(uint diffSecs) {
    String[4] result;
    usz result_count = 0;

    uint days = diffSecs/60/60/24;
    if (days > 0) result[result_count++] = string::tformat("%d %s", days, plural_number(days, "day", "days"));
    uint hours = diffSecs/60/60%24;
    if (hours > 0) result[result_count++] = string::tformat("%d %s", hours, plural_number(hours, "hour", "hours"));
    uint mins = diffSecs/60%60;
    if (mins > 0) result[result_count++] = string::tformat("%d %s", mins, plural_number(mins, "min", "mins"));
    uint secs = diffSecs%60;
    if (secs > 0) result[result_count++] = string::tformat("%d %s", secs, plural_number(secs, "sec", "secs"));
    return result_count == 0 ? "0 secs" : string::join_new(&result, " ", allocator::temp());
}

fn void stats_print_per_n_ticks(int n) @extern("stats_print_per_n_ticks") @wasm {
    if (stats[StatEntry.TICKS_COUNT].counter.value%n == 0) {
        @pool() {
            io::printn(string::tformat("STARTED AT: %s", stats[StatEntry.UPTIME].timer.started_at));
            io::printn("Stats:");
            foreach (&stat: stats) {
                io::printn(string::tformat("  %s %s", stat.description, get_stat(stat)));
            }
        };
    }
}

fn void stats_push_sample(StatEntry entry, float sample) @extern("stats_push_sample") @wasm {
    assert(entry < StatEntry.COUNT);
    Stat *stat = &stats[entry];
    assert(stat.kind == StatKind.AVERAGE);
    stat.average.samples.push(sample);
}

fn void stats_inc_counter(StatEntry entry, int delta) @extern("stats_inc_counter") @wasm {
    assert(entry < StatEntry.COUNT);
    Stat *stat = &stats[entry];
    assert(stat.kind == StatKind.AVERAGE);
    stat.counter.value += delta;
}

fn void entry() @init(2048) @private {
    // NOTE: ideally we need to override os::native_fputc_fn as well
    // because io::printn uses it print newline at the end of the
    // message. But since js_write is implemented as a single
    // console.log(), that newline is added implicitly anyway.
    os::native_fwrite_fn = fn usz!(void* f, char[] buffer) {
        js_write(&buffer[0], buffer.len);
        return buffer.len;
    };
    stats[StatEntry.UPTIME].timer.started_at = js_now_secs();
}
