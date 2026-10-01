/**
 * Falcon 9 educational flight model.
 * Event times: SpaceX Falcon User's Guide (2025), table 10-4, sample LEO mission.
 * https://www.spacex.com/assets/media/falcon-users-guide-2025-05-09.pdf
 *
 * Altitude, velocity, pitch, and downrange use illustrative keyframe interpolation.
 * They are NOT telemetry, guidance predictions, or an orbital dynamics solution.
 * The first-stage return to land is a separate educational illustration. Its burns
 * and touchdown time are not part of the official sample mission timeline.
 */

export const DURATION = 3390;
const START_TIME = -10;
const DEG = Math.PI / 180;

export const EVENTS = Object.freeze([
  { id: 'ignition', time: -3, label: '一级发动机点火', detail: '官方 LEO 示例：发动机启动序列开始，火箭仍留在发射台。' },
  { id: 'liftoff', time: 0, label: '火箭离台', detail: '任务时间 T+0，开始上升。' },
  { id: 'max-q', time: 67, label: '最大动压', detail: '官方示例的 Max-Q 时刻；画面中的飞行数据为教学插值。' },
  { id: 'meco', time: 145, label: '一级发动机关机', detail: 'MECO：一级主发动机关机，随后进行级间分离。' },
  { id: 'stage-separation', time: 148, label: '一、二级分离', detail: '二级继续飞行；一级进入独立的示意返航过程。' },
  { id: 'ses-1', time: 156, label: '二级首次点火', detail: 'SES-1：二级真空发动机开始工作。' },
  { id: 'fairing-separation', time: 195, label: '整流罩分离', detail: '整流罩两半分离，露出载荷。' },
  { id: 'seco-1', time: 514, label: '二级首次关机', detail: 'SECO-1：结束第一段推进，进入无主发动机推力的滑行阶段。' },
  { id: 'ses-2', time: 3086, label: '二级再次点火', detail: 'SES-2：官方示例中的第二次二级点火。' },
  { id: 'seco-2', time: 3090, label: '二级再次关机', detail: 'SECO-2：结束第二段推进，准备载荷部署。' },
  { id: 'payload-deployment', time: 3390, label: '载荷部署', detail: '官方示例任务抵达载荷分离时刻；本次科普体验完成。' },
].map(Object.freeze));

// [seconds, altitude metres, velocity metres/second, downrange metres, pitch degrees]
const FLIGHT_FRAMES = [
  [0, 0, 0, 0, 0],
  [10, 180, 40, 0, 0],
  [30, 2100, 150, 150, 3],
  [67, 13000, 450, 4000, 12],
  [100, 32000, 1000, 23000, 28],
  [145, 65000, 1850, 70000, 45],
  [148, 68000, 1900, 75000, 46],
  [156, 76000, 1930, 90000, 48],
  [195, 115000, 2600, 170000, 60],
  [300, 180000, 4200, 500000, 75],
  [514, 200000, 7600, 1800000, 90],
  [3086, 200000, 7650, 21450000, 90],
  [3090, 205000, 7700, 21490000, 90],
  [DURATION, 210000, 7700, 23800000, 90],
];

// Separate illustrative return-to-land track, NOT a claimed real Falcon 9 landing.
// [seconds, altitude metres, downrange metres, pitch degrees]
const BOOSTER_FRAMES = [
  [148, 68000, 75000, 46],
  [170, 90000, 110000, 135],
  [180, 99000, 120000, 160],
  [210, 120000, 135000, 120],
  [250, 115000, 110000, 30],
  [340, 55000, 40000, 15],
  [365, 37000, 25000, 8],
  [430, 8000, 3500, 3],
  [450, 2500, 1000, 1.5],
  [470, 300, 80, 0],
  [480, 0, 0, 0],
];

function clampTime(time) {
  if (typeof time !== 'number' || Number.isNaN(time)) return START_TIME;
  return Math.min(DURATION, Math.max(START_TIME, time));
}

function interpolate(frames, time) {
  if (time <= frames[0][0]) return frames[0].slice(1);
  for (let i = 1; i < frames.length; i += 1) {
    const right = frames[i];
    if (time <= right[0]) {
      const left = frames[i - 1];
      const fraction = (time - left[0]) / (right[0] - left[0]);
      return left.slice(1).map((value, index) => value + (right[index + 1] - value) * fraction);
    }
  }
  return frames[frames.length - 1].slice(1);
}

function phaseAt(time) {
  if (time < -3) return '发射准备';
  if (time < 0) return '发动机点火';
  if (time < 67) return '起飞与爬升';
  if (time < 145) return '通过最大动压';
  if (time < 148) return '一级关机';
  if (time < 156) return '级间分离';
  if (time < 195) return '二级推进';
  if (time < 514) return '整流罩分离后推进';
  if (time < 3086) return '轨道滑行';
  if (time < 3090) return '二级再次点火';
  if (time < DURATION) return '等待载荷部署';
  return '载荷部署完成';
}

/** Sample independently of previous frames; all angles are radians from vertical. */
export function sampleFlight(requestedTime) {
  const time = clampTime(requestedTime);
  const [altitude, velocity, downrange, pitchDegrees] = interpolate(FLIGHT_FRAMES, time);
  const pitch = pitchDegrees * DEG;
  const firstEngineOn = time >= -3 && time < 145;
  const separated = time >= 148;
  let booster;

  if (!separated) {
    booster = { altitude, downrange, pitch, engineOn: firstEngineOn, landed: false };
  } else {
    const [boosterAltitude, boosterDownrange, boosterPitch] = interpolate(BOOSTER_FRAMES, time);
    booster = {
      altitude: boosterAltitude,
      downrange: boosterDownrange,
      pitch: boosterPitch * DEG,
      engineOn: (time >= 180 && time < 215)
        || (time >= 340 && time < 365)
        || (time >= 450 && time < 480),
      landed: time >= 480,
    };
  }

  return {
    time,
    phase: phaseAt(time),
    altitude,
    velocity,
    downrange,
    pitch,
    firstEngineOn,
    secondEngineOn: (time >= 156 && time < 514) || (time >= 3086 && time < 3090),
    separated,
    fairingSeparated: time >= 195,
    deployed: time >= DURATION,
    stageSeparationElapsed: Math.max(0, time - 148),
    fairingElapsed: Math.max(0, time - 195),
    deploymentElapsed: Math.max(0, time - DURATION),
    booster,
  };
}

export class LaunchSimulation {
  constructor() {
    this.reset();
  }

  /** Start or resume; a completed mission requires reset before another launch. */
  launch() {
    if (this.time >= DURATION) {
      this.status = 'complete';
    } else {
      this.status = 'running';
    }
    this.lastEvents = [];
    return this.state;
  }

  /** Toggle an active mission. Ready and complete missions are unchanged. */
  togglePause() {
    if (this.status === 'running') this.status = 'paused';
    else if (this.status === 'paused') this.launch();
    this.lastEvents = [];
    return this.state;
  }

  reset() {
    this.time = START_TIME;
    this.rate = 1;
    this.status = 'ready';
    this.lastEvents = [];
    return this.state;
  }

  /** Scrub to an absolute mission time and pause, including at the final frame. */
  seek(time) {
    this.time = clampTime(time);
    this.status = 'paused';
    this.lastEvents = [];
    return this.state;
  }

  setRate(rate) {
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      throw new RangeError('Playback rate must be a finite number greater than zero.');
    }
    this.rate = rate;
    return this.rate;
  }

  /** Advance by real elapsed seconds. Invalid/negative deltas do not advance. */
  update(deltaSeconds) {
    this.lastEvents = [];
    if (this.status !== 'running'
      || typeof deltaSeconds !== 'number'
      || !Number.isFinite(deltaSeconds)
      || deltaSeconds <= 0) return this.state;

    const previousTime = this.time;
    this.time = Math.min(DURATION, previousTime + deltaSeconds * this.rate);
    this.lastEvents = EVENTS.filter((event) => event.time > previousTime && event.time <= this.time);
    if (this.time >= DURATION) this.status = 'complete';
    return this.state;
  }

  /** Complete current event history, reconstructed correctly after backwards seek. */
  get events() {
    return EVENTS.filter((event) => event.time <= this.time);
  }

  get state() {
    return sampleFlight(this.time);
  }
}
