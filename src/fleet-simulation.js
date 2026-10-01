import { EVENTS as FALCON9_EVENTS, DURATION as FALCON9_DURATION, sampleFlight } from './simulation.js';
import { missionAnimationTimes } from './mission-timeline.js';

/**
 * Multi-vehicle educational missions. Only Falcon 9 reuses the documented
 * example timeline in simulation.js. Every other timestamp, flight keyframe,
 * burn duration and recovery animation below is authored for teaching and is
 * neither a historical flight reconstruction nor a prediction of performance.
 */
const START_TIME = -10;
const DEG = Math.PI / 180;
const TEACHING_NOTE = '教学编排：时刻与运动轨迹为展示流程而设定，不是实飞任务记录。';

function event(id, time, label, detail) {
  return Object.freeze({ id, time, label, detail: `${detail} ${TEACHING_NOTE}` });
}

function defineMission(metadata, events) {
  return Object.freeze({
    accuracy: TEACHING_NOTE,
    hasRecovery: false,
    recoveryTime: null,
    stageSeparationTime: null,
    fairingTime: null,
    boosterTime: null,
    kind: 'satellite',
    completionLabel: '载荷分离演示完成',
    ...metadata,
    events: Object.freeze(events),
  });
}

const MISSIONS = Object.freeze({
  falcon9: defineMission({
    id: 'falcon9', duration: FALCON9_DURATION,
    label: '猎鹰 9 号 · 官方 LEO 示例',
    description: '保留原有官方 LEO 示例事件顺序，并演示两级推进和独立的一级返航。',
    accuracy: '事件时刻来自原有 SpaceX 官方 LEO 示例；轨迹、速度与一级陆地回收均为教学插值，不是实飞遥测。',
    hasRecovery: true, recoveryTime: 480, stageSeparationTime: 148, fairingTime: 195,
    completionLabel: '载荷部署完成',
  }, FALCON9_EVENTS),

  'falcon-heavy': defineMission({
    id: 'falcon-heavy', duration: 1080,
    label: '重型猎鹰 · 三芯级教学任务',
    description: '侧助推器先分离，中心芯级继续推进，再与二级分离。芯级返航是独立教学情景，不代表某次真实任务。',
    accuracy: `${TEACHING_NOTE} 芯级回收为独立的假设教学情景；不代表实际任务的回收方式或成功结果。`,
    hasRecovery: true, recoveryTime: 480, stageSeparationTime: 210,
    fairingTime: 245, boosterTime: 155,
  }, [
    event('ignition', -4, '三芯级发动机点火', '中央芯级与两枚侧助推器进入启动序列。'),
    event('liftoff', 0, '重型猎鹰离台', '三芯级共同提供起飞推力。'),
    event('max-q', 72, '最大动压阶段', '经过教学任务中的最大气动载荷阶段。'),
    event('booster-cutoff', 150, '侧助推器关机', '侧助推器结束推进，中心芯级继续工作。'),
    event('booster-separation', 155, '两枚侧助推器分离', '侧助推器先于中心芯级离开组合体。'),
    event('meco', 205, '中心芯级关机', '中心芯级完成本段推进。'),
    event('stage-separation', 210, '中心芯级与二级分离', '上面级继续执行载荷运送；芯级开始独立教学返航。'),
    event('ses-1', 218, '二级首次点火', '二级接替中心芯级继续推进。'),
    event('fairing-separation', 245, '整流罩分离', '两半整流罩离开载荷。'),
    event('recovery-complete', 480, '芯级教学回收结束', '此陆地回收演示独立于真实飞行任务，不代表实际芯级回收方案。'),
    event('seco-1', 540, '二级首次关机', '进入教学任务的无动力滑行段。'),
    event('ses-2', 960, '二级再次点火', '展示二级再次启动。'),
    event('seco-2', 990, '二级再次关机', '准备释放载荷。'),
    event('payload-deployment', 1080, '载荷分离', '完成本次教学任务的载荷释放。'),
  ]),

  starship: defineMission({
    id: 'starship', duration: 900,
    label: '星舰 · 热分离与亚轨道教学任务',
    description: 'Ship 先点火再与 Super Heavy 分离，随后推进并关机，最后展示亚轨道滑行；没有抛罩、卫星部署或着陆演示。',
    accuracy: `${TEACHING_NOTE} 不对应任何一次星舰试飞，不模拟发射塔夹持、着陆腿或实飞溅落；完成状态不表示入轨。`,
    stageSeparationTime: 174, kind: 'suborbital', completionLabel: 'Ship 亚轨道演示完成',
  }, [
    event('ignition', -6, 'Super Heavy 发动机点火', '助推器发动机进入启动序列。'),
    event('liftoff', 0, '星舰组合体离台', 'Ship 与 Super Heavy 作为组合体升空。'),
    event('max-q', 65, '最大动压阶段', '展示上升过程中的气动载荷阶段。'),
    event('booster-throttle', 165, 'Super Heavy 降推力', '为教学热分离阶段做准备。'),
    event('ses-1', 170, 'Ship 发动机点火', 'Ship 在尚未分离时点火，短暂呈现两级同时工作的热分离过程。'),
    event('stage-separation', 174, 'Ship 热分离', 'Ship 与 Super Heavy 分离，Ship 继续推进；本演示结束助推器推进。'),
    event('seco-1', 505, 'Ship 发动机关机', 'Ship 进入教学亚轨道滑行段；关机本身不代表入轨。'),
    event('suborbital-coast', 650, 'Ship 亚轨道滑行', '展示无主发动机推力的高空飞行，不释放卫星。'),
    event('flight-complete', 900, 'Ship 亚轨道演示完成', '本版演示到此结束，不模拟再入、溅落或塔架回收。'),
  ]),

  cz5: defineMission({
    id: 'cz5', duration: 1140,
    label: '长征五号 · 两级芯级教学任务',
    description: '四枚助推器先分离；整流罩在芯一级仍工作时抛离，之后由芯二级继续推进。',
    stageSeparationTime: 474, fairingTime: 210, boosterTime: 184,
  }, [
    event('ignition', -5, '芯级与助推器点火', '芯一级与四枚助推器进入启动序列。'),
    event('liftoff', 0, '长征五号离台', '开始本次教学上升过程。'),
    event('max-q', 78, '最大动压阶段', '展示气动载荷变化阶段。'),
    event('booster-cutoff', 179, '助推器关机', '四枚助推器结束推进。'),
    event('booster-separation', 184, '四枚助推器分离', '芯一级仍继续工作。'),
    event('fairing-separation', 210, '整流罩分离', '本教学序列先抛整流罩，再进行芯级分离。'),
    event('meco', 470, '芯一级关机', '芯一级结束推进。'),
    event('stage-separation', 474, '芯一、二级分离', '芯二级与芯一级分开。'),
    event('ses-1', 482, '芯二级首次点火', '芯二级继续推动载荷。'),
    event('seco-1', 790, '芯二级首次关机', '开始教学滑行阶段。'),
    event('ses-2', 1010, '芯二级再次点火', '展示上面级再次启动的教学情景。'),
    event('seco-2', 1055, '芯二级再次关机', '准备释放载荷。'),
    event('payload-deployment', 1140, '载荷分离', '完成教学任务，未安排任何芯级或助推器回收。'),
  ]),

  cz5b: defineMission({
    id: 'cz5b', duration: 620,
    label: '长征五号乙 · 单芯级教学任务',
    description: '四枚助推器配合单一芯级完成推进，没有芯二级、级间分离或二级点火；芯级关机后释放载荷。',
    fairingTime: 225, boosterTime: 176,
  }, [
    event('ignition', -5, '芯级与助推器点火', '单芯级与四枚助推器进入启动序列。'),
    event('liftoff', 0, '长征五号乙离台', '单芯级构型开始教学飞行。'),
    event('max-q', 76, '最大动压阶段', '展示上升段的气动载荷阶段。'),
    event('booster-cutoff', 171, '助推器关机', '助推器结束推进。'),
    event('booster-separation', 176, '四枚助推器分离', '单一芯级仍继续工作，不会出现第二级。'),
    event('fairing-separation', 225, '大型整流罩分离', '露出教学载荷。'),
    event('meco', 495, '单芯级关机', '单芯级结束推进，随后直接准备载荷分离。'),
    event('payload-deployment', 620, '载荷与芯级分离', '载荷直接与芯级分开；本构型不存在二级点火或芯级回收。'),
  ]),

  cz7: defineMission({
    id: 'cz7', duration: 780,
    label: '长征七号 · 两级教学任务',
    description: '四枚助推器先分离，一级与二级随后分开，二级继续推进并释放教学载荷。',
    stageSeparationTime: 179, fairingTime: 220, boosterTime: 126,
  }, [
    event('ignition', -4, '一级与助推器点火', '一级和四枚助推器进入启动序列。'),
    event('liftoff', 0, '长征七号离台', '开始教学上升过程。'),
    event('max-q', 62, '最大动压阶段', '展示上升过程的气动载荷阶段。'),
    event('booster-cutoff', 122, '助推器关机', '助推器完成教学推进段。'),
    event('booster-separation', 126, '四枚助推器分离', '主芯级继续上升。'),
    event('meco', 175, '一级关机', '准备级间分离。'),
    event('stage-separation', 179, '一、二级分离', '二级与一级分开。'),
    event('ses-1', 186, '二级点火', '二级继续推进。'),
    event('fairing-separation', 220, '整流罩分离', '露出教学载荷。'),
    event('seco-1', 640, '二级关机', '结束教学推进阶段。'),
    event('payload-deployment', 780, '载荷分离', '完成教学任务，未安排回收。'),
  ]),

  cz8: defineMission({
    id: 'cz8', duration: 840,
    label: '长征八号 · 两助推器教学任务',
    description: '采用两枚侧助推器的教学构型，展示助推器分离、两级接力与载荷释放，不演示回收。',
    stageSeparationTime: 187, fairingTime: 250, boosterTime: 144,
  }, [
    event('ignition', -4, '一级与助推器点火', '一级和两枚侧助推器进入启动序列。'),
    event('liftoff', 0, '长征八号离台', '开始教学飞行。'),
    event('max-q', 69, '最大动压阶段', '展示上升过程的气动载荷阶段。'),
    event('booster-cutoff', 140, '侧助推器关机', '两枚侧助推器结束推进。'),
    event('booster-separation', 144, '两枚侧助推器分离', '芯一级继续工作。'),
    event('meco', 182, '一级关机', '结束一级推进。'),
    event('stage-separation', 187, '一、二级分离', '二级与一级分开。'),
    event('ses-1', 194, '二级点火', '二级开始教学推进段。'),
    event('fairing-separation', 250, '整流罩分离', '露出教学载荷。'),
    event('seco-1', 705, '二级关机', '准备释放载荷。'),
    event('payload-deployment', 840, '载荷分离', '结束本次教学任务，不安排助推器或芯级回收。'),
  ]),

  cz2f: defineMission({
    id: 'cz2f', duration: 660,
    label: '长征二号 F · 载人飞船教学任务',
    description: '依次展示逃逸塔抛离、助推器分离、两级接力、整流罩分离和载人飞船分离；抛塔不表示执行紧急逃逸。',
    stageSeparationTime: 162, fairingTime: 218, boosterTime: 145,
    kind: 'crewed', completionLabel: '载人飞船分离演示完成',
  }, [
    event('ignition', -3, '一级与助推器点火', '一级与四枚助推器进入启动序列。'),
    event('liftoff', 0, '长征二号 F 离台', '顶部带有逃逸塔的组合体开始上升。'),
    event('max-q', 61, '最大动压阶段', '展示上升过程的气动载荷阶段。'),
    event('escape-tower-jettison', 116, '逃逸塔抛离', '展示正常飞行中的逃逸塔抛离，不是紧急逃逸。'),
    event('booster-cutoff', 140, '助推器关机', '四枚助推器结束推进。'),
    event('booster-separation', 145, '四枚助推器分离', '芯一级继续执行教学上升过程。'),
    event('meco', 158, '一级关机', '一级推进结束。'),
    event('stage-separation', 162, '一、二级分离', '二级与一级分开。'),
    event('ses-1', 166, '二级点火', '二级继续推动载人飞船组合体。'),
    event('fairing-separation', 218, '整流罩分离', '露出教学飞船。'),
    event('seco-1', 585, '二级关机', '准备飞船分离。'),
    event('spacecraft-separation', 660, '载人飞船分离', '载人飞船与火箭分开，完成本次教学演示。'),
  ]),
});

// [time seconds, altitude metres, velocity m/s, downrange metres, pitch degrees].
// These trajectories are deliberately independent educational keyframes.
const PROFILES = {
  'falcon-heavy': {
    firstBurn: [-4, 205], secondBurns: [[218, 540], [960, 990]], payloadTime: 1080,
    frames: [[0,0,0,0,0],[12,240,50,0,0],[72,16500,520,5800,15],[155,65000,1800,80000,40],[210,99000,2450,140000,50],[245,128000,2850,230000,61],[360,185000,4550,700000,76],[540,215000,7650,1920000,90],[960,225000,7620,5100000,90],[990,240000,7780,5330000,90],[1080,240000,7780,6020000,90]],
  },
  starship: {
    firstBurn: [-6, 174], secondBurns: [[170, 505]], payloadTime: null,
    frames: [[0,0,0,0,0],[20,850,110,40,2],[65,15000,500,4500,12],[165,65000,1700,65000,39],[174,73000,1900,81000,43],[280,116000,3500,390000,64],[400,142000,5350,1100000,78],[505,160000,6900,2000000,87],[650,210000,6300,2950000,90],[900,135000,6700,4580000,96]],
  },
  cz5: {
    firstBurn: [-5, 470], secondBurns: [[482, 790], [1010, 1055]], payloadTime: 1140,
    frames: [[0,0,0,0,0],[15,350,55,0,0],[78,16000,510,4700,13],[184,64000,1650,75000,38],[210,82000,2000,122000,47],[340,155000,3450,485000,64],[474,195000,4850,1080000,77],[600,215000,6200,1710000,86],[790,260000,7700,3050000,90],[1010,270000,7650,4730000,90],[1055,285000,7800,5080000,90],[1140,285000,7800,5740000,90]],
  },
  cz5b: {
    firstBurn: [-5, 495], secondBurns: [], payloadTime: 620,
    frames: [[0,0,0,0,0],[15,360,65,0,0],[76,14500,500,4200,12],[176,62000,1830,76000,40],[225,105000,3000,190000,58],[370,180000,5400,815000,79],[495,205000,7750,1630000,90],[620,215000,7730,2590000,90]],
  },
  cz7: {
    firstBurn: [-4, 175], secondBurns: [[186, 640]], payloadTime: 780,
    frames: [[0,0,0,0,0],[14,300,55,0,0],[62,14000,470,4100,13],[126,40000,1260,39000,30],[179,69000,2050,94000,45],[220,103000,2800,177000,57],[350,178000,4550,650000,76],[500,230000,6600,1490000,86],[640,275000,7730,2510000,90],[780,275000,7730,3590000,90]],
  },
  cz8: {
    firstBurn: [-4, 182], secondBurns: [[194, 705]], payloadTime: 840,
    frames: [[0,0,0,0,0],[16,330,52,0,0],[69,15000,480,4300,13],[144,47000,1500,54000,36],[187,71000,2200,117000,48],[250,116000,2970,260000,62],[390,187000,4700,760000,77],[540,265000,6430,1600000,85],[705,340000,7690,2790000,90],[840,340000,7690,3830000,90]],
  },
  cz2f: {
    firstBurn: [-3, 158], secondBurns: [[166, 585]], payloadTime: 660, escapeTime: 116,
    frames: [[0,0,0,0,0],[12,230,48,0,0],[61,12500,450,3700,13],[116,34000,1150,31500,29],[145,52000,1680,65000,39],[162,65000,2070,94000,47],[218,105000,3020,224000,62],[355,180000,4760,720000,78],[470,230000,6400,1330000,87],[585,260000,7760,2150000,90],[660,260000,7760,2730000,90]],
  },
};

const HEAVY_RETURN = [
  [210,99000,140000,50],[240,125000,175000,140],[275,145000,195000,160],
  [325,115000,150000,35],[385,50000,65000,15],[435,10000,10000,5],
  [458,2400,1500,2],[470,330,120,0],[480,0,0,0],
];

export function getMission(id = 'falcon9') {
  if (!Object.hasOwn(MISSIONS, id)) throw new RangeError(`Unknown rocket: ${String(id)}`);
  return MISSIONS[id];
}

function clampTime(time, duration) {
  if (typeof time !== 'number' || Number.isNaN(time)) return START_TIME;
  return Math.max(START_TIME, Math.min(duration, time));
}

function interpolate(frames, time) {
  if (time <= frames[0][0]) return frames[0].slice(1);
  for (let index = 1; index < frames.length; index += 1) {
    const right = frames[index];
    if (time <= right[0]) {
      const left = frames[index - 1];
      const amount = (time - left[0]) / (right[0] - left[0]);
      return left.slice(1).map((value, field) => value + (right[field + 1] - value) * amount);
    }
  }
  return frames.at(-1).slice(1);
}

function reached(time, eventTime) {
  return eventTime !== null && eventTime !== undefined && time >= eventTime;
}

function burnActive(time, [start, end]) {
  return time >= start && time < end;
}

function phaseAt(mission, profile, time, separated, deployed, secondEngineOn) {
  if (time < profile.firstBurn[0]) return '发射准备';
  if (time < 0) return '发动机点火（教学）';
  if (time >= mission.duration || deployed) return mission.completionLabel;
  if (mission.kind === 'suborbital') {
    if (separated && !secondEngineOn) return 'Ship 亚轨道滑行（教学）';
    if (separated) return 'Ship 推进（教学）';
    if (secondEngineOn) return 'Ship 点火 · 热分离准备（教学）';
  }
  if (secondEngineOn) return '第二级推进（教学）';
  if (separated) return '第二级滑行（教学）';
  if (time >= profile.firstBurn[1]) return mission.id === 'cz5b'
    ? '单芯级关机 · 等待载荷分离' : '一级关机 · 等待分离';
  if (reached(time, mission.boosterTime)) return '助推器已分离 · 芯级推进（教学）';
  return '组合体上升（教学）';
}

function extras(mission, time, escapeTime = null) {
  const boosterIgnitionTime = PROFILES[mission.id]?.firstBurn[0];
  const boosterCutoffTime = mission.events.find((entry) => entry.id === 'booster-cutoff')?.time ?? mission.boosterTime;
  return {
    rocketId: mission.id,
    boostersEngineOn: mission.boosterTime !== null
      && reached(time, boosterIgnitionTime) && time < boosterCutoffTime,
    boostersSeparated: reached(time, mission.boosterTime),
    escapeTowerJettisoned: reached(time, escapeTime),
    ...missionAnimationTimes(mission, time),
    hasRecovery: mission.hasRecovery,
    isSingleStage: mission.id === 'cz5b',
    missionKind: mission.kind,
    completionLabel: mission.completionLabel,
  };
}

function sampleMission(mission, requestedTime) {
  const time = clampTime(requestedTime, mission.duration);
  if (mission.id === 'falcon9') return { ...sampleFlight(time), ...extras(mission, time) };
  const profile = PROFILES[mission.id];
  const [altitude, velocity, downrange, pitchDegrees] = interpolate(profile.frames, time);
  const pitch = pitchDegrees * DEG;
  const separated = reached(time, mission.stageSeparationTime);
  const firstEngineOn = burnActive(time, profile.firstBurn);
  const secondEngineOn = profile.secondBurns.some((burn) => burnActive(time, burn));
  const deployed = reached(time, profile.payloadTime);
  let booster = { altitude, downrange, pitch, engineOn: firstEngineOn, landed: false };

  if (mission.id === 'falcon-heavy' && separated) {
    const [returnAltitude, returnDownrange, returnPitch] = interpolate(HEAVY_RETURN, time);
    booster = {
      altitude: returnAltitude, downrange: returnDownrange, pitch: returnPitch * DEG,
      engineOn: [[248,285],[380,401],[458,480]].some((burn) => burnActive(time, burn)),
      landed: time >= mission.recoveryTime,
    };
  } else if (separated) {
    // A continuous, hidden spent-stage track satisfies the existing pose API.
    // Its ground contact is never labelled as a landing or a recovery.
    const [separationAltitude, separationVelocity, separationDownrange, separationPitch] = interpolate(profile.frames, mission.stageSeparationTime);
    const elapsed = time - mission.stageSeparationTime;
    const fallDuration = (170 + Math.sqrt(170 ** 2 + 9.2 * separationAltitude)) / 4.6;
    const fallingTime = Math.min(elapsed, fallDuration);
    booster = {
      altitude: Math.max(0, separationAltitude + 170 * fallingTime - 2.3 * fallingTime ** 2),
      downrange: separationDownrange + fallingTime * separationVelocity * .55,
      pitch: Math.min(Math.PI, separationPitch * DEG + fallingTime * .012),
      engineOn: false, landed: false,
    };
  }

  return {
    time,
    phase: phaseAt(mission, profile, time, separated, deployed, secondEngineOn),
    altitude, velocity, downrange, pitch,
    firstEngineOn, secondEngineOn, separated,
    fairingSeparated: reached(time, mission.fairingTime),
    deployed, booster,
    ...extras(mission, time, profile.escapeTime),
  };
}

/** Same playback contract as LaunchSimulation, plus vehicle selection. */
export class FleetSimulation {
  constructor(rocketId = 'falcon9') {
    this.setRocket(rocketId);
  }

  setRocket(rocketId) {
    const mission = getMission(rocketId);
    this.rocketId = mission.id;
    this.mission = mission;
    return this.reset();
  }

  launch() {
    this.status = this.time >= this.mission.duration ? 'complete' : 'running';
    this.lastEvents = [];
    return this.state;
  }

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

  seek(time) {
    this.time = clampTime(time, this.mission.duration);
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

  update(deltaSeconds) {
    this.lastEvents = [];
    if (this.status !== 'running' || typeof deltaSeconds !== 'number'
      || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return this.state;
    const previousTime = this.time;
    this.time = Math.min(this.mission.duration, previousTime + deltaSeconds * this.rate);
    this.lastEvents = this.mission.events.filter((entry) => entry.time > previousTime && entry.time <= this.time);
    if (this.time >= this.mission.duration) this.status = 'complete';
    return this.state;
  }

  get events() {
    return this.mission.events.filter((entry) => entry.time <= this.time);
  }

  get state() {
    return sampleMission(this.mission, this.time);
  }
}
