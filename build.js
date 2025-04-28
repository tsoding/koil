// @ts-check
const { spawn } = require('child_process');
const { promisify } = require('util');
const { mkdir, mkdtemp } = require('fs/promises');

const BUILD_FOLDER = 'build/';
const SRC_FOLDER = 'src/';

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

function TODO(message) {
    throw new Error(`TODO: ${message}`)
}

function buildJs() {
    return cmdAsync("./node_modules/.bin/tsc", []);
}

async function buildClient() {
    await Promise.all([
        cmdAsync("clang", [
            "-Wall", "-Wextra", "-ggdb",
            "-I"+SRC_FOLDER,
            "-I"+SRC_FOLDER+"cws/",
            "-o", BUILD_FOLDER+"packer",
            SRC_FOLDER+"packer.c",
            "-lm",
        ]),
        cmdAsync("clang", [
            "-Wall", "-Wextra",
            "--target=wasm32",
            "-I", SRC_FOLDER+"cws/",
            "-c", SRC_FOLDER+"common.c",
            "-o", BUILD_FOLDER+"common.wasm.o",
        ]),
        cmdAsync("clang", [
            "-Wall", "-Wextra",
            "--target=wasm32",
            "-I", SRC_FOLDER+"cws/",
            "-c", SRC_FOLDER+"client.c",
            "-o", BUILD_FOLDER+"client.wasm.o",
        ]),
    ])

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
        "-z", "--export=pixels_of_display",
        BUILD_FOLDER+"common.wasm.o",
        BUILD_FOLDER+"client.wasm.o",
        SRC_FOLDER+"client.c3",
        SRC_FOLDER+"common.c3",
    ])
}

async function buildCWS() {
    await Promise.all([
        cmdAsync("clang", [
            "-Wall", "-Wextra", "-ggdb",
            "-o", BUILD_FOLDER+"coroutine.o",
            "-fsanitize=address",
            "-c",
            SRC_FOLDER+"cws/coroutine.c"
        ]),
        cmdAsync("clang", [
            "-Wall", "-Wextra", "-ggdb",
            "-o", BUILD_FOLDER+"cws.o",
            "-fsanitize=address",
            "-c",
            SRC_FOLDER+"cws/cws.c"
        ]),
    ])
    await cmdAsync("ar", [
        "-rcs",
        BUILD_FOLDER+"libcws.a",
        BUILD_FOLDER+"coroutine.o",
        BUILD_FOLDER+"cws.o"
    ])
}

async function buildServer() {
    await Promise.all([
        buildCWS(),
        cmdAsync("clang", [
            "-Wall", "-Wextra", "-ggdb",
            "-I", SRC_FOLDER+"cws/",
            "-fsanitize=address",
            "-c", SRC_FOLDER+"server.c",
            "-o", BUILD_FOLDER+"server.o",
        ]),
        cmdAsync("clang", [
            "-Wall", "-Wextra", "-ggdb",
            "-I", SRC_FOLDER+"cws/",
            "-fsanitize=address",
            "-c", SRC_FOLDER+"common.c",
            "-o", BUILD_FOLDER+"common.o",
        ]),
        cmdAsync("clang", [
            "-Wall", "-Wextra", "-ggdb",
            "-I", SRC_FOLDER+"cws/",
            "-fsanitize=address",
            "-c", SRC_FOLDER+"stats.c",
            "-o", BUILD_FOLDER+"stats.o",
        ]),
    ])
    await cmdAsync("clang", [
        "-ggdb",
        "-fsanitize=address",
        "-o", BUILD_FOLDER+"server",
        BUILD_FOLDER+"server.o",
        BUILD_FOLDER+"common.o",
        BUILD_FOLDER+"stats.o",
        BUILD_FOLDER+"libcws.a",
        "-lm"
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
    await mkdirp(BUILD_FOLDER)
    await Promise.all([
        buildJs(),
        // Running all the C3 related builds sequentually because c3c is completely unparallelizable
        (async () => {
            const args = process.argv.slice(2);
            const target = args.shift()
            switch (target) {
            case undefined:
                await buildClient();
                await buildServer();
                break;
            case 'client':
                await buildClient();
                break;
            case 'server':
                await buildServer();
                break;
            default:
                throw new Error(`unknown target \`${target}\``)
            }
        })()
    ])
}

main()
