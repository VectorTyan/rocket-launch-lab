import test from 'node:test';
import assert from 'node:assert/strict';
import { ROCKETS } from '../src/fleet-data.js';
import { AssemblyGame, getAssemblyPlan } from '../src/assembly-state.js';

const GROUPS = new Set(['core', 'engine', 'booster', 'payload', 'cover', 'detail']);

for (const rocket of ROCKETS) {
  test(`${rocket.id}: plan contains exactly its real model modules with valid dependencies`, () => {
    const plan = getAssemblyPlan(rocket.id);
    assert.equal(plan.total, rocket.moduleIds.length);
    assert.deepEqual(plan.parts.map(part => part.id).sort(), [...rocket.moduleIds].sort());
    assert.equal(plan.parts[0].id, 'stage1');
    const earlier = new Set();
    for (const [index, part] of plan.parts.entries()) {
      assert.equal(part.step, index + 1);
      for (const field of ['id', 'name', 'shortName', 'hint', 'fact']) assert.ok(typeof part[field] === 'string' && part[field].length > 0);
      assert.ok(GROUPS.has(part.group));
      for (const prerequisite of part.prerequisites) assert.ok(earlier.has(prerequisite), `${part.id} prerequisite ${prerequisite} precedes it`);
      earlier.add(part.id);
    }
    assert.match(plan.note, /模型.*不是真实/);
  });

  test(`${rocket.id}: guided play reaches completion exactly once without duplicate counting`, () => {
    const game = new AssemblyGame(rocket.id);
    assert.equal(game.progress, 0); assert.equal(game.completed, false);
    assert.equal(game.selectedId, 'stage1'); assert.equal(game.placed.size, 0);
    let completionEvents = 0;
    for (let i = 0; i < game.plan.total; i++) {
      const next = game.nextPart;
      assert.equal(game.hint().partId, next.id);
      assert.equal(game.canPlace(next.id), true);
      const result = game.place();
      assert.equal(result.ok, true); assert.equal(result.partId, next.id);
      assert.equal(result.newlyCompleted, i === game.plan.total - 1);
      completionEvents += Number(result.newlyCompleted);
      assert.equal(game.placed.size, i + 1);
      assert.equal(game.progress, (i + 1) / game.plan.total);
      const beforeDuplicate = game.snapshot();
      const duplicate = game.place(next.id);
      assert.equal(duplicate.ok, false); assert.equal(duplicate.reason, 'already-placed');
      assert.equal(duplicate.newlyCompleted, false);
      assert.deepEqual(game.snapshot(), beforeDuplicate);
    }
    assert.equal(completionEvents, 1);
    assert.equal(game.completed, true); assert.equal(game.progress, 1);
    assert.equal(game.nextPart, null); assert.equal(game.selectedId, null);
    assert.equal(game.hint().completed, true); assert.equal(game.hint().part, null);
    const noSelection = game.place();
    assert.equal(noSelection.reason, 'complete'); assert.equal(noSelection.newlyCompleted, false);
  });
}

test('variant-specific dependency relationships do not invent absent stages or covers', () => {
  const byId = id => new Map(getAssemblyPlan(id).parts.map(part => [part.id, part]));
  const cz5b = byId('cz5b');
  for (const absent of ['stage2', 'engine2', 'interstage']) assert.equal(cz5b.has(absent), false);
  assert.deepEqual(cz5b.get('payload').prerequisites, ['stage1']);
  const ship = byId('starship');
  for (const absent of ['fairing-left', 'fairing-right', 'landing-legs', 'escape-tower']) assert.equal(ship.has(absent), false);
  assert.deepEqual(ship.get('stage2').prerequisites, ['interstage']);
  for (const id of ['engine2', 'heatshield', 'flaps', 'payload']) assert.deepEqual(ship.get(id).prerequisites, ['stage2']);
  const crewed = byId('cz2f');
  assert.equal(crewed.has('payload'), false);
  assert.deepEqual(crewed.get('spacecraft').prerequisites, ['stage2']);
  for (const id of ['fairing-left', 'fairing-right']) assert.deepEqual(crewed.get(id).prerequisites, ['spacecraft']);
  assert.deepEqual(crewed.get('escape-tower').prerequisites, ['fairing-left', 'fairing-right']);
  const heavy = byId('falcon-heavy');
  for (const id of ['engines1', 'booster-1', 'booster-2', 'grid-fins', 'landing-legs']) assert.deepEqual(heavy.get(id).prerequisites, ['stage1']);
});

test('free play permits supported alternatives while guided play recommends one next part', () => {
  const game = new AssemblyGame('falcon-heavy');
  assert.equal(game.select('stage2'), true, 'unready parts can be selected for a friendly hint');
  assert.equal(game.canPlace(), false);
  const notReady = game.place();
  assert.equal(notReady.reason, 'missing-prerequisites');
  assert.equal(game.placed.size, 0);
  assert.equal(game.place('stage1').ok, true);
  assert.equal(game.canPlace('interstage'), false);
  assert.equal(game.place('interstage').reason, 'guided-order');
  game.setGuided(false);
  assert.equal(game.canPlace('interstage'), true);
  assert.equal(game.canPlace('booster-2'), true);
  assert.equal(game.place('booster-2').ok, true);
  assert.equal(game.place('interstage').ok, true);
  assert.equal(game.place('stage2').ok, true);
  game.setGuided(true);
  assert.equal(game.selectedId, 'engines1');
  assert.equal(game.canPlace('engines1'), true);
  assert.equal(game.canPlace('engine2'), false, 'switching modes preserves the recommendation rule');
  assert.equal(game.placed.size, 4);
});

test('free placement and last-in-first-out undo never leave dangling dependencies', () => {
  const game = new AssemblyGame('cz2f', { guided: false });
  const order = ['stage1', 'interstage', 'stage2', 'spacecraft', 'fairing-right', 'fairing-left', 'escape-tower', 'engine2', 'booster-4', 'booster-2', 'engines1', 'booster-1', 'booster-3'];
  for (const id of order) assert.equal(game.place(id).ok, true, `${id} is legal in this free-play order`);
  assert.equal(game.completed, true);
  for (const id of [...order].reverse()) {
    const result = game.undo();
    assert.equal(result.ok, true); assert.equal(result.partId, id);
    assert.equal(game.selectedId, id); assert.equal(game.canPlace(id), true);
    for (const part of game.plan.parts.filter(part => game.placed.has(part.id))) {
      assert.ok(part.prerequisites.every(prerequisite => game.placed.has(prerequisite)));
    }
  }
  assert.equal(game.progress, 0);
  const empty = game.snapshot();
  assert.equal(game.undo().reason, 'nothing-to-undo');
  assert.deepEqual(game.snapshot(), empty);
});

test('invalid identifiers are refused and snapshots cannot mutate live assembly state', () => {
  assert.throws(() => getAssemblyPlan('not-a-rocket'), RangeError);
  assert.throws(() => new AssemblyGame('not-a-rocket'), RangeError);
  const game = new AssemblyGame('cz5b');
  const initial = game.snapshot();
  for (const id of ['stage2', 'missing-part', '', '__proto__', null, undefined]) {
    assert.equal(game.select(id), false);
    if (id !== undefined) assert.equal(game.place(id).ok, false);
  }
  assert.deepEqual(game.snapshot(), initial);
  const externalSet = game.placed; externalSet.add('stage1');
  assert.equal(game.placed.size, 0, 'placed exposes a defensive Set snapshot');
  game.place('stage1');
  const snapshot = game.snapshot();
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
  snapshot.placed.push('payload');
  assert.equal(game.placed.has('payload'), false);
  assert.ok(Object.isFrozen(game.plan.parts[0].prerequisites));
});

test('reset preserves the play mode and undoing completion permits a fresh completion transition', () => {
  const game = new AssemblyGame('starship', { guided: false });
  for (const part of game.plan.parts) game.place(part.id);
  const lastId = game.plan.parts.at(-1).id;
  assert.equal(game.completed, true);
  game.undo();
  assert.equal(game.completed, false);
  assert.equal(game.place(lastId).newlyCompleted, true);
  const reset = game.reset();
  assert.equal(game.guided, false);
  assert.equal(reset.progress, 0); assert.deepEqual(reset.placed, []);
  assert.equal(reset.selectedId, 'stage1'); assert.equal(reset.nextPartId, 'stage1');
  assert.equal(game.hint().remaining, game.plan.total);
});
