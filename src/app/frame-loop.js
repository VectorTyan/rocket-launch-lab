/** A cancellable loop; wall-clock mission time is calculated by the mission controller. */
export function createFrameLoop({ requestFrame, cancelFrame, onFrame, now }) {
  let handle = null,
    running = false,
    disposed = false,
    previous = now();
  function tick(time) {
    if (!running) return;
    handle = null;
    const delta = Math.max(0, Math.min((time - previous) / 1000, 0.1));
    previous = time;
    onFrame(time, delta);
    if (running) handle = requestFrame(tick);
  }
  function start() {
    if (running || disposed) return;
    running = true;
    previous = now();
    handle = requestFrame(tick);
  }
  function stop() {
    running = false;
    if (handle !== null) cancelFrame(handle);
    handle = null;
  }
  function dispose() {
    disposed = true;
    stop();
  }
  return { start, stop, dispose };
}
