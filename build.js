import { execSync, } from 'child_process';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

console.log('Bundling with esbuild...');
execSync('npx esbuild src/index.ts --bundle --platform=node --format=cjs --outfile=dist/bundle.cjs', { stdio: 'inherit' });

console.log('Packaging into exe...');
mkdirSync('exe', { recursive: true });
execSync('npx pkg dist/bundle.cjs --targets node18-win-x64 --output exe/sprint-demo-planner.exe', { stdio: 'inherit' });

console.log('Copying .env.example...');
copyFileSync('.env.example', 'exe/.env.example');

if (existsSync('.env')) {
  console.log('Copying .env...');
  copyFileSync('.env', 'exe/.env');
}

console.log('Done! exe/sprint-demo-planner.exe');
