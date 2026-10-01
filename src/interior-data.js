// Public structural references checked 2026-10-01. This is an evidence catalogue,
// not a geometric model. "confirmed" covers the listed public facts only.
// Unknown tank order MUST NOT be replaced with a shared default layout.
export const INTERIOR_SOURCES = [
  { id: 'int-falcon-2025', title: 'SpaceX Falcon 用户指南 · 2025-05-09', url: 'https://www.spacex.com/assets/media/falcon-users-guide-2025-05-09.pdf', scope: '第 2.2–2.4 节：储箱、穿箱输氧管、发动机和级间连接；第 4.1.3 节：带声学内衬的标准整流罩载荷包络。不是完整工程图，内衬也不代表所有任务使用同一配置。' },
  { id: 'int-nasa-crew', title: 'NASA Commercial Crew Program Press Kit', url: 'https://www.nasa.gov/commercial-crew-program-press-kit/', scope: 'Falcon 9 公开组成图、一级九台发动机、铝锂贮箱及 LOX/RP-1；载人载荷图不能当作本游戏卫星载荷内部图。引用不代表模型获 NASA 认证。' },
  { id: 'int-nasa-liquid-engine', title: 'NASA Glenn · Liquid Rocket Engine', url: 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/liquid-rocket-engine/', scope: '只支持液体发动机中独立存储的推进剂由泵和供给流路送入燃烧室，再经喷管排出的功能关系；不支持本库任一机型泵组的具体数量、外形或安装坐标。' },
  { id: 'int-starship-v3', title: 'SpaceX · Introducing Starship V3', url: 'https://new.spacex.com/updates', scope: 'V3 集成热分级结构、助推器燃料箱前穹顶、燃料输送管、三片栅格翼及 header 供给系统改进；未提供所有 V3 储箱与管线的完整尺寸图。' },
  { id: 'int-starship-flight12', title: 'SpaceX · Starship 第十二次试飞', url: 'https://www.spacex.com/launches/starship-flight-12', scope: 'V3 的 33/6 台发动机、热分级、四片 Ship 襟翼、热防护与试验过程；不作为全部内部几何依据。' },
  { id: 'int-starship-faa-2023', title: 'FAA · 2023 Starship/Super Heavy 环境评估补充材料', url: 'https://www.faa.gov/media/27271', scope: '附件 Methodology — Starship Orbital Test Flight Vehicle Impact Noise Analysis，March 2023，图 2（PDF 索引页 35）：早期 Starship 主箱、header tanks、共底与供给管示意。仅作历史结构参考，不能把位置或尺寸直接移植到 V3。' },
  { id: 'int-cz5-structure', title: '国家航天局 · 长征五号构型介绍', url: 'https://www.cnsa.gov.cn/n6758824/n6759008/n6759011/c6794064/content.html', scope: '5 米氢氧芯级与四个 3.35 米液氧煤油助推器；不确认储箱上下顺序和内部尺寸。' },
  { id: 'int-cz5-assembly', title: '国家航天局 · 长征五号部段数字化总装', url: 'https://www.cnsa.gov.cn/n6758823/n6758838/c6770161/content.html', scope: '确认一级氢箱、一级箱间段、一级氧箱作为部段进行总装对接；文字没有给出可独立核验的上下布局图。' },
  { id: 'int-cz5-engines', title: '航天科技集团 · 长五动力系统', url: 'https://www.spacechina.com/n25/n2014789/n2014809/c3094961/content.html', scope: '八台助推器主机、两台芯一级氢氧主机、两台芯二级氢氧主机；布局尺寸仍需图纸。' },
  { id: 'int-cz5-booster-paper', title: '长征五号火箭助推器关键技术及方案设计', url: 'https://jdse.bit.edu.cn/sktcxb/cn/article/id/58c21589-a86b-48db-b547-a5533573fda7', scope: '研制论文公开的助推器承力、低温贮箱绝热、搅拌摩擦焊及捆绑结构技术；本轮未据正文图确认储箱顺序，不填精确坐标。' },
  { id: 'int-cz5b', title: '中国载人航天 · 长征五号 B 首飞发布会', url: 'https://www.cmse.gov.cn/ztbd/xwfbh/202005/t20200519_46641.html', scope: '取消芯二级，保留一个芯级、四个助推器与大型舱罩组合体；禁止生成不存在的芯二级贮箱。' },
  { id: 'int-cz7-structure', title: '中国载人航天 · 长征七号结构介绍', url: 'https://www.cmse.gov.cn/kpjy/htzs/ttsj/201509/t20150911_37325.html', scope: '芯一级部段列表包括氧箱、箱间段、煤油箱；芯二级四台液氧煤油发动机。追加查看原始配图后确认为实物照片，不是带内部标注的剖面，不能据此确认箱序。' },
  { id: 'int-cz7-core', title: '中国载人航天 · 长征七号芯一级双机试车', url: 'https://www.cmse.gov.cn/xwzx/yzjz/201510/t20151028_45019.html', scope: '确认芯一级两台并联液氧煤油发动机；不提供完整机架尺寸。' },
  { id: 'int-cz7-mount', title: '航天科技集团 · 长七二级发动机机架', url: 'https://www.spacechina.com/n25/n2014789/n2014809/c3810383/content.html', scope: '二级四台发动机安装在同一机架下面；2023 年机架结构增强说明。没有公布杆件位置和全部几何。' },
  { id: 'int-cz8', title: '航天科技集团 · 长征八号基本型', url: 'https://www.spacechina.com/n25/n146/n238/n12985/c3961239/content.html', scope: '芯一级及双助推器使用液氧煤油、芯二级使用液氢液氧，发动机分别 2、每助推器 1、二级 2；不是长征八号甲。' },
  { id: 'int-cz2f-structure', title: '中国载人航天 · 长征二号 F 系统构成', url: 'https://www.cmse.gov.cn/kpjy/htzs/ttsj/201509/t20150911_37314.html', scope: '仅引用文章前半部分传统神舟载人构型：NTO/UDMH、仪器舱及动力结构。追加查看原始图 1 为无贮箱文字标注的外形图，图 2 为系统框图，未据此确认箱序；文末换发方案不移植。' },
  { id: 'int-cz2f-engines', title: '国家航天局 · 中国载人火箭组成解读', url: 'https://www.cnsa.gov.cn/n6758824/n6759009/n6759042/n6759070/c6795735/content.html', scope: '传统长二 F 两芯级与四助推器、二级一主机及四个游动推力单元；仅引用结构，不混用旧稿质量参数。' },
  { id: 'int-shenzhou-layout', title: '中国载人航天 · 飞船总体布局', url: 'https://www.cmse.gov.cn/art/2015/9/11/art_944_20867.html', scope: '2015 年公开神舟总体布局：三舱、返回舱座椅与仪表、轨道舱安装板、推进舱设备安装圆盘。不能视为最新神舟批次逐件装配图。' },
  { id: 'int-crewed-cargo', title: '中国载人航天 · 神舟、天舟构型比较', url: 'https://www.cmse.gov.cn/xwzx/202302/t20230223_52828.html', scope: '空间站阶段神舟为轨道舱/返回舱/推进舱；天舟为货物舱/推进舱。确认舱段类型，不确认每次任务内部货物布置。' },
];

const TYPE = {
  kerolox: { fuelLabel: 'RP-1 火箭煤油', oxidizerLabel: '液氧 LOX' },
  kerosene: { fuelLabel: '煤油', oxidizerLabel: '液氧 LOX' },
  hydrolox: { fuelLabel: '液氢 LH₂', oxidizerLabel: '液氧 LOX' },
  methalox: { fuelLabel: '液态甲烷 CH₄', oxidizerLabel: '液氧 LOX' },
  hypergolic: { fuelLabel: '偏二甲肼 UDMH', oxidizerLabel: '四氧化二氮 N₂O₄' },
};
const COUNTS = {
  falcon9: [9, 1, 0, 0], 'falcon-heavy': [9, 1, 2, 9], starship: [33, 6, 0, 0],
  cz5: [2, 2, 4, 2], cz5b: [2, 0, 4, 2], cz7: [2, 4, 4, 1], cz8: [2, 2, 2, 1], cz2f: [4, 1, 4, 1],
};

function reference({ type, order = 'unknown', sourceIds = [], confidence = 'schematic', notes, features = [] }) {
  return {
    ...(type ? TYPE[type] : { fuelLabel: '不适用', oxidizerLabel: '不适用' }),
    order,
    sourceIds: [...sourceIds],
    confidence,
    notes: notes || '该部件的内部几何尚未获得可靠公开资料支持。',
    features: [...features],
  };
}

function falconTank(upper, heavy) {
  return reference({
    type: 'kerolox', order: 'oxidizer-top', confidence: 'confirmed', sourceIds: ['int-falcon-2025'],
    notes: `${upper ? '二级顺序依据缩短版贮箱说明及燃料箱底部连接界面，与公开总览一致。' : '一级顺序依据 LOX 管穿过 RP-1 箱到发动机段及上端 LOX 箱连接说明。'}仅确认布局原理，不确认本模型的容积、箱长、壁厚或支架细节。${heavy && !upper ? 'FH 中央芯级有加强设计，不能把其承力结构视为与侧芯级完全相同。' : ''}`,
    features: upper
      ? ['液氧在上、RP-1 在下', '二级储箱为一级架构的缩短形式', '下方单台 Merlin Vacuum；另有氮气姿控系统']
      : ['液氧在上、RP-1 在下', '共底穹顶隔开两种推进剂', '双壁输氧管穿过下部煤油箱', '底部九机承力区：外圈八台、中央一台'],
  });
}

function tankSpec(rocketId, upper, booster) {
  if (rocketId === 'falcon9' || rocketId === 'falcon-heavy') return falconTank(upper, rocketId === 'falcon-heavy' && !booster);
  if (rocketId === 'starship') return reference({
    type: 'methalox', order: upper ? 'unknown' : 'fuel-top',
    confidence: upper ? 'schematic' : 'confirmed',
    sourceIds: upper ? ['int-starship-v3', 'int-starship-flight12', 'int-starship-faa-2023'] : ['int-starship-v3', 'int-starship-flight12'],
    notes: upper
      ? '主贮箱与着陆储供系统已有公开说明，但 V3 Ship 完整剖面仍待核实。2023 年 FAA 图属于早期方案，不能确认 V3 主箱顺序和鼻部小贮箱的位置。'
      : '燃料箱位于前部依据 V3 更新中“燃料箱前穹顶直接面对 Ship 点火”的结构说明；燃料向下输送到 33 台发动机。其余壁厚、箱长、支承位置仍未核实。',
    features: upper
      ? ['主甲烷箱与主液氧箱', '独立于主箱概念的 header 储供系统', 'V3 header 管路真空夹套与低温循环系统', '六台 Raptor、四片襟翼与迎风侧热防护']
      : ['前部甲烷燃料箱', '集成热分级区与受保护的前穹顶', '向 33 台 Raptor 输送燃料的管道', '三片栅格翼；无猎鹰式着陆腿'],
  });
  if (rocketId === 'cz5' || rocketId === 'cz5b') return reference({
    type: booster ? 'kerosene' : 'hydrolox',
    sourceIds: booster ? ['int-cz5-structure', 'int-cz5-engines', 'int-cz5-booster-paper'] : upper ? ['int-cz5-structure', 'int-cz5-engines'] : ['int-cz5-structure', 'int-cz5-assembly', ...(rocketId === 'cz5b' ? ['int-cz5b'] : [])],
    notes: '推进剂及芯级、助推器的区别已确认；储箱上下关系仍待核实。灰色区域仅表示舱段空间，不代表已经确认的贮箱排列。',
    features: booster
      ? ['液氧箱与煤油箱', '每助推器两台 YF-100', '低温绝热与捆绑承力结构；内部位置待核实']
      : upper ? ['氢氧上面级储箱区', '两台 YF-75D', '独立的二级安装与仪器接口区域']
        : ['氢箱、箱间段与氧箱部段', '芯级两台 YF-77', rocketId === 'cz5b' ? '唯一芯级；上方直接连接舱罩组合体' : '上端为芯一、二级连接区'],
  });
  if (rocketId === 'cz7') return reference({
    type: 'kerosene', sourceIds: ['int-cz7-structure', ...(upper ? ['int-cz7-mount'] : [])],
    notes: '公开资料列出了氧箱、箱间段和煤油箱，但配图是实物照片，尚不足以确认各贮箱的上下位置。二级采用四台发动机共架结构。',
    features: booster ? ['液氧与煤油两类贮箱', '单台液氧煤油发动机', '助推器与芯级连接件位置待核实'] : upper ? ['液氧煤油储箱区', '四台发动机共用机架', '发动机安装区与贮箱不能混为一个实心圆柱'] : ['氧箱、箱间段、煤油箱', '后过渡段与尾段', '双主机安装区'],
  });
  if (rocketId === 'cz8') return reference({
    type: upper ? 'hydrolox' : 'kerosene', sourceIds: ['int-cz8'],
    notes: '本资料适用于双助推器基本型，推进剂和模块类型已确认；储箱顺序及内部隔壁形式仍待核实。长征八号甲属于不同构型。',
    features: upper ? ['液氢与液氧储箱区', '3 米芯二级', '两台 YF-75'] : booster ? ['液氧与煤油贮箱', '每枚一台 YF-100', '两枚侧助推器之一'] : ['液氧与煤油贮箱', '3.35 米芯一级', '两台 YF-100'],
  });
  return reference({
    type: 'hypergolic', sourceIds: ['int-cz2f-structure', 'int-cz2f-engines'],
    notes: '传统神舟载人构型使用四氧化二氮和偏二甲肼。已查看的官方外形图与系统框图没有贮箱位置标注，箱长、容积及上下关系仍待核实。',
    features: upper ? ['氧化剂箱与燃烧剂箱', '前部仪器舱圆盘', '一台中央主机与四个游动推力单元'] : booster ? ['氧化剂箱与燃烧剂箱', '单台主发动机', '助推器尾翼与捆绑区域'] : ['氧化剂箱与燃烧剂箱', '四台发动机并联机架', '常温推进剂体系，不使用液氧煤油配色标签'],
  });
}

/**
 * Stable public API. All labels/notes/features are Chinese strings.
 * Unknown IDs and absent modules return a schematic non-propellant record,
 * rather than silently inheriting Falcon 9 internals.
 */
export function getInteriorSpec(rocketId, partId) {
  const counts = COUNTS[rocketId];
  if (!counts) return reference({ notes: '未识别机型，无可引用的内部结构结论。' });
  const boosterMatch = /^booster-([1-4])$/.exec(partId || '');
  const booster = Boolean(boosterMatch && Number(boosterMatch[1]) <= counts[2]);
  const upper = partId === 'stage2';
  if (rocketId === 'cz5b' && ['stage2', 'engine2', 'interstage'].includes(partId)) return reference({
    confidence: 'confirmed', sourceIds: ['int-cz5b'], notes: '长征五号 B 没有芯二级及芯一、二级间段，本构型不包含这个部件。', features: ['本构型不存在此部件'],
  });
  if (partId === 'stage1' || upper || booster) return tankSpec(rocketId, upper, booster);
  if (partId === 'engines1' || partId === 'engine2') {
    const isUpper = partId === 'engine2';
    const tank = tankSpec(rocketId, isUpper, false);
    const engineSources = rocketId === 'cz5' || rocketId === 'cz5b' ? ['int-cz5-engines'] : rocketId === 'cz7' ? [isUpper ? 'int-cz7-structure' : 'int-cz7-core', ...(isUpper ? ['int-cz7-mount'] : [])] : tank.sourceIds;
    return { ...tank, sourceIds: [...engineSources, 'int-nasa-liquid-engine'], order: 'unknown', confidence: 'confirmed', notes: '类型与数量已确认，喷管、泵阀和机架细部为示意。', features: [
      `${isUpper ? '二级' : '芯一级'}主发动机：${counts[isUpper ? 1 : 0]} 台`,
      rocketId === 'cz2f' && isUpper ? '主机与游动系统共用机架；另有四个游动推力单元' : rocketId.startsWith('falcon') && !isUpper ? '外圈八台、中央一台' : rocketId === 'cz7' && isUpper ? '四机共同安装机架' : '推力室、喷管与安装承力区',
      '泵与供给管将推进剂送往燃烧室，展示代表性功能关系',
      '设备尺度、阀门和管路细节待核实',
    ] };
  }
  if (partId === 'interstage') {
    if (rocketId.startsWith('falcon')) return reference({ confidence: 'confirmed', sourceIds: ['int-falcon-2025'], notes: '外部为复合材料筒壳，剖面展示内部连接界面；连接件的具体尺寸仍为示意。', features: ['铝蜂窝芯与碳纤维蒙皮', '级间顶部三处机械锁扣', '四个气动分离推杆', '连接二级燃料箱底部'] });
    if (rocketId === 'starship') return reference({ confidence: 'confirmed', sourceIds: ['int-starship-v3'], notes: '仅适用 V3：集成热分级结构随 Super Heavy 保留，不按旧式独立环抛离。内部热防护层位置仅作结构概念展示。', features: ['通气热分级区域', '燃料箱前穹顶及保护层', '上级点火时仍存在两级接口'] });
    return reference({ sourceIds: [rocketId === 'cz2f' ? 'int-cz2f-structure' : rocketId === 'cz8' ? 'int-cz8' : rocketId === 'cz7' ? 'int-cz7-structure' : 'int-cz5-structure'], notes: '级间接口存在，承力件、连接件和安装位置缺少完整公开尺寸依据，当前展示为结构示意。', features: ['上下级接口', '上面级发动机容纳空间', '承力与连接结构采用示意'] });
  }
  if (partId === 'spacecraft' && rocketId === 'cz2f') return reference({ confidence: 'schematic', sourceIds: ['int-shenzhou-layout', 'int-crewed-cargo'], notes: '三舱类型可确认。2015 布局资料可解释座椅/仪器区等功能模块，不作为当前任务的逐件内装图，也不确定具体设备位置与尺寸。', features: ['轨道舱、返回舱、推进舱', '返回舱三座椅及仪表区的公开布局示例', '轨道舱仪器安装板', '推进舱设备安装圆盘'] });
  if (partId === 'payload') {
    if (rocketId === 'cz7') return reference({ sourceIds: ['int-crewed-cargo'], notes: '可参考天舟的货物舱/推进舱概念，但本项目示例载荷并未绑定某次天舟任务或货物清单。', features: ['货物舱与推进舱功能区', '装货与设备位置采用教学布局'] });
    if (rocketId === 'starship') return reference({ sourceIds: ['int-starship-v3', 'int-starship-faa-2023'], notes: '当前为舱内演示载荷。主贮箱、着陆储供系统与载荷区域各有不同功能；V3 载荷舱的具体内部布置尚未核实。', features: ['载荷区域与推进剂区域分开', '载荷内部结构未锁定', '未展示未经核实的载人座舱'] });
    return reference({ sourceIds: rocketId.startsWith('falcon') ? ['int-falcon-2025'] : rocketId === 'cz5b' ? ['int-cz5b'] : [], notes: '未指定实际卫星或空间站舱段，当前展示一般安装关系与教学内部布局。', features: ['载荷安装接口', '演示载荷内部保持示意'] });
  }
  if (partId === 'heatshield' && rocketId === 'starship') return reference({ confidence: 'confirmed', sourceIds: ['int-starship-flight12'], notes: '确认再入热防护功能；瓦片排列、背部层次和安装销没有逐件尺寸依据。', features: ['迎风侧热防护区域', '瓦片与安装细节不等于实际施工图'] });
  if (partId === 'flaps' && rocketId === 'starship') return reference({ confidence: 'confirmed', sourceIds: ['int-starship-flight12'], notes: '四片襟翼的外部构型与用途已确认，内部驱动机构的细节仍待核实。', features: ['前后四片气动操纵面', '襟翼根部连接与执行器为概念示意'] });
  if (partId === 'grid-fins' && (rocketId.startsWith('falcon') || rocketId === 'starship')) return reference({ confidence: 'confirmed', sourceIds: [rocketId === 'starship' ? 'int-starship-v3' : 'int-falcon-2025'], notes: '只确认气动部件与构型；内部执行机构尺寸未核实。', features: [rocketId === 'starship' ? 'V3 三片栅格翼' : '可回收芯级每级四片栅格翼', '转轴和驱动机构仅作示意'] });
  if (partId === 'escape-tower' && rocketId === 'cz2f') return reference({ confidence: 'confirmed', sourceIds: ['int-cz2f-structure'], notes: '逃逸系统由固体发动机等组件构成，没有液体双贮箱；内部细节仅作功能示意。', features: ['逃逸动力和姿态控制组件', '结构支承与飞船连接关系', '发动机内部装药几何不在核实范围'] });
  if (partId === 'fairing-left' || partId === 'fairing-right') return reference({ sourceIds: rocketId.startsWith('falcon') ? ['int-falcon-2025'] : rocketId === 'cz2f' ? ['int-cz2f-structure'] : rocketId === 'cz5b' ? ['int-cz5b'] : [], notes: rocketId === 'starship' ? '本 Starship 构型没有传统两瓣抛弃式整流罩。' : '整流罩内是载荷空间与安装接口，不是推进剂主箱；内侧蒙皮、吸声和连接细节仍为示意。', features: rocketId === 'starship' ? ['本构型不存在此部件'] : ['载荷保护空间', '内衬与连接界面采用教学近似'] });
  return reference({ notes: '该部件的内部贮箱、管线或机械结构尚未取得可独立确认的公开资料。', features: ['内部结构待核实'] });
}
