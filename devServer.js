//@ts-check
const { WebSocketServer } = require("ws");
const { watchFile } = require("fs");
const path = require("path");

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

const FILES_TO_WATCH = ["index.html", "index.js"];

FILES_TO_WATCH.forEach((file) =>
  watchFile(path.join(__dirname, file), { interval: 50 }, () => {
    websockets.forEach((socket) => socket.send("reload"));
  })
);
