import { getModuleNarration } from '../../module-narration.js';
import { NARRATION_AUDIO } from '../../narration-audio.js';
import { createNarrator } from '../../narrator.js';
import { createScope } from '../../app/lifecycle.js';
import { icon } from '../../ui/icons.js';

export function createNarrationFeature({ dom, window, createAudio = (src) => new window.Audio(src) }) {
  const $ = dom.one,
    scope = createScope(window);
  function render({ status, error }) {
    const playing = ['playing', 'loading'].includes(status);
    $('#narration-play').innerHTML =
      `${icon(playing ? 'pause' : 'volume')}<span>${playing ? '暂停讲解' : status === 'paused' ? '继续听' : '听讲解'}</span>`;
    $('#narration-play').setAttribute(
      'aria-label',
      playing ? '暂停部件讲解' : status === 'paused' ? '继续部件讲解' : '播放部件讲解',
    );
    $('#narration-status').textContent =
      error ||
      {
        idle: '点一下喇叭，听听它的故事。',
        loading: '正在打开本地讲解…',
        playing: '正在讲解 · 可以边听边转动模型',
        paused: '已暂停，点“继续听”接着听。',
        ended: '听完啦！再选一个部件探索吧。',
      }[status];
    $('#module-detail').classList.toggle('speaking', playing);
    $('#module-detail').classList.toggle('has-narration-error', Boolean(error));
  }
  const player = createNarrator({ createAudio, onChange: render });
  scope.on($('#narration-play'), 'click', () => player.toggle());
  scope.own(() => player.dispose());
  function setPart(rocketId, partId) {
    const lesson = getModuleNarration(rocketId, partId),
      record = lesson && NARRATION_AUDIO[lesson.key];
    player.setLesson(
      lesson ? { ...lesson, audio: record?.text === lesson.text ? record.audio : null } : null,
    );
    // Spoken copy stays in the audio manifest; the visible panel presents module facts.
  }
  return { setPart, stop: player.stop, pause: player.pause, dispose: scope.dispose };
}
