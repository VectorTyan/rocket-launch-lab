import { createScope, setPressed } from '../../app/lifecycle.js';
import { icon } from '../../ui/icons.js';
import { formatTime } from '../../ui/formatters.js';
import { CAMERA_MODES } from '../../ui/config.js';

/** Flight controls and telemetry. Playback rules live in mission-controller.js. */
export function createLaunchFeature({ dom, window, context, mission, toast, onChange, onExplore }) {
  const $ = dom.one,
    scope = createScope(window);
  let view = 'orbit',
    lastStatus = '',
    markerElements = new Map();
  const active = () => context.mode === 'launch';
  function syncCamera(reset = false) {
    const frame = mission.frame();
    $('#subject-choice').value = frame.subject;
    if (active()) {
      context.scene?.setSubject(frame.subject);
      if (reset) context.scene?.setView(view);
    }
  }
  function setView(id) {
    if (!CAMERA_MODES.some((item) => item[0] === id)) return;
    view = id;
    if (active()) context.scene?.setView(id);
    setPressed(dom.all('[data-camera]'), (button) => button.dataset.camera === id);
    $('#view-name').textContent = CAMERA_MODES.find((item) => item[0] === id)[2];
    $('#subject-note').textContent =
      id === 'orbit' ? '拖动旋转 · 滚轮缩放 · 右键平移' : '相机自动追踪；选择自由环绕可手动观察。';
    onChange();
  }
  function reset() {
    mission.reset();
    syncCamera(true);
    render();
  }
  function toggle() {
    if (!context.scene) return;
    mission.toggle();
    syncCamera();
    render();
  }
  function seek(time) {
    mission.seek(time);
    syncCamera(true);
    render();
  }
  function setRate(value) {
    mission.setRate(value);
    render();
  }
  function jump(id) {
    const event = mission.jump(id);
    if (!event) return;
    syncCamera(true);
    render();
    toast(`${event.label} · ${formatTime(event.time)} · 已暂停`);
  }
  function setRocket() {
    const frame = mission.frame();
    $('#mission-profile').textContent = frame.mission.label;
    $('#mission-profile').title = frame.mission.accuracy;
    $('#timeline').max = frame.mission.duration;
    $('#timeline-end').textContent = formatTime(frame.mission.duration);
    $('#completion h2').textContent =
      context.rocket.id === 'starship' ? '奔向更远的星空。' : '下一站，宇宙。';
    $('#completion p').textContent = frame.mission.completionLabel + '。本次科普演示已完成。';
    $('#subject-choice option[value="booster"]').hidden = !frame.mission.hasRecovery;
    $('.subject-control').hidden = !frame.mission.hasRecovery;
    $('#timeline-markers').innerHTML = frame.timeline.markers
      .map(
        (event) =>
          `<i data-marker="${event.id}" style="left:${event.percent}%" title="${event.label} · ${formatTime(event.time)}"></i>`,
      )
      .join('');
    $('.event-strip').innerHTML = frame.timeline.markers
      .map(
        (event) =>
          `<button data-timeline-event="${event.id}" title="${event.detail}"><i></i>${event.label}<small>${formatTime(event.time)}${event.kind === 'recovery' ? ' · 示意' : ''}</small></button>`,
      )
      .join('');
    markerElements = new Map(
      frame.timeline.markers.map((event) => [
        event.id,
        {
          tick: $(`[data-marker="${event.id}"]`),
          button: $(`[data-timeline-event="${event.id}"]`),
        },
      ]),
    );
    lastStatus = '';
    syncCamera();
    setView(view);
    render();
  }
  function render(frame = mission.frame()) {
    setPressed(dom.all('[data-rate]'), (button) => Number(button.dataset.rate) === frame.rate);
    if (!active()) return;
    const { state, status, subject, timeline, presentationTime } = frame;
    const viewingBooster = subject === 'booster' && state.separated && frame.mission.hasRecovery;
    const altitude = viewingBooster ? state.booster.altitude : state.altitude;
    $('#scene-location').textContent =
      `${context.site.padLabel} · ${status === 'ready' ? '发射台待命' : viewingBooster ? '一级回收教学示意' : frame.mission.label}`;
    $('#clock').textContent = formatTime(state.time);
    $('#timeline').value = state.time;
    $('#timeline').style.setProperty('--progress', `${timeline.percent}%`);
    $('#timeline').setAttribute(
      'aria-valuetext',
      `${formatTime(state.time)}，${timeline.currentEvent?.label || '发射准备'}`,
    );
    $('#timeline-current-event').textContent = timeline.currentEvent
      ? `最近发生：${timeline.currentEvent.label} · ${formatTime(timeline.currentEvent.time)}`
      : '准备发射';
    $('#timeline-next-event').textContent = timeline.nextEvent
      ? `下一事件：${timeline.nextEvent.label} · ${formatTime(timeline.nextEvent.time)}`
      : '全部事件已到达';
    $('#phase').textContent = viewingBooster
      ? state.booster.landed
        ? '一级已着陆 · 教学示意'
        : '一级返航 · 教学示意'
      : status === 'ready'
        ? '等待你的发射指令'
        : state.deployed && presentationTime < 4
          ? '载荷分离展示中'
          : state.phase;
    $('#altitude').innerHTML = `${(altitude / 1000).toFixed(altitude >= 100000 ? 1 : 2)}<small>km</small>`;
    $('#velocity').innerHTML = viewingBooster
      ? '—<small>未建模</small>'
      : `${Math.round(state.velocity).toLocaleString('en-US')}<small>m/s</small>`;
    $('#altitude-bar').style.width = `${Math.min(100, (altitude / 210000) * 100)}%`;
    const engines = state.boostersEngineOn
      ? context.rocket.liftoffEngineCount
      : context.rocket.firstStageEngines;
    $('#engine-status').textContent = viewingBooster
      ? state.booster.engineOn
        ? '回收点火'
        : '关机'
      : state.firstEngineOn && state.secondEngineOn
        ? '热分级 · 两级点火'
        : state.firstEngineOn
          ? `起飞段 · ${engines} 台工作`
          : state.secondEngineOn
            ? `上面级 · ${context.rocket.secondStageEngines} 台工作`
            : state.time < -3
              ? '待机'
              : '关机 / 滑行';
    $('#subject-choice option[value="booster"]').disabled = !state.separated || !frame.mission.hasRecovery;
    $('#site-choice').disabled = status !== 'ready';
    $('#next-event').disabled = state.time >= frame.mission.duration;
    $('#subject-choice').value = subject;
    if (status !== lastStatus) {
      $('#mission-state').innerHTML =
        `<i class="${status === 'running' ? 'live' : ''}"></i>${{ ready: '系统就绪', running: '任务进行中', paused: '时间已暂停', complete: '任务完成' }[status]}`;
      $('#launch').innerHTML =
        `${icon(status === 'running' ? 'pause' : status === 'ready' ? 'launch' : 'play')}<span>${{ ready: '启动发射', running: '暂停任务', paused: '继续播放', complete: '重新发射' }[status]}</span><kbd>SPACE</kbd>`;
      $('#launch').classList.toggle('in-flight', status === 'running');
      lastStatus = status;
    }
    $('#launch').disabled = !context.scene;
    for (const event of timeline.markers) {
      const elements = markerElements.get(event.id);
      if (!elements) continue;
      const current = timeline.currentEvent?.id === event.id;
      elements.tick.classList.toggle('passed', event.passed);
      elements.button.classList.toggle('passed', event.passed);
      elements.tick.classList.toggle('current', current);
      elements.button.classList.toggle('current', current);
      elements.button.setAttribute('aria-current', current ? 'step' : 'false');
    }
    $('#completion').hidden = !frame.showCompletion;
  }
  function activate() {
    syncCamera(true);
    setView(view);
    render();
  }
  for (const b of dom.all('[data-camera]')) scope.on(b, 'click', () => setView(b.dataset.camera));
  for (const b of dom.all('[data-rate]')) scope.on(b, 'click', () => setRate(Number(b.dataset.rate)));
  scope.on($('.event-strip'), 'click', (event) => {
    const b = event.target.closest('[data-timeline-event]');
    if (b) jump(b.dataset.timelineEvent);
  });
  scope.on($('#launch'), 'click', toggle);
  scope.on($('#reset'), 'click', reset);
  scope.on($('#timeline'), 'input', (event) => seek(Number(event.target.value)));
  scope.on($('#next-event'), 'click', () => {
    const event = mission.nextEvent();
    if (event) {
      syncCamera(true);
      render();
      toast(`${event.label} · ${formatTime(event.time)}`);
    }
  });
  scope.on($('#subject-choice'), 'change', (event) => {
    mission.setSubject(event.target.value);
    syncCamera(true);
    render();
    if (mission.frame().subject === 'booster') toast('正在观察一级回收 · 教学示意');
  });
  scope.on($('#completion-explore'), 'click', onExplore);
  scope.on($('#completion-replay'), 'click', reset);
  scope.on($('#completion-close'), 'click', () => {
    mission.dismissCompletion();
    render();
  });
  return {
    render,
    reset,
    toggle,
    seek,
    setRate,
    setView,
    setRocket,
    activate,
    get view() {
      return view;
    },
    dispose: scope.dispose,
  };
}
