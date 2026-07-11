import { mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join, resolve } from 'path';

function readPkg(): { name: string; version: string } {
  const candidates = [
    join(__dirname, '..', 'package.json'),
    join(dirname(process.argv[0]), '..', 'package.json'),
    join(process.cwd(), 'package.json')
  ];
  for (const p of candidates) {
    try {
      return JSON.parse(readFileSync(p, 'utf-8'));
    } catch {
      // impure
      continue;
    }
  }
  return { name: 'rex', version: 'unknown' };
}

const pkg = readPkg();

// --- CLI ---
console.log(`${pkg.name} v${pkg.version}`);
const args = process.argv.slice(2);

if (args.length < 1 || args.length > 2) {
  // impure
  console.log(`
Usage:
  ${pkg.name} <STAGE.DIR|file.dar> [OUTPUTDIRECTORY]
`);
  // impure
  process.exit(0);
}

const input = resolve(args[0]);
const output = args[1] ? resolve(args[1]) : dirname(input);
const ext = extname(input).toLowerCase();
const stem = basename(input).toUpperCase();

if (ext === '.dar') {
  // impure
  console.log(`Extracting DAR: ${input}`);
  // impure
  readDar(input, output);
}
if (ext === '.dir' && stem.includes('STAGE')) {
  // impure
  console.log(`Extracting STAGE: ${input}`);
  // impure
  readStage(input, output);
}

// impure
console.log('Exiting');

// --- Functions ---

type FsOp = () => void;

function readDar(input: string, output: string) {
  const ops: FsOp[] = [];
  const darDir = join(output, 'dar');
  // impure
  ops.push(() => mkdirSync(darDir, { recursive: true }));
  // impure
  const buffer = readFileSync(input);
  let pointer = 0;

  while (pointer < buffer.length) {
    const strcode = buffer.readUInt16LE(pointer);
    const extension = buffer.readUInt16LE(pointer + 2);
    const size = buffer.readUInt32LE(pointer + 4);
    const filename = `${hex(strcode)}.${extForID(extension)}`;
    // impure
    console.log(`  Parsing entry: ${filename} (${size} bytes)`);
    ops.push(() => {
      // impure
      mkdirSync(darDir, { recursive: true });
      // impure
      console.log(`  Writing: ${join(darDir, filename)}`);
      writeFileSync(
        join(darDir, filename),
        buffer.subarray(pointer + 8, pointer + 8 + size)
      );
    });
    pointer += size + 8;
  }

  for (const op of ops) {
    op();
  }
}

function readStage(input: string, outputDir: string, sector = 0x800) {
  const ops: FsOp[] = [];
  // impure
  const buf = readFileSync(input);
  const tableSize = buf.readUInt32LE(0);
  const numEntries = tableSize / 12;

  for (let index = 0; index < numEntries; index++) {
    const off = 4 + index * 12;
    const name = buf.toString('ascii', off, off + 8).split('\0')[0];
    const offset = buf.readUInt32LE(off + 8) * sector;
    // impure
    let nextOffset = buf.readUInt32LE(4 + (index + 1) * 12 + 8) * sector;
    if (index === numEntries - 1) {
      nextOffset = statSync(input).size;
    }
    const pageData = buf.subarray(offset, offset + nextOffset - offset);
    const stageDir = join(outputDir, 'stage', name);
    // impure
    console.log(`  Parsing stage: ${name} (${nextOffset - offset} bytes)`);
    ops.push(() => {
      // impure
      mkdirSync(stageDir, { recursive: true });
    });
    readStagePage(pageData, sector, stageDir, ops);
  }

  for (const op of ops) {
    op();
  }
}

function hex(value: number): string {
  return value.toString(16).padStart(6, '0');
}

function isDar(extension: number): boolean {
  return extension === 0x64;
}

function isSentinel(extension: number): boolean {
  return extension === 0xff;
}

function extForID(id: number): string {
  switch (id) {
    case 0x62:
      return 'bin';
    case 0x63:
      return 'con';
    case 0x64:
      return 'dar';
    case 0x65:
      return 'efx';
    case 0x67:
      return 'gcx';
    case 0x68:
      return 'hzm';
    case 0x69:
      return 'img';
    case 0x6b:
      return 'kmd';
    case 0x6c:
      return 'lit';
    case 0x6d:
      return 'mdx';
    case 0x6f:
      return 'oar';
    case 0x70:
      return 'pcx';
    case 0x72:
      return 'rar';
    case 0x73:
      return 'sgt';
    case 0x77:
      return 'wvx';
    case 0x7a:
      return 'zmd';
    default:
      return '';
  }
}

function align(offset: number, size: number): number {
  return (size - (offset % size)) % size;
}

function tagFileName(
  tag: { id: number; extension: number },
  fallback: string
): string {
  if (tag.id) {
    return `${hex(tag.id)}.${extForID(tag.extension)}`;
  }
  return fallback;
}

function darFallback(prefix: string, extension: number): string {
  if (isDar(extension)) {
    return `${prefix}.${extForID(extension)}`;
  }
  return `unknown.${extForID(extension)}`;
}

function readStagePage(
  data: Buffer,
  sector: number,
  outputDir: string,
  ops: FsOp[]
) {
  const cnfSize = data.readUInt16LE(0);
  // impure
  let dataPtr = cnfSize * sector;

  interface CnfTag {
    id: number;
    region: number;
    extension: number;
    offset: number;
  }

  const readTag = (off: number): CnfTag => ({
    id: data.readUInt16LE(off),
    region: data.readUInt8(off + 2),
    extension: data.readUInt8(off + 3),
    offset: data.readUInt32LE(off + 4)
  });

  let resDarCount = 0;
  let cacDarCount = 0;
  let section = data;

  let index = 0;
  while (true) {
    const tag = readTag(4 + index * 8);
    if (tag.region === 0) {
      break;
    }
    const nextTag = readTag(4 + (index + 1) * 8);

    switch (tag.region) {
      // end
      case 0x00: {
        if (isDar(tag.extension)) {
          // impure
          cacDarCount++;
        }
        const fallback = darFallback(`stg_tex${cacDarCount}`, tag.extension);
        const outName = tagFileName(tag, fallback);
        // impure
        console.log(`  Region: end, writing: ${outName}`);
        ops.push(() => {
          // impure
          mkdirSync(outputDir, { recursive: true });
          // impure
          console.log(`  Writing: ${join(outputDir, outName)}`);
          writeFileSync(
            join(outputDir, outName),
            data.subarray(dataPtr, dataPtr + tag.offset)
          );
        });
        // impure
        dataPtr += tag.offset + align(dataPtr + tag.offset, sector);
        break;
      }
      // nocache
      case 0x6e: {
        if (isDar(tag.extension)) {
          // impure
          cacDarCount++;
        }
        const fallback = darFallback(`stg_tex${cacDarCount}`, tag.extension);
        const outName = tagFileName(tag, fallback);
        // impure
        console.log(`  Region: nocache, writing: ${outName}`);
        ops.push(() => {
          // impure
          mkdirSync(outputDir, { recursive: true });
          // impure
          console.log(`  Writing: ${join(outputDir, outName)}`);
          writeFileSync(
            join(outputDir, outName),
            data.subarray(dataPtr, dataPtr + tag.offset)
          );
        });
        // impure
        dataPtr += tag.offset + align(dataPtr + tag.offset, sector);
        break;
      }
      // cache
      case 0x63: {
        if (!tag.offset) {
          // impure
          section = data.subarray(dataPtr);
        }
        if (isSentinel(tag.extension)) {
          // impure
          console.log(`  Region: cache, sentinel encountered`);
          dataPtr += tag.offset + align(dataPtr + tag.offset, sector);
          break;
        }
        if (isDar(tag.extension)) {
          // impure
          cacDarCount++;
        }
        const outName = isDar(tag.extension)
          ? `stg_tex${cacDarCount}.${extForID(tag.extension)}`
          : tagFileName(
              tag,
              `stg_tex${cacDarCount}.${extForID(tag.extension)}`
            );
        // impure
        console.log(`  Region: cache, writing: ${outName}`);
        ops.push(() => {
          // impure
          mkdirSync(outputDir, { recursive: true });
          // impure
          console.log(`  Writing: ${join(outputDir, outName)}`);
          writeFileSync(
            join(outputDir, outName),
            section.subarray(
              tag.offset,
              tag.offset + (nextTag.offset - tag.offset)
            )
          );
        });
        break;
      }
      // resident
      case 0x72: {
        const fallback = darFallback(`res_mdl${resDarCount}`, tag.extension);
        const outName = tagFileName(tag, fallback);
        // impure
        console.log(`  Region: resident, writing: ${outName}`);
        ops.push(() => {
          // impure
          mkdirSync(outputDir, { recursive: true });
          // impure
          console.log(`  Writing: ${join(outputDir, outName)}`);
          writeFileSync(
            join(outputDir, outName),
            data.subarray(dataPtr, dataPtr + tag.offset)
          );
        });
        if (isDar(tag.extension)) {
          // impure
          resDarCount++;
        }
        // impure
        dataPtr += tag.offset + align(dataPtr + tag.offset, sector);
        break;
      }
      // sound
      case 0x73: {
        if (isDar(tag.extension)) {
          // impure
          cacDarCount++;
        }
        const fallback = darFallback(`stg_tex${cacDarCount}`, tag.extension);
        const outName = tagFileName(tag, fallback);
        // impure
        console.log(`  Region: sound, writing: ${outName}`);
        ops.push(() => {
          // impure
          mkdirSync(outputDir, { recursive: true });
          // impure
          console.log(`  Writing: ${join(outputDir, outName)}`);
          writeFileSync(
            join(outputDir, outName),
            data.subarray(dataPtr, dataPtr + tag.offset)
          );
        });
        // impure
        dataPtr += tag.offset + align(dataPtr + tag.offset, sector);
        break;
      }
      default: {
        if (isDar(tag.extension)) {
          // impure
          cacDarCount++;
        }
        const fallback = darFallback(`stg_tex${cacDarCount}`, tag.extension);
        const outName = tagFileName(tag, fallback);
        // impure
        console.log(`  Region: unknown, writing: ${outName}`);
        ops.push(() => {
          // impure
          mkdirSync(outputDir, { recursive: true });
          // impure
          console.log(`  Writing: ${join(outputDir, outName)}`);
          writeFileSync(
            join(outputDir, outName),
            data.subarray(dataPtr, dataPtr + tag.offset)
          );
        });
        // impure
        dataPtr += tag.offset + align(dataPtr + tag.offset, sector);
        break;
      }
    }
    index++;
  }
}
