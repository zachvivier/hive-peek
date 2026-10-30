#!/usr/bin/env node
// Zips datapack/ into dist/hive-peek-<version>.zip, ready to drop into a world's datapacks folder.
//
//   node build.js 1.0.0
//
// No dependencies; needs Node 22+ (for zlib.crc32).

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const version = process.argv[2];
if (!version) {
  console.error('Usage: node build.js <version>');
  process.exit(2);
}

const src = path.join(__dirname, 'datapack');
const out = path.join(__dirname, 'dist', `hive-peek-${version}.zip`);

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(full) : [full];
  });
}

// Minimal zip writer: deflated entries, forward-slash paths, fixed timestamp so builds are reproducible
const DOS_TIME = 0;
const DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1;
const locals = [];
const centrals = [];
let offset = 0;

for (const file of listFiles(src).sort()) {
  const name = Buffer.from(path.relative(src, file).split(path.sep).join('/'));
  const data = fs.readFileSync(file);
  const packed = zlib.deflateRawSync(data, { level: 9 });
  const crc = zlib.crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  locals.push(local, name, packed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, name);

  offset += local.length + name.length + packed.length;
}

const centralSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(centrals.length / 2, 8);
end.writeUInt16LE(centrals.length / 2, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([...locals, ...centrals, end]));
console.log(`Wrote ${path.relative(__dirname, out)}`);
