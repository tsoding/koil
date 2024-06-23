// @ts-check
const spawn = require('child_process').spawn;

/**
 * 
 * @returns {boolean}
 */
function isWindows() {
    return require("os").platform() === "win32";
}

/**
 * @type {Parameters<typeof spawn>[2]}
 */
const spawnOptions = isWindows() ? { "shell": true } : {};

/**
 * 
 * @param {string} program 
 * @param {string[]} args 
 * @returns {ReturnType<typeof spawn>}
 */
function cmd(program, args) {
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

cmd('tsc', ['-w'])
cmd('http-server', ['-p', '6969', '-a', '127.0.0.1', '-s'])