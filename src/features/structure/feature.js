import { getModules } from '../../fleet-data.js';
import { getInteriorSpec, INTERIOR_SOURCES } from '../../interior-data.js';
import { createScope, setPressed } from '../../app/lifecycle.js';
import { createNarrationFeature } from './narration.js';
import { icon } from '../../ui/icons.js';

export function createStructureFeature({ dom, window, context, onChange, createAudio }) {
  const $ = dom.one,
    scope = createScope(window);
  const narration = createNarrationFeature({ dom, window, createAudio });
  scope.own(narration.dispose);
  let selectedPart = 'stage1',
    view = 'exterior',
    explode = 0,
    offset = 0,
    isolated = false;
  const active = () => context.mode === 'structure';

  function renderInterior() {
    const spec = getInteriorSpec(context.rocket.id, selectedPart);
    $('#interior-details').hidden = view !== 'cutaway';
    $('#interior-confidence').textContent =
      spec.confidence === 'confirmed' ? '结构原理有公开依据' : '布局细节待核实';
    $('#interior-features').innerHTML = spec.features.map((f) => `<li>${f}</li>`).join('');
    $('#interior-description').textContent = spec.notes;
    $('#interior-sources').innerHTML = spec.sourceIds
      .map((id) => INTERIOR_SOURCES.find((s) => s.id === id))
      .filter(Boolean)
      .slice(0, 3)
      .map(
        (s) =>
          `<a href="${s.url}" target="_blank" rel="noopener noreferrer" title="${s.scope}">${s.title} ↗</a>`,
      )
      .join('');
    const tank = ['stage1', 'stage2'].includes(selectedPart) || selectedPart.startsWith('booster-');
    $('.cutaway-key').innerHTML =
      !tank && isolated
        ? '<span><i class="structure-swatch"></i>结构与设备示意</span>'
        : tank && spec.order === 'unknown'
          ? `<span><i class="unknown-swatch"></i>舱区范围 · 未定箱序</span><span class="propellant-note">氧化剂：${spec.oxidizerLabel}<br>燃料：${spec.fuelLabel}</span>`
          : `<span><i class="oxidizer-swatch"></i>${spec.oxidizerLabel === '不适用' ? '氧化剂舱' : spec.oxidizerLabel}</span><span><i class="fuel-swatch"></i>${spec.fuelLabel === '不适用' ? '燃料舱' : spec.fuelLabel}</span><span><i class="structure-swatch"></i>管路与支撑</span>`;
  }
  function renderControls() {
    const cutting = view === 'cutaway';
    dom.root.dataset.inspection = view;
    $('#cutaway-tools').hidden = !cutting;
    $('#explode').hidden = cutting;
    $('#explode').disabled = cutting;
    $('#explode-heading').hidden = cutting;
    $('#explode').value = explode;
    $('#explode-value').textContent = `${Math.round(explode * 100)}%`;
    $('#cutaway-offset').value = offset;
    $('#cutaway-value').textContent =
      Math.abs(offset) < 0.01 ? '中线' : `${offset > 0 ? '+' : ''}${Math.round(offset * 100)}%`;
    $('#isolate-part').setAttribute('aria-pressed', String(isolated));
    const label = isolated ? '模块剖面位置' : '整箭剖面位置';
    $('label[for="cutaway-offset"]').textContent = label;
    $('#cutaway-offset').setAttribute('aria-label', label);
    $('#cutaway-note').textContent =
      '彩色舱按已核布局关系展示；灰色表示内部布局待核实。尺寸、管路和连接细节仍为教学近似。';
    setPressed(dom.all('[data-structure-view]'), (b) => b.dataset.structureView === view);
  }
  function select(id) {
    const part = getModules(context.rocket.id).find((p) => p.id === id);
    if (!part) return false;
    selectedPart = id;
    if (active()) context.scene?.setSelected(id);
    setPressed(dom.all('[data-part]'), (b) => b.dataset.part === id);
    $('#part-name').textContent = part.name;
    $('#part-subtitle').textContent = part.subtitle;
    $('#part-description').textContent = part.description;
    $('#part-facts').innerHTML = part.facts.map((f) => `<li>${f}</li>`).join('');
    $('#part-accuracy').textContent = part.accuracy;
    narration.setPart(context.rocket.id, id);
    renderInterior();
    return true;
  }
  function setView(next) {
    view = next === 'cutaway' ? 'cutaway' : 'exterior';
    if (view === 'cutaway') {
      explode = 0;
      isolated = false;
      context.scene?.setExplode(0);
      context.scene?.setIsolated(false);
    }
    context.scene?.setCutaway(active() && view === 'cutaway');
    renderControls();
    renderInterior();
    onChange();
  }
  function setOffset(value) {
    offset = Math.max(-0.8, Math.min(0.8, Number(value) || 0));
    context.scene?.setCutawayOffset(offset);
    renderControls();
  }
  function setIsolated(value) {
    isolated = Boolean(value);
    context.scene?.setIsolated(isolated);
    renderControls();
    renderInterior();
  }
  function restore() {
    explode = 0;
    setIsolated(false);
    setView('exterior');
    context.scene?.setExplode(0);
    context.scene?.setSelected(selectedPart);
  }
  function setRocket() {
    narration.stop();
    selectedPart = getModules(context.rocket.id)[0].id;
    view = 'exterior';
    explode = 0;
    offset = 0;
    isolated = false;
    const modules = getModules(context.rocket.id);
    $('#module-count').textContent = `EXPLORE / ${modules.length}`;
    $('.module-list').innerHTML = modules
      .map(
        (p, i) =>
          `<button data-part="${p.id}" aria-pressed="false"><span class="module-number">${String(i + 1).padStart(2, '0')}</span><span>${p.name}</span>${icon('arrow')}</button>`,
      )
      .join('');
    context.scene?.setCutawayOffset(0);
    context.scene?.setIsolated(false);
    context.scene?.setExplode(0);
    renderControls();
    select(selectedPart);
  }
  function activate() {
    context.scene?.setExplode(explode);
    context.scene?.setCutaway(view === 'cutaway');
    context.scene?.setIsolated(isolated);
    select(selectedPart);
    renderControls();
  }
  function deactivate(nextMode) {
    narration.stop();
    setView('exterior');
    if (nextMode === 'assembly') setIsolated(false);
  }
  scope.on($('.module-list'), 'click', (e) => {
    const b = e.target.closest('[data-part]');
    if (b) select(b.dataset.part);
  });
  for (const b of dom.all('[data-structure-view]'))
    scope.on(b, 'click', () => setView(b.dataset.structureView));
  scope.on($('#cutaway-offset'), 'input', (e) => setOffset(e.target.value));
  scope.on($('#explode'), 'input', (e) => {
    explode = Number(e.target.value);
    context.scene?.setExplode(explode);
    renderControls();
  });
  scope.on($('#section-front'), 'click', () => {
    setOffset(0);
    if (isolated) context.scene?.focusSelected();
    else context.scene?.setCutaway(true);
  });
  scope.on($('#assemble'), 'click', restore);
  scope.on($('#isolate-part'), 'click', () => {
    setIsolated(!isolated);
    context.scene?.focusSelected();
  });
  scope.on($('#focus-part'), 'click', () => context.scene?.focusSelected());
  return {
    select,
    setRocket,
    activate,
    deactivate,
    pauseNarration: narration.pause,
    stopNarration: narration.stop,
    get state() {
      return { selectedPart, view, explode, offset, isolated };
    },
    dispose: scope.dispose,
  };
}
