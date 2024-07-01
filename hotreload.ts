(async () => {
    const game = document.getElementById("game") as (HTMLCanvasElement | null);
    if (game === null) throw new Error("No canvas with id `game` is found");
    const factor = 80;
    game.width = 16*factor;
    game.height = 9*factor;
    const ctx = game.getContext("2d");
    if (ctx === null) throw new Error("2D context is not supported");

    let dvd = await import("./dvd.js");
    let state = new dvd.State();

    const isDev = window.location.hostname === "localhost";
    if (isDev) {
        const ws = new WebSocket("ws://localhost:6970");

        ws.addEventListener("message", async (event) => {
            if (event.data === "reload") {
                console.log("Hot reloading module");
                dvd = await import("./dvd.js?date="+new Date().getTime());
                Object.setPrototypeOf(state, Object.getPrototypeOf(new dvd.State()));
            }
        });
    }

    let prevTimestamp = 0;
    const frame = (timestamp: number) => {
        const deltaTime = (timestamp - prevTimestamp)/1000;
        prevTimestamp = timestamp;

        state.update(ctx, deltaTime);

        window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame((timestamp) => {
        prevTimestamp = timestamp;
        window.requestAnimationFrame(frame);
    });

    console.log("Hello from Hotreload");
})();
