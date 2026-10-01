import { icon } from './icons.js';

export function renderHeader() {
  return `
<header class="app-header">
    <a class="brand" href="#" aria-label="小小火箭工程师首页"><span class="brand-mark">${icon('rocket')}</span><span>小小火箭工程师<small>ROCKET LAUNCH LAB</small></span></a>
    <nav class="mode-tabs" aria-label="体验模式"><button class="active" data-mode="launch" aria-pressed="true">${icon('launch')}发射控制</button><button data-mode="structure" aria-pressed="false">${icon('layers')}结构探索</button><button data-mode="assembly" aria-pressed="false">${icon('build')}组装工坊</button></nav>
    <div class="header-actions"><div class="quality-switch" aria-label="画质设置"><button data-quality="standard">标准</button><button data-quality="cinema">电影</button></div><span class="local-badge"><i></i>本地</span><button class="icon-button sound-button" title="开启音效" aria-label="开启音效" aria-pressed="false">${icon('volume')}</button><button class="about-button">${icon('info')}关于仿真</button></div>
  </header>
  `;
}
