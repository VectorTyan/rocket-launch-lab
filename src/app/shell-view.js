import { getSitesForRocket, SOURCES } from '../fleet-data.js';
import { createScope, setPressed } from './lifecycle.js';
import { coordinate } from '../ui/formatters.js';
const MODE_PANELS = {
  launch: ['launch-panel', 'flight-console', 'telemetry', 'clock-box'],
  structure: ['structure-panel', 'module-detail', 'explore-console'],
  assembly: ['assembly-panel', 'assembly-coach', 'assembly-console'],
};
export function createShellView({ dom, window, context }) {
  const $ = dom.one,
    scope = createScope(window);
  let cancelToast;
  function toast(message) {
    cancelToast?.();
    $('#toast').textContent = message;
    $('#toast').classList.add('visible');
    cancelToast = scope.later(() => $('#toast').classList.remove('visible'), 3500);
  }
  function renderMode() {
    dom.root.dataset.mode = context.mode;
    $('.sidebar').scrollTop = 0;
    for (const [mode, ids] of Object.entries(MODE_PANELS))
      for (const id of ids) $('#' + id).hidden = mode !== context.mode;
    $('#studio-theme-control').hidden = context.mode === 'launch';
    $('#assembly-tray-caption').hidden = context.mode !== 'assembly';
    $('#assembly-target-label').hidden = true;
    $('#completion').hidden = true;
    setPressed(dom.all('.mode-tabs [data-mode]'), (b) => b.dataset.mode === context.mode);
  }
  function renderTheme(theme) {
    dom.root.dataset.studioTheme = theme.id;
    for (const [key, color] of Object.entries(theme.ui)) dom.root.style.setProperty('--studio-' + key, color);
    $('#studio-theme-choice').value = theme.id;
    $('#studio-theme-description').textContent = theme.subtitle;
  }
  function renderQuality(quality) {
    setPressed(dom.all('[data-quality]'), (b) => b.dataset.quality === quality);
    $('#quality-label').textContent = (quality === 'cinema' ? '电影画质' : '标准画质') + ' · 教学场景';
  }
  function renderSite() {
    const { site, rocket } = context;
    $('#site-choice').innerHTML = getSitesForRocket(rocket.id)
      .map(
        (item) =>
          '<option value="' +
          item.id +
          '" ' +
          (item.id === site.id ? 'selected' : '') +
          '>' +
          item.name +
          '</option>',
      )
      .join('');
    $('#site-region').textContent = site.region;
    $('#site-coords').textContent = coordinate(site.lat, 'N', 'S') + ' ' + coordinate(site.lon, 'E', 'W');
    $('#site-map').href = site.mapUrl;
    $('#site-map').title = site.layoutNote;
  }
  function renderVehicle() {
    const { rocket } = context;
    $('#rocket-title').textContent = rocket.shortName;
    $('#rocket-title').classList.toggle('long-title', rocket.shortName.length > 8);
    $('#program-label').textContent = rocket.program + ' / VEHICLE COLLECTION';
    $('#rocket-subtitle').textContent = rocket.variant;
    $('#rocket-intro').textContent = rocket.description;
    $('#spec-height').innerHTML = rocket.height + '<span> m</span>';
    $('#spec-diameter').innerHTML = rocket.diameter + '<span> m</span>';
    $('#spec-stages').innerHTML = rocket.stages + '<span> 级</span>';
    $('#rocket-choice').value = rocket.id;
    renderSite();
    renderAbout();
  }
  function renderHeading({ assembly, inspection, camera }) {
    if (context.mode === 'assembly') {
      $('#scene-title').textContent = `一起搭${context.rocket.shortName}`;
      $('#scene-kicker').textContent = 'BUILD & DISCOVER';
      $('#scene-location').textContent = assembly.completed
        ? '搭建完成！转一转，欣赏你的作品。'
        : assembly.guided
          ? '跟着提示，一块一块搭起来。'
          : '试试不同顺序，找到部件之间的连接。';
      $('#scene-mode-label').textContent = 'ROCKET BUILD WORKSHOP';
      $('#scene-hint').textContent = '选零件 · 放进发光轮廓 · 也可点按钮安装';
    } else if (context.mode === 'structure') {
      $('#scene-title').textContent = '结构探索';
      $('#scene-kicker').textContent = context.rocket.englishName.toUpperCase() + ' / ANATOMY';
      $('#scene-location').textContent = `${context.rocket.height} 米之间，每一部分各司其职。`;
      $('#scene-mode-label').textContent =
        inspection.view === 'cutaway' ? 'SECTION VIEW / INTERNAL STRUCTURE' : 'VEHICLE EXPLORER';
      $('#scene-hint').textContent =
        inspection.view === 'cutaway' ? '旋转查看剖面 · 点选部件了解内部' : '拖动旋转 · 滚轮缩放 · 点选部件';
    } else {
      $('#scene-title').textContent = context.site.shortName;
      $('#scene-kicker').textContent = context.site.kicker;
      $('#scene-location').textContent = `${context.site.padLabel} · ${context.site.region}`;
      $('#scene-mode-label').textContent = 'LAUNCH SIMULATION';
      $('#scene-hint').textContent =
        camera === 'orbit' ? '拖动探索视角 · 滚轮缩放' : '镜头自动追踪 · 数字 1–6 切换';
    }
    $('#reset-camera').title =
      context.mode === 'assembly'
        ? '复位工坊视角'
        : context.mode === 'structure'
          ? '复位展厅视角'
          : '复位相机';
    $('#reset-camera').setAttribute('aria-label', $('#reset-camera').title);
  }
  function renderAbout() {
    const modal = $('#about-dialog');
    modal.querySelector(':scope > p').textContent =
      '本地运行的多型号航天科普体验，支持发射、结构探索和组装工坊。展厅可切换主题；组装有提示、可撤销，没有计时或扣分。';
    const cells = modal.querySelectorAll('.about-grid > div');
    cells[0].querySelector('p').textContent =
      `${context.rocket.name}：全高 ${context.rocket.height} m、芯径 ${context.rocket.diameter} m。${context.rocket.accuracy}`;
    cells[1].querySelector('p').textContent = context.mission.description + ' ' + context.mission.accuracy;
    cells[2].querySelector('strong').textContent = '场景与画质';
    cells[2].querySelector('p').textContent =
      '场地位置有资料与地图参考，设施并非实景扫描。电影档使用 HDR 环境光、材质反射、柔和泛光与更高分辨率阴影，仍是浏览器实时近似。';
    cells[3].querySelector('p').textContent =
      '发射时空格启动 / 暂停，R 重置，1–6 切换镜头。结构探索与组装都会暂停发射。工坊可拖动零件或点按钮安装，进度按型号保存在本机；拼搭顺序不代表真实总装流程。';
    $('.source-links').innerHTML =
      SOURCES.filter(
        (s) =>
          context.rocket.sourceIds.includes(s.id) ||
          ['wenchang-pads', 'jiuquan-pad', 'maps-urls'].includes(s.id),
      )
        .map(
          (s) =>
            `<a href="${s.url}" target="_blank" rel="noopener noreferrer"><strong>${s.title} ↗</strong><span>${s.note}</span></a>`,
        )
        .join('') +
      '<a href="https://polyhaven.com/a/kloofendal_38d_partly_cloudy" target="_blank" rel="noopener noreferrer"><strong>Poly Haven · Greg Zaal / CC0 HDR ↗</strong><span>本地电影光照与天空素材；并非所选发射场的实拍照片。</span></a>';
    $('.source-links').insertAdjacentHTML(
      'beforeend',
      '<a href="https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/" target="_blank" rel="noopener noreferrer"><strong>NASA · Blue Marble 历史地球合成影像 ↗</strong><span>地球远景纹理：NASA Goddard，Reto Stöckli / Robert Simmon。历史影像，非实时地图或天气。</span></a>',
    );
    $('.dialog-footnote').textContent =
      '游戏运行时资源从本地加载；地图和资料外链需要联网。未将 Google 地图底图打包进游戏。';
  }

  function renderError(reload) {
    $('#viewport').innerHTML =
      '<div class="render-error"><h2>三维场景暂时无法启动</h2><p>请使用支持 WebGL 2 的新版 Chrome 或 Edge，并开启硬件加速。</p><button>重新加载</button></div>';
    scope.on($('.render-error button'), 'click', reload);
    $('#launch').disabled = true;
    toast('三维渲染未启动，请检查浏览器硬件加速设置');
  }
  scope.on($('.about-button'), 'click', () => $('#about-dialog').showModal());
  scope.on($('#close-about'), 'click', () => $('#about-dialog').close());
  scope.on($('#about-dialog'), 'click', (event) => {
    if (event.target !== $('#about-dialog')) return;
    const box = event.target.getBoundingClientRect();
    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    )
      event.target.close();
  });
  return {
    toast,
    renderMode,
    renderTheme,
    renderQuality,
    renderVehicle,
    renderSite,
    renderHeading,
    renderError,
    dispose: scope.dispose,
  };
}
