# Raycasting in TypeScript

![screenshot](./screenshot.png)

My take on Raycasting inspired by Lode's Computer Graphics Tutorial: https://lodev.org/cgtutor/raycasting.html

No Web-server is required, just open index.html with a browser. You can also visit GitHub pages: https://tsoding.github.io/raycasting/

## Rebuilding index.js

```console
$ npm install
$ npm run build
```

This scripts just runs `tsc` once.

## Watch mode

```console
$ npm install
$ npm run watch
```

This script starts up http-server at http://localhost:6969/ to serve the content of the current folder and tsc in watch mode to constantly recompile [index.ts](./index.ts). See [watch.js](./watch.js) for more details.
