// @ts-check
const { spawn } = require('child_process');
const { promisify } = require('util');
const { mkdir } = require('fs/promises');

/**
 * TODO: this signature is outdated
 * 
 * @param {string} program 
 * @param {string[]} args 
 * @returns {ReturnType<typeof spawn>}
 */
function cmd(program, args, callback) {
    const spawnOptions = { "shell": true };
    console.log('CMD:', program, args.flat(), spawnOptions);
    const p = spawn(program, args.flat(), spawnOptions); // NOTE: flattening the args array enables you to group related arguments for better self-documentation of the running command
    // @ts-ignore [stdout may be null?]
    p.stdout.on('data', (data) => process.stdout.write(data));
    // @ts-ignore [stderr may be null?]
    p.stderr.on('data', (data) => process.stderr.write(data));
    p.on('exit', (code, signal) => callback(code || signal || null))
    p.on('error', callback)
    return p;
}

const cmdAsync = promisify(cmd);

const BUILD_FOLDER = 'build/';

function TODO(message) {
    throw new Error(`TODO: ${message}`)
}

function buildJs() {
    return cmdAsync("./node_modules/.bin/tsc", []);
}

async function buildClient() {
    await cmdAsync("clang", [
        "-DSTB_IMAGE_IMPLEMENTATION",
        "-o", BUILD_FOLDER+"stb_image.o",
        "-x", "c",
        "-c",
        "stb_image.h"
    ]);
    await cmdAsync("c3c", [
        "compile",
        "-o", BUILD_FOLDER+"packer",
        "packer.c3", "common.c3",
        BUILD_FOLDER+"stb_image.o"
    ]);
    return cmdAsync("c3c", [
        "compile",
        "-D", "PLATFORM_WEB",
        "--reloc=none",
        "--target", "wasm32",
        "-O5", "-g0", "--link-libc=no", "--no-entry",
        "--trust=full",
        "-o", "client",
        "-z", "--export-table",
        "-z", "--allow-undefined",
        "client.c3", "common.c3",
    ])
}

async function buildCWS() {
    await Promise.all([
        cmdAsync("gcc", [
            "-Wall", "-Wextra", "-ggdb",
            "-o", BUILD_FOLDER+"coroutine.o",
            "-c",
            "cws/coroutine.c"
        ]),
        cmdAsync("gcc", [
            "-Wall", "-Wextra", "-ggdb",
            "-o", BUILD_FOLDER+"cws.o",
            "-c",
            "cws/cws.c"
        ]),
    ])
    await cmdAsync("ar", [
        "-rcs",
        BUILD_FOLDER+"libcws.a",
        BUILD_FOLDER+"coroutine.o",
        BUILD_FOLDER+"cws.o"
    ])
}

async function buildWasmServer() {
    await cmdAsync("c3c", [
        "compile",
        "-D", "PLATFORM_WEB",
        "--reloc=none",
        "--target", "wasm32",
        "-O5", "-g0", "--link-libc=no", "--no-entry",
        "-o", "server",
        "-z", "--export-table",
        "-z", "--allow-undefined",
        "server.c3", "common.c3",
    ])
}

async function buildNativeServer() {
    await buildCWS();
    await cmdAsync("c3c", [
        "compile",
        "-o", BUILD_FOLDER+"server_native",
        "server_native.c3"
    ]);
}

function mkdirp(path) {
    console.log(`MKDIR: ${path}`)
    return mkdir(path, {
        mode: 0o755,
        recursive: true
    });
}

async function main () {
    const args = process.argv.slice(2);

    await Promise.all([
        mkdirp(BUILD_FOLDER+"wasm_objects/"),
        mkdirp(BUILD_FOLDER+"native_objects/"),
    ])

    await Promise.all([
        buildJs(),
        buildClient(),
        buildWasmServer(),
        //buildNativeServer(),
    ])
}

main()
