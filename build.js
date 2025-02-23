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
    await cmdAsync("gcc", [
        "-Wall", "-Wextra", "-ggdb",
        "-I"+SRC_FOLDER,
        "-I"+SRC_FOLDER+"cws/",
        "-o", BUILD_FOLDER+"packer",
        SRC_FOLDER+"packer.c",
        "-lm",
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
        SRC_FOLDER+"client.c3",
        SRC_FOLDER+"common.c3",
        SRC_FOLDER+"common_wasm.c3",
    ])
}

async function buildCWS() {
    await Promise.all([
        cmdAsync("gcc", [
            "-Wall", "-Wextra", "-ggdb",
            "-o", BUILD_FOLDER+"coroutine.o",
            "-c",
            SRC_FOLDER+"cws/coroutine.c"
        ]),
        cmdAsync("gcc", [
            "-Wall", "-Wextra", "-ggdb",
            "-o", BUILD_FOLDER+"cws.o",
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
    await buildCWS();
    await cmdAsync("c3c", [
        "compile",
        "-l", BUILD_FOLDER+"libcws.a",
        "-o", BUILD_FOLDER+"server",
        SRC_FOLDER+"server.c3",
        SRC_FOLDER+"common.c3",
        SRC_FOLDER+"cws/cws.c3",
        SRC_FOLDER+"cws/coroutine.c3",
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

    await mkdirp(BUILD_FOLDER)
    await Promise.all([
        buildJs(),
        // Running all the C3 related builds sequentually because c3c is completely unparallelizable
        (async () => {
            await buildClient();
            await buildServer();
        })()
    ])
}

main()
