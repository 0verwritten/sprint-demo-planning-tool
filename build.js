import { execSync } from 'child_process';

console.log('Compiling TypeScript...');
execSync('npx tsc', { stdio: 'inherit' });

console.log('Packaging into exe...');
execSync('npx pkg dist/index.js --config package.json', { stdio: 'inherit' });

console.log('Done! Exe is in ./exe/');
