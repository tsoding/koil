# Raycasting in TypeScript

![screenshot](./screenshot.png)

My take on Raycasting inspired by Lode's Computer Graphics Tutorial: https://lodev.org/cgtutor/raycasting.html

GitHub Pages: https://tsoding.github.io/raycasting/

**We are intentinally rendering on HTML 2D Canvas without employing
any hardware acceleration to see how much we can push the boundaries
of the software rendering implemented in JavaScript running in
Browser. So the renderer may ran unexpectedly slow on some machines
and browsers, but we are working it.**

## Quick Start

```console
$ npm install
$ npm run watch
$ <browser> https://localhost:6969/
```

This script starts up http-server at http://localhost:6969/ to serve the content of the current folder and tsc in watch mode to constantly recompile [index.ts](./index.ts). See [watch.js](./watch.js) for more details.
