import { icon } from './icons.js';

export function renderViewport({ site }) {
  return `
<div class="viewport-wrap">
        <div id="viewport"></div>
        <div class="scene-shade"></div>
        <div class="scene-topline"><div><span class="eyebrow" id="scene-kicker">${site.kicker}</span><h2 id="scene-title">${site.shortName}</h2><p id="scene-location">${site.padLabel} · 发射台待命</p></div><span class="scene-quality" id="quality-label">电影画质 · 教学场景</span></div>
        <div class="mission-clock" id="clock-box"><span id="mission-state"><i></i>系统就绪</span><strong id="clock">T−00:10</strong><small id="phase">等待你的发射指令</small></div>
        <div class="telemetry" id="telemetry"><div class="telemetry-heading"><i></i>飞行数据<small>教学插值</small></div><div class="metric"><span>高度 ALTITUDE</span><strong id="altitude">0.00<small>km</small></strong><div class="metric-bar"><i id="altitude-bar"></i></div></div><div class="metric"><span>速度 VELOCITY</span><strong id="velocity">0<small>m/s</small></strong></div><div class="metric small-metric"><span>发动机状态</span><strong id="engine-status">待机</strong></div><div class="metric small-metric"><span>当前视角</span><strong id="view-name">自由环绕</strong></div></div>
        <section id="launch-ceremony" class="launch-ceremony" data-phase="count" data-number="" aria-label="点火倒计时" hidden>
          <span class="countdown-kicker">点火倒计时</span>
          <div class="countdown-dial">
            <svg class="countdown-ring" viewBox="0 0 100 100" fill="none" aria-hidden="true">
              <circle class="countdown-ring-track" cx="50" cy="50" r="44" pathLength="100" />
              <circle class="countdown-ring-progress" cx="50" cy="50" r="44" pathLength="100" />
            </svg>
            <strong id="countdown-number" role="timer" aria-live="off">—</strong>
          </div>
          <div class="countdown-copy"><strong id="countdown-label" role="status" aria-live="polite" aria-atomic="true">准备点火</strong><p id="countdown-detail">按当前型号的点火节拍推进</p></div>
        </section>
        <article class="module-detail" id="module-detail" hidden><span class="eyebrow">COMPONENT INSIGHT</span><div class="module-heading-row"><h2 id="part-name"></h2><button type="button" id="narration-play">${icon('volume')}<span>听讲解</span></button></div><p class="part-subtitle" id="part-subtitle"></p>
          <p id="narration-status" role="status" aria-live="polite"></p>
          <section class="module-more" aria-label="模块介绍"><p id="part-description"></p><ul id="part-facts"></ul><p class="accuracy-note" id="part-accuracy"></p></section><section class="interior-details" id="interior-details" hidden><h3>内部结构依据</h3><span id="interior-confidence"></span><ul id="interior-features"></ul><p id="interior-description"></p><div id="interior-sources"></div></section></article>
        <article class="assembly-coach" id="assembly-coach" hidden><span class="eyebrow">你的造箭小任务</span><span class="assembly-step" id="assembly-step">01</span><h2 id="assembly-task"></h2><p id="assembly-instruction"></p><div class="assembly-fact"><span>${icon('info')}原来是这样</span><p id="assembly-fact"></p></div><button id="assembly-hint">${icon('target')}给我一点提示</button><p class="assembly-feedback" id="assembly-feedback" role="status" aria-live="polite"></p></article>
        <div id="assembly-target-label" class="assembly-target-label" hidden>放到这里 <span>＋</span></div>
        <div class="assembly-tray-caption" id="assembly-tray-caption" hidden>${icon('build')}拿起零件，放进发光轮廓</div>
        <div id="assembly-celebration" class="assembly-celebration" hidden><span class="builder-medal">${icon('star')}</span><p class="eyebrow">MISSION BUILT BY YOU</p><h2>小小火箭工程师！</h2><p id="assembly-congratulations">每块零件都找到自己的位置啦。</p><button id="assembly-finish-launch">我的火箭，出发！ ${icon('launch')}</button><div><button id="assembly-again">再搭一次</button><button id="assembly-admire">欣赏作品</button></div></div>
        <div class="assembly-confetti" id="assembly-confetti" aria-hidden="true"></div>
        <div class="scene-bottomline"><span><i></i><span id="scene-mode-label">LAUNCH SIMULATION</span></span><span id="scene-hint">拖动探索视角 <span class="dot-separator">·</span> 滚轮缩放</span><button id="reset-camera" title="复位相机">${icon('target')}复位视角</button></div>
        <div class="completion" id="completion" hidden><span class="completion-icon">${icon('check')}</span><span class="eyebrow">MISSION COMPLETE</span><h2>下一站，宇宙。</h2><p>载荷已部署。你已完成本次发射科普体验。</p><div><button id="completion-explore">探索火箭结构 ${icon('arrow')}</button><button id="completion-replay">再发射一次</button><button id="completion-close" class="quiet">继续观察</button></div></div>
        <div class="toast" id="toast" role="status" aria-live="polite"></div>
      </div>
  `;
}
