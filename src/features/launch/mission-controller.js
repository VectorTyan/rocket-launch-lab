import { FleetSimulation } from '../../fleet-simulation.js';
import { MissionClock, timelinePresentation } from '../../mission-timeline.js';
import { createCountdownState } from './countdown-state.js';

/** Application playback policy. No DOM, browser globals, or Three.js dependency. */
export function createMissionController(rocketId, { now = () => performance.now() } = {}) {
  const simulation = new FleetSimulation(rocketId);
  const clock = new MissionClock(simulation, now());
  const countdown = createCountdownState(simulation.mission, simulation.rate);
  let mode = 'launch',
    visible = true,
    subject = 'vehicle';
  let presentationTime = 0,
    completionDismissed = false,
    hiddenPause = false;
  const active = () => mode === 'launch' && visible;
  function resetPresentation() {
    presentationTime = 0;
    completionDismissed = false;
  }
  function advance(time = now()) {
    // Split at the real T+1.2 boundary. Applying the restored multiplier to an
    // entire slow frame would fast-forward part of the protected launch window.
    if (countdown.armed && active() && simulation.status === 'running') {
      const remaining = countdown.releaseTime - simulation.time;
      const wallSeconds =
        Number.isFinite(time) && Number.isFinite(clock.timestamp)
          ? Math.max(0, (time - clock.timestamp) / 1000)
          : 0;
      if (remaining > 0 && wallSeconds >= remaining) {
        clock.advance(clock.timestamp + remaining * 1000, true);
        simulation.setRate(countdown.cancel());
      } else if (remaining <= 1e-9) {
        simulation.setRate(countdown.cancel());
      }
    }
    clock.advance(time, active());
    if (countdown.armed && simulation.time >= countdown.releaseTime - 1e-9) {
      simulation.setRate(countdown.cancel());
    }
    clock.drainEvents();
    return simulation.state;
  }
  function frame(state = simulation.state) {
    const complete = simulation.time >= simulation.mission.duration;
    return {
      state,
      mission: simulation.mission,
      time: simulation.time,
      status: complete ? 'complete' : simulation.status,
      rate: simulation.rate,
      countdown: countdown.snapshot({
        time: simulation.time,
        status: simulation.status,
        active: active(),
        effectiveRate: simulation.rate,
      }),
      subject,
      presentationTime,
      timeline: timelinePresentation(simulation.mission, state.time),
      showCompletion: complete && !completionDismissed && (!state.deployed || presentationTime >= 4),
      renderState: {
        ...state,
        deploymentElapsed: state.deployed ? presentationTime * 5 : state.deploymentElapsed,
      },
    };
  }
  function tick(time, renderDelta) {
    const state = advance(time);
    if (active() && state.deployed && simulation.time >= simulation.mission.duration) {
      presentationTime = Math.min(7, presentationTime + Math.max(0, Math.min(0.1, renderDelta || 0)));
    }
    return frame(state);
  }
  function resetAt(time) {
    simulation.reset();
    countdown.reset(simulation.mission, simulation.rate);
    clock.rebase(time);
    resetPresentation();
    subject = 'vehicle';
    hiddenPause = false;
  }
  function reset() {
    resetAt(now());
  }
  function setRocket(id) {
    simulation.setRocket(id);
    reset();
  }
  function toggle() {
    const time = now();
    advance(time);
    if (simulation.time >= simulation.mission.duration) {
      const replayRate = countdown.requestedRate;
      resetAt(time);
      countdown.setRequestedRate(replayRate);
      simulation.setRate(replayRate);
    }
    if (simulation.status === 'running') simulation.togglePause();
    else {
      if (simulation.status === 'ready') {
        countdown.arm(simulation.rate);
        simulation.setRate(1);
      }
      simulation.launch();
    }
    clock.rebase(time);
  }
  function setMode(next) {
    advance();
    if (frame().showCompletion) completionDismissed = true;
    if (simulation.status === 'running') simulation.togglePause();
    mode = next;
    clock.rebase(now());
  }
  function setSubject(next) {
    const state = simulation.state;
    subject = next === 'booster' && state.hasRecovery && state.separated ? 'booster' : 'vehicle';
    return subject;
  }
  function seek(time, target = subject) {
    simulation.seek(time);
    simulation.setRate(countdown.cancel());
    clock.rebase(now());
    resetPresentation();
    setSubject(target);
  }
  function jump(id) {
    const event = frame().timeline.markers.find((entry) => entry.id === id);
    if (event) seek(event.time, event.target);
    return event ?? null;
  }
  function nextEvent() {
    advance();
    const event = frame().timeline.nextEvent;
    if (event) seek(event.time, event.target);
    return event;
  }
  function setRate(rate) {
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      throw new RangeError('Playback rate must be a finite number greater than zero.');
    }
    advance();
    countdown.setRequestedRate(rate);
    simulation.setRate(countdown.armed ? 1 : rate);
  }
  function setVisible(next) {
    if (!next && visible) {
      advance();
      if (simulation.status === 'running') {
        simulation.togglePause();
        hiddenPause = true;
      }
    }
    visible = Boolean(next);
    clock.rebase(now());
    const notify = visible && hiddenPause;
    if (notify) hiddenPause = false;
    return notify;
  }
  return {
    tick,
    frame,
    reset,
    setRocket,
    toggle,
    setMode,
    seek,
    jump,
    nextEvent,
    setRate,
    setSubject,
    setVisible,
    dismissCompletion() {
      completionDismissed = true;
    },
    get mission() {
      return simulation.mission;
    },
  };
}
