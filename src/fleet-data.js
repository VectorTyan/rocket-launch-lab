// Public reference configurations, checked 2026-10-01. Dimensions are metres.
// diameter means CORE diameter, never the total width including side boosters.
// stages counts serial propulsion stages; boosters are counted separately.
// firstStageEngines means CORE engines; liftoffEngineCount includes side boosters.

export const SOURCES = [
  { id: 'falcon9', title: 'SpaceX · Falcon 9', url: 'https://new.spacex.com/vehicles/falcon-9', note: '70 米全高、3.7 米芯径与九台一级发动机。' },
  { id: 'falcon-heavy', title: 'SpaceX · Falcon Heavy', url: 'https://new.spacex.com/vehicles/falcon-heavy', note: '70 米全高、12.2 米总宽、三芯级 27 台发动机；总宽不是芯级直径。' },
  { id: 'falcon-guide', title: 'Falcon 用户指南 · 2025-05-09', url: 'https://www.spacex.com/assets/media/falcon-users-guide-2025-05-09.pdf', note: 'Falcon 9 / Heavy 的公开结构、场地与示例任务。' },
  { id: 'starship-overview', title: 'SpaceX · 2026-06-05 公开文件中的 Starship 概览', url: 'https://content.spacex.com/cms-assets/FINAL_Documents%20and%20Updates/SpaceX%20-%20EU%20Prospectus%20%28Approved%20by%20Bafin%29%20-%20June%205%2C%202026.pdf', note: '本版本固定全高 124.4 米、直径 9 米；不是所有历史星舰构型的统一尺寸。' },
  { id: 'starship-flight12', title: 'SpaceX · Starship 第十二次飞行试验', url: 'https://www.spacex.com/launches/starship-flight-12', note: 'V3、33 台助推器发动机、6 台飞船发动机、4 片襟翼及 Starbase Pad 2。' },
  { id: 'starship-v3', title: 'SpaceX · Starship V3 更新说明', url: 'https://new.spacex.com/updates', note: 'V3 助推器采用三片栅格翼与集成热分级段；网页会继续更新，应保留所选构型。' },
  { id: 'cz5', title: '国家航天局 · 长征五号遥三任务', url: 'https://www.cnsa.gov.cn/n6758823/n6758838/c6808545/content.html', note: '57 米公开尺寸口径、5 米芯径、四个 3.35 米助推器与文昌发射。' },
  { id: 'cz5-structure', title: '国家航天局 · 长征五号构型', url: 'https://www.cnsa.gov.cn/n6758824/n6759008/n6759011/c6794064/content.html', note: '两个芯级加四个液体助推器。' },
  { id: 'cz5-engines', title: '航天科技集团 · 长五液体动力', url: 'https://www.spacechina.com/n25/n2014789/n2014809/c3094961/content.html', note: '8 台助推器主发动机、2 台芯一级主发动机和 2 台芯二级主发动机。' },
  { id: 'cz5b', title: '中国载人航天 · 长征五号 B 首飞发布会', url: 'https://www.cmse.gov.cn/ztbd/xwfbh/202005/t20200519_46641.html', note: '53.7 米、5 米芯径、20.5 米长/5.2 米直径整流罩；取消芯二级。' },
  { id: 'cz7', title: '国家航天局 · 长征七号运抵文昌', url: 'https://www.cnsa.gov.cn/n6758823/n6758838/c6770231/content.html', note: '53.1 米、3.35 米芯径、四个 2.25 米助推器。' },
  { id: 'cz7-core', title: '中国载人航天 · 长征七号芯一级双机试车', url: 'https://www.cmse.gov.cn/xwzx/yzjz/201510/t20151028_45019.html', note: '芯一级采用两台并联液氧煤油发动机。' },
  { id: 'cz7-engines', title: '航天科技集团 · 长七与天舟七号动力', url: 'https://www.spacechina.com/n25/n2014789/n2014809/c4045757/content.html', note: '长七起飞段六台主发动机、二级四台发动机。' },
  { id: 'cz8', title: '航天科技集团 · 长征八号基本型', url: 'https://www.spacechina.com/n25/n146/n238/n12985/c3961239/content.html', note: '50.3 米；芯一级径 3.35 米/两台 YF-100，芯二级径 3 米/两台 YF-75，两助推器各一台 YF-100。' },
  { id: 'cz8-first', title: '国家航天局 · 长征八号首次飞行', url: 'https://www.cnsa.gov.cn/n6759533/c6810959/content.html', note: '2020 首飞的双助推器构型与 4.2 米整流罩。' },
  { id: 'cz8-pad', title: '中央纪委国家监委报现场采访 · 长征八号首飞', url: 'https://www.shjjjc.gov.cn/2015jjw/n2230/n2236/u1ai84758.html', note: '政府网站转载的现场采访：长八首飞借用长七塔架；不是海南商业航天发射场。' },
  { id: 'cz2f', title: '中国载人航天 · 长征二号 F 系统介绍', url: 'https://www.cmse.gov.cn/col/col919/index.html', note: '58.34 米、3.35 米芯径、四个 2.25 米助推器、载人构型整流罩径 3.8 米。' },
  { id: 'cz2f-structure', title: '中国载人航天 · 长征二号 F 系统构成', url: 'https://www.cmse.gov.cn/kpjy/htzs/ttsj/201509/t20150911_37314.html', note: '逃逸塔、整流罩、飞船、两芯级、助推器与动力系统。' },
  { id: 'cz2f-engines', title: '国家航天局 · 载人火箭动力构成解读', url: 'https://www.cnsa.gov.cn/n6758824/n6759009/n6759042/n6759070/c6795735/content.html', note: '两级动力构成：起飞段共八台主发动机，二级一台主机及四个游动推力单元。仅引用结构，不套用早期质量参数。' },
  { id: 'wenchang-pads', title: '中国军网 · 文昌发射场工位现场报道', url: 'https://www.81.mil.cn/kt/16442632.html', note: '101 工位对应长征五号及空间站舱段，201 工位对应长征七号；直接采访发射场人员。' },
  { id: 'jiuquan-pad', title: '央广网 · 酒泉发射塔架现场报道', url: 'https://china.cnr.cn/gdgg/20240426/t20240426_526682621.shtml', note: '酒泉 921 工位承担载人航天发射。' },
  { id: 'maps-urls', title: 'Google Maps URLs 官方文档', url: 'https://developers.google.com/maps/documentation/urls/get-started', note: '仅生成区域定位外链；游戏不下载或重新分发 Google 地图影像。' },
];

const layoutNote = '地形、道路、塔架及相对位置为科普场景；地图坐标仅用于区域参考，未进行工位测绘或 Google 影像配准。';
const siteRecords = [
  { id: 'slc40', name: '卡纳维拉尔角 · SLC-40', shortName: '卡纳维拉尔角', region: '美国 · 佛罗里达州', lat: 28.56, lon: -80.58, terrain: 'coast', padLabel: 'SLC-40', padType: 'falcon', kicker: 'FLORIDA / EASTERN RANGE', description: '猎鹰 9 号的大西洋沿岸发射场；本机型库不将这里开放给猎鹰重型。' },
  { id: 'lc39a', name: '肯尼迪航天中心 · LC-39A', shortName: '肯尼迪航天中心', region: '美国 · 佛罗里达州', lat: 28.61, lon: -80.60, terrain: 'coast', padLabel: 'LC-39A', padType: 'heavy', kicker: 'KENNEDY / LAUNCH COMPLEX 39A', description: '猎鹰 9 号与猎鹰重型的兼容发射场。场景平台为可辨识的示意布局。' },
  { id: 'slc4e', name: '范登堡 · SLC-4E', shortName: '范登堡', region: '美国 · 加利福尼亚州', lat: 34.63, lon: -120.61, terrain: 'west', padLabel: 'SLC-4E', padType: 'falcon', kicker: 'CALIFORNIA / WESTERN RANGE', description: '猎鹰 9 号的太平洋沿岸发射场；丘陵与海岸按环境特征生成。' },
  { id: 'starbase', name: 'Starbase · Pad 2', shortName: '星际基地', region: '美国 · 得克萨斯州', lat: 26.00, lon: -97.16, terrain: 'coast', padLabel: 'PAD 2', padType: 'starship', kicker: 'TEXAS / STARBASE', description: '本版本的星舰 V3 参考 Starbase Pad 2，依据 SpaceX 第十二次试飞说明。区域定位点不等于塔架中心。' },
  { id: 'wenchang101', name: '文昌 · 101 工位', shortName: '文昌一号工位', region: '中国 · 海南文昌', lat: 19.61, lon: 110.95, terrain: 'tropical', padLabel: '101', padType: 'cz5', kicker: 'HAINAN / WENCHANG 101', description: '长征五号与长征五号 B 的热带滨海发射场景；对应文昌航天发射场的一号工位。' },
  { id: 'wenchang201', name: '文昌 · 201 工位', shortName: '文昌二号工位', region: '中国 · 海南文昌', lat: 19.62, lon: 110.96, terrain: 'tropical', padLabel: '201', padType: 'cz7', kicker: 'HAINAN / WENCHANG 201', description: '长征七号与早期双助推器长征八号的参考发射工位。长八首飞借用长七塔架；这里不是海南商业航天发射场。' },
  { id: 'jiuquan921', name: '酒泉 · 921 工位', shortName: '酒泉载人发射场', region: '中国 · 酒泉航天城', lat: 40.96, lon: 100.29, terrain: 'desert', padLabel: '921', padType: 'cz2f', kicker: 'JIUQUAN / CREWED LAUNCH', description: '长征二号 F 神舟载人构型的参考发射场景；以戈壁、服务塔和载人发射设施为主要环境特征。' },
];

export const SITES = siteRecords.map(site => ({
  ...site,
  mapUrl: `https://www.google.com/maps/search/?api=1&query=${site.lat.toFixed(2)},${site.lon.toFixed(2)}`,
  layoutNote,
}));

const fairing = ['fairing-left', 'fairing-right'];
const twoStage = ['stage1', 'engines1', 'interstage', 'stage2', 'engine2'];
const boosterIds = count => Array.from({ length: count }, (_, i) => `booster-${i + 1}`);
const publicModel = '公开全高、芯径和主要构型作为比例基准；各舱段、机械连接、表面细节与飞行轨迹仍为教学近似。';

export const ROCKETS = [
  {
    id: 'falcon9', name: '猎鹰 9 号', englishName: 'Falcon 9', shortName: '猎鹰 9', program: 'SpaceX',
    variant: 'Block 5 · 标准卫星整流罩', height: 70, diameter: 3.7, stages: 2,
    firstStageEngines: 9, secondStageEngines: 1, boosters: 0, boosterEngines: 0, liftoffEngineCount: 9,
    hasRecovery: true, siteIds: ['slc40', 'lc39a', 'slc4e'],
    description: '九台 Merlin 推动一级升空，单台真空发动机继续送载荷入轨；一级可在适当任务中回收。',
    accuracy: publicModel, sourceIds: ['falcon9', 'falcon-guide'],
    moduleIds: [...twoStage, ...fairing, 'payload', 'grid-fins', 'landing-legs'],
  },
  {
    id: 'falcon-heavy', name: '猎鹰重型', englishName: 'Falcon Heavy', shortName: '猎鹰重型', program: 'SpaceX',
    variant: '三芯级 · 标准卫星整流罩', height: 70, diameter: 3.7, totalWidth: 12.2, stages: 2,
    firstStageEngines: 9, secondStageEngines: 1, boosters: 2, boosterEngines: 9, liftoffEngineCount: 27,
    hasRecovery: true, siteIds: ['lc39a'],
    description: '中央芯级与两枚侧助推器共用 27 台 Merlin 起飞，侧助推器先分离，中央芯级继续工作。',
    accuracy: `${publicModel} 12.2 米是总宽；回收状态须按具体任务区分。`, sourceIds: ['falcon-heavy', 'falcon-guide'],
    moduleIds: [...twoStage, ...fairing, 'payload', ...boosterIds(2), 'grid-fins', 'landing-legs'],
  },
  {
    id: 'starship', name: '星舰', englishName: 'Starship / Super Heavy', shortName: '星舰', program: 'SpaceX',
    variant: 'V3 · 2026 年公开构型参考', height: 124.4, diameter: 9, stages: 2,
    firstStageEngines: 33, secondStageEngines: 6, boosters: 0, boosterEngines: 0, liftoffEngineCount: 33,
    hasRecovery: true, siteIds: ['starbase'],
    description: 'Super Heavy 与 Ship 构成两级系统，采用热分级；Ship 带襟翼和热防护层，使用自身舱体容纳载荷。',
    accuracy: `${publicModel} 固定 V3，不混用早期高度或四栅格翼构型；回收能力字段表示设计特征，不代表本动画是实飞复现。`,
    sourceIds: ['starship-overview', 'starship-flight12', 'starship-v3'],
    moduleIds: [...twoStage, 'payload', 'grid-fins', 'flaps', 'heatshield'],
  },
  {
    id: 'cz5', name: '长征五号', englishName: 'Long March 5', shortName: '长征五号', program: '中国航天',
    variant: '早期标准两级构型 · 遥三外形参考', height: 57, diameter: 5, stages: 2,
    firstStageEngines: 2, secondStageEngines: 2, boosters: 4, boosterEngines: 2, liftoffEngineCount: 10,
    hasRecovery: false, siteIds: ['wenchang101'],
    description: '两级氢氧芯级配合四枚液氧煤油助推器，是本机型库中的大型深空任务火箭代表。',
    accuracy: `${publicModel} 57 米采用遥三任务公开口径，不适用于加长整流罩等后续变体。`,
    sourceIds: ['cz5', 'cz5-structure', 'cz5-engines', 'wenchang-pads'],
    moduleIds: [...twoStage, ...fairing, 'payload', ...boosterIds(4)],
  },
  {
    id: 'cz5b', name: '长征五号 B', englishName: 'Long March 5B', shortName: '长征五号 B', program: '中国航天',
    variant: '一级半 · 大型舱段整流罩', height: 53.7, diameter: 5, stages: 1,
    firstStageEngines: 2, secondStageEngines: 0, boosters: 4, boosterEngines: 2, liftoffEngineCount: 10,
    hasRecovery: false, siteIds: ['wenchang101'],
    description: '取消芯二级，以一个芯级和四枚助推器执行近地轨道大型载荷任务；采用更长的整流罩。',
    accuracy: `${publicModel} 只有一个芯级，不能使用通用二级分离动画。`, sourceIds: ['cz5b', 'cz5-engines', 'wenchang-pads'],
    moduleIds: ['stage1', 'engines1', ...fairing, 'payload', ...boosterIds(4)],
  },
  {
    id: 'cz7', name: '长征七号', englishName: 'Long March 7', shortName: '长征七号', program: '中国航天',
    variant: '两级四助推 · 天舟货运构型参考', height: 53.1, diameter: 3.35, stages: 2,
    firstStageEngines: 2, secondStageEngines: 4, boosters: 4, boosterEngines: 1, liftoffEngineCount: 6,
    hasRecovery: false, siteIds: ['wenchang201'],
    description: '采用液氧煤油动力，芯一级双发动机与四枚单发动机助推器协作，二级由四台发动机推进。',
    accuracy: `${publicModel} 本型为长征七号，不是增加芯三级的长征七号甲。`,
    sourceIds: ['cz7', 'cz7-core', 'cz7-engines', 'wenchang-pads'],
    moduleIds: [...twoStage, ...fairing, 'payload', ...boosterIds(4)],
  },
  {
    id: 'cz8', name: '长征八号', englishName: 'Long March 8', shortName: '长征八号', program: '中国航天',
    variant: '2020 首飞双助推器构型参考', height: 50.3, diameter: 3.35, upperDiameter: 3, stages: 2,
    firstStageEngines: 2, secondStageEngines: 2, boosters: 2, boosterEngines: 1, liftoffEngineCount: 4,
    hasRecovery: false, siteIds: ['wenchang201'],
    description: '液氧煤油芯一级、两个助推器与较细的氢氧芯二级组合，展现模块化火箭的不同外形。',
    accuracy: `${publicModel} 不混用无助推器构型、长征八号甲或回收方案。`,
    sourceIds: ['cz8', 'cz8-first', 'cz8-pad', 'wenchang-pads'],
    moduleIds: [...twoStage, ...fairing, 'payload', ...boosterIds(2)],
  },
  {
    id: 'cz2f', name: '长征二号 F', englishName: 'Long March 2F', shortName: '长征二号 F', program: '中国航天',
    variant: '神舟载人构型 · 带逃逸塔', height: 58.34, diameter: 3.35, stages: 2,
    firstStageEngines: 4, secondStageEngines: 1, vernierEngines: 4, boosters: 4, boosterEngines: 1, liftoffEngineCount: 8,
    hasRecovery: false, siteIds: ['jiuquan921'],
    description: '顶部逃逸塔与载人整流罩是主要识别特征；两芯级和四助推器将神舟飞船送入轨道。',
    accuracy: `${publicModel} 二级枚数仅统计主发动机；另有四个游动推力单元。飞船与救生系统均为科普模型。`,
    sourceIds: ['cz2f', 'cz2f-structure', 'cz2f-engines', 'jiuquan-pad'],
    moduleIds: [...twoStage, ...fairing, 'spacecraft', 'escape-tower', ...boosterIds(4)],
  },
];

const propulsion = {
  falcon9: { core: 'Merlin', upper: 'Merlin Vacuum', fuel: '液氧 / RP-1 火箭煤油', upperFuel: '液氧 / RP-1 火箭煤油', booster: 'Merlin' },
  'falcon-heavy': { core: 'Merlin', upper: 'Merlin Vacuum', fuel: '液氧 / RP-1 火箭煤油', upperFuel: '液氧 / RP-1 火箭煤油', booster: 'Merlin' },
  starship: { core: 'Raptor 3', upper: 'Raptor 3（3 台海平面型 + 3 台真空型）', fuel: '液氧 / 液态甲烷', upperFuel: '液氧 / 液态甲烷' },
  cz5: { core: 'YF-77', upper: 'YF-75D', fuel: '液氢 / 液氧', upperFuel: '液氢 / 液氧', booster: 'YF-100' },
  cz5b: { core: 'YF-77', fuel: '液氢 / 液氧', booster: 'YF-100' },
  cz7: { core: 'YF-100', upper: 'YF-115', fuel: '液氧 / 煤油', upperFuel: '液氧 / 煤油', booster: 'YF-100' },
  cz8: { core: 'YF-100', upper: 'YF-75', fuel: '液氧 / 煤油', upperFuel: '液氢 / 液氧', booster: 'YF-100' },
  cz2f: { core: '常温液体主发动机', upper: '主发动机与游动推力单元', fuel: '四氧化二氮 / 偏二甲肼', upperFuel: '四氧化二氮 / 偏二甲肼', booster: '常温液体主发动机' },
};

export function getRocket(id = 'falcon9') {
  return ROCKETS.find(rocket => rocket.id === id) || ROCKETS[0];
}

export function getSitesForRocket(id = 'falcon9') {
  const rocket = getRocket(id);
  return SITES.filter(site => rocket.siteIds.includes(site.id));
}

export function getModules(id = 'falcon9') {
  const rocket = getRocket(id);
  const p = propulsion[rocket.id];
  const isShip = rocket.id === 'starship';
  const heavy = rocket.id === 'falcon-heavy';
  const crewed = rocket.id === 'cz2f';
  const moduleAccuracy = '公开构型与用途；几何细节、内部结构和机械动作采用教学近似。';
  const describe = (partId, name, subtitle, description, facts, accuracy = moduleAccuracy) => ({ id: partId, name, subtitle, description, facts, accuracy });
  const entries = {
    stage1: describe('stage1', isShip ? 'Super Heavy 助推级' : heavy ? '中央芯一级' : '芯一级', '起飞段主结构',
      isShip ? 'Super Heavy 是星舰系统的第一级。它与 Ship 热分级后独立运动；V3 没有猎鹰式着陆腿。' : rocket.stages === 1 ? '长征五号 B 唯一的芯级。助推器分离后它继续工作，将大型载荷送往目标轨道，不存在芯一、二级分离。' : `${rocket.name}的芯一级负责起飞和初始上升，${rocket.boosters ? '与侧助推器共同工作。' : '完成任务后与第二级分离。'}`,
      [`芯级直径：${rocket.diameter} 米`, `推进剂：${p.fuel}`, rocket.hasRecovery ? '回收状态与轨迹须按任务区分' : '本参考构型不展示动力回收']),
    engines1: describe('engines1', '芯一级发动机组', `${rocket.firstStageEngines} 台${p.core}`,
      `这里展示芯一级的主发动机。${rocket.boosters ? `加上${rocket.boosters}枚侧助推器，起飞段共有${rocket.liftoffEngineCount}台主发动机。` : '发动机喷管与工作火焰分开建模。'}`,
      [`芯一级：${rocket.firstStageEngines} 台`, `动力：${p.core}`, '喷管、管路与尾焰为视觉示意']),
    interstage: describe('interstage', isShip ? '集成热分级段' : '级间段', isShip ? 'V3 不抛弃的连接区域' : '连接相邻芯级',
      isShip ? 'Ship 点火时，两级尚处于热分级转换过程。V3 的热分级段集成在 Super Heavy 上，不应作为旧式独立环在飞行中抛弃。' : '连接芯一级与第二级，并为级间分离提供结构空间。教学展开图不代表实际拆装顺序。',
      isShip ? ['固定参考：Starship V3', '教学上可单独查看', '飞行中随助推级保留'] : ['级间连接结构', '细节不对应完整工程图', '分离过程按机型区分']),
    stage2: describe('stage2', isShip ? 'Ship 飞船 / 上面级' : '芯二级', isShip ? '推进、载荷舱与再入结构一体' : '继续加速的上面级',
      isShip ? 'Ship 自身包括推进系统、载荷舱、襟翼和热防护结构。它不是带两瓣抛弃式整流罩的传统卫星上面级。' : '芯二级在前段工作完成后继续推进载荷。发动机数量、推进剂和点火方式随型号变化。',
      [`推进剂：${p.upperFuel || '不适用'}`, `主发动机：${rocket.secondStageEngines} 台`, rocket.id === 'cz8' ? '本型芯二级直径：3 米' : '舱段长度按整体比例近似']),
    engine2: describe('engine2', crewed ? '二级主机与游动系统' : '二级发动机组', p.upper || '本构型无芯二级',
      crewed ? '二级由一台主发动机与四个游动推力单元协作。主机计数不包含游动系统；较小喷管不应被画成四台同等尺寸的主机。' : isShip ? 'Ship 采用三台海平面型和三台真空型 Raptor，六台发动机的喷管用途与外形不同。' : '上面级发动机在高空工作，喷管与推进剂种类依照各型号区分。',
      crewed ? ['主发动机：1 台', '游动推力单元：4 个', '发动机舱细节为近似'] : [`主发动机：${rocket.secondStageEngines} 台`, `型号：${p.upper || '不适用'}`, '工作时长不采用其他型号的实飞值']),
    payload: describe('payload', isShip ? '舱内示例载荷' : rocket.id === 'cz5b' ? '大型舱段示例' : rocket.id === 'cz7' ? '货运飞船示例' : '示例载荷', '理解运载空间',
      isShip ? '虚构的舱内载荷用于说明容纳空间，不执行传统整流罩抛离或从鼻锥顶部飞出式部署。' : '模型用于展示载荷与运载火箭的位置关系，不对应某次任务完整的卫星或飞船内部设计。',
      ['教学模型', '尺寸、质量与设备细节未做实物验收', isShip ? '本版本不模拟真实舱门部署' : '释放动作是示意过程'], '教学载荷，无特定任务实物对应。'),
    'grid-fins': describe('grid-fins', '栅格翼', '返航气动控制',
      isShip ? 'V3 的 Super Heavy 使用三片栅格翼；不要与早期四片构型混用。它们在有大气的返航阶段发挥气动作用。' : heavy ? '三芯级参考构型每芯级四片、合计十二片栅格翼。是否安装及使用回收部件仍取决于具体任务。' : '一级上部四片栅格翼在返航时帮助调整姿态和航向，需要气流才能产生气动力。',
      [isShip ? 'V3：3 片' : heavy ? '每芯级 4 片，三芯级参考合计 12 片' : '4 片', '大气中的气动部件', '网格与转轴为近似']),
    'landing-legs': describe('landing-legs', '着陆腿', '收拢与展开',
      heavy ? '参考可回收芯级的着陆支撑部件。侧助推器和中央芯级的回收安排并不总是相同。' : '四条着陆腿起飞时收拢，着陆前展开。动画简化了机构运动和接地缓冲。',
      ['每个装备回收腿的芯级为 4 条', '具体任务可采用不同回收安排', '不用于星舰或本库长征构型']),
    flaps: describe('flaps', 'Ship 襟翼', '四片气动操纵面', '前部与后部襟翼用于控制 Ship 在大气中的姿态，与 Super Heavy 的栅格翼属于不同部件。', ['前部 2 片、后部 2 片', '本版本参考 V3', '动作与热载荷未做物理求解']),
    heatshield: describe('heatshield', 'Ship 热防护层', '迎风侧再入防护', '展示覆盖迎风侧的热防护区域。图案与分片为程序纹理，不是逐块复原的真实隔热瓦地图。', ['迎风侧防热结构', '纹理细节为示意', '未模拟真实热流与材料损伤']),
    spacecraft: describe('spacecraft', '神舟飞船', '载人构型的有效载荷', '以公开的三舱布局为参考。剖视展示座椅、仪表区和设备安装板的功能关系；位置与尺寸为教学摆放，未模拟航天员操作。', ['轨道舱、返回舱、推进舱', '飞船不是单独的火箭推进级', '内部为公开功能区示意，非批次实装图']),
    'escape-tower': describe('escape-tower', '逃逸塔', '载人安全系统', '位于火箭顶部，为飞行早期的应急逃逸提供动力。正常任务中按阶段抛离；这里的拆解不代表执行真实救生程序。', ['神舟载人构型保留逃逸塔', '本库不混用无塔无人构型', '救生机构仅作组成说明']),
  };

  for (const [index, side] of ['左', '右'].entries()) {
    const partId = fairing[index];
    const size = rocket.id === 'cz5b' ? '公开长 20.5 米、直径 5.2 米' : crewed ? '载人整流罩公开最大直径 3.8 米' : rocket.id === 'cz8' ? '整流罩公开直径 4.2 米' : '罩型与任务构型绑定';
    entries[partId] = describe(partId, `整流罩 · ${side}半罩`, crewed ? '保护载人飞船' : '保护有效载荷',
      `${crewed ? '载人整流罩包围神舟飞船，并与逃逸系统配合。' : '在穿越稠密大气时保护载荷，完成保护任务后分离。'}左右只用于教学视图辨认。`,
      [size, '两半罩分离运动为示意', '内部连接件未按工程图还原']);
  }
  for (let index = 1; index <= rocket.boosters; index += 1) {
    const partId = `booster-${index}`;
    const diameter = heavy ? 3.7 : ['cz5', 'cz5b'].includes(rocket.id) ? 3.35 : 2.25;
    entries[partId] = describe(partId, `${heavy ? '侧芯级' : '助推器'} ${index}`, `${rocket.boosterEngines} 台${p.booster}`,
      heavy ? '侧芯级与中央芯级共同起飞，并在中央芯级之前分离。此部件组合包含其自身发动机及回收相关部件的视觉示意。' : '捆绑在芯一级周围提供额外推力，完成工作后与主箭体分离。编号仅用于教学模型定位。',
      [`本构型共 ${rocket.boosters} 枚`, `单枚直径：${diameter} 米`, `单枚主发动机：${rocket.boosterEngines} 台`]);
  }
  return rocket.moduleIds.map(partId => entries[partId]);
}
