import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
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

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

function printUsage(): void {
  console.log(
    '\nUsage:\n' +
    '  rex [command] <input> [output]\n' +
    '\n' +
    'Commands:\n' +
    '  -x, --extract <file> [dir]     Extract a .dar or .dir file\n' +
    '  -p, --pack <directory> [file]  Re-pack a directory into a .dir file\n' +
    '  -h, --help                     Show this help message and exit\n' +
    '\n' +
    'Examples:\n' +
    '  rex -x file.dar ./output\n' +
    '  rex -x STAGE.DIR ./output\n' +
    '  rex -p ./extracted_dir output.dir\n' +
    '  rex -h\n'
  );
}

if (hasFlag('-h') || hasFlag('--help')) {
  printUsage();
  process.exit(0);
}

if (args.length < 2) {
  printUsage();
  process.exit(0);
}

if (hasFlag('-x') || hasFlag('--extract')) {
  const files = args.filter(a => !a.startsWith('-'));
  const input = resolve(files[0]);
  const output = files[1] ? resolve(files[1]) : dirname(input);
  const ext = extname(input).toLowerCase();

  if (ext === '.dar') {
    // impure
    console.log(`Extracting DAR: ${input}`);
    // impure
    readDar(input, output);
  } else if (ext === '.dir') {
    // impure
    console.log(`Extracting STAGE: ${input}`);
    // impure
    readStage(input, output);
  } else {
    // impure
    console.log(`Error: unsupported file type "${ext}" (expected .dar or .dir)`);
    process.exit(1);
  }
}

if (hasFlag('-p') || hasFlag('--pack')) {
  const files = args.filter(a => !a.startsWith('-'));
  const input = resolve(files[0]);
  const outputDir = files[1] ? resolve(files[1]) : input;
  const output = join(outputDir, 'STAGE.DIR');

  // impure
  console.log(`Packing directory: ${input}`);
  // impure
  writeStage(input, output);
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
    const p = pointer;
    ops.push(() => {
      // impure
      mkdirSync(darDir, { recursive: true });
      // impure
      console.log(`  Writing: ${join(darDir, filename)}`);
      writeFileSync(
        join(darDir, filename),
        buffer.subarray(p + 8, p + 8 + size)
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

  const pageOrder: { name: string; sector: number }[] = [];

  for (let index = 0; index < numEntries; index++) {
    const off = 4 + index * 12;
    const name = buf.toString('ascii', off, off + 8).split('\0')[0];
    const offsetSector = buf.readUInt32LE(off + 8);
    const offset = offsetSector * sector;
    // impure
    let nextOffset = buf.readUInt32LE(4 + (index + 1) * 12 + 8) * sector;
    if (index === numEntries - 1) {
      nextOffset = statSync(input).size;
    }
    const pageData = buf.subarray(offset, offset + nextOffset - offset);
    const stageDir = join(outputDir, 'stage', name);
    // impure
    pageOrder.push({ name, sector: offsetSector });
    // impure
    console.log(`  Parsing stage: ${name} (${nextOffset - offset} bytes)`);
    ops.push(() => {
      // impure
      mkdirSync(stageDir, { recursive: true });
    });
    readStagePage(pageData, sector, stageDir, ops);
  }

  const stageDir = join(outputDir, 'stage');
  // impure
  ops.push(() => {
    // impure
    mkdirSync(stageDir, { recursive: true });
    // impure
    writeFileSync(
      join(stageDir, '.rex.json'),
      JSON.stringify({ pages: pageOrder })
    );
  });

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

  interface TagMeta extends CnfTag {
    file: string | null;
  }

  const readTag = (off: number): CnfTag => ({
    id: data.readUInt16LE(off),
    region: data.readUInt8(off + 2),
    extension: data.readUInt8(off + 3),
    offset: data.readUInt32LE(off + 4)
  });

  const tags: TagMeta[] = [];
  let resDarCount = 0;
  let cacDarCount = 0;
  let section = data;

  let index = 0;
  while (true) {
    const tag = readTag(4 + index * 8);
    if (tag.region === 0) {
      // impure
      tags.push({ ...tag, file: null });
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
        tags.push({ ...tag, file: outName });
        // impure
        console.log(`  Region: end, writing: ${outName}`);
        const dp0 = dataPtr;
        ops.push(() => {
          // impure
          mkdirSync(outputDir, { recursive: true });
          // impure
          console.log(`  Writing: ${join(outputDir, outName)}`);
          writeFileSync(
            join(outputDir, outName),
            data.subarray(dp0, dp0 + tag.offset)
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
        tags.push({ ...tag, file: outName });
        // impure
        console.log(`  Region: nocache, writing: ${outName}`);
        const dp1 = dataPtr;
        ops.push(() => {
          // impure
          mkdirSync(outputDir, { recursive: true });
          // impure
          console.log(`  Writing: ${join(outputDir, outName)}`);
          writeFileSync(
            join(outputDir, outName),
            data.subarray(dp1, dp1 + tag.offset)
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
          tags.push({ ...tag, file: null });
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
        tags.push({ ...tag, file: outName });
        // impure
        console.log(`  Region: cache, writing: ${outName}`);
        const sectionRef = section;
        ops.push(() => {
          // impure
          mkdirSync(outputDir, { recursive: true });
          // impure
          console.log(`  Writing: ${join(outputDir, outName)}`);
          writeFileSync(
            join(outputDir, outName),
            sectionRef.subarray(
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
        tags.push({ ...tag, file: outName });
        // impure
        console.log(`  Region: resident, writing: ${outName}`);
        const dp2 = dataPtr;
        ops.push(() => {
          // impure
          mkdirSync(outputDir, { recursive: true });
          // impure
          console.log(`  Writing: ${join(outputDir, outName)}`);
          writeFileSync(
            join(outputDir, outName),
            data.subarray(dp2, dp2 + tag.offset)
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
        tags.push({ ...tag, file: outName });
        // impure
        console.log(`  Region: sound, writing: ${outName}`);
        const dp3 = dataPtr;
        ops.push(() => {
          // impure
          mkdirSync(outputDir, { recursive: true });
          // impure
          console.log(`  Writing: ${join(outputDir, outName)}`);
          writeFileSync(
            join(outputDir, outName),
            data.subarray(dp3, dp3 + tag.offset)
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
        tags.push({ ...tag, file: outName });
        // impure
        console.log(`  Region: unknown, writing: ${outName}`);
        const dp4 = dataPtr;
        ops.push(() => {
          // impure
          mkdirSync(outputDir, { recursive: true });
          // impure
          console.log(`  Writing: ${join(outputDir, outName)}`);
          writeFileSync(
            join(outputDir, outName),
            data.subarray(dp4, dp4 + tag.offset)
          );
        });
        // impure
        dataPtr += tag.offset + align(dataPtr + tag.offset, sector);
        break;
      }
    }
    index++;
  }

  const tagsSnapshot = tags.map(t => ({ ...t }));
  const headerWord = data.readUInt32LE(0);
  // impure
  ops.push(() => {
    // impure
    mkdirSync(outputDir, { recursive: true });
    // impure
    writeFileSync(
      join(outputDir, '.rex.json'),
      JSON.stringify({ header: headerWord, cnfSize, tags: tagsSnapshot })
    );
  });
}

function extToID(ext: string): number {
  switch (ext) {
    case 'bin':
      return 0x62;
    case 'con':
      return 0x63;
    case 'dar':
      return 0x64;
    case 'efx':
      return 0x65;
    case 'gcx':
      return 0x67;
    case 'hzm':
      return 0x68;
    case 'img':
      return 0x69;
    case 'kmd':
      return 0x6b;
    case 'lit':
      return 0x6c;
    case 'mdx':
      return 0x6d;
    case 'oar':
      return 0x6f;
    case 'pcx':
      return 0x70;
    case 'rar':
      return 0x72;
    case 'sgt':
      return 0x73;
    case 'wvx':
      return 0x77;
    case 'zmd':
      return 0x7a;
    default:
      return 0x64;
  }
}

function writeStage(inputDir: string, outputFile: string, sector = 0x800): void {
  const topLevelMetaPath = join(inputDir, '.rex.json');
  let pageNames: string[];

  if (existsSync(topLevelMetaPath)) {
    const topLevelMeta = JSON.parse(readFileSync(topLevelMetaPath, 'utf8'));
    pageNames = topLevelMeta.pages.map((p: { name: string }) => p.name);
  } else {
    pageNames = readdirSync(inputDir)
      .filter(name => {
        try { return statSync(join(inputDir, name)).isDirectory(); }
        catch { return false; }
      })
      .sort();
  }

  const pageBuffers: Buffer[] = [];

  for (const pageName of pageNames) {
    const pageDir = join(inputDir, pageName);
    const metaPath = join(pageDir, '.rex.json');

    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));

      const paddedHeaderSize = meta.cnfSize * sector;

      const readTagFile = (tag: { file: string | null }): Buffer | null => {
        if (!tag.file) return null;
        const fp = join(pageDir, tag.file);
        if (!existsSync(fp)) return null;
        return readFileSync(fp);
      };

      let dataOffset = paddedHeaderSize;
      let cacheSectionStart = -1;

      for (const tag of meta.tags) {
        if (tag.region === 0) break;

        if (tag.region === 0x63) {
          if (tag.offset === 0 && !isSentinel(tag.extension)) {
            cacheSectionStart = dataOffset;
          }
          if (isSentinel(tag.extension)) {
            dataOffset = cacheSectionStart + tag.offset + align(cacheSectionStart + tag.offset, sector);
            cacheSectionStart = -1;
          }
        } else {
          const buf = readTagFile(tag);
          if (buf) {
            dataOffset += buf.length + align(dataOffset + buf.length, sector);
          }
        }
      }

      const totalDataSize = dataOffset - paddedHeaderSize;
      const pageBufferSize = paddedHeaderSize + totalDataSize;
      const pageBuffer = Buffer.alloc(pageBufferSize);

      pageBuffer.writeUInt32LE(meta.header, 0);

      meta.tags.forEach((tag: { id: number; region: number; extension: number; offset: number; file: string | null }, i: number) => {
        const base = 4 + i * 8;
        pageBuffer.writeUInt16LE(tag.id, base);
        pageBuffer.writeUInt8(tag.region, base + 2);
        pageBuffer.writeUInt8(tag.extension, base + 3);
        pageBuffer.writeUInt32LE(tag.offset, base + 4);
      });

      dataOffset = paddedHeaderSize;
      cacheSectionStart = -1;

      for (const tag of meta.tags) {
        if (tag.region === 0) break;

        if (tag.region === 0x63) {
          if (tag.offset === 0 && !isSentinel(tag.extension)) {
            cacheSectionStart = dataOffset;
          }
          if (isSentinel(tag.extension)) {
            dataOffset = cacheSectionStart + tag.offset + align(cacheSectionStart + tag.offset, sector);
            cacheSectionStart = -1;
          } else if (cacheSectionStart >= 0) {
            const buf = readTagFile(tag);
            if (buf) {
              // impure
              buf.copy(pageBuffer, cacheSectionStart + tag.offset);
            }
          }
        } else {
          const buf = readTagFile(tag);
          if (buf) {
            // impure
            buf.copy(pageBuffer, dataOffset);
            dataOffset += buf.length + align(dataOffset + buf.length, sector);
          }
        }
      }

      // impure
      pageBuffers.push(pageBuffer);
      // impure
      console.log(`  Packing page: ${pageName} (${meta.tags.length} tags, ${pageBufferSize} bytes) [from .rex.json]`);
    } else {
      const files = readdirSync(pageDir)
        .filter(f => !f.startsWith('.'))
        .sort();

      const tagCount = files.length + 1;
      const headerSize = 4 + tagCount * 8;
      const paddedHeaderSize = Math.ceil(headerSize / sector) * sector;
      const cnfSizeSectors = paddedHeaderSize / sector;

      let totalDataSize = 0;
      const fileBuffers: Buffer[] = [];
      for (const filename of files) {
        const buf = readFileSync(join(pageDir, filename));
        fileBuffers.push(buf);
        totalDataSize += buf.length + align(totalDataSize + buf.length, sector);
      }

      const pageBufferSize = paddedHeaderSize + totalDataSize;
      const pageBuffer = Buffer.alloc(pageBufferSize);

      pageBuffer.writeUInt16LE(cnfSizeSectors, 0);
      pageBuffer.writeUInt16LE(0, 2);

      fileBuffers.forEach((buf, i) => {
        const base = 4 + i * 8;
        const filename = files[i];
        const ext = extname(filename).slice(1).toLowerCase();
        const stem = basename(filename, '.' + ext);
        const hexMatch = stem.match(/^([0-9a-f]{6})$/i);
        const id = hexMatch ? parseInt(hexMatch[1], 16) : 0;

        pageBuffer.writeUInt16LE(id, base);
        pageBuffer.writeUInt8(0x6e, base + 2);
        pageBuffer.writeUInt8(extToID(ext), base + 3);
        pageBuffer.writeUInt32LE(buf.length, base + 4);
      });

      const sentBase = 4 + files.length * 8;
      pageBuffer.writeUInt16LE(0, sentBase);
      pageBuffer.writeUInt8(0x00, sentBase + 2);
      pageBuffer.writeUInt8(0xff, sentBase + 3);
      pageBuffer.writeUInt32LE(0, sentBase + 4);

      let dataOffset = paddedHeaderSize;
      for (const buf of fileBuffers) {
        // impure
        buf.copy(pageBuffer, dataOffset);
        dataOffset += buf.length + align(dataOffset + buf.length, sector);
      }

      // impure
      pageBuffers.push(pageBuffer);
      // impure
      console.log(`  Packing page: ${pageName} (${files.length} files, ${pageBufferSize} bytes)`);
    }
  }

  const tableSize = pageNames.length * 12;
  const tableRawSize = 4 + tableSize;
  const tableBufferSize = Math.ceil(tableRawSize / sector) * sector;
  const totalBufferSize = tableBufferSize + pageBuffers.reduce((sum, b) => sum + b.length, 0);
  const outBuffer = Buffer.alloc(totalBufferSize);

  outBuffer.writeUInt32LE(tableSize, 0);

  let tableOffset = 4;
  let pageOffsetSectors = tableBufferSize / sector;

  for (let i = 0; i < pageNames.length; i++) {
    // impure
    outBuffer.write(pageNames[i].substring(0, 8), tableOffset, 'ascii');
    outBuffer.writeUInt32LE(pageOffsetSectors, tableOffset + 8);
    tableOffset += 12;
    pageOffsetSectors += pageBuffers[i].length / sector;
  }

  let writePos = tableBufferSize;
  for (const pageBuffer of pageBuffers) {
    // impure
    pageBuffer.copy(outBuffer, writePos);
    writePos += pageBuffer.length;
  }

  // impure
  mkdirSync(dirname(outputFile), { recursive: true });
  // impure
  writeFileSync(outputFile, outBuffer);
}
