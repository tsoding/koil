// @ts-check
// Do not run this file directly. Run it via `npm run watch`. See package.json for more info.
import { spawn } from "node:child_process"

/**
 * 
 * @param {string} program 
 * @param {string[]} args 
 * @returns {Promise<void>}
 */
function cmd(program, args = []) {
    /** @type {(v?: any) => void} */
    let resolve;
    /** @type {(error: any) => void} */
    let reject;
    /** @type {Promise<void>} */
    const promise = new Promise((f, e) => { resolve = f; reject = e; })

    // NOTE: flattening the args array enables you to group related arguments for better self-documentation of the running command
    const flatArgs = args.flat()

    const spawnOptions = { "shell": true };
    console.log('CMD:', program, flatArgs, spawnOptions);
    const p = spawn(program, flatArgs, spawnOptions);
    // @ts-ignore [stdout may be null?]
    p.stdout.on('data', (data) => process.stdout.write(data));
    // @ts-ignore [stderr may be null?]
    p.stderr.on('data', (data) => process.stderr.write(data));
    p.on('close', (code) => {
        if (code !== 0) {
            console.error(program, args, 'exited with', code);
            reject(code);
        } else {
            resolve();
        }
    });
    return promise;
}

try {
    if (!0) await cmd("tsc", []);
    if (!0) {
        await Promise.all([
            cmd("clang", ["-DSTB_IMAGE_IMPLEMENTATION", "-x", "c", "-c", "stb_image.h"]).then(async () => {
                await cmd("c3c", ["compile", "packer.c3", "common.c3", "stb_image.o"])
                await cmd("c3c", [
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
            }),
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
            ]),
        ])
    }
}
// silence -> bad exit code already reported on close...
catch (e) { }
