import './style.css';
import { ROCKETS, SITES, getRocket, getSitesForRocket, getModules, SOURCES } from './fleet-data.js';
import { FleetSimulation } from './fleet-simulation.js';
import { getInteriorSpec, INTERIOR_SOURCES } from './interior-data.js';
import { createScene } from './scene.js';
import { AssemblyGame } from './assembly-state.js';
import { STUDIO_THEMES, getStudioTheme } from './studio-themes.js';
import { getModuleNarration } from './module-narration.js';
import { NARRATION_AUDIO } from './narration-audio.js';
import { createNarrator } from './narrator.js';
import { MissionClock, timelinePresentation } from './mission-timeline.js';

const icons = {
  rocket:'<path d="m12 3 5 11-5-2-5 2 5-11Z"/><path d="m8 15-2 4m6-4v6m4-6 2 4"/>',
  launch:'<path d="m12 19 0-14m-6 6 6-6 6 6"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  orbit:'<ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-35 12 12)"/><circle cx="12" cy="12" r="3"/>',
  camera:'<rect x="3" y="6" width="18" height="14" rx="3"/><path d="m8 6 2-3h4l2 3"/><circle cx="12" cy="13" r="4"/>',
  target:'<circle cx="12" cy="12" r="7"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
  engine:'<path d="M9 3h6l1 8 4 8H4l4-8 1-8Zm0 19v-3m6 3v-3"/>',
  globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/>',
  reset:'<path d="M3 9a9 9 0 1 1 1 9M3 3v6h6"/>',
  play:'<path d="m8 4 12 8-12 8V4Z"/>',
  pause:'<path d="M8 4v16M16 4v16"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v2"/>',
  volume:'<path d="m11 4-5 5H3v6h3l5 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  check:'<path d="m5 12 4 4 10-10"/>',
  build:'<path d="m4 8 8-5 8 5-8 5-8-5Zm0 0v9l8 5 8-5V8M12 13v9"/>',
  star:'<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.target}</svg>`;
const cameraModes=[['orbit','orbit','自由环绕'],['follow','target','箭体跟随'],['pad','camera','地面追踪'],['engine','engine','发动机视角'],['wide','globe','飞行全景'],['cinematic','camera','电影镜头']];
const $ = (selector) => document.querySelector(selector);
let savedRocket='falcon9',quality='cinema';try{savedRocket=localStorage.getItem('karman.rocket')||savedRocket;quality=localStorage.getItem('karman.quality')||quality;}catch{}
let ROCKET=getRocket(savedRocket)||ROCKETS[0];
const sim=new FleetSimulation(ROCKET.id);
const missionClock=new MissionClock(sim,performance.now());
let MODULES=getModules(ROCKET.id),EVENTS=sim.mission.events,DURATION=sim.mission.duration;
let mode='launch',view='orbit',selectedModule='stage1',subject='vehicle',scene=null,lastPhase='',lastStatus='',lastFrame=performance.now(),lastUi=0,hiddenPause=false,presentationTime=0,structureView='exterior';
let soundEnabled=false,audioContext=null,audioGain=null;
let savedSite='slc40';try{savedSite=localStorage.getItem('karman.site')||savedSite;}catch{}
let site=getSitesForRocket(ROCKET.id).find(s=>s.id===savedSite)||getSitesForRocket(ROCKET.id)[0];
let studioThemeId='technology',savedAssembly={};
try{studioThemeId=getStudioTheme(localStorage.getItem('karman.studio-theme')).id;const saved=JSON.parse(localStorage.getItem('karman.assembly-progress')||'{}');savedAssembly=saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};}catch{}
const assemblyGames=new Map();
function assemblyFor(id){
  if(assemblyGames.has(id))return assemblyGames.get(id);
  const game=new AssemblyGame(id,{guided:false}),saved=savedAssembly[id];
  if(Array.isArray(saved?.placed))for(const part of saved.placed.slice(0,game.plan.total)){if(game.canPlace(part))game.place(part);}
  game.setGuided(saved?.guided!==false);if(typeof saved?.selectedId==='string')game.select(saved.selectedId);assemblyGames.set(id,game);return game;
}
let assemblyGame=assemblyFor(ROCKET.id),assemblyFeedbackTimer,confettiTimer,assemblyHintId=null,draggedAssemblyId=null;
const ASSEMBLY_DRAG_TYPE='application/x-karman-assembly-part';

$('#app').innerHTML=`
  <header class="app-header">
    <a class="brand" href="#" aria-label="卡门线首页"><span class="brand-mark">${icon('rocket')}</span><span>卡门线<small>KÁRMÁN / LAUNCH LAB</small></span></a>
    <nav class="mode-tabs" aria-label="体验模式"><button class="active" data-mode="launch" aria-pressed="true">${icon('launch')}发射控制</button><button data-mode="structure" aria-pressed="false">${icon('layers')}结构探索</button><button data-mode="assembly" aria-pressed="false">${icon('build')}组装工坊</button></nav>
    <div class="header-actions"><div class="quality-switch" aria-label="画质设置"><button data-quality="standard">标准</button><button data-quality="cinema">电影</button></div><span class="local-badge"><i></i>本地</span><button class="icon-button sound-button" title="开启音效" aria-label="开启音效" aria-pressed="false">${icon('volume')}</button><button class="about-button">${icon('info')}关于仿真</button></div>
  </header>
  <main class="workspace">
    <aside class="sidebar">
      <div class="mission-heading"><span class="eyebrow" id="program-label">${ROCKET.program} / VEHICLE COLLECTION</span><span class="edition">8 型号</span></div>
      <h1 id="rocket-title">${ROCKET.shortName}</h1><p class="rocket-subtitle" id="rocket-subtitle">${ROCKET.variant}</p>
      <p class="intro" id="rocket-intro">${ROCKET.description}</p>
      <div class="specs"><div><strong id="spec-height">${ROCKET.height}<span> m</span></strong><small>全箭高度</small></div><div><strong id="spec-diameter">${ROCKET.diameter}<span> m</span></strong><small>芯级直径</small></div><div><strong id="spec-stages">${ROCKET.stages}<span> 级</span></strong><small>串联级数</small></div></div>
      <label class="field-label" for="rocket-choice">火箭型号 · ROCKET LIBRARY</label><select id="rocket-choice">${ROCKETS.map(r=>`<option value="${r.id}" ${r.id===ROCKET.id?'selected':''}>${r.name}</option>`).join('')}</select>
      <div class="studio-theme-control" id="studio-theme-control" hidden><label class="field-label" for="studio-theme-choice">展厅主题</label><select id="studio-theme-choice">${STUDIO_THEMES.map(t=>`<option value="${t.id}" ${t.id===studioThemeId?'selected':''}>${t.name}</option>`).join('')}</select><p id="studio-theme-description"></p></div>
      <section id="launch-panel">
        <div class="section-title"><h2>发射任务</h2><span>MISSION SETUP</span></div>
        <label class="field-label" for="site-choice">发射场</label><select id="site-choice">${SITES.map(s=>`<option value="${s.id}" ${s.id===site.id?'selected':''}>${s.name}</option>`).join('')}</select>
        <div class="site-caption"><span id="site-region"></span><span id="site-coords"></span></div>
        <a id="site-map" class="map-reference" href="${site.mapUrl}" target="_blank" rel="noopener noreferrer">${icon('globe')}地图位置参考 ↗</a>
        <p class="mission-profile" id="mission-profile">${sim.mission.label}</p>
        <div class="section-title camera-title"><h2>观察视角</h2><span>CAMERA</span></div>
        <div class="camera-list">${cameraModes.map(([id,ic,label],i)=>`<button data-camera="${id}" class="camera-option ${i===0?'active':''}" aria-pressed="${i===0}">${icon(ic)}<span>${label}</span><kbd>${i+1}</kbd></button>`).join('')}</div>
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
        <div class="module-list" aria-label="火箭模块">${MODULES.map((part,i)=>`<button data-part="${part.id}" class="${i===0?'active':''}" aria-pressed="${i===0}"><span class="module-number">${String(i+1).padStart(2,'0')}</span><span>${part.name}</span>${icon('arrow')}</button>`).join('')}</div>
        <p class="muted-note">也可以直接点击三维模型选中部件。</p>
      </section>
      <section id="assembly-panel" hidden>
        <div class="section-title"><h2>一起搭火箭</h2><span>BUILD & DISCOVER</span></div>
        <div class="assembly-difficulty" aria-label="组装玩法"><button data-guided="true" class="active" aria-pressed="true">跟我搭</button><button data-guided="false" aria-pressed="false">小工程师</button></div>
        <div class="assembly-progress"><div><span>组装进度</span><strong id="assembly-count">0 / 10</strong></div><div class="assembly-meter"><i id="assembly-meter-fill"></i></div></div>
        <div class="assembly-palette" id="assembly-palette" aria-label="待组装零件"></div>
        <div class="assembly-small-actions"><button id="assembly-undo">${icon('reset')}撤销一步</button><button id="assembly-reset">重新组装</button></div>
        <p class="assembly-save-note">进度保存在本机。模型拼搭不代表工厂总装流程。</p>
      </section>
      <div class="sidebar-footer"><span class="tiny-orbit">◌</span><span>保持好奇，向上探索。<small>A SMALL STEP INTO SPACE.</small></span></div>
    </aside>
    <section class="experience" aria-label="火箭三维体验">
      <div class="viewport-wrap">
        <div id="viewport"></div>
        <div class="scene-shade"></div>
        <div class="scene-topline"><div><span class="eyebrow" id="scene-kicker">${site.kicker}</span><h2 id="scene-title">${site.shortName}</h2><p id="scene-location">${site.padLabel} · 发射台待命</p></div><span class="scene-quality" id="quality-label">电影画质 · 教学场景</span></div>
        <div class="mission-clock" id="clock-box"><span id="mission-state"><i></i>系统就绪</span><strong id="clock">T−00:10</strong><small id="phase">等待你的发射指令</small></div>
        <div class="telemetry" id="telemetry"><div class="telemetry-heading"><i></i>飞行数据<small>教学插值</small></div><div class="metric"><span>高度 ALTITUDE</span><strong id="altitude">0.00<small>km</small></strong><div class="metric-bar"><i id="altitude-bar"></i></div></div><div class="metric"><span>速度 VELOCITY</span><strong id="velocity">0<small>m/s</small></strong></div><div class="metric small-metric"><span>发动机状态</span><strong id="engine-status">待机</strong></div><div class="metric small-metric"><span>当前视角</span><strong id="view-name">自由环绕</strong></div></div>
        <article class="module-detail" id="module-detail" hidden><span class="eyebrow">COMPONENT INSIGHT</span><h2 id="part-name"></h2><p class="part-subtitle" id="part-subtitle"></p>
          <section class="module-narration" aria-label="小朋友讲解"><div class="narration-actions"><button id="narration-play">${icon('volume')}<span>听讲解</span></button><button id="narration-stop" aria-label="停止讲解" disabled>${icon('close')}</button></div><div class="narration-options"><button id="narration-slow" aria-pressed="false">慢一点</button><button id="narration-replay">${icon('reset')}再听一遍</button></div><p id="narration-status" role="status" aria-live="polite">点一下喇叭，听听它的故事。</p><div class="narration-story" id="narration-story"></div></section>
          <details class="module-more"><summary>了解更多</summary><p id="part-description"></p><ul id="part-facts"></ul><p class="accuracy-note" id="part-accuracy"></p></details><section class="interior-details" id="interior-details" hidden><h3>内部结构依据</h3><span id="interior-confidence"></span><ul id="interior-features"></ul><p id="interior-description"></p><div id="interior-sources"></div></section></article>
        <article class="assembly-coach" id="assembly-coach" hidden><span class="eyebrow">你的造箭小任务</span><span class="assembly-step" id="assembly-step">01</span><h2 id="assembly-task"></h2><p id="assembly-instruction"></p><div class="assembly-fact"><span>${icon('info')}原来是这样</span><p id="assembly-fact"></p></div><button id="assembly-hint">${icon('target')}给我一点提示</button><p class="assembly-feedback" id="assembly-feedback" role="status" aria-live="polite"></p></article>
        <div id="assembly-target-label" class="assembly-target-label" hidden>放到这里 <span>＋</span></div>
        <div class="assembly-tray-caption" id="assembly-tray-caption" hidden>${icon('build')}拿起零件，放进发光轮廓</div>
        <div id="assembly-celebration" class="assembly-celebration" hidden><span class="builder-medal">${icon('star')}</span><p class="eyebrow">MISSION BUILT BY YOU</p><h2>小小火箭工程师！</h2><p id="assembly-congratulations">每块零件都找到自己的位置啦。</p><button id="assembly-finish-launch">我的火箭，出发！ ${icon('launch')}</button><div><button id="assembly-again">再搭一次</button><button id="assembly-admire">欣赏作品</button></div></div>
        <div class="assembly-confetti" id="assembly-confetti" aria-hidden="true"></div>
        <div class="scene-bottomline"><span><i></i><span id="scene-mode-label">LAUNCH SIMULATION</span></span><span id="scene-hint">拖动探索视角 <span class="dot-separator">·</span> 滚轮缩放</span><button id="reset-camera" title="复位相机">${icon('target')}复位视角</button></div>
        <div class="completion" id="completion" hidden><span class="completion-icon">${icon('check')}</span><span class="eyebrow">MISSION COMPLETE</span><h2>下一站，宇宙。</h2><p>载荷已部署。你已完成本次发射科普体验。</p><div><button id="completion-explore">探索火箭结构 ${icon('arrow')}</button><button id="completion-replay">再发射一次</button><button id="completion-close" class="quiet">继续观察</button></div></div>
        <div class="toast" id="toast" role="status" aria-live="polite"></div>
      </div>
      <footer class="flight-console" id="flight-console">
        <div class="console-controls"><div class="launch-actions"><button class="launch-button" id="launch">${icon('launch')}<span>启动发射</span><kbd>SPACE</kbd></button><button class="reset-button" id="reset" title="重置任务 (R)" aria-label="重置任务">${icon('reset')}</button></div><div class="playback"><span>时间倍率</span><div class="rates">${[1,5,20,100,600].map(rate=>`<button data-rate="${rate}" class="${rate===1?'active':''}" aria-pressed="${rate===1}">${rate}×</button>`).join('')}</div></div><button class="next-event" id="next-event">下一事件 ${icon('arrow')}</button></div>
        <div class="timeline-row"><span id="timeline-start">T−00:10</span><div class="timeline-track"><input type="range" id="timeline" aria-label="任务时间轴" min="-10" max="${DURATION}" value="-10" step="0.1"/><div class="timeline-markers" id="timeline-markers" aria-hidden="true"></div></div><span id="timeline-end">${formatTime(DURATION)}</span></div>
        <div class="timeline-status"><span id="timeline-current-event">等待发射</span><span id="timeline-next-event"></span></div><div class="event-navigation-label">事件导航 · 按发生顺序，点击可跳转 <span>上方刻度按任务时长排列</span></div>
        <div class="event-strip" aria-label="关键飞行事件">${EVENTS.filter(e=>!['ignition','meco','ses-1','ses-2','seco-2'].includes(e.id)).map(e=>`<button data-event="${e.id}" title="${e.detail}"><i></i>${e.label}<small>${formatTime(e.time)}</small></button>`).join('')}<button data-jump="480" title="独立的一级陆地回收教学示意"><i></i>一级着陆<small>T+08:00 · 示意</small></button></div>
      </footer>
      <footer class="explore-console" id="explore-console" hidden><span>${icon('layers')}认识部件，理解协作。<small>整体尺寸依据公开资料，模块细节为教学示意。</small></span><button id="back-to-launch">前往发射台 ${icon('arrow')}</button></footer>
      <footer class="assembly-console" id="assembly-console" hidden><div><strong id="assembly-action-label">选一块零件开始吧</strong><small>可以拖动三维零件，也可以点按钮安装。</small></div><button id="assembly-install">${icon('build')}装上这一块</button><button id="assembly-launch" disabled>${icon('launch')}去发射</button></footer>
    </section>
  </main>
  <dialog id="about-dialog"><div class="dialog-top"><span class="eyebrow">ABOUT THE SIMULATION</span><button id="close-about" class="icon-button" aria-label="关闭说明">${icon('close')}</button></div><h2>探索真实，理解边界。</h2><p>这是本地运行的猎鹰 9 号科普体验。你可以观察发射与分级、切换机位，或在展馆里拆解火箭。</p><div class="about-grid"><div><strong>公开尺寸</strong><p>全箭高 70 m、芯级直径 3.7 m。程序生成的表面细节和内部结构为示意，尚非工程模型。</p></div><div><strong>任务时间线</strong><p>上升事件来自 SpaceX 用户指南的 LEO 示例。高度、速度与轨迹为教学插值，不是真实遥测或物理求解。</p></div><div><strong>回收示意</strong><p>一级返航为独立的教学动画，不能视为该 LEO 示例任务的实际回收过程。发射场设施与地形也为示意。</p></div><div><strong>观察与操作</strong><p>空格：启动 / 暂停；R：重置；1–5：切换镜头。拖动时间轴会暂停；切入结构探索也会暂停任务。</p></div></div><h3>资料来源</h3><div class="source-links">${SOURCES.map(s=>`<a href="${s.url}" target="_blank" rel="noopener noreferrer"><strong>${s.title} ↗</strong><span>${s.note}</span></a>`).join('')}</div><p class="dialog-footnote">游戏无需外部地图或在线模型服务。打开资料链接时需要联网。</p></dialog>
`;

const narrator=createNarrator({onChange:renderNarrationState});
function renderNarrationState({status,slow,error}){
  const playing=['playing','loading'].includes(status);
  $('#narration-play').innerHTML=`${icon(playing?'pause':'volume')}<span>${playing?'暂停讲解':status==='paused'?'继续听':status==='ended'?'再听一遍':'听讲解'}</span>`;
  $('#narration-play').setAttribute('aria-label',playing?'暂停部件讲解':status==='paused'?'继续部件讲解':'播放部件讲解');
  $('#narration-stop').disabled=!playing&&status!=='paused';$('#narration-slow').setAttribute('aria-pressed',String(slow));
  $('#narration-status').textContent=error||({idle:'点一下喇叭，听听它的故事。',loading:'正在打开本地讲解…',playing:'正在讲解 · 可以边听边转动模型',paused:'已暂停，点“继续听”接着听。',ended:'听完啦！再选一个部件探索吧。'})[status];
  $('.module-narration').classList.toggle('speaking',playing);
}
function setNarrationLesson(){
  const lesson=getModuleNarration(ROCKET.id,selectedModule),record=lesson&&NARRATION_AUDIO[lesson.key];
  narrator.setLesson(lesson?{...lesson,audio:record?.text===lesson.text?record.audio:null}:null);
  $('#narration-story').replaceChildren(...(lesson?.sentences||[]).map(sentence=>{const p=document.createElement('p');p.textContent=sentence;return p;}));
}

function formatTime(time){const s=Math.floor(Math.abs(time));return `T${time<0?'−':'+'}${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
function coordinate(value,positive,negative){return `${Math.abs(value).toFixed(2)}°${value>=0?positive:negative}`;}
function refreshSceneHeading(){
  if(mode==='assembly'){
    $('#scene-title').textContent=`一起搭${ROCKET.shortName}`;$('#scene-kicker').textContent='BUILD & DISCOVER';
    $('#scene-location').textContent=assemblyGame.completed?'搭建完成！转一转，欣赏你的作品。':assemblyGame.guided?'跟着提示，一块一块搭起来。':'试试不同顺序，找到部件之间的连接。';
    $('#scene-mode-label').textContent='ROCKET BUILD WORKSHOP';$('#scene-hint').textContent='选零件 · 放进发光轮廓 · 也可点按钮安装';
  }else if(mode==='structure'){
    $('#scene-title').textContent='结构探索';$('#scene-kicker').textContent=ROCKET.englishName.toUpperCase()+' / ANATOMY';
    $('#scene-location').textContent=`${ROCKET.height} 米之间，每一部分各司其职。`;
    $('#scene-mode-label').textContent=structureView==='cutaway'?'SECTION VIEW / INTERNAL STRUCTURE':'VEHICLE EXPLORER';
    $('#scene-hint').textContent=structureView==='cutaway'?'旋转查看剖面 · 点选部件了解内部':'拖动旋转 · 滚轮缩放 · 点选部件';
  }else{
    $('#scene-title').textContent=site.shortName;$('#scene-kicker').textContent=site.kicker;
    $('#scene-location').textContent=`${site.padLabel} · ${site.region}`;$('#scene-mode-label').textContent='LAUNCH SIMULATION';
    $('#scene-hint').textContent=view==='orbit'?'拖动探索视角 · 滚轮缩放':'镜头自动追踪 · 数字 1–6 切换';
  }
  $('#reset-camera').title=mode==='assembly'?'复位工坊视角':mode==='structure'?'复位展厅视角':'复位相机';
  $('#reset-camera').setAttribute('aria-label',$('#reset-camera').title);
}
function setStudioTheme(value){
  const theme=getStudioTheme(value);studioThemeId=theme.id;
  $('#app').dataset.studioTheme=theme.id;
  for(const [key,color]of Object.entries(theme.ui))$('#app').style.setProperty(`--studio-${key}`,color);
  $('#studio-theme-choice').value=theme.id;$('#studio-theme-description').textContent=theme.subtitle;
  scene?.setStudioTheme(theme.id);
  try{localStorage.setItem('karman.studio-theme',theme.id);}catch{}
}
function saveAssemblyProgress(){
  savedAssembly[assemblyGame.rocketId]=assemblyGame.snapshot();
  try{localStorage.setItem('karman.assembly-progress',JSON.stringify(savedAssembly));}
  catch{$('.assembly-save-note').textContent='本次进度暂时保留在页面中。模型拼搭不代表工厂总装流程。';}
}
function clearAssemblyFeedback(){clearTimeout(assemblyFeedbackTimer);$('#assembly-feedback').textContent='';$('#assembly-feedback').classList.remove('success','gentle');}
function showAssemblyFeedback(message,success=false){
  clearTimeout(assemblyFeedbackTimer);const feedback=$('#assembly-feedback');feedback.textContent=message;
  feedback.classList.toggle('success',success);feedback.classList.toggle('gentle',!success);
  assemblyFeedbackTimer=setTimeout(()=>{feedback.textContent='';feedback.classList.remove('success','gentle');},6000);
}
function assemblyAvailability(part){
  if(!part)return '选一块零件，我们一起试试。';
  const placed=assemblyGame.placed;
  const missing=part.prerequisites.filter(id=>!placed.has(id));
  if(missing.length){const names=missing.map(id=>assemblyGame.plan.parts.find(item=>item.id===id)?.shortName||id).join('、');return `先把${names}拼好，就能放${part.shortName}啦。`;}
  if(assemblyGame.guided&&assemblyGame.nextPart?.id!==part.id)return `跟着提示，下一块先找${assemblyGame.nextPart.shortName}。想自己安排顺序，可以试试“小工程师”。`;
  return part.hint;
}
function syncAssemblyScene(){
  if(mode!=='assembly')return;
  scene?.setAssemblyState({placed:assemblyGame.placed,selectedId:assemblyGame.selectedId,hintId:assemblyHintId||(assemblyGame.guided?assemblyGame.nextPart?.id:null)||null});
}
function revealAssemblySelection(){
  if(mode!=='assembly')return;
  const palette=$('#assembly-palette'),card=palette.querySelector('.active');if(!card)return;
  const box=palette.getBoundingClientRect(),part=card.getBoundingClientRect();
  if(part.top<box.top||part.bottom>box.bottom)palette.scrollTo({top:palette.scrollTop+part.top-box.top-(palette.clientHeight-part.height)/2,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
function renderAssemblyUI(){
  const palette=$('#assembly-palette');
  if(palette.dataset.rocket!==ROCKET.id){
    const scrollTop=palette.scrollTop;
    palette.innerHTML=assemblyGame.plan.parts.map(part=>`<button type="button" class="assembly-part" data-assembly-part="${part.id}" data-group="${part.group}" draggable="true"><span class="assembly-part-number">${String(part.step).padStart(2,'0')}</span><span class="assembly-part-name">${part.shortName}</span><span class="assembly-part-status"></span></button>`).join('');
    palette.dataset.rocket=ROCKET.id;palette.scrollTop=scrollTop;
  }
  const placed=assemblyGame.placed,next=assemblyGame.nextPart;
  for(const part of assemblyGame.plan.parts){
    const button=palette.querySelector(`[data-assembly-part="${part.id}"]`);const installed=placed.has(part.id),ready=assemblyGame.canPlace(part.id),selected=assemblyGame.selectedId===part.id;
    button.classList.toggle('placed',installed);button.classList.toggle('active',selected);button.classList.toggle('ready',ready);button.classList.toggle('locked',!installed&&!ready);button.classList.toggle('recommended',next?.id===part.id);
    button.disabled=installed;button.draggable=!installed;button.setAttribute('aria-pressed',String(selected));
    const status=installed?'已装好':ready?'可以安装':'先看提示';button.querySelector('.assembly-part-status').textContent=status;
    button.setAttribute('aria-label',`${part.shortName}，${status}`);button.title=installed?`${part.shortName}已经到位`:assemblyAvailability(part);
  }
  $('#assembly-count').textContent=`${placed.size} / ${assemblyGame.plan.total}`;$('#assembly-meter-fill').style.width=`${Math.round(assemblyGame.progress*100)}%`;
  const meter=$('.assembly-meter');meter.setAttribute('role','progressbar');meter.setAttribute('aria-label','火箭组装进度');meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax',String(assemblyGame.plan.total));meter.setAttribute('aria-valuenow',String(placed.size));
  document.querySelectorAll('[data-guided]').forEach(button=>{const active=(button.dataset.guided==='true')===assemblyGame.guided;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  const selected=assemblyGame.plan.parts.find(part=>part.id===assemblyGame.selectedId)||next;
  $('#assembly-step').textContent=assemblyGame.completed?'完成':String(selected?.step||1).padStart(2,'0');
  $('#assembly-task').textContent=assemblyGame.completed?'每块零件都到位啦':selected?.shortName||'选一块零件';
  $('#assembly-instruction').textContent=assemblyGame.completed?'拖动旋转模型，看看自己搭好的火箭。':selected?.hint||'从左边的部件盒开始吧。';
  $('#assembly-fact').textContent=assemblyGame.completed?`你已经认识了 ${assemblyGame.plan.total} 组部件。${assemblyGame.plan.note}`:selected?.fact||assemblyGame.plan.note;
  $('#assembly-action-label').textContent=assemblyGame.completed?`${ROCKET.shortName}已经搭好啦`:`正在拼：${selected?.shortName||'选一块零件'}`;
  $('#assembly-install').disabled=!scene||!selected||!assemblyGame.canPlace(selected.id);
  $('#assembly-hint').disabled=assemblyGame.completed;$('#assembly-undo').disabled=placed.size===0;
  $('#assembly-launch').disabled=!scene||!assemblyGame.completed;$('#assembly-finish-launch').disabled=!scene||!assemblyGame.completed;
  $('#assembly-congratulations').textContent=`${ROCKET.shortName}的 ${assemblyGame.plan.total} 组部件都找到了自己的位置！`;
  $('#assembly-tray-caption').hidden=mode!=='assembly'||assemblyGame.completed;
  if(assemblyGame.completed)$('#assembly-target-label').hidden=true;
  if(mode==='assembly')refreshSceneHeading();
}
function selectAssemblyPart(id){
  if(mode!=='assembly'||!assemblyGame.select(id))return false;
  assemblyHintId=null;clearAssemblyFeedback();renderAssemblyUI();syncAssemblyScene();saveAssemblyProgress();
  if(!assemblyGame.canPlace(id))showAssemblyFeedback(assemblyAvailability(assemblyGame.plan.parts.find(part=>part.id===id)));
  return true;
}
function clearAssemblyCelebration(){
  clearTimeout(confettiTimer);$('#assembly-celebration').hidden=true;$('#assembly-confetti').replaceChildren();$('#assembly-confetti').classList.remove('active');
}
function celebrateAssembly(){
  $('#assembly-celebration').hidden=false;
  clearTimeout(confettiTimer);const confetti=$('#assembly-confetti');confetti.replaceChildren();
  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    const colors=['#f5b75c','#70bed2','#b7a5db','#86c5a6','#ec9e92'];
    const pieces=Array.from({length:42},(_,index)=>{const piece=document.createElement('i');piece.style.left=`${5+Math.random()*90}%`;piece.style.background=colors[index%colors.length];piece.style.animationDelay=`${Math.random()*.65}s`;piece.style.animationDuration=`${2.2+Math.random()*.65}s`;piece.style.setProperty('--drift',`${(Math.random()-.5)*200}px`);piece.style.setProperty('--rotation',`${Math.random()*540-270}deg`);return piece;});
    confetti.append(...pieces);confetti.classList.add('active');
    confettiTimer=setTimeout(()=>{confetti.replaceChildren();confetti.classList.remove('active');},3800);
  }
}
function handleAssemblyDrop(id,nearTarget){
  if(mode!=='assembly'||!scene||assemblyGame.placed.has(id))return false;
  if(!assemblyGame.select(id)){showAssemblyFeedback('先从部件盒选一块零件，我们再试试。');return false;}
  if(!assemblyGame.canPlace(id)){const refusal=assemblyGame.place(id);renderAssemblyUI();syncAssemblyScene();scene.assemblyFeedback(false);showAssemblyFeedback(refusal.message);return false;}
  if(!nearTarget){renderAssemblyUI();syncAssemblyScene();scene.assemblyFeedback(false);showAssemblyFeedback('再靠近发光轮廓一点点，就能把这块拼上啦。');return false;}
  const result=assemblyGame.place(id);
  if(!result.ok){renderAssemblyUI();syncAssemblyScene();scene.assemblyFeedback(false);showAssemblyFeedback(result.message);return false;}
  assemblyHintId=null;renderAssemblyUI();syncAssemblyScene();revealAssemblySelection();scene.assemblyFeedback(true);saveAssemblyProgress();showAssemblyFeedback(result.message,true);
  if(result.newlyCompleted)celebrateAssembly();
  return true;
}
function resetAssembly(){assemblyGame.reset();assemblyHintId=null;clearAssemblyCelebration();clearAssemblyFeedback();renderAssemblyUI();syncAssemblyScene();revealAssemblySelection();saveAssemblyProgress();showAssemblyFeedback('部件盒准备好啦，我们从第一块开始。');}
function launchAssembledRocket(){if(!assemblyGame.completed||!scene)return;saveAssemblyProgress();clearAssemblyCelebration();setMode('launch');reset();launch();}
function updateAssemblyTargetLabel(){
  const label=$('#assembly-target-label');
  if(mode!=='assembly'||assemblyGame.completed||!assemblyGame.canPlace(assemblyGame.selectedId)||!$('#assembly-celebration').hidden){if(!label.hidden)label.hidden=true;return;}
  const target=scene?.getAssemblyTargetScreen();
  if(!target?.visible||!Number.isFinite(target.x)||!Number.isFinite(target.y)){if(!label.hidden)label.hidden=true;return;}
  const viewport=$('#viewport');if(target.x<0||target.x>viewport.clientWidth||target.y<0||target.y>viewport.clientHeight){if(!label.hidden)label.hidden=true;return;}
  label.hidden=false;const left=`${Math.round(target.x)}px`,top=`${Math.round(target.y)}px`;
  if(label.style.left!==left)label.style.left=left;if(label.style.top!==top)label.style.top=top;
}
function eventButtons(){
  const timeline=timelinePresentation(sim.mission,sim.time);
  $('#timeline-markers').innerHTML=timeline.markers.map(e=>`<i data-marker="${e.id}" style="left:${e.percent}%" title="${e.label} · ${formatTime(e.time)}"></i>`).join('');
  $('.event-strip').innerHTML=timeline.markers.map(e=>`<button data-timeline-event="${e.id}" title="${e.detail}"><i></i>${e.label}<small>${formatTime(e.time)}${e.kind==='recovery'?' · 示意':''}</small></button>`).join('');
  $('.event-strip').querySelectorAll('[data-timeline-event]').forEach(b=>b.addEventListener('click',()=>{
    const event=timeline.markers.find(e=>e.id===b.dataset.timelineEvent);seek(event.time);subject=event.target;$('#subject-choice').value=subject;scene?.setSubject(subject);updateUI();toast(`${event.label} · ${formatTime(event.time)} · 已暂停`);
  }));
}
function refreshAbout(){
  const modal=$('#about-dialog');modal.querySelector(':scope > p').textContent='本地运行的多型号航天科普体验，支持发射、结构探索和组装工坊。展厅可切换主题；组装有提示、可撤销，没有计时或扣分。';
  const cells=modal.querySelectorAll('.about-grid > div');
  cells[0].querySelector('p').textContent=`${ROCKET.name}：全高 ${ROCKET.height} m、芯径 ${ROCKET.diameter} m。${ROCKET.accuracy}`;
  cells[1].querySelector('p').textContent=sim.mission.description+' '+sim.mission.accuracy;
  cells[2].querySelector('strong').textContent='场景与画质';cells[2].querySelector('p').textContent='场地位置有资料与地图参考，设施并非实景扫描。电影档使用 HDR 环境光、材质反射、柔和泛光与更高分辨率阴影，仍是浏览器实时近似。';
  cells[3].querySelector('p').textContent='发射时空格启动 / 暂停，R 重置，1–6 切换镜头。结构探索与组装都会暂停发射。工坊可拖动零件或点按钮安装，进度按型号保存在本机；拼搭顺序不代表真实总装流程。';
  $('.source-links').innerHTML=SOURCES.filter(s=>ROCKET.sourceIds.includes(s.id)||['wenchang-pads','jiuquan-pad','maps-urls'].includes(s.id)).map(s=>`<a href="${s.url}" target="_blank" rel="noopener noreferrer"><strong>${s.title} ↗</strong><span>${s.note}</span></a>`).join('')+'<a href="https://polyhaven.com/a/kloofendal_38d_partly_cloudy" target="_blank" rel="noopener noreferrer"><strong>Poly Haven · Greg Zaal / CC0 HDR ↗</strong><span>本地电影光照与天空素材；并非所选发射场的实拍照片。</span></a>';
  $('.source-links').insertAdjacentHTML('beforeend','<a href="https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/" target="_blank" rel="noopener noreferrer"><strong>NASA · Blue Marble 历史地球合成影像 ↗</strong><span>地球远景纹理：NASA Goddard，Reto Stöckli / Robert Simmon。历史影像，非实时地图或天气。</span></a>');
  $('.dialog-footnote').textContent='游戏运行时资源从本地加载；地图和资料外链需要联网。未将 Google 地图底图打包进游戏。';
}
function refreshVehicleUI(){
  $('#rocket-title').textContent=ROCKET.shortName;$('#rocket-title').classList.toggle('long-title',ROCKET.shortName.length>8);
  $('#program-label').textContent=`${ROCKET.program} / VEHICLE COLLECTION`;$('#rocket-subtitle').textContent=ROCKET.variant;$('#rocket-intro').textContent=ROCKET.description;
  $('#spec-height').innerHTML=`${ROCKET.height}<span> m</span>`;$('#spec-diameter').innerHTML=`${ROCKET.diameter}<span> m</span>`;$('#spec-stages').innerHTML=`${ROCKET.stages}<span> 级</span>`;
  $('#module-count').textContent=`EXPLORE / ${MODULES.length}`;$('.module-list').innerHTML=MODULES.map((p,i)=>`<button data-part="${p.id}" aria-pressed="false"><span class="module-number">${String(i+1).padStart(2,'0')}</span><span>${p.name}</span>${icon('arrow')}</button>`).join('');
  $('.module-list').querySelectorAll('[data-part]').forEach(b=>b.addEventListener('click',()=>setPart(b.dataset.part)));
  $('#mission-profile').textContent=sim.mission.label;$('#mission-profile').title=sim.mission.accuracy;
  $('#timeline').max=DURATION;$('#timeline-end').textContent=formatTime(DURATION);
  $('#completion h2').textContent=ROCKET.id==='starship'?'奔向更远的星空。':'下一站，宇宙。';
  $('#completion p').textContent=sim.mission.completionLabel+'。本次科普演示已完成。';
  $('#subject-choice option[value="booster"]').hidden=!sim.mission.hasRecovery;
  $('.subject-control').hidden=!sim.mission.hasRecovery;
  eventButtons();refreshAbout();setPart(selectedModule);
}
function setStructureView(value){
  structureView=value==='cutaway'?'cutaway':'exterior';const enabled=structureView==='cutaway';
  if(enabled){$('#explode').value=0;$('#explode-value').textContent='0%';scene?.setExplode(0);scene?.setIsolated(false);$('#isolate-part').setAttribute('aria-pressed','false');}
  scene?.setCutaway(enabled&&mode==='structure');
  $('#cutaway-tools').hidden=!enabled;$('#explode').disabled=enabled;$('#explode').hidden=enabled;$('#explode-heading').hidden=enabled;$('#app').dataset.inspection=structureView;
  document.querySelectorAll('[data-structure-view]').forEach(b=>{b.classList.toggle('active',b.dataset.structureView===structureView);b.setAttribute('aria-pressed',b.dataset.structureView===structureView);});
  refreshSceneHeading();
  $('#cutaway-note').textContent='彩色舱按已核布局关系展示；灰色表示内部布局待核实。尺寸、管路和连接细节仍为教学近似。';
  $('label[for="cutaway-offset"]').textContent='整箭剖面位置';$('#cutaway-offset').setAttribute('aria-label','整箭剖面位置');
  renderInteriorDetails();
}
function renderInteriorDetails(){
  const spec=getInteriorSpec(ROCKET.id,selectedModule);$('#interior-details').hidden=structureView!=='cutaway';
  $('#interior-confidence').textContent=spec.confidence==='confirmed'?'结构原理有公开依据':'布局细节待核实';
  $('#interior-features').innerHTML=spec.features.map(f=>`<li>${f}</li>`).join('');$('#interior-description').textContent=spec.notes;
  $('#interior-sources').innerHTML=spec.sourceIds.map(id=>INTERIOR_SOURCES.find(s=>s.id===id)).filter(Boolean).slice(0,3).map(s=>`<a href="${s.url}" target="_blank" rel="noopener noreferrer" title="${s.scope}">${s.title} ↗</a>`).join('');
  const tank=selectedModule==='stage1'||selectedModule==='stage2'||selectedModule.startsWith('booster-');
  if(!tank&&$('#isolate-part').getAttribute('aria-pressed')==='true'){$('.cutaway-key').innerHTML='<span><i class="structure-swatch"></i>结构与设备示意</span>';return;}
  $('.cutaway-key').innerHTML=tank&&spec.order==='unknown'?`<span><i class="unknown-swatch"></i>舱区范围 · 未定箱序</span><span class="propellant-note">氧化剂：${spec.oxidizerLabel}<br>燃料：${spec.fuelLabel}</span>`:`<span><i class="oxidizer-swatch"></i>${spec.oxidizerLabel==='不适用'?'氧化剂舱':spec.oxidizerLabel}</span><span><i class="fuel-swatch"></i>${spec.fuelLabel==='不适用'?'燃料舱':spec.fuelLabel}</span><span><i class="structure-swatch"></i>管路与支撑</span>`;
}
function switchRocket(id){
  narrator.stop();
  saveAssemblyProgress();clearAssemblyCelebration();clearAssemblyFeedback();assemblyHintId=null;draggedAssemblyId=null;
  setStructureView('exterior');$('#cutaway-offset').value=0;$('#cutaway-value').textContent='中线';
  ROCKET=getRocket(id);sim.setRocket(ROCKET.id);missionClock.rebase(performance.now());MODULES=getModules(ROCKET.id);EVENTS=sim.mission.events;DURATION=sim.mission.duration;
  assemblyGame=assemblyFor(ROCKET.id);$('#rocket-choice').value=ROCKET.id;
  selectedModule=MODULES[0].id;subject='vehicle';$('#subject-choice').value=subject;$('#completion').hidden=true;completionShown=false;lastStatus='';presentationTime=0;
  $('#explode').value=0;$('#explode-value').textContent='0%';$('#isolate-part').setAttribute('aria-pressed','false');
  scene?.setRocket(ROCKET);scene?.setCutawayOffset(0);scene?.setIsolated(false);scene?.setExplode(0);scene?.setSubject(subject);
  const compatible=getSitesForRocket(ROCKET.id);site=compatible.find(s=>s.id===site.id)||compatible[0];
  $('#site-choice').innerHTML=compatible.map(s=>`<option value="${s.id}" ${s.id===site.id?'selected':''}>${s.name}</option>`).join('');
  setSite(site.id);refreshVehicleUI();setRate(1);
  if(mode!=='structure')scene?.setSelected(null);
  renderAssemblyUI();syncAssemblyScene();refreshSceneHeading();
  try{localStorage.setItem('karman.rocket',ROCKET.id);}catch{}
  updateUI();
}
function setQuality(value){quality=value==='standard'?'standard':'cinema';scene?.setQuality(quality);document.querySelectorAll('[data-quality]').forEach(b=>{b.classList.toggle('active',b.dataset.quality===quality);b.setAttribute('aria-pressed',b.dataset.quality===quality);});$('#quality-label').textContent=(quality==='cinema'?'电影画质':'标准画质')+' · 教学场景';try{localStorage.setItem('karman.quality',quality);}catch{} }
let toastTimer;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
function setMode(next){
  if(!['launch','structure','assembly'].includes(next))return;
  if(mode===next){if(mode==='assembly'){renderAssemblyUI();syncAssemblyScene();}refreshSceneHeading();return;}
  narrator.stop();
  if(mode==='assembly')saveAssemblyProgress();
  missionClock.advance(performance.now(),mode==='launch'&&!document.hidden);
  if(sim.status==='running')sim.togglePause();missionClock.rebase(performance.now());
  if(next!=='structure')setStructureView('exterior');
  mode=next;scene?.setMode(mode);$('#app').dataset.mode=mode;$('.sidebar').scrollTop=0;draggedAssemblyId=null;
  $('#launch-panel').hidden=mode!=='launch';$('#structure-panel').hidden=mode!=='structure';$('#module-detail').hidden=mode!=='structure';$('#flight-console').hidden=mode!=='launch';$('#explore-console').hidden=mode!=='structure';$('#telemetry').hidden=mode!=='launch';$('#clock-box').hidden=mode!=='launch';$('#completion').hidden=true;
  $('#assembly-panel').hidden=mode!=='assembly';$('#assembly-coach').hidden=mode!=='assembly';$('#assembly-console').hidden=mode!=='assembly';$('#studio-theme-control').hidden=mode==='launch';$('#assembly-tray-caption').hidden=mode!=='assembly'||assemblyGame.completed;$('#assembly-target-label').hidden=true;
  clearAssemblyCelebration();clearAssemblyFeedback();$('#viewport').classList.remove('assembly-drop-active');
  document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',b.dataset.mode===mode);});
  if(mode==='assembly'){
    scene?.setSelected(null);scene?.setIsolated(false);$('#isolate-part').setAttribute('aria-pressed','false');scene?.setExplode(0);scene?.setView('orbit');renderAssemblyUI();syncAssemblyScene();revealAssemblySelection();
  }else if(mode==='structure'){setPart(selectedModule);scene?.setExplode(Number($('#explode').value));}
  else{scene?.setSelected(null);setView(view);scene?.setSubject(subject);}
  refreshSceneHeading();
  updateUI();
}
function setSite(id){site=getSitesForRocket(ROCKET.id).find(s=>s.id===id)||getSitesForRocket(ROCKET.id)[0];scene?.setSite(site);$('#site-region').textContent=site.region;$('#site-coords').textContent=`${coordinate(site.lat,'N','S')} ${coordinate(site.lon,'E','W')}`;$('#site-map').href=site.mapUrl;$('#site-map').title=site.layoutNote;refreshSceneHeading();try{localStorage.setItem('karman.site',site.id);}catch{} }
function setView(id){view=id;scene?.setView(id);document.querySelectorAll('[data-camera]').forEach(b=>{b.classList.toggle('active',b.dataset.camera===id);b.setAttribute('aria-pressed',b.dataset.camera===id);});$('#view-name').textContent=cameraModes.find(m=>m[0]===id)?.[2]||'自由环绕';$('#subject-note').textContent=id==='orbit'?'拖动旋转 · 滚轮缩放 · 右键平移':'相机自动追踪；选择自由环绕可手动观察。';refreshSceneHeading();}
function setPart(id){if(mode==='assembly'){selectAssemblyPart(id);return;}const part=MODULES.find(p=>p.id===id);if(!part)return;selectedModule=id;scene?.setSelected(id);document.querySelectorAll('[data-part]').forEach(b=>{b.classList.toggle('active',b.dataset.part===id);b.setAttribute('aria-pressed',b.dataset.part===id);});$('#part-name').textContent=part.name;$('#part-subtitle').textContent=part.subtitle;$('#part-description').textContent=part.description;$('#part-facts').innerHTML=part.facts.map(f=>`<li>${f}</li>`).join('');$('#part-accuracy').textContent=part.accuracy;setNarrationLesson();renderInteriorDetails();}
function launch(){if(!scene)return;missionClock.advance(performance.now(),mode==='launch'&&!document.hidden);if(sim.time>=DURATION){reset();}if(sim.status==='running')sim.togglePause();else sim.launch();missionClock.rebase(performance.now());updateUI();}
function reset(){sim.reset();missionClock.rebase(performance.now());presentationTime=0;subject='vehicle';$('#subject-choice').value=subject;scene?.setSubject(subject);scene?.setView(view);$('#completion').hidden=true;completionShown=false;hiddenPause=false;setRate(1);updateUI();}
function seek(time){sim.seek(time);missionClock.rebase(performance.now());presentationTime=0;$('#completion').hidden=true;completionShown=false;if(!sim.state.separated||!sim.mission.hasRecovery){subject='vehicle';$('#subject-choice').value=subject;scene?.setSubject(subject);}scene?.setView(view);updateUI();}
function setRate(rate){missionClock.setRate(rate,performance.now(),mode==='launch'&&!document.hidden);document.querySelectorAll('[data-rate]').forEach(b=>{b.classList.toggle('active',Number(b.dataset.rate)===rate);b.setAttribute('aria-pressed',Number(b.dataset.rate)===rate);});updateUI();}

document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
document.querySelectorAll('[data-camera]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.camera)));
document.querySelectorAll('[data-part]').forEach(b=>b.addEventListener('click',()=>setPart(b.dataset.part)));
document.querySelectorAll('[data-rate]').forEach(b=>b.addEventListener('click',()=>setRate(Number(b.dataset.rate))));
document.querySelectorAll('[data-quality]').forEach(b=>b.addEventListener('click',()=>setQuality(b.dataset.quality)));
document.querySelectorAll('[data-structure-view]').forEach(b=>b.addEventListener('click',()=>setStructureView(b.dataset.structureView)));
$('#studio-theme-choice').addEventListener('change',event=>setStudioTheme(event.target.value));
$('#narration-play').addEventListener('click',()=>narrator.toggle());
$('#narration-stop').addEventListener('click',()=>narrator.stop());
$('#narration-replay').addEventListener('click',()=>narrator.replay());
$('#narration-slow').addEventListener('click',()=>narrator.setSlow(!narrator.state.slow));
document.addEventListener('visibilitychange',()=>{if(document.hidden)narrator.pause();});
window.addEventListener('pagehide',()=>narrator.stop());
document.querySelectorAll('[data-guided]').forEach(button=>button.addEventListener('click',()=>{
  assemblyGame.setGuided(button.dataset.guided==='true');assemblyHintId=null;clearAssemblyFeedback();renderAssemblyUI();syncAssemblyScene();saveAssemblyProgress();
  showAssemblyFeedback(assemblyGame.guided?'跟着提示，下一块零件会亮起来。':'你可以自己选顺序。先把连接它的部件拼好就行。');
}));
$('#assembly-palette').addEventListener('click',event=>{const button=event.target.closest('[data-assembly-part]');if(button&&!button.disabled)selectAssemblyPart(button.dataset.assemblyPart);});
$('#assembly-palette').addEventListener('dragstart',event=>{
  const button=event.target.closest('[data-assembly-part]');
  if(mode!=='assembly'||!scene||!button||button.disabled||!selectAssemblyPart(button.dataset.assemblyPart)){event.preventDefault();return;}
  draggedAssemblyId=button.dataset.assemblyPart;
  event.dataTransfer.effectAllowed='move';event.dataTransfer.setData(ASSEMBLY_DRAG_TYPE,draggedAssemblyId);event.dataTransfer.setData('text/plain',draggedAssemblyId);
  $('#viewport').classList.add('assembly-drop-active');
});
$('#assembly-palette').addEventListener('dragend',()=>{draggedAssemblyId=null;$('#viewport').classList.remove('assembly-drop-active');});
$('.viewport-wrap').addEventListener('dragover',event=>{
  if(mode!=='assembly'||!scene||(!draggedAssemblyId&&!Array.from(event.dataTransfer?.types||[]).includes(ASSEMBLY_DRAG_TYPE)))return;
  event.preventDefault();event.dataTransfer.dropEffect='move';$('#viewport').classList.add('assembly-drop-active');
});
$('.viewport-wrap').addEventListener('dragleave',event=>{if(!event.currentTarget.contains(event.relatedTarget))$('#viewport').classList.remove('assembly-drop-active');});
$('.viewport-wrap').addEventListener('drop',event=>{
  if(mode!=='assembly'||!scene)return;
  const id=event.dataTransfer?.getData(ASSEMBLY_DRAG_TYPE)||draggedAssemblyId;if(!id)return;
  event.preventDefault();event.stopPropagation();draggedAssemblyId=null;$('#viewport').classList.remove('assembly-drop-active');
  if(!assemblyGame.plan.parts.some(part=>part.id===id)){showAssemblyFeedback('从当前火箭的部件盒里选一块零件吧。');return;}
  const nearTarget=scene.tryAssemblyDrop(id,event.clientX,event.clientY);handleAssemblyDrop(id,Boolean(nearTarget));
});
$('#assembly-install').addEventListener('click',()=>handleAssemblyDrop(assemblyGame.selectedId,true));
$('#assembly-hint').addEventListener('click',()=>{
  const hint=assemblyGame.hint();if(!hint.part){showAssemblyFeedback(hint.message,true);return;}
  assemblyGame.select(hint.partId);assemblyHintId=hint.partId;renderAssemblyUI();syncAssemblyScene();revealAssemblySelection();saveAssemblyProgress();showAssemblyFeedback(hint.message);
});
$('#assembly-undo').addEventListener('click',()=>{
  const result=assemblyGame.undo();if(result.ok){assemblyHintId=null;clearAssemblyCelebration();renderAssemblyUI();syncAssemblyScene();revealAssemblySelection();saveAssemblyProgress();}showAssemblyFeedback(result.message);
});
$('#assembly-reset').addEventListener('click',resetAssembly);$('#assembly-again').addEventListener('click',resetAssembly);
$('#assembly-launch').addEventListener('click',launchAssembledRocket);$('#assembly-finish-launch').addEventListener('click',launchAssembledRocket);
$('#assembly-admire').addEventListener('click',()=>{clearAssemblyCelebration();showAssemblyFeedback('慢慢转一转，看看每一块零件是怎样连在一起的。',true);});
$('#cutaway-offset').addEventListener('input',e=>{const value=Number(e.target.value);scene?.setCutawayOffset(value);$('#cutaway-value').textContent=Math.abs(value)<.01?'中线':`${value>0?'+':''}${Math.round(value*100)}%`;});
$('#section-front').addEventListener('click',()=>{$('#cutaway-offset').value=0;$('#cutaway-value').textContent='中线';scene?.setCutawayOffset(0);if($('#isolate-part').getAttribute('aria-pressed')==='true')scene?.focusSelected();else scene?.setCutaway(true);});
$('#rocket-choice').addEventListener('change',e=>switchRocket(e.target.value));
document.querySelectorAll('[data-event]').forEach(b=>b.addEventListener('click',()=>{const e=EVENTS.find(e=>e.id===b.dataset.event);seek(e.time);toast(`${e.label} · 已暂停，可继续播放`);}));
document.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>{seek(Number(b.dataset.jump));subject='booster';$('#subject-choice').value=subject;scene?.setSubject(subject);toast('一级陆地回收为独立的教学示意');}));
$('#site-choice').addEventListener('change',e=>{reset();setSite(e.target.value);});
$('#subject-choice').addEventListener('change',e=>{subject=e.target.value;scene?.setSubject(subject);if(subject==='booster')toast('正在观察一级回收 · 教学示意');updateUI();});
$('#launch').addEventListener('click',launch);$('#reset').addEventListener('click',reset);
$('#timeline').addEventListener('input',e=>seek(Number(e.target.value)));
$('#next-event').addEventListener('click',()=>{missionClock.advance(performance.now(),mode==='launch'&&!document.hidden);const e=timelinePresentation(sim.mission,sim.time).nextEvent;if(e){seek(e.time);subject=e.target;$('#subject-choice').value=subject;scene?.setSubject(subject);updateUI();toast(`${e.label} · ${formatTime(e.time)}`);}});
$('#explode').addEventListener('input',e=>{$('#explode-value').textContent=`${Math.round(Number(e.target.value)*100)}%`;scene?.setExplode(Number(e.target.value));});
$('#assemble').addEventListener('click',()=>{setStructureView('exterior');$('#explode').value=0;$('#explode-value').textContent='0%';scene?.setExplode(0);scene?.setSelected(selectedModule);scene?.setIsolated(false);$('#isolate-part').setAttribute('aria-pressed','false');});
$('#isolate-part').addEventListener('click',()=>{const enabled=$('#isolate-part').getAttribute('aria-pressed')!=='true';$('#isolate-part').setAttribute('aria-pressed',String(enabled));const label=enabled?'模块剖面位置':'整箭剖面位置';$('label[for="cutaway-offset"]').textContent=label;$('#cutaway-offset').setAttribute('aria-label',label);scene?.setIsolated(enabled);scene?.focusSelected();renderInteriorDetails();});
$('#focus-part').addEventListener('click',()=>scene?.focusSelected());$('#reset-camera').addEventListener('click',()=>scene?.setView(mode==='launch'?view:'orbit'));
$('#back-to-launch').addEventListener('click',()=>setMode('launch'));$('#completion-explore').addEventListener('click',()=>setMode('structure'));$('#completion-replay').addEventListener('click',reset);$('#completion-close').addEventListener('click',()=>{$('#completion').hidden=true;});
$('.about-button').addEventListener('click',()=>$('#about-dialog').showModal());$('#close-about').addEventListener('click',()=>$('#about-dialog').close());$('#about-dialog').addEventListener('click',e=>{if(e.target===$('#about-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('.brand').addEventListener('click',e=>{e.preventDefault();setMode('launch');});
document.addEventListener('keydown',e=>{if(e.repeat||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable||$('#about-dialog').open)return;if(e.code==='Space'&&mode==='launch'){e.preventDefault();launch();}if(e.code==='KeyR'&&mode==='launch')reset();if(/^[1-6]$/.test(e.key)&&mode==='launch')setView(cameraModes[Number(e.key)-1][0]);});
document.addEventListener('visibilitychange',()=>{const now=performance.now();if(document.hidden&&sim.status==='running'){missionClock.advance(now,mode==='launch');sim.togglePause();hiddenPause=true;updateUI();}missionClock.rebase(now);if(!document.hidden){lastFrame=now;if(hiddenPause){toast('任务已在离开页面时暂停');hiddenPause=false;}}});

$('.sound-button').addEventListener('click',async()=>{
  try{
    if(!audioContext){audioContext=new AudioContext();const buffer=audioContext.createBuffer(1,audioContext.sampleRate*2,audioContext.sampleRate);const samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;const noise=audioContext.createBufferSource();noise.buffer=buffer;noise.loop=true;const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=180;audioGain=audioContext.createGain();audioGain.gain.value=0;noise.connect(filter).connect(audioGain).connect(audioContext.destination);noise.start();}
    await audioContext.resume();soundEnabled=!soundEnabled;$('.sound-button').setAttribute('aria-pressed',soundEnabled);$('.sound-button').classList.toggle('enabled',soundEnabled);$('.sound-button').title=soundEnabled?'关闭音效':'开启音效';$('.sound-button').setAttribute('aria-label',soundEnabled?'关闭音效':'开启音效');toast(soundEnabled?'音效已开启（合成发动机音）':'音效已关闭');
  }catch{toast('当前浏览器无法启用音效');}
});

let completionShown=false;
function updateUI(state=sim.state){
  if(mode!=='launch')return;
  const status=sim.time>=DURATION?'complete':sim.status;const viewingBooster=subject==='booster'&&state.separated&&sim.mission.hasRecovery;const altitude=viewingBooster?state.booster.altitude:state.altitude;
  const timeline=timelinePresentation(sim.mission,state.time);
  if(mode==='launch')$('#scene-location').textContent=`${site.padLabel} · ${status==='ready'?'发射台待命':viewingBooster?'一级回收教学示意':sim.mission.label}`;
  $('#clock').textContent=formatTime(state.time);$('#timeline').value=state.time;$('#timeline').style.setProperty('--progress',`${timeline.percent}%`);
  $('#timeline').setAttribute('aria-valuetext',`${formatTime(state.time)}，${timeline.currentEvent?.label||'发射准备'}`);
  $('#timeline-current-event').textContent=timeline.currentEvent?`最近发生：${timeline.currentEvent.label} · ${formatTime(timeline.currentEvent.time)}`:'准备发射';
  $('#timeline-next-event').textContent=timeline.nextEvent?`下一事件：${timeline.nextEvent.label} · ${formatTime(timeline.nextEvent.time)}`:'全部事件已到达';
  $('#phase').textContent=viewingBooster?(state.booster.landed?'一级已着陆 · 教学示意':'一级返航 · 教学示意'):status==='ready'?'等待你的发射指令':state.deployed&&presentationTime<4?'载荷分离展示中':state.phase;
  $('#altitude').innerHTML=`${(altitude/1000).toFixed(altitude>=100000?1:2)}<small>km</small>`;
  $('#velocity').innerHTML=viewingBooster?`—<small>未建模</small>`:`${Math.round(state.velocity).toLocaleString('en-US')}<small>m/s</small>`;
  $('#altitude-bar').style.width=`${Math.min(100,altitude/210000*100)}%`;
  const engines=state.boostersEngineOn?ROCKET.liftoffEngineCount:ROCKET.firstStageEngines;
  $('#engine-status').textContent=viewingBooster?(state.booster.engineOn?'回收点火':'关机'):state.firstEngineOn&&state.secondEngineOn?'热分级 · 两级点火':state.firstEngineOn?`起飞段 · ${engines} 台工作`:state.secondEngineOn?`上面级 · ${ROCKET.secondStageEngines} 台工作`:state.time<-3?'待机':'关机 / 滑行';
  $('#subject-choice option[value="booster"]').disabled=!state.separated||!sim.mission.hasRecovery;
  $('#site-choice').disabled=status!=='ready';$('#next-event').disabled=sim.time>=DURATION;
  if(status!==lastStatus){
    $('#mission-state').innerHTML=`<i class="${status==='running'?'live':''}"></i>${({ready:'系统就绪',running:'任务进行中',paused:'时间已暂停',complete:'任务完成'})[status]}`;
    $('#launch').innerHTML=`${icon(status==='running'?'pause':status==='ready'?'launch':'play')}<span>${({ready:'启动发射',running:'暂停任务',paused:'继续播放',complete:'重新发射'})[status]}</span><kbd>SPACE</kbd>`;
    $('#launch').classList.toggle('in-flight',status==='running');lastStatus=status;
  }
  if(state.phase!==lastPhase||status!==lastStatus){lastPhase=state.phase;}
  for(const marker of timeline.markers){
    const tick=$(`[data-marker="${marker.id}"]`),button=$(`[data-timeline-event="${marker.id}"]`);
    tick?.classList.toggle('passed',marker.passed);button?.classList.toggle('passed',marker.passed);
    const current=timeline.currentEvent?.id===marker.id;tick?.classList.toggle('current',current);button?.classList.toggle('current',current);
    if(button)button.setAttribute('aria-current',current?'step':'false');
  }
  if(status==='complete'&&!completionShown&&mode==='launch'&&(!state.deployed||presentationTime>=4)){completionShown=true;$('#completion').hidden=false;}
}

$('#app').dataset.mode=mode;setStudioTheme(studioThemeId);renderAssemblyUI();
try{scene=createScene($('#viewport'),setPart,ROCKET,{onAssemblyDrop:handleAssemblyDrop});setStudioTheme(studioThemeId);switchRocket(ROCKET.id);setQuality(quality);scene.setSelected(null);setView('orbit');}
catch(error){console.error(error);try{scene?.dispose();}catch{}scene=null;$('#viewport').innerHTML='<div class="render-error"><h2>三维场景暂时无法启动</h2><p>请使用支持 WebGL 2 的新版 Chrome 或 Edge，并开启硬件加速。</p><button onclick="location.reload()">重新加载</button></div>';$('#launch').disabled=true;renderAssemblyUI();toast('三维渲染未启动，请检查浏览器硬件加速设置');}
updateUI();
function tick(now){const dt=Math.max(0,Math.min((now-lastFrame)/1000,.1));lastFrame=now;const{state}=missionClock.advance(now,mode==='launch'&&!document.hidden);missionClock.drainEvents();if(mode==='launch'&&state.deployed&&sim.time>=DURATION)presentationTime=Math.min(7,presentationTime+dt);scene?.update({...state,deploymentElapsed:state.deployed?presentationTime*5:state.deploymentElapsed},dt);updateAssemblyTargetLabel();updateUI(state);if(audioGain){const active=mode==='launch'&&sim.status==='running'&&(subject==='booster'?state.booster.engineOn:state.firstEngineOn||state.secondEngineOn||state.boostersEngineOn);audioGain.gain.setTargetAtTime(soundEnabled&&active?.25:0,audioContext.currentTime,.12);}requestAnimationFrame(tick);}
requestAnimationFrame(tick);
