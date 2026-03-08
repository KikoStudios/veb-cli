import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const binDir = path.join(rootDir, 'bin');

// Ensure bin directory exists
if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir);
}

const entryPoint = './scr/cli.js';

const targets = [
    { name: 'veb-linux', os: 'bun-linux-x64' },
    { name: 'veb-windows.exe', os: 'bun-windows-x64' }
];

console.log('Building veb binaries for Linux and Windows...');

for (const target of targets) {
    console.log(`\nCompiling ${target.name} target: ${target.os}...`);
    
    const outPath = path.join('bin', target.name);
    
    const result = spawnSync('bun', [
        'build', '--compile', `--target=${target.os}`, entryPoint, `--outfile`, outPath
    ], {
        cwd: rootDir,
        stdio: 'inherit',
        shell: true
    });

    if (result.status !== 0) {
        console.error(`❌ Failed to compile ${target.name}`);
        process.exit(1);
    }
    
    console.log(`✅ Successfully compiled ${target.name}`);
}

console.log('\nAll binaries compiled successfully to the /bin directory.');
