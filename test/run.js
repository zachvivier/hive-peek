#!/usr/bin/env node
// Runs Hive Peek on real vanilla servers and checks the labels it makes.
//
//   node test/run.js 26.3 1.21.9
//
// Downloads each server jar from Mojang into test/.cache, starts it with a fresh
// world containing the pack, drives it over RCON, then shuts it down.
// Needs Node 22+ and Java 25 (set JAVA to pick a specific java binary).
// Set HIVE_PEEK_ZIP to a built zip to test that instead of the datapack/ folder.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(__dirname, '.cache');
const JAVA = process.env.JAVA || 'java';
const RCON_PORT = 25598;
const RCON_PASSWORD = 'hive-peek-test';
const BEE = '{entity_data:{id:"minecraft:bee"},ticks_in_hive:0,min_ticks_in_hive:99999999}';

async function getServerJar(version) {
  const jar = path.join(CACHE, version, 'server.jar');
  if (fs.existsSync(jar)) return jar;
  const manifest = await (await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')).json();
  const entry = manifest.versions.find((v) => v.id === version);
  if (!entry) throw new Error(`Unknown Minecraft version ${version}`);
  const meta = await (await fetch(entry.url)).json();
  fs.mkdirSync(path.dirname(jar), { recursive: true });
  fs.writeFileSync(jar, Buffer.from(await (await fetch(meta.downloads.server.url)).arrayBuffer()));
  return jar;
}

function prepareServerDir(version) {
  const dir = path.join(CACHE, version, 'run');
  fs.rmSync(dir, { recursive: true, force: true });
  const packs = path.join(dir, 'world', 'datapacks');
  fs.mkdirSync(packs, { recursive: true });
  if (process.env.HIVE_PEEK_ZIP) {
    fs.copyFileSync(process.env.HIVE_PEEK_ZIP, path.join(packs, 'hive_peek.zip'));
  } else {
    fs.cpSync(path.join(ROOT, 'datapack'), path.join(packs, 'hive_peek'), { recursive: true });
  }
  fs.cpSync(path.join(__dirname, 'fixtures', 'hive_peek_test'), path.join(packs, 'hive_peek_test'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'eula.txt'), 'eula=true\n');
  fs.writeFileSync(path.join(dir, 'server.properties'), [
    'online-mode=false',
    'server-port=25599',
    'level-type=minecraft\\:flat',
    'generate-structures=false',
    'enable-rcon=true',
    `rcon.port=${RCON_PORT}`,
    `rcon.password=${RCON_PASSWORD}`,
    'spawn-protection=0',
    'view-distance=4',
    'simulation-distance=4',
    'pause-when-empty-seconds=-1',
  ].join('\n') + '\n');
  return dir;
}

function startServer(jar, dir) {
  const proc = spawn(JAVA, ['-Xmx2G', '-jar', jar, '--nogui'], { cwd: dir });
  const log = fs.createWriteStream(path.join(dir, 'server.log'));
  proc.stdout.pipe(log);
  proc.stderr.pipe(log);
  const ready = new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error('Server did not start within 180s')), 180_000);
    proc.stdout.on('data', (d) => {
      out += d;
      // RCON comes up just after the "Done" line
      if (/RCON running on/.test(out)) { clearTimeout(timer); resolve(); }
    });
    proc.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited early (code ${code}), see ${dir}/server.log`)); });
  });
  return { proc, ready };
}

class Rcon {
  static connect() {
    return new Promise((resolve, reject) => {
      const rcon = new Rcon(net.connect(RCON_PORT, '127.0.0.1'));
      rcon.socket.once('error', reject);
      rcon.socket.once('connect', () => rcon.send(3, RCON_PASSWORD).then(() => resolve(rcon), reject));
    });
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.buf = Buffer.alloc(0);
    socket.on('data', (d) => {
      this.buf = Buffer.concat([this.buf, d]);
      while (this.buf.length >= 4 && this.buf.length >= this.buf.readInt32LE(0) + 4) {
        const len = this.buf.readInt32LE(0);
        const id = this.buf.readInt32LE(4);
        const body = this.buf.toString('utf8', 12, 4 + len - 2);
        this.buf = this.buf.subarray(4 + len);
        this.pending.get(id)?.(body);
        this.pending.delete(id);
      }
    });
  }

  send(type, body) {
    const id = this.nextId++;
    const payload = Buffer.from(body, 'utf8');
    const packet = Buffer.alloc(14 + payload.length);
    packet.writeInt32LE(10 + payload.length, 0);
    packet.writeInt32LE(id, 4);
    packet.writeInt32LE(type, 8);
    payload.copy(packet, 12);
    this.socket.write(packet);
    return new Promise((resolve) => this.pending.set(id, resolve));
  }

  run(command) {
    return this.send(2, command);
  }

  close() {
    this.socket.end();
  }
}

// Reads the labels test:look dumped into storage
async function look(rcon) {
  if (!(await rcon.run('execute if entity @e[type=armor_stand,tag=eye]')).includes('Test passed')) {
    throw new Error('The test armor stand went missing');
  }
  await rcon.run('function test:look');
  const out = await rcon.run('data get storage test:out labels');
  const labels = [];
  const re = /pos: \[([-\d.E]+)d, ([-\d.E]+)d, ([-\d.E]+)d\], rot: \[([-\d.E]+)f, ([-\d.E]+)f\], text: \{[^}]*text: "([^"]*)"/g;
  for (const m of out.matchAll(re)) {
    labels.push({ pos: [+m[1], +m[2], +m[3]], yaw: +m[4], text: m[6] });
  }
  return labels;
}

async function waitFor(rcon, command, expected, what) {
  for (let i = 0; i < 100; i++) {
    if ((await rcon.run(command)).includes(expected)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

const near = (a, b) => Math.abs(a - b) < 0.001;
const sameYaw = (a, b) => near(((a - b) % 360 + 360) % 360, 0) || near(((a - b) % 360 + 360) % 360, 360);

async function runChecks(rcon) {
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok, detail });

  const enabled = await rcon.run('datapack list enabled');
  check('pack is enabled', /file\/hive_peek(\.zip)? \(world\)/.test(enabled), enabled);
  const objectives = await rcon.run('scoreboard objectives list');
  check('load function ran', objectives.includes('[hive_peek]'), objectives);
  const tick = await rcon.run('function hive_peek:tick');
  check('tick function runs', !/Unknown|Incorrect|error/i.test(tick), tick);

  await rcon.run('forceload add -16 -16 16 16');
  await waitFor(rcon, 'execute if loaded -16 64 -16 if loaded -16 64 16 if loaded 16 64 -16 if loaded 16 64 16', 'Test passed', 'chunks to load');
  await rcon.run('summon minecraft:armor_stand 0.5 64 3.5 {Tags:["eye"],NoGravity:1b,Invulnerable:1b}');
  await waitFor(rcon, 'execute if entity @e[type=armor_stand,tag=eye]', 'Test passed', 'armor stand');

  // Hive at 0 64 0. For each facing, the viewer stands in front of it looking at the face.
  const cases = [
    { facing: 'south', block: 'beehive', bees: 2, eye: '0.5 64 3.5 180 30', pos: [0.22, 64.64, 1.003], yaw: 0 },
    { facing: 'north', block: 'bee_nest', bees: 0, eye: '0.5 64 -2.5 0 30', pos: [0.78, 64.64, -0.003], yaw: 180 },
    { facing: 'east', block: 'beehive', bees: 1, eye: '3.5 64 0.5 90 30', pos: [1.003, 64.64, 0.78], yaw: -90 },
    { facing: 'west', block: 'bee_nest', bees: 3, eye: '-2.5 64 0.5 -90 30', pos: [-0.003, 64.64, 0.22], yaw: 90 },
  ];
  for (const c of cases) {
    const bees = Array(c.bees).fill(BEE).join(',');
    await rcon.run(`setblock 0 64 0 minecraft:${c.block}[facing=${c.facing}]{bees:[${bees}]}`);
    await rcon.run(`tp @e[tag=eye] ${c.eye}`);
    const labels = await look(rcon);
    const l = labels[0];
    const ok = labels.length === 1 && l.text === String(c.bees)
      && c.pos.every((v, i) => near(v, l.pos[i])) && sameYaw(l.yaw, c.yaw);
    check(`${c.block} facing ${c.facing} with ${c.bees} bees`, ok, JSON.stringify(labels));
  }

  // Count changes on a label that already exists
  await rcon.run(`setblock 0 64 0 minecraft:beehive[facing=south]{bees:[${BEE}]}`);
  await rcon.run('tp @e[tag=eye] 0.5 64 3.5 180 30');
  await look(rcon);
  await rcon.run(`data modify block 0 64 0 bees append value ${BEE}`);
  let labels = await look(rcon);
  check('label updates when a bee enters', labels.length === 1 && labels[0].text === '2', JSON.stringify(labels));
  await rcon.run('data modify block 0 64 0 bees set value []');
  labels = await look(rcon);
  check('label updates when bees leave', labels.length === 1 && labels[0].text === '0', JSON.stringify(labels));

  // A wall between the viewer and the hive, tall enough to cross the line of sight
  await rcon.run('fill 0 64 2 0 66 2 minecraft:stone');
  labels = await look(rcon);
  check('no label when a block is in the way', labels.length === 0, JSON.stringify(labels));
  await rcon.run('fill 0 64 2 0 66 2 minecraft:air');

  await rcon.run('tp @e[tag=eye] 0.5 64 3.5 0 30');
  labels = await look(rcon);
  check('label disappears when looking away', labels.length === 0, JSON.stringify(labels));

  await rcon.run('tp @e[tag=eye] 0.5 64 6.5 180 15');
  labels = await look(rcon);
  check('no label when out of reach', labels.length === 0, JSON.stringify(labels));

  await rcon.run('setblock 0 64 0 minecraft:oak_planks');
  await rcon.run('tp @e[tag=eye] 0.5 64 3.5 180 30');
  labels = await look(rcon);
  check('no label on other blocks', labels.length === 0, JSON.stringify(labels));

  await rcon.run(`setblock 0 64 0 minecraft:beehive[facing=south]{bees:[${BEE}]}`);
  await look(rcon);
  await rcon.run('function hive_peek:uninstall');
  const leftovers = await rcon.run('execute if entity @e[type=text_display,tag=hive_peek.label]');
  const after = await rcon.run('scoreboard objectives list');
  check('uninstall removes labels and the scoreboard', !leftovers.includes('Test passed') && !after.includes('[hive_peek]'), `${leftovers} / ${after}`);

  return results;
}

async function testVersion(version) {
  const jar = await getServerJar(version);
  const dir = prepareServerDir(version);
  const { proc, ready } = startServer(jar, dir);
  try {
    await ready;
    const rcon = await Rcon.connect();
    try {
      return await runChecks(rcon);
    } finally {
      await rcon.run('stop');
      rcon.close();
    }
  } finally {
    await new Promise((resolve) => {
      if (proc.exitCode !== null) return resolve();
      const timer = setTimeout(() => { proc.kill(); resolve(); }, 30_000);
      proc.on('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
}

async function main() {
  const versions = process.argv.slice(2);
  if (versions.length === 0) {
    console.error('Usage: node test/run.js <minecraft version> [more versions...]');
    process.exit(2);
  }
  let failed = 0;
  for (const version of versions) {
    console.log(`\n== Minecraft ${version}`);
    let results;
    try {
      results = await testVersion(version);
    } catch (err) {
      console.log(`  FAIL  ${err.message}`);
      failed++;
      continue;
    }
    for (const r of results) {
      console.log(`  ${r.ok ? 'pass' : 'FAIL'}  ${r.name}`);
      if (!r.ok) {
        console.log(`        ${r.detail.replace(/\n/g, ' ')}`);
        failed++;
      }
    }
  }
  console.log(failed ? `\n${failed} failure(s)` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
}

main();
