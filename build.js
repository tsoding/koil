// @ts-check
// Do not run this file directly. Run it via `npm run watch`. See package.json for more info.
const { spawn } = require('child_process');

const WASM_SIZE_OPT = true;

/**
 * 
 * @param {string} program 
 * @param {string[]} args 
 * @returns {ReturnType<typeof spawn>}
 */
function cmd(program, args = []) {
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

if (!0) cmd("tsc", []);
if (!0) {
    cmd("clang", ["-DSTB_IMAGE_IMPLEMENTATION", "-x", "c", "-c", "stb_image.h"]).on('close', (data) => {
        if (data !== 0) return;
        cmd("c3c", ["compile", "packer.c3", "common.c3", "stb_image.o"]).on('close', (data) => {
            if (data !== 0) return;
            cmd("c3c", [
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
            ]);

	});
    });
    
    cmd("c3c", [
        "compile",
        "-D", "PLATFORM_WEB",
        "--reloc=none",
        "--target", "wasm32",
        "-O5", "-g0", "--link-libc=no", "--no-entry",
        "-o", "server",
        "-z", "--export-table",
        "-z", "--allow-undefined",
        "server.c3", "common.c3",
    ]);
}

if (WASM_SIZE_OPT) {
    // Optimize client.wasm by converting it to WAT then back to WASM
    cmd("wasm2wat", ["client.wasm", ">", "client.wat"])
        .on('close', (data) => {
	    if (data != 0) return;

            cmd("wat2wasm", ["client.wat", "-o", "client.wasm"]);
        });


    // Optimize server.wasm by converting it to WAT then back to WASM
    cmd("wasm2wat", ["server.wasm", ">", "server.wat"])
        .on('close', (data) => {
            if (data != 0) return;

            cmd("wat2wasm", ["server.wat", "-o", "server.wasm"]);
        });
}
