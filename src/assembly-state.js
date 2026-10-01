import { ROCKETS, getModules } from './fleet-data.js';

const PLAN_NOTE = '这是模型拼搭顺序，不是真实火箭总装流程。';
const ORDER = [
  'stage1', 'engines1', 'booster-1', 'booster-2', 'booster-3', 'booster-4',
  'interstage', 'stage2', 'engine2', 'payload', 'spacecraft',
  'heatshield', 'flaps', 'fairing-left', 'fairing-right', 'escape-tower',
  'grid-fins', 'landing-legs',
];

function rocketRecord(id) {
  const rocket = ROCKETS.find(record => record.id === id);
  if (!rocket) throw new RangeError(`Unknown assembly rocket: ${id}`);
  return rocket;
}

function partCopy(rocket, id) {
  const ship = rocket.id === 'starship';
  const heavy = rocket.id === 'falcon-heavy';
  const lowerName = ship ? 'Super Heavy 助推级' : heavy ? '中央芯级' : '芯一级';
  const upperName = ship ? 'Ship 飞船' : '芯二级';
  const payloadName = rocket.id === 'cz5b' ? '大型舱段' : rocket.id === 'cz7' ? '货运飞船' : ship ? '舱内载荷' : '卫星载荷';
  const entries = {
    stage1: {
      shortName: ship ? '助推级' : heavy ? '中央芯级' : '芯一级', group: 'core',
      hint: `先把${lowerName}放在模型中间，作为拼搭的起点。`,
      fact: rocket.stages === 1 ? '长征五号 B 只有一个芯级，旁边还有四枚助推器。' : `${lowerName}负责起飞和最初一段上升。`,
    },
    engines1: {
      shortName: '一级发动机', group: 'engine',
      hint: `把这组发动机放到${lowerName}底部，喷管朝下。`,
      fact: `这组里有 ${rocket.firstStageEngines} 台主发动机，为起飞提供推力。`,
    },
    interstage: {
      shortName: ship ? '热分级段' : '级间段', group: 'core',
      hint: `把连接段放在${lowerName}上方。`,
      fact: ship ? 'V3 的热分级段连接两级，分级后留在助推级上。' : '级间段把两个芯级连接起来。',
    },
    stage2: {
      shortName: upperName, group: 'core',
      hint: `把${upperName}接到连接段上方。`,
      fact: ship ? 'Ship 把推进系统和载荷舱放在同一艘飞船里。' : '芯二级接着工作，让载荷继续加速。',
    },
    engine2: {
      shortName: '二级发动机', group: 'engine',
      hint: `把这组发动机接到${upperName}下方的安装位置。`,
      fact: ship ? '这里有三台海平面型和三台真空型发动机。' : rocket.id === 'cz2f' ? '这里有一台主发动机，还有四个帮助调整方向的小喷管。' : `这组有 ${rocket.secondStageEngines} 台主发动机，在高空继续提供推力。`,
    },
    payload: {
      shortName: payloadName, group: 'payload',
      hint: ship ? '把示例载荷放进 Ship 的载荷舱。' : `把${payloadName}放到箭体顶部的载荷位置。`,
      fact: rocket.id === 'cz5b' ? '这是大型舱段的教学模型，它是载荷，不是燃料箱。' : rocket.id === 'cz7' ? '这是货运飞船的教学模型，用来认识火箭运送的载荷。' : ship ? 'Ship 用自身的载荷舱容纳物品，没有两瓣卫星整流罩。' : '载荷是火箭要运送的物品，这里用卫星模型来表示。',
    },
    spacecraft: {
      shortName: '神舟飞船', group: 'payload',
      hint: '把神舟飞船放在芯二级上方。',
      fact: '神舟是载人飞船，具有轨道舱、返回舱和推进舱。',
    },
    'fairing-left': {
      shortName: '左半整流罩', group: 'cover',
      hint: '把左半保护罩放到载荷旁边，罩住它的一侧。',
      fact: '整流罩像保护壳，在飞过稠密大气时保护里面的载荷。',
    },
    'fairing-right': {
      shortName: '右半整流罩', group: 'cover',
      hint: '把右半保护罩放到载荷的另一侧。两半到位就能合拢。',
      fact: '两半整流罩合起来，形成完整的载荷保护空间。',
    },
    'escape-tower': {
      shortName: '逃逸塔', group: 'detail',
      hint: '把逃逸塔放在合拢的整流罩顶端。',
      fact: '逃逸塔属于载人火箭的安全装置，紧急时帮助航天员远离危险。',
    },
    'grid-fins': {
      shortName: '栅格翼', group: 'detail',
      hint: `把这组带网格的小翼放在${lowerName}上部。`,
      fact: ship ? 'V3 的 Super Heavy 有三片栅格翼，借助气流调整方向。' : '气流经过栅格翼时，能帮助返航的芯级调整方向。',
    },
    'landing-legs': {
      shortName: '着陆腿', group: 'detail',
      hint: `把收拢的着陆腿装在${lowerName}下部。`,
      fact: '这些腿在着陆前展开，帮助芯级站稳。',
    },
    heatshield: {
      shortName: '热防护层', group: 'cover',
      hint: '把深色热防护层贴到 Ship 的迎风面。',
      fact: '再入大气时，热防护层帮助保护飞船。',
    },
    flaps: {
      shortName: '襟翼', group: 'detail',
      hint: '把这一组襟翼装到 Ship 的两侧。',
      fact: 'Ship 前后共有四片襟翼，用来调整它在大气中的姿态。',
    },
  };
  if (/^booster-[1-4]$/.test(id)) {
    const index = Number(id.split('-')[1]);
    const name = `${heavy ? '侧芯级' : '助推器'} ${index}`;
    return {
      shortName: name, group: 'booster',
      hint: `把${name}放到${lowerName}旁边对应的位置。`,
      fact: `它有 ${rocket.boosterEngines} 台发动机，和${lowerName}一起帮助火箭起飞。`,
    };
  }
  if (!entries[id]) throw new RangeError(`No assembly description for module: ${id}`);
  return entries[id];
}

function prerequisites(id, present) {
  const carrier = present.has('stage2') ? 'stage2' : 'stage1';
  switch (id) {
    case 'stage1': return [];
    case 'engines1': case 'interstage': case 'grid-fins': case 'landing-legs': return ['stage1'];
    case 'stage2': return [present.has('interstage') ? 'interstage' : 'stage1'];
    case 'engine2': case 'flaps': case 'heatshield': return ['stage2'];
    case 'payload': case 'spacecraft': return [carrier];
    case 'fairing-left': case 'fairing-right': return [present.has('spacecraft') ? 'spacecraft' : 'payload'];
    case 'escape-tower': return ['fairing-left', 'fairing-right'].filter(part => present.has(part));
    default: return /^booster-[1-4]$/.test(id) ? ['stage1'] : [];
  }
}

/** Plan order is a child-friendly model interaction, not a real assembly procedure. */
export function getAssemblyPlan(rocketId = 'falcon9') {
  const rocket = rocketRecord(rocketId);
  const present = new Set(rocket.moduleIds);
  const modules = new Map(getModules(rocketId).map(part => [part.id, part]));
  const ids = ORDER.filter(id => present.has(id));
  if (ids.length !== present.size) throw new RangeError(`Incomplete assembly plan for ${rocketId}`);
  const parts = ids.map((id, index) => {
    const dependencies = prerequisites(id, present);
    if (dependencies.some(dependency => !present.has(dependency))) throw new RangeError(`Missing assembly dependency for ${rocketId}/${id}`);
    return Object.freeze({
      id, name: modules.get(id).name, ...partCopy(rocket, id),
      prerequisites: Object.freeze(dependencies), step: index + 1,
    });
  });
  return Object.freeze({ parts: Object.freeze(parts), total: parts.length, note: PLAN_NOTE });
}

/**
 * State only: 3D placement/overlap decisions stay with the scene controller.
 * placed is a defensive Set snapshot; progress is a 0..1 fraction.
 */
export class AssemblyGame {
  #placed = new Set();
  #history = [];
  #parts;

  constructor(rocketId = 'falcon9', { guided = true } = {}) {
    this.plan = getAssemblyPlan(rocketId);
    this.rocketId = rocketId;
    this.guided = Boolean(guided);
    this.#parts = new Map(this.plan.parts.map(part => [part.id, part]));
    this.selectedId = this.nextPart?.id ?? null;
  }

  get placed() { return new Set(this.#placed); }
  get completed() { return this.#placed.size === this.plan.total; }
  get progress() { return this.plan.total ? this.#placed.size / this.plan.total : 1; }
  get nextPart() { return this.plan.parts.find(part => !this.#placed.has(part.id)) ?? null; }

  select(id) {
    if (!this.#parts.has(id) || this.#placed.has(id)) return false;
    this.selectedId = id;
    return true;
  }

  #check(id) {
    const part = this.#parts.get(id);
    if (!part) return { ok: false, reason: this.completed && id == null ? 'complete' : 'unknown-part', message: this.completed && id == null ? '火箭模型已经装好啦！' : '从部件盒里选一个部件，我们再试试。' };
    if (this.#placed.has(id)) return { ok: false, reason: 'already-placed', message: `${part.shortName}已经装好啦，看看下一个部件吧。` };
    const missing = part.prerequisites.filter(dependency => !this.#placed.has(dependency));
    if (missing.length) {
      const names = missing.map(dependency => this.#parts.get(dependency).shortName).join('、');
      return { ok: false, reason: 'missing-prerequisites', message: `先把${names}拼好，就能放${part.shortName}啦。` };
    }
    if (this.guided && this.nextPart?.id !== id) return { ok: false, reason: 'guided-order', message: `跟着提示，先找${this.nextPart.shortName}吧。` };
    return { ok: true, reason: 'ready', message: `可以把${part.shortName}放到它的位置啦。` };
  }

  canPlace(id = this.selectedId) { return this.#check(id).ok; }

  place(id = this.selectedId) {
    const check = this.#check(id);
    if (!check.ok) return { ...check, partId: typeof id === 'string' ? id : null, completed: this.completed, newlyCompleted: false };
    this.#placed.add(id);
    this.#history.push(id);
    const completed = this.completed;
    this.selectedId = this.nextPart?.id ?? null;
    return {
      ok: true, reason: 'placed', partId: id, completed, newlyCompleted: completed,
      message: completed ? '所有部件都到位啦！你的火箭模型装好了。' : `${this.#parts.get(id).shortName}到位啦！`,
    };
  }

  setGuided(guided) {
    this.guided = Boolean(guided);
    if (this.guided || !this.#parts.has(this.selectedId) || this.#placed.has(this.selectedId)) this.selectedId = this.nextPart?.id ?? null;
    return this.guided;
  }

  undo() {
    const id = this.#history.pop();
    if (!id) return { ok: false, reason: 'nothing-to-undo', partId: null, completed: this.completed, newlyCompleted: false, message: '还没有拼上部件。先从第一个部件开始吧。' };
    this.#placed.delete(id);
    this.selectedId = this.guided ? this.nextPart?.id ?? null : id;
    return { ok: true, reason: 'undone', partId: id, completed: this.completed, newlyCompleted: false, message: `${this.#parts.get(id).shortName}放回部件盒啦，可以重新试试。` };
  }

  reset() {
    this.#placed.clear(); this.#history.length = 0;
    this.selectedId = this.nextPart?.id ?? null;
    return this.snapshot();
  }

  hint() {
    const part = this.nextPart;
    return {
      partId: part?.id ?? null, part, completed: this.completed,
      message: part?.hint ?? '全部装好啦！可以转一转，看看你的火箭模型。',
      step: part?.step ?? this.plan.total, total: this.plan.total,
      remaining: this.plan.total - this.#placed.size,
    };
  }

  snapshot() {
    return {
      version: 1, rocketId: this.rocketId, guided: this.guided,
      placed: [...this.#history], selectedId: this.selectedId,
      completed: this.completed, progress: this.progress,
      nextPartId: this.nextPart?.id ?? null,
      total: this.plan.total, remaining: this.plan.total - this.#placed.size,
    };
  }
}
