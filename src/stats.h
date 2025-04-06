#ifndef STATS_H_
#define STATS_H_

#include <stdint.h>
#include <stddef.h>

typedef enum {
    SE_UPTIME = 0,
    SE_TICKS_COUNT,
    SE_TICK_TIMES,
    SE_MESSAGES_SENT,
    SE_MESSAGES_RECEIVED,
    SE_TICK_MESSAGES_SENT,
    SE_TICK_MESSAGES_RECEIVED,
    SE_BYTES_SENT,
    SE_BYTES_RECEIVED,
    SE_TICK_BYTE_SENT,
    SE_TICK_BYTE_RECEIVED,
    SE_PLAYERS_CURRENTLY,
    SE_PLAYERS_JOINED,
    SE_PLAYERS_LEFT,
    SE_BOGUS_AMOGUS_MESSAGES,
    SE_PLAYERS_REJECTED,
    NUMBER_OF_STAT_ENTRIES,
} Stat_Entry;

extern int messages_recieved_within_tick;
extern int bytes_received_within_tick;
extern int message_sent_within_tick;
extern int bytes_sent_within_tick;

void stat_print_per_n_ticks(int n, uint32_t now_msecs);
void stat_start_timer_at(Stat_Entry entry, uint32_t msecs);
void stat_inc_counter(Stat_Entry entry, int delta);
void stat_push_sample(Stat_Entry entry, float sample);

#endif // STATS_H_
