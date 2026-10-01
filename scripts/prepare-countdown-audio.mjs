// Trim SAPI padding so each short spoken cue fits its one-second visual beat.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const directory = new URL('../public/assets/countdown/', import.meta.url);
const cues = [...Array.from({ length: 10 }, (_, i) => `count-${i + 1}`), 'ignition', 'liftoff'];
const manifest = [];
for (const cue of cues) {
  const url = new URL(`${cue}.wav`, directory);
  const source = await readFile(url);
  if (source.toString('ascii', 0, 4) !== 'RIFF' || source.toString('ascii', 8, 12) !== 'WAVE')
    throw new Error(`Not a WAV: ${cue}`);
  let fmt, data;
  for (let position = 12; position + 8 <= source.length; ) {
    const size = source.readUInt32LE(position + 4);
    const id = source.toString('ascii', position, position + 4);
    if (id === 'fmt ') fmt = source.subarray(position + 8, position + 8 + size);
    if (id === 'data') data = source.subarray(position + 8, position + 8 + size);
    position += 8 + size + (size % 2);
  }
  if (!fmt || !data || fmt.readUInt16LE(0) !== 1 || fmt.readUInt16LE(2) !== 1 || fmt.readUInt16LE(14) !== 16)
    throw new Error(`Expected PCM16 mono: ${cue}`);
  const sampleRate = fmt.readUInt32LE(4),
    samples = data.length / 2;
  let first = 0,
    last = samples - 1,
    peak = 0;
  while (first < samples && Math.abs(data.readInt16LE(first * 2)) < 120) first++;
  while (last > first && Math.abs(data.readInt16LE(last * 2)) < 120) last--;
  if (first >= samples) throw new Error(`Silent speech: ${cue}`);
  first = Math.max(0, first - Math.round(sampleRate * 0.025));
  last = Math.min(samples - 1, last + Math.round(sampleRate * 0.065));
  const pcm = Buffer.from(data.subarray(first * 2, (last + 1) * 2));
  for (let i = 0; i < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
  const gain = Math.min(2.5, 26000 / Math.max(peak, 1));
  const fade = Math.round(sampleRate * 0.004),
    length = pcm.length / 2;
  for (let i = 0; i < length; i++) {
    const envelope = Math.min(1, i / fade, (length - 1 - i) / fade);
    pcm.writeInt16LE(Math.round(pcm.readInt16LE(i * 2) * gain * envelope), i * 2);
  }
  const duration = length / sampleRate;
  if (duration > (cue.startsWith('count-') ? 0.95 : 1.15))
    throw new Error(`Cue is too long for its beat: ${cue} ${duration}`);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(pcm.length + 36, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  fmt.copy(header, 20, 0, 16);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  const result = Buffer.concat([header, pcm]);
  await writeFile(url, result);
  manifest.push({
    cue,
    file: `${cue}.wav`,
    seconds: Number(duration.toFixed(4)),
    bytes: result.length,
    sha256: createHash('sha256').update(result).digest('hex'),
  });
}
await writeFile(
  new URL('manifest.json', directory),
  JSON.stringify({ voice: 'Microsoft Kangkang', sampleRate: 22050, clips: manifest }, null, 2) + '\n',
);
console.log(JSON.stringify(manifest.map(({ cue, seconds }) => ({ cue, seconds }))));
