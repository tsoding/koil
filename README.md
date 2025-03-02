# Koil

> [!WARNING]
> This Game is a work In Progress! Anything can change at any moment without any notice! Use this Game at your own risk!

Online Multiplayer Browser Game with Old-School Raycasting Graphics.

![screenshot](./screenshot.png)

Offline version available on GitHub Pages: https://tsoding.github.io/koil/

> [!WARNING]
> We are intentionally rendering on HTML 2D Canvas without employing any hardware acceleration to see how much we can push the boundaries of the software rendering implemented in JavaScript running in Browser. So the renderer may run unexpectedly slow on some machines and browsers, but we are working it.

## Quick Start

Dependencies
- Build from scratch commit [855be928](https://github.com/c3lang/c3c/tree/855be9288121d0f7a67d277f7bbbbf57fbfa2597) of [C3 compiler](https://github.com/c3lang/c3c). This commit is pinned and will not be updated.
- GCC (13.2.0+)
- Node (v20.9.0+)

```console
$ npm install
$ node run build
$ npm run serve
$ <browser> http://localhost:6969/
```

This script starts up http-server at http://localhost:6969/ to serve the content of the current folder and the server of the game. See [serve.js](./serve.js) for more details.

## References

- Renderer implementation is heavily inspired by https://lodev.org/cgtutor/raycasting.html
- The Networking is Based on https://github.com/tsoding/multiplayer-game-prototype
