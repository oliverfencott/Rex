import { execSync } from 'child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const stagePath = process.argv[2];
if (!stagePath) {
  console.error('Usage: node test/test-roundtrip.mjs <STAGE.DIR>');
  process.exit(1);
}

const rex = join(__dirname, '..', 'dist', 'rex');
const work = mkdtempSync(join(tmpdir(), 'rex-test-'));

try {
  const extractDir = join(work, 'extracted');
  const repackDir = join(work, 'repacked');
  const unpackedDir = join(work, 'unpacked');

  console.log(`Input:   ${stagePath}`);
  console.log(`Work:    ${work}`);

  // 1. Extract
  console.log('\n--- Extract ---');
  execSync(`${rex} -x "${stagePath}" "${extractDir}"`, { stdio: 'inherit' });

  // 2. Repack
  console.log('\n--- Repack ---');
  const stageDir = join(extractDir, 'stage');
  execSync(`${rex} -p "${stageDir}" "${repackDir}"`, { stdio: 'inherit' });

  const repackedFile = join(repackDir, 'STAGE.DIR');

  // 3. Re-extract the repacked file
  console.log('\n--- Re-extract ---');
  execSync(`${rex} -x "${repackedFile}" "${unpackedDir}"`, { stdio: 'inherit' });

  // 4. Compare original vs repacked STAGE.DIR (binary)
  console.log('\n--- Compare STAGE.DIR files ---');
  const originalBuf = readFileSync(stagePath);
  const repackedBuf = readFileSync(repackedFile);

  console.log(`Original size:  ${originalBuf.length}`);
  console.log(`Repacked size:  ${repackedBuf.length}`);

  if (originalBuf.length !== repackedBuf.length) {
    console.error('FAIL: file sizes differ');
    process.exit(1);
  }

  if (!originalBuf.equals(repackedBuf)) {
    let firstDiff = -1;
    for (let i = 0; i < originalBuf.length; i++) {
      if (originalBuf[i] !== repackedBuf[i]) {
        firstDiff = i;
        break;
      }
    }
    console.error(`FAIL: files differ at byte ${firstDiff} (0x${firstDiff.toString(16)})`);
    process.exit(1);
  }

  console.log('PASS: STAGE.DIR files are identical');

  // 5. Compare extracted vs re-extracted files (content)
  console.log('\n--- Compare extracted files ---');
  const origFiles = walk(join(extractDir, 'stage'));
  const reextFiles = walk(join(unpackedDir, 'stage'));

  const origMap = new Map(origFiles.map(f => [f.replace(extractDir, ''), readFileSync(f)]));
  const reextMap = new Map(reextFiles.map(f => [f.replace(unpackedDir, ''), readFileSync(f)]));

  let match = 0;
  let mismatch = 0;
  let missing = 0;
  let extra = 0;

  for (const [rel, buf] of origMap) {
    if (!reextMap.has(rel)) {
      missing++;
      console.log(`  MISSING: ${rel}`);
      continue;
    }
    if (buf.equals(reextMap.get(rel))) {
      match++;
    } else {
      mismatch++;
      console.log(`  MISMATCH: ${rel}`);
    }
  }

  for (const rel of reextMap.keys()) {
    if (!origMap.has(rel)) {
      extra++;
      console.log(`  EXTRA: ${rel}`);
    }
  }

  console.log(`\nMatch: ${match}, Mismatch: ${mismatch}, Missing: ${missing}, Extra: ${extra}`);

  if (mismatch > 0 || missing > 0 || extra > 0) {
    console.error('FAIL: extracted files do not match');
    process.exit(1);
  }

  console.log('PASS: all extracted files match');
} finally {
  rmSync(work, { recursive: true, force: true });
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}
