// @ts-check
// Do not run this file directly. Run it via `npm run watch`. See package.json for more info.
const { spawn } = require('child_process');
const { WebSocketServer } = require("ws");
const { watchFile } = require("fs");
const path = require("path");

/**
 * 
 * @param {string} program 
 * @param {string[]} args 
 * @returns {ReturnType<typeof spawn>}
 */
function cmd(program, args) {
    const spawnOptions = { "shell": true };
    console.log('CMD:', program, args.flat(), spawnOptions);
    const p = spawn(program, args.flat(), spawnOptions); // NOTE: flattening the args array enables you to group related arguments for better self-documentation of the running command
    // @ts-ignore [stdout may be null?]
    p.stdout.on('data', (data) => process.stdout.write(data));
    // @ts-ignore [stderr may be null?]
    p.stderr.on('data', (data) => process.stderr.write(data));
    p.on('close', (code) => {
        if (code !== 0) {
            console.error(program, args, 'exited with', code);
        }
    });
    return p;
}

cmd('tsc', ['-w'])
cmd('http-server', ['-p', '6969', '-a', '127.0.0.1', '-s', '-c-1'])

const wss = new WebSocketServer({
  port: 6970,
});

/** @type {import("ws").WebSocket[]} */
const websockets = [];

wss.on("connection", (ws) => {
  websockets.push(ws);

  ws.on("close", () => {
    websockets.splice(websockets.indexOf(ws), 1);
  });
});

const FILES_TO_WATCH = ["index.html", "index.js", "dvd.js"];

FILES_TO_WATCH.forEach((file) =>
  watchFile(path.join(__dirname, file), { interval: 50 }, () => {
    websockets.forEach((socket) => socket.send("reload"));
  })
);
