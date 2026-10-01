import { getModuleNarration } from '../../module-narration.js';
import { NARRATION_AUDIO } from '../../narration-audio.js';
import { createNarrator } from '../../narrator.js';
import { createScope } from '../../app/lifecycle.js';
import { icon } from '../../ui/icons.js';

export function createNarrationFeature({ dom, window, createAudio = (src) => new window.Audio(src) }) {
  const $ = dom.one,
    scope = createScope(window);
  function render({ status, slow, error }) {
    const playing = ['playing', 'loading'].includes(status);
    $('#narration-play').innerHTML =
      `${icon(playing ? 'pause' : 'volume')}<span>${playing ? '暂停讲解' : status === 'paused' ? '继续听' : status === 'ended' ? '再听一遍' : '听讲解'}</span>`;
    $('#narration-play').setAttribute(
      'aria-label',
      playing ? '暂停部件讲解' : status === 'paused' ? '继续部件讲解' : '播放部件讲解',
    );
    $('#narration-stop').disabled = !playing && status !== 'paused';
    $('#narration-slow').setAttribute('aria-pressed', String(slow));
    $('#narration-status').textContent =
      error ||
      {
        idle: '点一下喇叭，听听它的故事。',
        loading: '正在打开本地讲解…',
        playing: '正在讲解 · 可以边听边转动模型',
        paused: '已暂停，点“继续听”接着听。',
        ended: '听完啦！再选一个部件探索吧。',
      }[status];
    $('.module-narration').classList.toggle('speaking', playing);
  }
  const player = createNarrator({ createAudio, onChange: render });
  scope.on($('#narration-play'), 'click', () => player.toggle());
  scope.on($('#narration-stop'), 'click', () => player.stop());
  scope.on($('#narration-replay'), 'click', () => player.replay());
  scope.on($('#narration-slow'), 'click', () => player.setSlow(!player.state.slow));
  scope.own(() => player.dispose());
  function setPart(rocketId, partId) {
    const lesson = getModuleNarration(rocketId, partId),
      record = lesson && NARRATION_AUDIO[lesson.key];
    player.setLesson(
      lesson ? { ...lesson, audio: record?.text === lesson.text ? record.audio : null } : null,
    );
    $('#narration-story').replaceChildren(
      ...(lesson?.sentences || []).map((sentence) => {
        const p = dom.document.createElement('p');
        p.textContent = sentence;
        return p;
      }),
    );
  }
  return { setPart, stop: player.stop, pause: player.pause, dispose: scope.dispose };
}
