/** The launch ceremony is a view of real mission seconds, never a second clock. */
export const LIFTOFF_HOLD_SECONDS = 1.2;

function missionTimes(mission) {
  const ignitionTime = mission.events.find((event) => event.id === 'ignition')?.time;
  const liftoffTime = mission.events.find((event) => event.id === 'liftoff')?.time;
  if (!Number.isFinite(ignitionTime) || !Number.isFinite(liftoffTime) || ignitionTime >= liftoffTime) {
    throw new TypeError('A launch countdown requires ordered ignition and liftoff mission events.');
  }
  return { ignitionTime, liftoffTime, releaseTime: liftoffTime + LIFTOFF_HOLD_SECONDS };
}

function validRate(rate) {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw new RangeError('Playback rate must be a finite number greater than zero.');
  }
  return rate;
}

/**
 * revision identifies the ceremony lifecycle, not every render frame. Consumers
 * can combine revision + cueId to play each cue once. Pausing/resuming preserves
 * that identity; starting, cancelling, resetting and finishing invalidate it.
 */
export function createCountdownState(mission, initialRate = 1) {
  let timing = missionTimes(mission);
  let armed = false;
  let revision = 0;
  let requestedRate = validRate(initialRate);

  function setRequestedRate(rate) {
    requestedRate = validRate(rate);
    return requestedRate;
  }

  function arm(rate = requestedRate) {
    setRequestedRate(rate);
    if (!armed) {
      armed = true;
      revision++;
    }
  }

  function cancel() {
    armed = false;
    revision++;
    return requestedRate;
  }

  function reset(nextMission = mission, rate = 1) {
    const nextTiming = missionTimes(nextMission);
    const nextRate = validRate(rate);
    mission = nextMission;
    timing = nextTiming;
    requestedRate = nextRate;
    cancel();
  }

  function snapshot({ time, status, active = true, effectiveRate = armed ? 1 : requestedRate }) {
    const inWindow = armed && Number.isFinite(time) && time < timing.releaseTime;
    let phase = null;
    let number = null;
    if (inWindow) {
      if (time < timing.ignitionTime) {
        phase = 'count';
        // Avoid retaining the previous number for a frame solely because of
        // sub-nanosecond floating-point accumulation at a whole-second edge.
        number = Math.max(1, Math.ceil(timing.ignitionTime - time - 1e-9));
      } else if (time < timing.liftoffTime) phase = 'ignition';
      else phase = 'liftoff';
    }
    return {
      visible: inWindow && active,
      phase,
      number,
      cueId: phase === 'count' ? `count-${number}` : phase,
      running: inWindow && active && status === 'running',
      paused: inWindow && status === 'paused',
      revision,
      requestedRate,
      effectiveRate,
      ignitionTime: timing.ignitionTime,
      liftoffTime: timing.liftoffTime,
    };
  }

  return {
    arm,
    cancel,
    reset,
    setRequestedRate,
    snapshot,
    get armed() {
      return armed;
    },
    get releaseTime() {
      return timing.releaseTime;
    },
    get requestedRate() {
      return requestedRate;
    },
  };
}
