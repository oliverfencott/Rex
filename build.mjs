import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';

const distDir = 'dist';
const p = process.platform;

console.log(`Building Rex for ${p}/${process.arch}...`);

// Step 1: Compile TypeScript
console.log('Compiling TypeScript...');
execSync('npx tsc', { stdio: 'inherit' });

// Step 2: Build SEA (Node 25.5+ handles copy, inject, sign in one step)
console.log('Building single executable...');
if (existsSync(`${distDir}/rex`)) {
  rmSync(`${distDir}/rex`);
}
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}
execSync('node --build-sea sea-config.json', { stdio: 'inherit' });

// macOS: ad-hoc sign the binary (unsigned executables get SIGKILL)
if (p === 'darwin') {
  console.log('Signing binary...');
  execSync(`codesign --force --sign - ${distDir}/rex`, { stdio: 'inherit' });
}

const suffix = p === 'win32' ? '.exe' : '';
console.log(`\nBuild complete: ${distDir}/rex${suffix}`);
