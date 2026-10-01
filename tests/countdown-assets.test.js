import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ROCKETS } from '../src/fleet-data.js';
import { getMission } from '../src/fleet-simulation.js';

const directory = new URL('../public/assets/countdown/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory), 'utf8'));

test('countdown speech is bundled locally, has verified samples and fits each one-second beat', () => {
  assert.equal(manifest.clips.length, 12);
  const expected = [...Array.from({ length: 10 }, (_, i) => `count-${i + 1}`), 'ignition', 'liftoff'];
  assert.deepEqual(
    manifest.clips.map((clip) => clip.cue),
    expected,
  );
  for (const clip of manifest.clips) {
    const audio = readFileSync(new URL(clip.file, directory));
    assert.equal(audio.toString('ascii', 0, 4), 'RIFF');
    assert.equal(audio.toString('ascii', 8, 12), 'WAVE');
    assert.equal(audio.readUInt16LE(20), 1);
    assert.equal(audio.readUInt16LE(22), 1);
    assert.equal(audio.readUInt32LE(24), 22050);
    assert.equal(audio.readUInt16LE(34), 16);
    assert.equal(audio.length, clip.bytes);
    assert.equal(createHash('sha256').update(audio).digest('hex'), clip.sha256);
    const seconds = audio.readUInt32LE(40) / (22050 * 2);
    assert.ok(seconds > 0.1 && seconds < (clip.cue.startsWith('count-') ? 0.95 : 1.15));
    assert.ok(Math.abs(seconds - clip.seconds) < 0.0001);
    let energy = 0;
    for (let i = 44; i < audio.length; i += 2) energy += Math.abs(audio.readInt16LE(i));
    assert.ok(energy > 100000, 'speech file must not be silent');
  }
});

test('all eight missions have recorded cues through ignition and liftoff without shifting flight events', () => {
  const cues = new Set(manifest.clips.map((clip) => clip.cue));
  for (const rocket of ROCKETS) {
    const mission = getMission(rocket.id),
      ignition = mission.events.find((e) => e.id === 'ignition');
    assert.ok(ignition.time < 0);
    assert.equal(mission.events.find((e) => e.id === 'liftoff').time, 0);
    for (let number = Math.ceil(ignition.time + 10); number >= 1; number--)
      assert.ok(cues.has(`count-${number}`));
    assert.ok(cues.has('ignition'));
    assert.ok(cues.has('liftoff'));
  }
});
