import { ROCKETS, getRocket, getModules, getSitesForRocket } from '../fleet-data.js';
import { getStudioTheme } from '../studio-themes.js';
import { renderAppShell } from '../ui/shell.js';
import { CAMERA_MODES } from '../ui/config.js';
import { createScene } from '../scene.js';
import { createDom, createScope } from './lifecycle.js';
import { createPreferences, browserStorage } from './preferences.js';
import { createFrameLoop } from './frame-loop.js';
import { createShellView } from './shell-view.js';
import { createMissionController } from '../features/launch/mission-controller.js';
import { createLaunchFeature } from '../features/launch/view.js';
import { createStructureFeature } from '../features/structure/feature.js';
import { createAssemblyProgressStore } from '../features/assembly/progress-store.js';
import { createAssemblyFeature } from '../features/assembly/feature.js';
import { createEngineSound } from '../features/audio/engine-sound.js';

/**
 * Composition root: shared context is read-only, feature state has one owner.
 * Platform boundaries are injectable for integration tests without WebGL.
 */
export function createApplication({
  root,
  window = root?.ownerDocument.defaultView,
  storage = browserStorage(window),
  sceneFactory = createScene,
  now = () => window.performance.now(),
  requestFrame = (fn) => window.requestAnimationFrame(fn),
  cancelFrame = (id) => window.cancelAnimationFrame(id),
  createAudio,
  createAudioContext = () => new window.AudioContext(),
  onError = (error) => console.error(error),
  autoStart = true,
} = {}) {
  if (!root || !window) throw new TypeError('An application needs a root element and its window.');
  const preferences = createPreferences(storage),
    scope = createScope(window);
  let rocket = getRocket(preferences.get('rocket', 'falcon9')),
    mode = 'launch',
    scene = null;
  let site = compatibleSite(rocket, preferences.get('site', 'slc40'));
  let quality = preferences.get('quality') === 'standard' ? 'standard' : 'cinema';
  let theme = getStudioTheme(preferences.get('studio-theme')),
    disposed = false;
  const mission = createMissionController(rocket.id, { now });
  const context = Object.freeze({
    get rocket() {
      return rocket;
    },
    get site() {
      return site;
    },
    get mode() {
      return mode;
    },
    get scene() {
      return scene;
    },
    get mission() {
      return mission.mission;
    },
  });
  root.innerHTML = renderAppShell({
    rocket,
    modules: getModules(rocket.id),
    mission: mission.mission,
    site,
    studioThemeId: theme.id,
  });
  const dom = createDom(root),
    $ = dom.one;
  const shell = createShellView({ dom, window, context });
  let launch, structure, assembly;
  function refreshHeading() {
    if (!launch || !structure || !assembly || disposed) return;
    shell.renderHeading({ assembly: assembly.state, inspection: structure.state, camera: launch.view });
  }
  launch = createLaunchFeature({
    dom,
    window,
    context,
    mission,
    toast: shell.toast,
    onChange: refreshHeading,
    onExplore: () => setMode('structure'),
  });
  structure = createStructureFeature({ dom, window, context, createAudio, onChange: refreshHeading });
  assembly = createAssemblyFeature({
    dom,
    window,
    context,
    progress: createAssemblyProgressStore(preferences),
    onChange: refreshHeading,
    onLaunch: () => {
      setMode('launch');
      launch.reset();
      launch.toggle();
    },
  });
  const sound = createEngineSound({
    createContext: createAudioContext,
    onChange(enabled) {
      const button = $('.sound-button'),
        label = enabled ? '关闭音效' : '开启音效';
      button.setAttribute('aria-pressed', String(enabled));
      button.classList.toggle('enabled', enabled);
      button.title = label;
      button.setAttribute('aria-label', label);
      shell.toast(enabled ? '音效已开启（合成发动机音）' : '音效已关闭');
    },
    onError() {
      shell.toast('当前浏览器无法启用音效');
    },
  });
  // LIFO disposal stops callbacks and audio before releasing Three.js resources.
  scope.own(() => scene?.dispose());
  scope.own(shell.dispose);
  scope.own(launch.dispose);
  scope.own(structure.dispose);
  scope.own(assembly.dispose);
  scope.own(sound.dispose);

  function compatibleSite(selectedRocket, id) {
    const sites = getSitesForRocket(selectedRocket.id);
    return sites.find((item) => item.id === id) || sites[0];
  }
  function activateFeature() {
    if (mode === 'launch') launch.activate();
    else if (mode === 'structure') structure.activate();
    else assembly.activate();
  }
  function setMode(next) {
    if (disposed || !['launch', 'structure', 'assembly'].includes(next)) return;
    if (next === mode) {
      if (mode === 'assembly') assembly.activate();
      refreshHeading();
      return;
    }
    if (mode === 'assembly') assembly.deactivate();
    structure.deactivate(next);
    mission.setMode(next);
    mode = next;
    scene?.setMode(mode);
    scene?.setSelected(null);
    shell.renderMode();
    activateFeature();
    refreshHeading();
    launch.render();
  }
  function setRocket(id) {
    if (disposed || !ROCKETS.some((item) => item.id === id)) return false;
    assembly.deactivate();
    structure.deactivate('launch');
    rocket = getRocket(id);
    site = compatibleSite(rocket, site.id);
    mission.setRocket(id);
    scene?.setRocket(rocket);
    scene?.setSite(site);
    scene?.setMode(mode);
    shell.renderVehicle();
    structure.setRocket();
    launch.setRocket();
    assembly.setRocket();
    activateFeature();
    refreshHeading();
    launch.render();
    preferences.set('rocket', id);
    preferences.set('site', site.id);
    return true;
  }
  function setSite(id) {
    if (disposed) return;
    site = compatibleSite(rocket, id);
    launch.reset();
    scene?.setSite(site);
    shell.renderSite();
    refreshHeading();
    launch.render();
    preferences.set('site', site.id);
  }
  function setQuality(value) {
    if (disposed) return;
    quality = value === 'standard' ? 'standard' : 'cinema';
    scene?.setQuality(quality);
    shell.renderQuality(quality);
    preferences.set('quality', quality);
  }
  function setTheme(id) {
    if (disposed) return;
    theme = getStudioTheme(id);
    scene?.setStudioTheme(theme.id);
    shell.renderTheme(theme);
    preferences.set('studio-theme', theme.id);
  }
  function onPartSelect(id) {
    if (mode === 'assembly') assembly.select(id);
    else if (mode === 'structure') structure.select(id);
  }
  function onVisibility() {
    if (mission.setVisible(!dom.document.hidden)) shell.toast('任务已在离开页面时暂停');
    if (dom.document.hidden) structure.pauseNarration();
    launch.render();
    sound.update(mode, mission.frame());
  }
  function onKey(event) {
    const focused = dom.document.activeElement;
    if (
      event.repeat ||
      ['INPUT', 'SELECT', 'TEXTAREA'].includes(focused?.tagName) ||
      focused?.isContentEditable ||
      $('#about-dialog').open ||
      mode !== 'launch'
    )
      return;
    if (event.code === 'Space') {
      event.preventDefault();
      launch.toggle();
    }
    if (event.code === 'KeyR') launch.reset();
    if (/^[1-6]$/.test(event.key)) launch.setView(CAMERA_MODES[Number(event.key) - 1][0]);
  }
  for (const b of dom.all('.mode-tabs [data-mode]')) scope.on(b, 'click', () => setMode(b.dataset.mode));
  for (const b of dom.all('[data-quality]')) scope.on(b, 'click', () => setQuality(b.dataset.quality));
  scope.on($('#rocket-choice'), 'change', (e) => setRocket(e.target.value));
  scope.on($('#site-choice'), 'change', (e) => setSite(e.target.value));
  scope.on($('#studio-theme-choice'), 'change', (e) => setTheme(e.target.value));
  scope.on($('#reset-camera'), 'click', () => scene?.setView(mode === 'launch' ? launch.view : 'orbit'));
  scope.on($('#back-to-launch'), 'click', () => setMode('launch'));
  scope.on($('.brand'), 'click', (e) => {
    e.preventDefault();
    setMode('launch');
  });
  scope.on($('.sound-button'), 'click', sound.toggle);
  scope.on(dom.document, 'keydown', onKey);
  scope.on(dom.document, 'visibilitychange', onVisibility);
  scope.on(window, 'pagehide', (e) => {
    structure.stopNarration();
    if (!e.persisted) dispose();
  });

  shell.renderMode();
  shell.renderTheme(theme);
  shell.renderQuality(quality);
  try {
    scene = sceneFactory($('#viewport'), onPartSelect, rocket, { onAssemblyDrop: assembly.drop });
    scene.setStudioTheme(theme.id);
    scene.setQuality(quality);
    setRocket(rocket.id);
  } catch (error) {
    try {
      scene?.dispose();
    } catch (disposeError) {
      onError(disposeError);
    }
    scene = null;
    onError(error);
    shell.renderError(() => window.location.reload());
    setRocket(rocket.id);
  }
  onVisibility();
  const loop = createFrameLoop({
    now,
    requestFrame,
    cancelFrame,
    onFrame(time, delta) {
      const frame = mission.tick(time, delta);
      scene?.update(frame.renderState, delta);
      launch.render(frame);
      assembly.update();
      sound.update(mode, frame);
    },
  });
  scope.own(loop.dispose);
  if (autoStart) loop.start();
  function dispose() {
    if (disposed) return;
    disposed = true;
    scope.dispose();
  }
  return {
    setMode,
    setRocket,
    setSite,
    setQuality,
    setTheme,
    dispose,
    get state() {
      return {
        rocketId: rocket.id,
        siteId: site.id,
        mode,
        quality,
        themeId: theme.id,
        inspection: structure.state,
        assembly: assembly.state,
        flight: mission.frame(),
        disposed,
      };
    },
  };
}
