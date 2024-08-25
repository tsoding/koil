// @ts-check
// Do not run this file directly. Run it via `npm run watch`. See package.json for more info.
const { spawn } = require('child_process');

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

cmd('node', ['server.mjs'])
// TODO: prod mode where we are listening to address 0.0.0.0
cmd('http-server', ['-p', '6969', '-a', '0.0.0.0', '-s', '-c-1', '-d', 'false'])
