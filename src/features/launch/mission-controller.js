import { FleetSimulation } from '../../fleet-simulation.js';
import { MissionClock, timelinePresentation } from '../../mission-timeline.js';

/** Application playback policy. No DOM, browser globals, or Three.js dependency. */
export function createMissionController(rocketId, { now = () => performance.now() } = {}) {
  const simulation = new FleetSimulation(rocketId);
  const clock = new MissionClock(simulation, now());
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
    const { state } = clock.advance(time, active());
    clock.drainEvents();
    return state;
  }
  function frame(state = simulation.state) {
    const complete = simulation.time >= simulation.mission.duration;
    return {
      state,
      mission: simulation.mission,
      time: simulation.time,
      status: complete ? 'complete' : simulation.status,
      rate: simulation.rate,
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
  function reset() {
    simulation.reset();
    clock.rebase(now());
    resetPresentation();
    subject = 'vehicle';
    hiddenPause = false;
  }
  function setRocket(id) {
    simulation.setRocket(id);
    reset();
  }
  function toggle() {
    advance();
    if (simulation.time >= simulation.mission.duration) reset();
    if (simulation.status === 'running') simulation.togglePause();
    else simulation.launch();
    clock.rebase(now());
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
    clock.setRate(rate, now(), active());
    clock.drainEvents();
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
