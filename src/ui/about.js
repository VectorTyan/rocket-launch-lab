import { icon } from './icons.js';

export function renderAbout({ rocket, mission, sources }) {
  return `
  <dialog id="about-dialog">
    <div class="dialog-top"><span class="eyebrow">ABOUT THE SIMULATION</span><button id="close-about" class="icon-button" aria-label="关闭说明">${icon('close')}</button></div>
    <h2>探索真实，理解边界。</h2>
    <p>本地运行的多型号航天科普体验，支持发射、结构探索和组装工坊。展厅可切换主题；组装有提示、可撤销，没有计时或扣分。</p>
    <div class="about-grid">
      <div><strong>公开尺寸</strong><p>${rocket.name}：全高 ${rocket.height} m、芯径 ${rocket.diameter} m。${rocket.accuracy}</p></div>
      <div><strong>任务时间线</strong><p>${mission.description} ${mission.accuracy}</p></div>
      <div><strong>场景与画质</strong><p>场地位置有资料与地图参考，设施并非实景扫描。电影档使用 HDR 环境光、材质反射、柔和泛光与更高分辨率阴影，仍是浏览器实时近似。</p></div>
      <div><strong>观察与操作</strong><p>发射时空格启动 / 暂停，R 重置，1–6 切换镜头。结构探索与组装都会暂停发射。工坊可拖动零件或点按钮安装，进度按型号保存在本机；拼搭顺序不代表真实总装流程。</p></div>
    </div>
    <h3>资料来源</h3>
    <div class="source-links">
      ${sources.map((source) => `<a href="${source.url}" target="_blank" rel="noopener noreferrer"><strong>${source.title} ↗</strong><span>${source.note}</span></a>`).join('')}
      <a href="https://polyhaven.com/a/kloofendal_38d_partly_cloudy" target="_blank" rel="noopener noreferrer"><strong>Poly Haven · Greg Zaal / CC0 HDR ↗</strong><span>本地电影光照与天空素材；并非所选发射场的实拍照片。</span></a>
      <a href="https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/" target="_blank" rel="noopener noreferrer"><strong>NASA · Blue Marble 历史地球合成影像 ↗</strong><span>地球远景纹理：NASA Goddard，Reto Stöckli / Robert Simmon。历史影像，非实时地图或天气。</span></a>
    </div>
    <p class="dialog-footnote">游戏运行时资源从本地加载；地图和资料外链需要联网。未将 Google 地图底图打包进游戏。</p>
  </dialog>
  `;
}
