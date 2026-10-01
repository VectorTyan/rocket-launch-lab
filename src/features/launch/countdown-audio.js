const CUES = new Set([
  ...Array.from({ length: 10 }, (_, index) => `count-${index + 1}`),
  'ignition',
  'liftoff',
]);
const PHASES = new Set(['count', 'ignition', 'liftoff']);

function snapshotInput(countdown, currentRevision = 0) {
  const valid = countdown && PHASES.has(countdown.phase) && CUES.has(countdown.cueId);
  return {
    visible: Boolean(countdown?.visible),
    running: Boolean(countdown?.running),
    paused: Boolean(countdown?.paused),
    phase: valid ? countdown.phase : null,
    cueId: valid ? countdown.cueId : null,
    revision: countdown?.revision ?? currentRevision,
  };
}

/**
 * One current voice cue, never a playback queue. The caller supplies
 * createAudio(url), normally `url => new window.Audio(url)`.
 * update() calls play() synchronously to retain the launch click's activation.
 * onError receives {cueId, revision, reason, error}, at most once per revision.
 */
export function createCountdownAudio({ createAudio, onError } = {}) {
  if (typeof createAudio !== 'function') throw new TypeError('Countdown audio requires createAudio(url).');
  let enabled = true,
    disposed = false,
    latest = null,
    current = null,
    errorReported = false;
  const played = new Set();

  function pauseAudio(audio) {
    try {
      audio?.pause();
    } catch {
      /* Audio failures never interrupt simulation. */
    }
  }

  function releaseAudio(record) {
    const audio = record?.audio;
    if (!audio || record.releasedAudio === audio) return;
    record.releasedAudio = audio;
    record.pending = false;
    for (const [name, handler] of record.listeners) {
      try {
        audio.removeEventListener(name, handler);
      } catch {
        /* Continue releasing the remaining resources. */
      }
    }
    record.listeners.length = 0;
    pauseAudio(audio);
    try {
      audio.currentTime = 0;
    } catch {
      /* Metadata might not have loaded. */
    }
    try {
      if (typeof audio.removeAttribute === 'function') audio.removeAttribute('src');
      else audio.src = '';
    } catch {
      /* A factory may expose a read-only source. */
    }
    try {
      audio.load?.();
    } catch {
      /* Some lightweight audio implementations omit unloading. */
    }
  }

  function stopCurrent() {
    const record = current;
    current = null;
    if (!record) return;
    record.cancelled = true;
    record.playAttempt++;
    releaseAudio(record);
  }

  function wantsPlayback(record) {
    return (
      !disposed &&
      enabled &&
      current === record &&
      !record.cancelled &&
      !record.finished &&
      latest?.visible &&
      latest.running &&
      !latest.paused &&
      latest.cueId === record.cueId &&
      Object.is(latest.revision, record.revision)
    );
  }

  function reportFailure(record, reason, error) {
    if (disposed || current !== record || record.cancelled || record.finished) return;
    record.finished = true;
    record.status = 'error';
    record.playAttempt++;
    releaseAudio(record);
    if (errorReported) return;
    errorReported = true;
    try {
      onError?.({ cueId: record.cueId, revision: record.revision, reason, error });
    } catch {
      /* Notification hooks must not block the countdown. */
    }
  }

  function play(record) {
    if (!wantsPlayback(record) || record.pending || record.status === 'playing') return;
    const attempt = ++record.playAttempt;
    record.pending = true;
    record.status = 'starting';
    let promise;
    try {
      promise = record.audio.play();
    } catch (error) {
      record.pending = false;
      if (wantsPlayback(record) && attempt === record.playAttempt)
        reportFailure(record, 'play-rejected', error);
      return;
    }
    Promise.resolve(promise).then(
      () => {
        // A late play resolution may still start an old audio element. Silence it,
        // but never pause a newer resume request on the same, still-current clip.
        if (!wantsPlayback(record)) {
          pauseAudio(record.audio);
          return;
        }
        if (attempt !== record.playAttempt) return;
        record.pending = false;
        record.status = 'playing';
      },
      (error) => {
        if (!wantsPlayback(record) || attempt !== record.playAttempt) return;
        record.pending = false;
        reportFailure(record, 'play-rejected', error);
      },
    );
  }

  function startCue() {
    const record = {
      cueId: latest.cueId,
      revision: latest.revision,
      audio: null,
      releasedAudio: null,
      listeners: [],
      status: 'starting',
      pending: false,
      finished: false,
      cancelled: false,
      playAttempt: 0,
    };
    current = record;
    played.add(record.cueId);
    try {
      record.audio = createAudio(`/assets/countdown/${record.cueId}.wav`);
      if (
        !record.audio ||
        ['play', 'pause', 'addEventListener', 'removeEventListener'].some(
          (method) => typeof record.audio[method] !== 'function',
        )
      ) {
        throw new TypeError('createAudio must return an Audio-compatible event target.');
      }
      if (disposed || current !== record || record.cancelled) {
        releaseAudio(record);
        return;
      }
      record.audio.preload = 'auto';
      record.audio.autoplay = false;
      record.audio.loop = false;
      const ended = () => {
        if (disposed || current !== record || record.cancelled || record.finished) return;
        record.finished = true;
        record.status = 'ended';
        record.playAttempt++;
        releaseAudio(record);
      };
      const failed = (event) => reportFailure(record, 'resource-error', record.audio.error || event);
      for (const [name, handler] of [
        ['ended', ended],
        ['error', failed],
      ]) {
        record.audio.addEventListener(name, handler);
        record.listeners.push([name, handler]);
      }
      play(record);
    } catch (error) {
      reportFailure(record, 'audio-unavailable', error);
    }
  }

  function reconcile() {
    if (disposed) return;
    if (!enabled || !latest?.visible || !latest.cueId) {
      stopCurrent();
      return;
    }
    if (current && current.cueId !== latest.cueId) stopCurrent();
    if (!latest.running || latest.paused) {
      if (!latest.paused) {
        stopCurrent();
        return;
      }
      if (current && !current.finished && current.status !== 'paused') {
        current.playAttempt++;
        current.pending = false;
        current.status = 'paused';
        pauseAudio(current.audio);
      }
      return;
    }
    if (current) {
      if (!current.finished) play(current);
      return;
    }
    if (!played.has(latest.cueId)) startCue();
  }

  function state() {
    return Object.freeze({
      enabled,
      disposed,
      revision: latest?.revision ?? null,
      cueId: current?.cueId ?? null,
      desiredCueId: latest?.cueId ?? null,
      status: disposed
        ? 'disposed'
        : !enabled
          ? 'muted'
          : (current?.status ?? (latest?.visible && latest.paused ? 'paused' : 'idle')),
      pending: Boolean(current?.pending),
    });
  }

  function update(countdown) {
    if (disposed) return state();
    const next = snapshotInput(countdown, latest?.revision ?? 0);
    if (!latest || !Object.is(next.revision, latest.revision)) {
      stopCurrent();
      played.clear();
      errorReported = false;
    }
    latest = next;
    reconcile();
    return state();
  }

  function setEnabled(value) {
    if (disposed) return state();
    const next = Boolean(value);
    if (next === enabled) return state();
    enabled = next;
    // Unmuting is an explicit fresh request for only the currently visible cue.
    if (enabled && latest?.visible && latest.cueId) played.delete(latest.cueId);
    reconcile();
    return state();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopCurrent();
    played.clear();
    latest = null;
  }

  return {
    update,
    setEnabled,
    dispose,
    get state() {
      return state();
    },
  };
}
