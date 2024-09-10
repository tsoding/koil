// Do not run this file directly. Run it via `npm run watch`. See package.json for more info.
import { spawn } from 'child_process';

function cmd(program : string, args: string[] = [] ): ReturnType<typeof spawn> {
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

cmd('node', ["--experimental-transform-types", 'server.mts'])
// TODO: prod mode where we are listening to address 0.0.0.0
cmd('http-server', ['-p', '6969', '-a', '127.0.0.1', '-s', '-c-1', '-d', 'false'])
