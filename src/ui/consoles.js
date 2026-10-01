import { icon } from './icons.js';
import { formatTime } from './formatters.js';
import { PLAYBACK_RATES } from './config.js';

function renderRecoveryNavigation(mission) {
  if (!mission.hasRecovery || mission.events.some((event) => event.id === 'recovery-complete')) return '';
  return `<button data-jump="${mission.recoveryTime}" title="独立的一级陆地回收教学示意"><i></i>一级着陆<small>${formatTime(mission.recoveryTime)} · 示意</small></button>`;
}

export function renderConsoles({ mission }) {
  return `
<footer class="flight-console" id="flight-console">
        <div class="console-controls"><div class="launch-actions"><button class="launch-button" id="launch">${icon('launch')}<span>启动发射</span><kbd>SPACE</kbd></button><button class="reset-button" id="reset" title="重置任务 (R)" aria-label="重置任务">${icon('reset')}</button></div><div class="playback"><span>时间倍率</span><div class="rates">${PLAYBACK_RATES.map((rate) => `<button data-rate="${rate}" class="${rate === 1 ? 'active' : ''}" aria-pressed="${rate === 1}">${rate}×</button>`).join('')}</div></div><button class="next-event" id="next-event">下一事件 ${icon('arrow')}</button></div>
        <div class="timeline-row"><span id="timeline-start">T−00:10</span><div class="timeline-track"><input type="range" id="timeline" aria-label="任务时间轴" min="-10" max="${mission.duration}" value="-10" step="0.1"/><div class="timeline-markers" id="timeline-markers" aria-hidden="true"></div></div><span id="timeline-end">${formatTime(mission.duration)}</span></div>
        <div class="timeline-status"><span id="timeline-current-event">等待发射</span><span id="timeline-next-event"></span></div><div class="event-navigation-label">事件导航 · 按发生顺序，点击可跳转 <span>上方刻度按任务时长排列</span></div>
        <div class="event-strip" aria-label="关键飞行事件">${mission.events
          .filter((e) => !['ignition', 'meco', 'ses-1', 'ses-2', 'seco-2'].includes(e.id))
          .map(
            (e) =>
              `<button data-event="${e.id}" title="${e.detail}"><i></i>${e.label}<small>${formatTime(e.time)}</small></button>`,
          )
          .join('')}${renderRecoveryNavigation(mission)}</div>
      </footer>
      <footer class="explore-console" id="explore-console" hidden><span>${icon('layers')}认识部件，理解协作。<small>整体尺寸依据公开资料，模块细节为教学示意。</small></span><button id="back-to-launch">前往发射台 ${icon('arrow')}</button></footer>
      <footer class="assembly-console" id="assembly-console" hidden><div><strong id="assembly-action-label">选一块零件开始吧</strong><small>可以拖动三维零件，也可以点按钮安装。</small></div><button id="assembly-install">${icon('build')}装上这一块</button><button id="assembly-launch" disabled>${icon('launch')}去发射</button></footer>
  `;
}
