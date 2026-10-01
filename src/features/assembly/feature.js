import { createScope } from '../../app/lifecycle.js';

export function createAssemblyFeature({ dom, window, context, progress, onChange, onLaunch }) {
  const $ = dom.one,
    scope = createScope(window);
  let assemblyGame = progress.get(context.rocket.id),
    assemblyFeedbackTimer,
    confettiTimer,
    assemblyHintId = null,
    draggedAssemblyId = null;
  const ASSEMBLY_DRAG_TYPE = 'application/x-karman-assembly-part';
  function saveAssemblyProgress() {
    if (!progress.save(assemblyGame))
      $('.assembly-save-note').textContent = '本次进度暂时保留在页面中。模型拼搭不代表工厂总装流程。';
  }
  function clearAssemblyFeedback() {
    assemblyFeedbackTimer?.();
    $('#assembly-feedback').textContent = '';
    $('#assembly-feedback').classList.remove('success', 'gentle');
  }
  function showAssemblyFeedback(message, success = false) {
    assemblyFeedbackTimer?.();
    const feedback = $('#assembly-feedback');
    feedback.textContent = message;
    feedback.classList.toggle('success', success);
    feedback.classList.toggle('gentle', !success);
    assemblyFeedbackTimer = scope.later(() => {
      feedback.textContent = '';
      feedback.classList.remove('success', 'gentle');
    }, 6000);
  }
  function assemblyAvailability(part) {
    if (!part) return '选一块零件，我们一起试试。';
    const placed = assemblyGame.placed;
    const missing = part.prerequisites.filter((id) => !placed.has(id));
    if (missing.length) {
      const names = missing
        .map((id) => assemblyGame.plan.parts.find((item) => item.id === id)?.shortName || id)
        .join('、');
      return `先把${names}拼好，就能放${part.shortName}啦。`;
    }
    if (assemblyGame.guided && assemblyGame.nextPart?.id !== part.id)
      return `跟着提示，下一块先找${assemblyGame.nextPart.shortName}。想自己安排顺序，可以试试“小工程师”。`;
    return part.hint;
  }
  function syncAssemblyScene() {
    if (context.mode !== 'assembly') return;
    context.scene?.setAssemblyState({
      placed: assemblyGame.placed,
      selectedId: assemblyGame.selectedId,
      hintId: assemblyHintId || (assemblyGame.guided ? assemblyGame.nextPart?.id : null) || null,
    });
  }
  function revealAssemblySelection() {
    if (context.mode !== 'assembly') return;
    const palette = $('#assembly-palette'),
      card = palette.querySelector('.active');
    if (!card) return;
    const box = palette.getBoundingClientRect(),
      part = card.getBoundingClientRect();
    if (part.top < box.top || part.bottom > box.bottom)
      palette.scrollTo({
        top: palette.scrollTop + part.top - box.top - (palette.clientHeight - part.height) / 2,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
  }
  function renderAssemblyUI() {
    const palette = $('#assembly-palette');
    if (palette.dataset.rocket !== context.rocket.id) {
      const scrollTop = palette.scrollTop;
      palette.innerHTML = assemblyGame.plan.parts
        .map(
          (part) =>
            `<button type="button" class="assembly-part" data-assembly-part="${part.id}" data-group="${part.group}" draggable="true"><span class="assembly-part-number">${String(part.step).padStart(2, '0')}</span><span class="assembly-part-name">${part.shortName}</span><span class="assembly-part-status"></span></button>`,
        )
        .join('');
      palette.dataset.rocket = context.rocket.id;
      palette.scrollTop = scrollTop;
    }
    const placed = assemblyGame.placed,
      next = assemblyGame.nextPart;
    for (const part of assemblyGame.plan.parts) {
      const button = palette.querySelector(`[data-assembly-part="${part.id}"]`);
      const installed = placed.has(part.id),
        ready = assemblyGame.canPlace(part.id),
        selected = assemblyGame.selectedId === part.id;
      button.classList.toggle('placed', installed);
      button.classList.toggle('active', selected);
      button.classList.toggle('ready', ready);
      button.classList.toggle('locked', !installed && !ready);
      button.classList.toggle('recommended', next?.id === part.id);
      button.disabled = installed;
      button.draggable = !installed;
      button.setAttribute('aria-pressed', String(selected));
      const status = installed ? '已装好' : ready ? '可以安装' : '先看提示';
      button.querySelector('.assembly-part-status').textContent = status;
      button.setAttribute('aria-label', `${part.shortName}，${status}`);
      button.title = installed ? `${part.shortName}已经到位` : assemblyAvailability(part);
    }
    $('#assembly-count').textContent = `${placed.size} / ${assemblyGame.plan.total}`;
    $('#assembly-meter-fill').style.width = `${Math.round(assemblyGame.progress * 100)}%`;
    const meter = $('.assembly-meter');
    meter.setAttribute('role', 'progressbar');
    meter.setAttribute('aria-label', '火箭组装进度');
    meter.setAttribute('aria-valuemin', '0');
    meter.setAttribute('aria-valuemax', String(assemblyGame.plan.total));
    meter.setAttribute('aria-valuenow', String(placed.size));
    dom.all('[data-guided]').forEach((button) => {
      const active = (button.dataset.guided === 'true') === assemblyGame.guided;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const selected = assemblyGame.plan.parts.find((part) => part.id === assemblyGame.selectedId) || next;
    $('#assembly-step').textContent = assemblyGame.completed
      ? '完成'
      : String(selected?.step || 1).padStart(2, '0');
    $('#assembly-task').textContent = assemblyGame.completed
      ? '每块零件都到位啦'
      : selected?.shortName || '选一块零件';
    $('#assembly-instruction').textContent = assemblyGame.completed
      ? '拖动旋转模型，看看自己搭好的火箭。'
      : selected?.hint || '从左边的部件盒开始吧。';
    $('#assembly-fact').textContent = assemblyGame.completed
      ? `你已经认识了 ${assemblyGame.plan.total} 组部件。${assemblyGame.plan.note}`
      : selected?.fact || assemblyGame.plan.note;
    $('#assembly-action-label').textContent = assemblyGame.completed
      ? `${context.rocket.shortName}已经搭好啦`
      : `正在拼：${selected?.shortName || '选一块零件'}`;
    $('#assembly-install').disabled = !context.scene || !selected || !assemblyGame.canPlace(selected.id);
    $('#assembly-hint').disabled = assemblyGame.completed;
    $('#assembly-undo').disabled = placed.size === 0;
    $('#assembly-launch').disabled = !context.scene || !assemblyGame.completed;
    $('#assembly-finish-launch').disabled = !context.scene || !assemblyGame.completed;
    $('#assembly-congratulations').textContent =
      `${context.rocket.shortName}的 ${assemblyGame.plan.total} 组部件都找到了自己的位置！`;
    $('#assembly-tray-caption').hidden = context.mode !== 'assembly' || assemblyGame.completed;
    if (assemblyGame.completed) $('#assembly-target-label').hidden = true;
    if (context.mode === 'assembly') onChange();
  }
  function selectAssemblyPart(id) {
    if (context.mode !== 'assembly' || !assemblyGame.select(id)) return false;
    assemblyHintId = null;
    clearAssemblyFeedback();
    renderAssemblyUI();
    syncAssemblyScene();
    saveAssemblyProgress();
    if (!assemblyGame.canPlace(id))
      showAssemblyFeedback(assemblyAvailability(assemblyGame.plan.parts.find((part) => part.id === id)));
    return true;
  }
  function clearAssemblyCelebration() {
    confettiTimer?.();
    $('#assembly-celebration').hidden = true;
    $('#assembly-confetti').replaceChildren();
    $('#assembly-confetti').classList.remove('active');
  }
  function celebrateAssembly() {
    $('#assembly-celebration').hidden = false;
    confettiTimer?.();
    const confetti = $('#assembly-confetti');
    confetti.replaceChildren();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const colors = ['#f5b75c', '#70bed2', '#b7a5db', '#86c5a6', '#ec9e92'];
      const pieces = Array.from({ length: 42 }, (_, index) => {
        const piece = dom.document.createElement('i');
        piece.style.left = `${5 + Math.random() * 90}%`;
        piece.style.background = colors[index % colors.length];
        piece.style.animationDelay = `${Math.random() * 0.65}s`;
        piece.style.animationDuration = `${2.2 + Math.random() * 0.65}s`;
        piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 200}px`);
        piece.style.setProperty('--rotation', `${Math.random() * 540 - 270}deg`);
        return piece;
      });
      confetti.append(...pieces);
      confetti.classList.add('active');
      confettiTimer = scope.later(() => {
        confetti.replaceChildren();
        confetti.classList.remove('active');
      }, 3800);
    }
  }
  function handleAssemblyDrop(id, nearTarget) {
    if (context.mode !== 'assembly' || !context.scene || assemblyGame.placed.has(id)) return false;
    if (!assemblyGame.select(id)) {
      showAssemblyFeedback('先从部件盒选一块零件，我们再试试。');
      return false;
    }
    if (!assemblyGame.canPlace(id)) {
      const refusal = assemblyGame.place(id);
      renderAssemblyUI();
      syncAssemblyScene();
      context.scene.assemblyFeedback(false);
      showAssemblyFeedback(refusal.message);
      return false;
    }
    if (!nearTarget) {
      renderAssemblyUI();
      syncAssemblyScene();
      context.scene.assemblyFeedback(false);
      showAssemblyFeedback('再靠近发光轮廓一点点，就能把这块拼上啦。');
      return false;
    }
    const result = assemblyGame.place(id);
    if (!result.ok) {
      renderAssemblyUI();
      syncAssemblyScene();
      context.scene.assemblyFeedback(false);
      showAssemblyFeedback(result.message);
      return false;
    }
    assemblyHintId = null;
    renderAssemblyUI();
    syncAssemblyScene();
    revealAssemblySelection();
    context.scene.assemblyFeedback(true);
    saveAssemblyProgress();
    showAssemblyFeedback(result.message, true);
    if (result.newlyCompleted) celebrateAssembly();
    return true;
  }
  function resetAssembly() {
    assemblyGame.reset();
    assemblyHintId = null;
    clearAssemblyCelebration();
    clearAssemblyFeedback();
    renderAssemblyUI();
    syncAssemblyScene();
    revealAssemblySelection();
    saveAssemblyProgress();
    showAssemblyFeedback('部件盒准备好啦，我们从第一块开始。');
  }
  function launchAssembledRocket() {
    if (!assemblyGame.completed || !context.scene) return;
    saveAssemblyProgress();
    clearAssemblyCelebration();
    onLaunch();
  }
  function updateAssemblyTargetLabel() {
    const label = $('#assembly-target-label');
    if (
      context.mode !== 'assembly' ||
      assemblyGame.completed ||
      !assemblyGame.canPlace(assemblyGame.selectedId) ||
      !$('#assembly-celebration').hidden
    ) {
      if (!label.hidden) label.hidden = true;
      return;
    }
    const target = context.scene?.getAssemblyTargetScreen();
    if (!target?.visible || !Number.isFinite(target.x) || !Number.isFinite(target.y)) {
      if (!label.hidden) label.hidden = true;
      return;
    }
    const viewport = $('#viewport');
    if (target.x < 0 || target.x > viewport.clientWidth || target.y < 0 || target.y > viewport.clientHeight) {
      if (!label.hidden) label.hidden = true;
      return;
    }
    label.hidden = false;
    const left = `${Math.round(target.x)}px`,
      top = `${Math.round(target.y)}px`;
    if (label.style.left !== left) label.style.left = left;
    if (label.style.top !== top) label.style.top = top;
  }

  dom.all('[data-guided]').forEach((button) =>
    scope.on(button, 'click', () => {
      assemblyGame.setGuided(button.dataset.guided === 'true');
      assemblyHintId = null;
      clearAssemblyFeedback();
      renderAssemblyUI();
      syncAssemblyScene();
      saveAssemblyProgress();
      showAssemblyFeedback(
        assemblyGame.guided
          ? '跟着提示，下一块零件会亮起来。'
          : '你可以自己选顺序。先把连接它的部件拼好就行。',
      );
    }),
  );
  scope.on($('#assembly-palette'), 'click', (event) => {
    const button = event.target.closest('[data-assembly-part]');
    if (button && !button.disabled) selectAssemblyPart(button.dataset.assemblyPart);
  });
  scope.on($('#assembly-palette'), 'dragstart', (event) => {
    const button = event.target.closest('[data-assembly-part]');
    if (
      context.mode !== 'assembly' ||
      !context.scene ||
      !button ||
      button.disabled ||
      !selectAssemblyPart(button.dataset.assemblyPart)
    ) {
      event.preventDefault();
      return;
    }
    draggedAssemblyId = button.dataset.assemblyPart;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(ASSEMBLY_DRAG_TYPE, draggedAssemblyId);
    event.dataTransfer.setData('text/plain', draggedAssemblyId);
    $('#viewport').classList.add('assembly-drop-active');
  });
  scope.on($('#assembly-palette'), 'dragend', () => {
    draggedAssemblyId = null;
    $('#viewport').classList.remove('assembly-drop-active');
  });
  scope.on($('.viewport-wrap'), 'dragover', (event) => {
    if (
      context.mode !== 'assembly' ||
      !context.scene ||
      (!draggedAssemblyId && !Array.from(event.dataTransfer?.types || []).includes(ASSEMBLY_DRAG_TYPE))
    )
      return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    $('#viewport').classList.add('assembly-drop-active');
  });
  scope.on($('.viewport-wrap'), 'dragleave', (event) => {
    if (!event.currentTarget.contains(event.relatedTarget))
      $('#viewport').classList.remove('assembly-drop-active');
  });
  scope.on($('.viewport-wrap'), 'drop', (event) => {
    if (context.mode !== 'assembly' || !context.scene) return;
    const id = event.dataTransfer?.getData(ASSEMBLY_DRAG_TYPE) || draggedAssemblyId;
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    draggedAssemblyId = null;
    $('#viewport').classList.remove('assembly-drop-active');
    if (!assemblyGame.plan.parts.some((part) => part.id === id)) {
      showAssemblyFeedback('从当前火箭的部件盒里选一块零件吧。');
      return;
    }
    const nearTarget = context.scene.tryAssemblyDrop(id, event.clientX, event.clientY);
    handleAssemblyDrop(id, Boolean(nearTarget));
  });
  scope.on($('#assembly-install'), 'click', () => handleAssemblyDrop(assemblyGame.selectedId, true));
  scope.on($('#assembly-hint'), 'click', () => {
    const hint = assemblyGame.hint();
    if (!hint.part) {
      showAssemblyFeedback(hint.message, true);
      return;
    }
    assemblyGame.select(hint.partId);
    assemblyHintId = hint.partId;
    renderAssemblyUI();
    syncAssemblyScene();
    revealAssemblySelection();
    saveAssemblyProgress();
    showAssemblyFeedback(hint.message);
  });
  scope.on($('#assembly-undo'), 'click', () => {
    const result = assemblyGame.undo();
    if (result.ok) {
      assemblyHintId = null;
      clearAssemblyCelebration();
      renderAssemblyUI();
      syncAssemblyScene();
      revealAssemblySelection();
      saveAssemblyProgress();
    }
    showAssemblyFeedback(result.message);
  });
  scope.on($('#assembly-reset'), 'click', resetAssembly);
  scope.on($('#assembly-again'), 'click', resetAssembly);
  scope.on($('#assembly-launch'), 'click', launchAssembledRocket);
  scope.on($('#assembly-finish-launch'), 'click', launchAssembledRocket);
  scope.on($('#assembly-admire'), 'click', () => {
    clearAssemblyCelebration();
    showAssemblyFeedback('慢慢转一转，看看每一块零件是怎样连在一起的。', true);
  });

  function deactivate() {
    saveAssemblyProgress();
    clearAssemblyCelebration();
    clearAssemblyFeedback();
    draggedAssemblyId = null;
    $('#viewport').classList.remove('assembly-drop-active');
  }
  function setRocket() {
    deactivate();
    assemblyHintId = null;
    assemblyGame = progress.get(context.rocket.id);
    renderAssemblyUI();
    syncAssemblyScene();
  }
  function activate() {
    clearAssemblyCelebration();
    clearAssemblyFeedback();
    renderAssemblyUI();
    syncAssemblyScene();
    revealAssemblySelection();
  }
  function dispose() {
    deactivate();
    scope.dispose();
  }
  return {
    setRocket,
    activate,
    deactivate,
    select: selectAssemblyPart,
    drop: handleAssemblyDrop,
    update: updateAssemblyTargetLabel,
    dispose,
    get state() {
      return { ...assemblyGame.snapshot(), plan: assemblyGame.plan };
    },
  };
}
