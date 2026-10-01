import { AssemblyGame } from '../../assembly-state.js';
import { ROCKETS } from '../../fleet-data.js';

export function createAssemblyProgressStore(preferences) {
  const saved = preferences.object('assembly-progress');
  const allowed = new Set(ROCKETS.map((rocket) => rocket.id));
  const snapshots = Object.fromEntries(Object.entries(saved).filter(([id]) => allowed.has(id)));
  const games = new Map();
  function get(id) {
    if (!allowed.has(id)) throw new RangeError(`Unknown assembly rocket: ${id}`);
    if (games.has(id)) return games.get(id);
    const game = new AssemblyGame(id, { guided: false }),
      snapshot = snapshots[id];
    if (Array.isArray(snapshot?.placed)) {
      for (const part of snapshot.placed.slice(0, game.plan.total)) {
        if (game.canPlace(part)) game.place(part);
      }
    }
    game.setGuided(snapshot?.guided !== false);
    if (typeof snapshot?.selectedId === 'string') game.select(snapshot.selectedId);
    games.set(id, game);
    return game;
  }
  function save(game) {
    if (!allowed.has(game.rocketId)) throw new RangeError('Cannot persist an unknown rocket.');
    snapshots[game.rocketId] = game.snapshot();
    return preferences.set('assembly-progress', JSON.stringify(snapshots));
  }
  return { get, save };
}
