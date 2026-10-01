import { createScope } from '../../app/lifecycle.js';
import { icon } from '../../ui/icons.js';
import { createCountdownAudio } from './countdown-audio.js';

/** Presentation only: mission time and engine events stay owned by the mission controller. */
export function createCountdownView({ dom, window, context, preferences, createAudio }) {
  const $ = dom.one,
    scope = createScope(window),
    overlay = $('#launch-ceremony');
  let enabled = preferences.get('countdown-voice', 'on') !== 'off';
  let previousCue = null,
    previousRevision = null,
    lastFrame = null;
  const voice = createCountdownAudio({
    createAudio: createAudio || ((src) => new window.Audio(src)),
    onError() {
      $('#countdown-voice-status').textContent = '倒计时声音暂时未能播放，画面和点火仍会正常进行。';
      $('#countdown-voice-status').hidden = false;
    },
  });
  voice.setEnabled(enabled);
  scope.own(voice.dispose);
  function text(selector, value) {
    const element = $(selector);
    if (element.textContent !== value) element.textContent = value;
  }

  function renderSwitch() {
    const button = $('#countdown-voice');
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? '关闭人声倒计时' : '开启人声倒计时');
    button.innerHTML = `${icon('volume')}人声倒计时<span>${enabled ? '开' : '关'}</span>`;
  }
  function update(frame) {
    lastFrame = frame;
    const source = frame.countdown || { visible: false };
    const countdown = { ...source, visible: context.mode === 'launch' && source.visible };
    if (countdown.revision !== previousRevision) {
      $('#countdown-voice-status').hidden = true;
      previousRevision = countdown.revision;
    }
    voice.update(countdown);
    overlay.hidden = !countdown.visible;
    if (countdown.visible) {
      const { phase, number, paused, ignitionTime, liftoffTime, cueId, requestedRate } = countdown;
      const ignitionLead = Math.max(0, liftoffTime - ignitionTime);
      overlay.dataset.phase = phase;
      overlay.dataset.number = phase === 'count' ? String(number) : '';
      overlay.classList.toggle('paused', paused);
      text('#countdown-number', phase === 'count' ? String(number) : phase === 'ignition' ? '点火' : '起飞');
      text(
        '#countdown-label',
        paused
          ? '倒计时已暂停'
          : phase === 'count'
            ? '点火倒计时'
            : phase === 'ignition'
              ? '发动机启动 · 推力建立'
              : '火箭离台 · 向着太空',
      );
      text(
        '#countdown-detail',
        paused
          ? '点击继续播放，接着倒数'
          : phase === 'count'
            ? `${context.rocket.shortName} · 点火后 ${ignitionLead} 秒离台`
            : phase === 'ignition'
              ? '发动机已点火，等待离台'
              : '飞行任务继续，保持好奇',
      );
      const length = Math.max(1, ignitionTime - frame.timeline.start);
      const progress =
        phase === 'count' ? Math.max(0, Math.min(1, (frame.time - frame.timeline.start) / length)) : 1;
      overlay.style.setProperty('--countdown-progress', String(progress));
      if (cueId !== previousCue) {
        previousCue = cueId;
        // Restart a single beat only when the spoken cue changes, never per frame.
        overlay.classList.remove('beat');
        void overlay.offsetWidth;
        overlay.classList.add('beat');
      }
      text(
        '#countdown-playback-note',
        requestedRate !== 1
          ? `点火与离台阶段 1× · 随后恢复 ${requestedRate}×`
          : '点火与离台阶段按正常速度播放',
      );
    } else {
      previousCue = null;
      text(
        '#countdown-playback-note',
        frame.status === 'ready' ? '跟随人声倒数，再见证点火与起飞' : '重置后可再次体验发射倒计时',
      );
    }
    for (const button of dom.all('[data-rate]')) {
      const queued =
        countdown.visible &&
        countdown.requestedRate !== 1 &&
        Number(button.dataset.rate) === countdown.requestedRate;
      button.classList.toggle('queued-rate', queued);
      button.title = queued ? `离台后恢复 ${countdown.requestedRate}×` : `${button.dataset.rate}× 时间倍率`;
    }
  }
  scope.on($('#countdown-voice'), 'click', () => {
    enabled = !enabled;
    preferences.set('countdown-voice', enabled ? 'on' : 'off');
    $('#countdown-voice-status').hidden = true;
    voice.setEnabled(enabled);
    renderSwitch();
    if (lastFrame) update(lastFrame);
  });
  renderSwitch();
  return { update, dispose: scope.dispose };
}
