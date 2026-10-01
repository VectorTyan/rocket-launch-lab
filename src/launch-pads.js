import * as THREE from 'three';
import { createTerrain } from './terrain.js';
import { createPadDetails } from './pad-details.js';

const mat=(color,metalness=.1)=>new THREE.MeshStandardMaterial({color,metalness,roughness:metalness>.4?.4:.82});
function box(parent,size,position,material){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.position.set(...position);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
function beam(parent,a,b,r,material){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,av.distanceTo(bv),8),material);m.position.copy(av).add(bv).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),bv.sub(av).normalize());m.castShadow=true;parent.add(m);return m;}
function cylinder(parent,r,h,p,material){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,48),material);m.position.set(...p);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
function lettering(text){const c=document.createElement('canvas');c.width=1024;c.height=128;const g=c.getContext('2d');g.fillStyle='#c2c6bf';g.fillRect(0,0,c.width,c.height);g.fillStyle='#f8f6eb';g.textAlign='center';g.textBaseline='middle';g.font='bold 64px sans-serif';g.fillText(text,512,64);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshBasicMaterial({map:texture});}

/** Recognisable educational layouts informed by public site references, not surveys. */
export function createLaunchPad(site,rocket){
  const group=new THREE.Group(),terrain=createTerrain(site),details=createPadDetails(site);
  group.add(terrain.group,details.group);
  const concrete=details.concreteMaterial,road=details.roadMaterial,steel=mat('#77888e',.65),dark=mat('#25353f',.55),white=mat('#d1d6d3'),red=mat('#973f32'),blue=mat('#607f91',.35);
  const isChina=site.padType?.startsWith('cz'),isStarship=site.padType==='starship';
  const mount=isStarship?20:3.2;
  box(group,[210,.3,160],[0,0,0],concrete);
  box(group,[18,.08,2800],[-85,.2,1000],road);box(group,[180,.08,13],[-60,.23,85],road);
  for(let i=0;i<24;i++)box(group,[.6,.03,12],[-85,.26,150+i*95],white);
  box(group,[isStarship?24:18,3,100],[0,0,30],dark);
  const strongback=new THREE.Group();group.add(strongback);
  const arms=[];

  if(isStarship){
    cylinder(group,8.5,2,[0,19,0],steel);
    for(let i=0;i<6;i++){const a=i*Math.PI/3;beam(group,[Math.cos(a)*8,0,Math.sin(a)*8],[Math.cos(a)*7.5,18,Math.sin(a)*7.5],.85,dark);}
    const tx=-21,tz=-11,towerHeight=145;
    for(const dx of [-5,5])for(const dz of [-5,5])beam(group,[tx+dx,0,tz+dz],[tx+dx,towerHeight,tz+dz],.8,steel);
    for(let y=6;y<towerHeight;y+=9){
      box(group,[11,.7,11],[tx,y,tz],dark);
      beam(group,[tx-5,y,tz-5],[tx+5,y+9,tz-5],.28,steel);beam(group,[tx+5,y,tz+5],[tx-5,y+9,tz+5],.28,steel);
    }
    // Tower catches are represented as infrastructure; the demo does not claim a catch.
    for(const z of [-5,5]){const arm=box(group,[26,2.3,2.1],[-11,90,tz+z],dark);arms.push(arm);}
    box(group,[13,6,14],[tx,145,tz],white);beam(group,[tx,148,tz],[tx,159,tz],.3,red);
    for(let i=0;i<6;i++)cylinder(group,7,25,[-135-i*19,12.5,-120],white);
    box(group,[65,55,52],[-280,27.5,120],steel);box(group,[80,1,62],[-280,55,120],dark);
  }else if(isChina){
    const towerHeight=site.padType==='cz2f'?79:site.padType==='cz5'?92:84;
    const tx=-15,tz=-9;
    box(group,[12,towerHeight,12],[tx,towerHeight/2,tz],white);
    box(group,[3,towerHeight-7,13],[tx-5,towerHeight/2,tz],blue);
    for(let y=7;y<towerHeight-5;y+=7){
      box(group,[14,.5,14],[tx,y,tz],steel);
      beam(group,[tx-6,y,tz+6],[tx+6,y+7,tz+6],.18,blue);
      box(group,[1.4,3,6],[tx+6.2,y+2,tz],blue);
    }
    const cabinColor=site.padType==='cz2f'?red:blue;
    for(const y of [18,31,43,55,towerHeight-14]){
      const arm=new THREE.Group();arm.position.set(tx+5,y,tz);group.add(arm);
      box(arm,[14,1,3],[7,0,0],steel);box(arm,[5,3,7],[13,1.5,0],cabinColor);arms.push(arm);
    }
    cylinder(group,rocket.diameter*.85,3,[0,1.5,0],dark);
    box(group,[7,9,11],[tx,towerHeight+4.5,tz],cabinColor);
    for(const [x,z]of[[-42,-32],[42,-32],[42,37],[-42,37]]){
      const height=towerHeight+14;
      beam(group,[x,0,z],[x,height,z],.42,white);
      for(let y=0;y<height;y+=10)beam(group,[x,y,z],[x,Math.min(y+4,height),z],.46,red);
    }
    for(let i=0;i<5;i++){
      cylinder(group,5,22,[-140-i*18,11,-110],white);
      const dome=new THREE.Mesh(new THREE.SphereGeometry(5,24,14,0,Math.PI*2,0,Math.PI/2),white);dome.position.set(-140-i*18,22,-110);group.add(dome);
    }
    box(group,[68,36,52],[-270,18,140],white);box(group,[69,3,53],[-270,37.5,140],blue);
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(30,4),lettering('中国航天 · '+site.padLabel));sign.position.set(-270,30,166.1);group.add(sign);
    for(let i=0;i<2;i++)box(group,[.9,.08,1600],[-85+(i?3:-3),.35,700],steel);
  }else{
    box(group,[18,4,18],[0,1,0],steel);
    strongback.position.set(-5,3,-4);
    for(const x of [-1,1])for(const z of [-1,1])beam(strongback,[x,0,z],[x,52,z],.19,steel);
    for(let y=2;y<51;y+=4){beam(strongback,[-1,y,-1],[1,y+4,-1],.13,steel);beam(strongback,[1,y,1],[-1,y+4,1],.13,steel);box(strongback,[3,.4,3],[0,y,0],dark);}
    for(const y of[10,27,44])box(strongback,[7,.8,1.3],[2,y,0],steel);
    for(const [x,z]of[[-36,-32],[36,-32],[36,38],[-36,38]]){
      const height=site.id==='lc39a'?80:65;
      beam(group,[x,0,z],[x,height,z],.4,steel);beam(group,[x-4,0,z-4],[x,height-10,z],.17,steel);beam(group,[x+4,0,z+4],[x,height-10,z],.17,steel);
      beam(group,[x,height,z],[x,height+13,z],.12,steel);
    }
    for(let i=0;i<5;i++){cylinder(group,5,22,[-140-i*18,11,-110],white);const dome=new THREE.Mesh(new THREE.SphereGeometry(5,20,12,0,Math.PI*2,0,Math.PI/2),white);dome.position.set(-140-i*18,22,-110);group.add(dome);}
    box(group,[65,18,32],[-250,9,100],concrete);box(group,[75,1,42],[-250,18,100],dark);
    if(site.id==='lc39a'){box(group,[15,65,15],[-22,32,-16],steel);for(let y=8;y<64;y+=7)box(group,[16,.6,16],[-22,y,-16],white);}
  }
  const mark=new THREE.Mesh(new THREE.PlaneGeometry(35,4.4),lettering(site.padLabel));mark.rotation.x=-Math.PI/2;mark.position.set(0,.34,62);group.add(mark);
  const landing=new THREE.Group();landing.position.set(-350,0,200);group.add(landing);
  cylinder(landing,22,.5,[0,0,0],road);
  const ring=new THREE.Mesh(new THREE.RingGeometry(17.5,18,64),new THREE.MeshBasicMaterial({color:'#e5e8dd',side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.3;landing.add(ring);box(landing,[1,.1,18],[0,.4,0],white);box(landing,[14,.1,1],[0,.4,0],white);
  landing.visible=rocket.id==='falcon9'||rocket.id==='falcon-heavy';
  return{group,terrain,details,strongback,mount,update(time){const open=THREE.MathUtils.smoothstep(time,-10,-1);if(!isChina&&!isStarship)strongback.rotation.z=open*.19;else if(isChina)arms.forEach(a=>a.rotation.y=-1.45-.1*open);}};
}
