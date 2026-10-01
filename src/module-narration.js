import { getRocket, getModules } from './fleet-data.js';

const NUMBER = ['零','一','两','三','四','五','六','七','八','九'];
const count = n => n < 10 ? NUMBER[n] : n === 33 ? '三十三' : String(n);

/** Short, authored explanations of the existing educational model, ages 5–10. */
export function getModuleNarration(rocketId, partId) {
  const rocket=getRocket(rocketId),part=getModules(rocketId).find(item=>item.id===partId);
  if(!rocket||!part)return null;
  const ship=rocket.id==='starship',heavy=rocket.id==='falcon-heavy',booster=/^booster-/.test(partId);
  let title=part.name,sentences;
  if(partId==='stage1'||partId==='stage2'||booster){
    const upper=partId==='stage2';
    title=booster?'侧助推器':ship?(upper?'星舰飞船':'超级重型助推级'):heavy&&!upper?'中央芯级':upper?'芯二级':'芯一级';
    sentences=[`这是${title}。`,booster?'它像站在火箭身边的大力士，和中间的火箭一起用力。':upper?'它接过上升的接力棒，把载荷送得更远。':rocket.id==='cz5b'?'这枚火箭只有一个芯级，四枚侧助推器在起飞时一起帮忙。':'它负责把火箭从地面推向高空。',
      '里面有储箱，分别装着燃料和氧化剂，它们一起供发动机使用。',
      ship&&upper?'这艘飞船还带有襟翼和热防护层，载荷放在专门的舱区。':'剖视图像打开一扇窗，帮我们认识储箱和管道。'];
  }else if(partId==='engines1'||partId==='engine2'){
    const upper=partId==='engine2',n=upper?rocket.secondStageEngines:rocket.firstStageEngines;
    title=upper?'二级发动机':'一级发动机';
    sentences=[`这是${title}，这一组有${count(n)}台主发动机。`,'燃料和氧化剂送进发动机，产生很热的气体。','气体从下面的喷管高速喷出，把火箭向上推。','喷管中间留着气体通过的空间，不是实心的。'];
  }else if(partId==='interstage'){
    title=ship?'热分级连接段':'级间段';
    sentences=ship?['这是热分级连接段，它连接上下两级。','上面的飞船先点火，再与下面的助推级分开。','这里需要给高温气体留出通道，还要保护下面的结构。']:
      ['这是级间段，像连接上下两级的桥。','里面有连接件和支撑结构，也要给二级发动机留出空间。','一级完成任务后，两级从这里分开。'];
  }else if(partId.startsWith('fairing-')){
    title=partId.endsWith('left')?'左半整流罩':'右半整流罩';
    sentences=[`这是${title}。`,'两半合在一起，像头盔一样保护火箭里面的载荷。','罩壁里面有保护层，但中间要留出载荷的空间。','飞出稠密的大气后，保护罩就可以分开了。'];
  }else if(partId==='payload'){
    title=rocket.id==='cz7'?'货运飞船':rocket.id==='cz5b'?'大型舱段':'载荷';
    sentences=[`这是${title}，也就是火箭要运送的物品。`,rocket.id==='cz7'?'货运飞船可以把物资送到空间站，货物舱和推进舱负责不同的工作。':rocket.id==='cz5b'?'长征五号乙可以运送大型空间站舱段，这里展示的是教学模型。':ship?'这份示例载荷放在星舰的载荷舱里。':'这里用一个卫星模型，帮助我们认识火箭怎样运送物品。','它和存放燃料的储箱不是一回事。'];
  }else if(partId==='spacecraft'){
    title='神舟飞船';sentences=['这是神舟飞船，它可以运送航天员。','它有轨道舱、返回舱和推进舱。','航天员乘坐返回舱回到地球，这里用三张座椅帮助我们认识里面的空间。','座椅和设备的位置是教学示意。'];
  }else if(partId==='grid-fins'){
    title='栅格翼';sentences=['这是栅格翼，样子像带着许多小格子的翅膀。','气流经过它时，能够帮助返回的火箭调整方向。','它不是发动机，不会靠喷火推动火箭。'];
  }else if(partId==='landing-legs'){
    title='着陆腿';sentences=['这是着陆腿，就像火箭落地时伸出的脚。','上升时它们收在箭体旁边，着陆前才展开。','它们帮助火箭在着陆后站稳。'];
  }else if(partId==='heatshield'){
    title='热防护层';sentences=['这是热防护层，可以理解为飞船的防热外衣。','飞船高速返回大气时，表面会受到很强的加热。','热防护层帮助保护里面的结构，它不是装燃料的箱子。'];
  }else if(partId==='flaps'){
    title='襟翼';sentences=['这是星舰的襟翼，前后共有四片。','在大气中，它们通过改变气流的作用，帮助飞船调整姿态。','襟翼根部有连接和驱动装置，模型展示的是结构原理。'];
  }else if(partId==='escape-tower'){
    title='逃逸塔';sentences=['这是逃逸塔，站在载人火箭的最顶端。','遇到紧急情况时，逃逸系统可以帮助载有航天员的部分远离危险。','正常飞行中，不再需要它时会把它抛离，这不是发生了紧急逃逸。'];
  }
  if(!sentences)sentences=[`这是${part.name}。`,'它和其他部件一起协作，完成火箭的任务。','你可以转动模型，从不同方向观察它。'];
  return{key:`${rocket.id}-${partId}`,title,sentences,text:sentences.join('')};
}
