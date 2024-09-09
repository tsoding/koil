const AVERAGE_CAPACITY = 30;

export interface Counter {
    kind: 'counter',
    counter: number,
    description: string,
}

export interface Average {
    kind: 'average';
    samples: Array<number>;
    description: string;
    pushSample(sample: number): void;
}

export interface Timer {
    kind: 'timer',
    startedAt: number,
    description: string,
}

type Stat = Counter | Average | Timer;
type Stats = Record<string, Stat>
const stats: Stats = {}

function average(samples: Array<number>): number {
    return samples.reduce((a, b) => a + b, 0)/samples.length
}

function pluralNumber(num: number, singular: string, plural: string): string {
    return num === 1 ? singular : plural;
}

function displayTimeInterval(diffMs: number): string {
    const result = []
    const diffSecs = Math.floor(diffMs/1000);

    const days = Math.floor(diffSecs/60/60/24)
    if (days > 0) result.push(`${days} ${pluralNumber(days, 'day', 'days')}`);
    const hours = Math.floor(diffSecs/60/60%24);
    if (hours > 0) result.push(`${hours} ${pluralNumber(hours, 'hour', 'hours')}`);
    const mins = Math.floor(diffSecs/60%60);
    if (mins > 0) result.push(`${mins} ${pluralNumber(mins, 'min', 'mins')}`);
    const secs = Math.floor(diffSecs%60);
    if (secs > 0) result.push(`${secs} ${pluralNumber(secs, 'sec', 'secs')}`);
    return result.length === 0 ? '0 secs' : result.join(' ');
}

function getStat(stat: Stat): string {
    switch (stat.kind) {
        case 'counter': return stat.counter.toString();
        case 'average': return average(stat.samples).toString();
        case 'timer':   return displayTimeInterval(Date.now() - stat.startedAt);
    }
}

function registerCounter(name: string, description: string): Counter {
    const stat: Counter = {
        kind: 'counter',
        counter: 0,
        description,
    }
    stats[name] = stat;
    return stat;
}

function pushSample(this: Average, sample: number) {
    while (this.samples.length > AVERAGE_CAPACITY) this.samples.shift();
    this.samples.push(sample);
}

function registerAverage(name: string, description: string): Average {
    const stat: Average = {
        kind: 'average',
        samples: [],
        description,
        pushSample,
    }
    stats[name] = stat;
    return stat;
}

function registerTimer(name: string, description: string): Timer {
    const stat: Timer = {
        kind: 'timer',
        startedAt: 0,
        description,
    }
    stats[name] = stat;
    return stat;
}

export function print() {
    console.log("Stats:")
    for (let key in stats) {
        console.log(`  ${stats[key].description}`, getStat(stats[key]));
    }
}

export const uptime               = registerTimer  ("uptime",               "Uptime");
export const ticksCount           = registerCounter("ticksCount",           "Ticks count");
export const tickTimes            = registerAverage("tickTimes",            "Average time to process a tick");
export const messagesSent         = registerCounter("messagesSent",         "Total messages sent");
export const messagesReceived     = registerCounter("messagesReceived",     "Total messages received");
export const tickMessagesSent     = registerAverage("tickMessagesSent",     "Average messages sent per tick");
export const tickMessagesReceived = registerAverage("tickMessagesReceived", "Average messages received per tick");
export const bytesSent            = registerCounter("bytesSent",            "Total bytes sent");
export const bytesReceived        = registerCounter("bytesReceived",        "Total bytes received");
export const tickByteSent         = registerAverage("tickByteSent",         "Average bytes sent per tick");
export const tickByteReceived     = registerAverage("tickByteReceived",     "Average bytes received per tick");
export const playersCurrently     = registerCounter("playersCurrently",     "Currently players");
export const playersJoined        = registerCounter("playersJoined",        "Total players joined");
export const playersLeft          = registerCounter("playersLeft",          "Total players left");
export const bogusAmogusMessages  = registerCounter("bogusAmogusMessages",  "Total bogus-amogus messages");
export const playersRejected      = registerCounter("playersRejected",      "Total players rejected");
