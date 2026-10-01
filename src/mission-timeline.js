/** Mission seconds are authoritative for markers, events and model animations. */
export const MISSION_START = -10;

function validMission(mission) {
  if (!mission || !Number.isFinite(mission.duration) || mission.duration <= MISSION_START || !Array.isArray(mission.events)) {
    throw new TypeError('A timeline requires a finite mission duration and an events array.');
  }
}

function clamp(value, low, high) {
  if (typeof value !== 'number' || Number.isNaN(value)) return low;
  return Math.max(low, Math.min(high, value));
}

export function timelineProgress(time, duration, start = MISSION_START) {
  if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= start) {
    throw new RangeError('Timeline bounds must be finite and increasing.');
  }
  return (clamp(time, start, duration) - start) / (duration - start);
}

export function timelineTime(progress, duration, start = MISSION_START) {
  timelineProgress(start, duration, start);
  return start + clamp(progress, 0, 1) * (duration - start);
}

function findTime(mission, ids, fallback = null) {
  return mission.events.find(event => ids.includes(event.id))?.time ?? fallback;
}

function since(time, start) {
  return Number.isFinite(start) && Number.isFinite(time) ? Math.max(0, time - start) : 0;
}

/**
 * Deterministic elapsed times, including the alias understood by fleet-model.
 * They never depend on when a renderer first noticed a boolean flag. A separate
 * terminal presentation may explicitly override deploymentElapsed; no extra
 * task seconds or modified event dates are introduced here.
 */
export function missionAnimationTimes(mission, time) {
  validMission(mission);
  const stage = findTime(mission, ['stage-separation'], mission.stageSeparationTime);
  const booster = findTime(mission, ['booster-separation'], mission.boosterTime);
  const fairing = findTime(mission, ['fairing-separation'], mission.fairingTime);
  const escape = findTime(mission, ['escape-tower-jettison']);
  const deployment = findTime(mission, ['payload-deployment', 'spacecraft-separation']);
  const escapeElapsed = since(time, escape);
  return {
    stageSeparationElapsed: since(time, stage),
    boosterSeparationElapsed: since(time, booster),
    fairingElapsed: since(time, fairing),
    escapeElapsed,
    escapeTowerElapsed: escapeElapsed,
    escapeTowerJettisonElapsed: escapeElapsed,
    deploymentElapsed: since(time, deployment),
  };
}

/**
 * One presentation snapshot for a linear [-10, duration] track. Markers are
 * truly time-proportional; dense early events must not be visually redistributed
 * along the track. Current event means the most recently reached event, not the
 * vehicle's ongoing propulsion phase. A separate jump-button list may be used.
 */
export function timelinePresentation(mission, requestedTime) {
  validMission(mission);
  const time = clamp(requestedTime, MISSION_START, mission.duration);
  const source = mission.events.map(event => ({ ...event,
    kind: event.id === 'recovery-complete' ? 'recovery' : 'mission',
    target: event.id === 'recovery-complete' ? 'booster' : 'vehicle',
  }));
  if (mission.hasRecovery && Number.isFinite(mission.recoveryTime)
    && !source.some(event => event.kind === 'recovery' && event.time === mission.recoveryTime)) {
    source.push({
      id: 'recovery-landing', time: mission.recoveryTime, label: '一级着陆 · 示意',
      detail: '独立的一级陆地回收教学示意，不代表所选主任务的实飞回收过程。',
      kind: 'recovery', target: 'booster',
    });
  }
  source.sort((a, b) => a.time - b.time);
  const markers = source.filter(event => Number.isFinite(event.time))
    .map(event => {
      const progress = timelineProgress(event.time, mission.duration);
      return { ...event, progress, percent: progress * 100, passed: event.time <= time };
    });
  const passed = markers.filter(event => event.passed);
  const currentEvent = passed.at(-1) ?? null;
  const nextEvent = markers.find(event => !event.passed) ?? null;
  const progress = timelineProgress(time, mission.duration);
  return {
    time, start: MISSION_START, end: mission.duration,
    progress, percent: progress * 100,
    remainingSeconds: mission.duration - time,
    markers, currentEvent, nextEvent,
    passedEventIds: passed.map(event => event.id),
  };
}

/**
 * Wall-clock adapter for the existing simulation, with no second mission clock.
 * Call advance(performance.now(), mode === 'launch' && !document.hidden) each
 * RAF. On speed clicks call setRate(rate, performance.now(), active) so elapsed
 * time BEFORE the click is settled at the OLD speed. Clamp only render dt, not
 * the elapsed duration sent here. Call rebase(now) after reset/seek/model change.
 * Before toggling launch/pause, advance to the input timestamp, then toggle.
 */
export class MissionClock {
  constructor(simulation, initialNow = null) {
    if (!simulation || typeof simulation.update !== 'function' || typeof simulation.setRate !== 'function') {
      throw new TypeError('MissionClock requires a simulation with update and setRate.');
    }
    this.simulation = simulation;
    this.timestamp = Number.isFinite(initialNow) ? initialNow : null;
    this.pendingEvents = [];
  }

  advance(now, active = true) {
    let realDeltaSeconds = 0;
    if (Number.isFinite(now)) {
      if (this.timestamp !== null && now > this.timestamp) realDeltaSeconds = (now - this.timestamp) / 1000;
      if (this.timestamp === null || now > this.timestamp) this.timestamp = now;
    }
    const before = this.simulation.time;
    let events = [];
    if (active && realDeltaSeconds > 0) {
      this.simulation.update(realDeltaSeconds);
      events = [...this.simulation.lastEvents];
      this.pendingEvents.push(...events);
    }
    return {
      state: this.simulation.state,
      realDeltaSeconds,
      missionDeltaSeconds: this.simulation.time - before,
      events,
    };
  }

  setRate(rate, now, active = true) {
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      throw new RangeError('Playback rate must be a finite number greater than zero.');
    }
    const frame = this.advance(now, active);
    this.simulation.setRate(rate);
    return frame;
  }

  rebase(now = null) {
    this.timestamp = Number.isFinite(now) ? now : null;
    this.pendingEvents = [];
  }

  drainEvents() {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }
}
