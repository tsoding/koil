// Do not run this file directly. Run it via `npm run watch`. See package.json for more info.
import { spawn } from 'child_process';

function cmd(program: string, args: string[] = []): ReturnType<typeof spawn> {
    const spawnOptions = { "shell": true };
    console.log('CMD:', program, args.flat(), spawnOptions);
    const p = spawn(program, args.flat(), spawnOptions); // NOTE: flattening the args array enables you to group related arguments for better self-documentation of the running command
    p.stdout.on('data', (data) => process.stdout.write(data));
    p.stderr.on('data', (data) => process.stderr.write(data));
    p.on('close', (code) => {
        if (code !== 0) {
            console.error(program, args, 'exited with', code);
        }
    });
    return p;
}

cmd("tsc", []);
cmd("c3c", [
    "compile",
    "-D", "PLATFORM_WEB",
    "--reloc=none",
    "--target", "wasm32",
    "-O5", "-g0", "--link-libc=no", "--no-entry",
    "-o", "client",
    "-z", "--export-table",
    "-z", "--allow-undefined",
    "client.c3", "common.c3",
])
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
])
