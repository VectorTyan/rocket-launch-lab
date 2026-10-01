import { icon } from './icons.js';
import { CAMERA_MODES } from './config.js';

export function renderSidebar({
  rocket: ROCKET,
  rocketOptions: ROCKETS,
  modules: MODULES,
  sites: SITES,
  themes: STUDIO_THEMES,
  studioThemeId,
  site,
  mission,
}) {
  return `
<aside class="sidebar">
      <div class="mission-heading"><span class="eyebrow" id="program-label">${ROCKET.program} / VEHICLE COLLECTION</span><span class="edition">${ROCKETS.length} 型号</span></div>
      <h1 id="rocket-title">${ROCKET.shortName}</h1><p class="rocket-subtitle" id="rocket-subtitle">${ROCKET.variant}</p>
      <p class="intro" id="rocket-intro">${ROCKET.description}</p>
      <div class="specs"><div><strong id="spec-height">${ROCKET.height}<span> m</span></strong><small>全箭高度</small></div><div><strong id="spec-diameter">${ROCKET.diameter}<span> m</span></strong><small>芯级直径</small></div><div><strong id="spec-stages">${ROCKET.stages}<span> 级</span></strong><small>串联级数</small></div></div>
      <label class="field-label" for="rocket-choice">火箭型号 · ROCKET LIBRARY</label><select id="rocket-choice">${ROCKETS.map((r) => `<option value="${r.id}" ${r.id === ROCKET.id ? 'selected' : ''}>${r.name}</option>`).join('')}</select>
      <div class="studio-theme-control" id="studio-theme-control" hidden><label class="field-label" for="studio-theme-choice">展厅主题</label><select id="studio-theme-choice">${STUDIO_THEMES.map((t) => `<option value="${t.id}" ${t.id === studioThemeId ? 'selected' : ''}>${t.name}</option>`).join('')}</select><p id="studio-theme-description"></p></div>
      <section id="launch-panel">
        <div class="section-title"><h2>发射任务</h2><span>MISSION SETUP</span></div>
        <label class="field-label" for="site-choice">发射场</label><select id="site-choice">${SITES.map((s) => `<option value="${s.id}" ${s.id === site.id ? 'selected' : ''}>${s.name}</option>`).join('')}</select>
        <div class="site-caption"><span id="site-region"></span><span id="site-coords"></span></div>
        <a id="site-map" class="map-reference" href="${site.mapUrl}" target="_blank" rel="noopener noreferrer">${icon('globe')}地图位置参考 ↗</a>
        <p class="mission-profile" id="mission-profile">${mission.label}</p>
        <div class="section-title camera-title"><h2>观察视角</h2><span>CAMERA</span></div>
        <div class="camera-list">${CAMERA_MODES.map(([id, ic, label], i) => `<button data-camera="${id}" class="camera-option ${i === 0 ? 'active' : ''}" aria-pressed="${i === 0}">${icon(ic)}<span>${label}</span><kbd>${i + 1}</kbd></button>`).join('')}</div>
        <div class="subject-control"><label for="subject-choice">追踪对象</label><select id="subject-choice"><option value="vehicle">主箭体 / 第二级</option><option value="booster" disabled>一级回收（分级后可选）</option></select></div>
        <p class="muted-note" id="subject-note">拖动旋转 · 滚轮缩放 · 右键平移</p>
      </section>
      <section id="structure-panel" hidden>
        <div class="section-title"><h2>模块拆解</h2><span id="module-count">EXPLORE / ${MODULES.length}</span></div>
        <div class="structure-view-tabs" aria-label="结构观察方式"><button data-structure-view="exterior" class="active" aria-pressed="true">完整外观</button><button data-structure-view="cutaway" aria-pressed="false">剖视图</button></div>
        <div id="cutaway-tools" hidden>
          <div class="explode-heading"><label for="cutaway-offset">整箭剖面位置</label><output id="cutaway-value">中线</output></div>
          <input id="cutaway-offset" aria-label="整箭剖面位置" type="range" min="-0.8" max="0.8" step="0.02" value="0" />
          <div class="cutaway-key"><span><i class="oxidizer-swatch"></i>氧化剂舱</span><span><i class="fuel-swatch"></i>燃料舱</span><span><i class="structure-swatch"></i>管路与支撑</span></div>
          <p class="cutaway-caution" id="cutaway-note">公开结构关系参考；储箱容积、管路及连接件细节为示意。</p>
          <button class="section-front-button" id="section-front">${icon('target')}正面剖视</button>
        </div>
        <div class="explode-heading" id="explode-heading"><label for="explode">展开程度</label><output id="explode-value">0%</output></div><input id="explode" aria-label="展开程度" type="range" min="0" max="1" step="0.01" value="0" />
        <div class="structure-actions"><button id="assemble">${icon('reset')}复原</button><button id="focus-part">${icon('target')}聚焦模块</button></div><button class="isolate-button" id="isolate-part" aria-pressed="false">${icon('layers')}单独查看当前模块</button>
        <div class="module-list" aria-label="火箭模块">${MODULES.map((part, i) => `<button data-part="${part.id}" class="${i === 0 ? 'active' : ''}" aria-pressed="${i === 0}"><span class="module-number">${String(i + 1).padStart(2, '0')}</span><span>${part.name}</span>${icon('arrow')}</button>`).join('')}</div>
        <p class="muted-note">也可以直接点击三维模型选中部件。</p>
      </section>
      <section id="assembly-panel" hidden>
        <div class="section-title"><h2>一起搭火箭</h2><span>BUILD & DISCOVER</span></div>
        <div class="assembly-difficulty" aria-label="组装玩法"><button data-guided="true" class="active" aria-pressed="true">跟我搭</button><button data-guided="false" aria-pressed="false">小工程师</button></div>
        <div class="assembly-progress"><div><span>组装进度</span><strong id="assembly-count">0 / ${MODULES.length}</strong></div><div class="assembly-meter"><i id="assembly-meter-fill"></i></div></div>
        <div class="assembly-palette" id="assembly-palette" aria-label="待组装零件"></div>
        <div class="assembly-small-actions"><button id="assembly-undo">${icon('reset')}撤销一步</button><button id="assembly-reset">重新组装</button></div>
        <p class="assembly-save-note">进度保存在本机。模型拼搭不代表工厂总装流程。</p>
      </section>
      <div class="sidebar-footer"><span class="tiny-orbit">◌</span><span>保持好奇，向上探索。<small>A SMALL STEP INTO SPACE.</small></span></div>
    </aside>
  `;
}
