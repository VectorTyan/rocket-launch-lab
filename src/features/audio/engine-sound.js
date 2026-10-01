/** Lazily created Web Audio graph, owned independently of module narration. */
export function createEngineSound({
  createContext,
  onChange = () => {},
  onError = () => {},
  random = Math.random,
}) {
  let context = null,
    gain = null,
    source = null,
    filter = null,
    enabled = false,
    disposed = false,
    pending = false;
  function build() {
    context = createContext();
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = random() * 2 - 1;
    source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    gain = context.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(context.destination);
    source.start();
  }
  function release() {
    if (source) {
      try {
        source.stop();
      } catch {}
      source.disconnect();
    }
    filter?.disconnect();
    gain?.disconnect();
    const closing = context;
    context = gain = source = filter = null;
    if (closing) Promise.resolve(closing.close()).catch(() => {});
  }
  async function toggle() {
    if (disposed || pending) return;
    pending = true;
    try {
      if (!context) build();
      await context.resume();
      if (disposed) return;
      enabled = !enabled;
      onChange(enabled);
    } catch (error) {
      release();
      enabled = false;
      if (!disposed) {
        onChange(false);
        onError(error);
      }
    } finally {
      pending = false;
    }
  }
  function update(mode, frame) {
    if (!gain || disposed) return;
    const state = frame.state;
    const active =
      mode === 'launch' &&
      frame.status === 'running' &&
      (frame.subject === 'booster'
        ? state.booster.engineOn
        : state.firstEngineOn || state.secondEngineOn || state.boostersEngineOn);
    gain.gain.setTargetAtTime(enabled && active ? 0.25 : 0, context.currentTime, 0.12);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    enabled = false;
    release();
  }
  return {
    toggle,
    update,
    dispose,
    get enabled() {
      return enabled;
    },
  };
}
