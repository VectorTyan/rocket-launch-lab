import * as THREE from 'three';
import { getNozzleLayout } from './fleet-model.js';

const VERTEX=`uniform float time;varying vec2 vUv;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main(){vUv=uv;vec4 p=vec4(position,1.0);
    p.y*=.965+.035*sin(time*41.0);
    #ifdef USE_INSTANCING
      p=instanceMatrix*p;
    #endif
    gl_Position=projectionMatrix*modelViewMatrix*p;
    #include <logdepthbuf_vertex>
  }`;
const FRAGMENT=`uniform float time;uniform float power;uniform float opacityScale;uniform vec3 tint;uniform vec3 coreTint;uniform vec3 shockTint;varying vec2 vUv;
  #include <logdepthbuf_pars_fragment>
  float noise(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  void main(){
    #include <logdepthbuf_fragment>
    float distanceDown=1.0-vUv.y;
    float turbulence=sin(vUv.x*31.4+distanceDown*39.0-time*24.0)*.5+.5;
    turbulence=mix(turbulence,noise(floor(vec2(vUv.x*140.0,distanceDown*60.0-time*17.0))),.22);
    float tail=pow(max(0.0,1.0-distanceDown),1.6);
    float diamonds=pow(.5+.5*cos(distanceDown*57.0-time*1.8),9.0)*(1.0-distanceDown);
    vec3 hot=mix(tint*2.5,coreTint*7.0,pow(1.0-distanceDown,4.0));
    hot+=diamonds*shockTint*1.8;
    float alpha=tail*(.22+.45*turbulence)*power*opacityScale;
    gl_FragColor=vec4(hot,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// Representative teaching palettes, not a spectral/combustion simulation.
const STYLES = {
  kerolox: { tint: '#ffa263', core: '#fff1d2', shock: '#c4dcff', opacity: 1, light: '#ffb079' },
  hydrolox: { tint: '#aac9ff', core: '#edf5ff', shock: '#9bbeff', opacity: .48, light: '#bfd8ff' },
  methalox: { tint: '#b6aaff', core: '#e7eaff', shock: '#a6bfff', opacity: .78, light: '#c5c5ff' },
  hypergolic: { tint: '#ff9864', core: '#fff0da', shock: '#f7b785', opacity: .85, light: '#ffb085' },
};

function emitter(section, originY = 0){
  if(!section.nozzles.length)return null;
  const group=new THREE.Group();
  group.name=`${section.id} · ${section.engineFamily}`;
  group.userData={layer:section.id,propulsion:section.fuel,engineFamily:section.engineFamily,nozzleCount:section.nozzles.length};
  const style=STYLES[section.fuel];
  // Tapered semi-transparent jets with turbulent brightness and shock-cell bands.
  const geometry=new THREE.CylinderGeometry(1,.12,1,20,22,true);
  geometry.translate(0,-.5,0);
  const material=new THREE.ShaderMaterial({uniforms:{time:{value:0},power:{value:0},tint:{value:new THREE.Color(style.tint)},coreTint:{value:new THREE.Color(style.core)},shockTint:{value:new THREE.Color(style.shock)},opacityScale:{value:style.opacity}},vertexShader:VERTEX,fragmentShader:FRAGMENT,transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
  material.name=`${section.fuel} plume`;
  const mesh=new THREE.InstancedMesh(geometry,material,section.nozzles.length);
  mesh.name=`${section.id} plume instances`;
  mesh.userData={...group.userData,nozzles:section.nozzles.map(nozzle=>({...nozzle,position:[...nozzle.position]}))};
  const dummy=new THREE.Object3D();
  section.nozzles.forEach((nozzle,i)=>{
    const [x,y,z]=nozzle.position;
    dummy.position.set(x,y-originY,z);
    const relativeLength=nozzle.kind==='vernier'?.26:nozzle.kind==='sea-level'?.9:1;
    dummy.scale.set(nozzle.radius*.96,section.length*relativeLength,nozzle.radius*.96);
    dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=false;group.add(mesh);group.position.y=originY;group.visible=false;
  return {group,material,geometry,mesh,update(time,power){group.visible=power>0;material.uniforms.time.value=time;material.uniforms.power.value=power;},dispose(){mesh.dispose();geometry.dispose();material.dispose();}};
}

export function createPlumes(rocket){
  const layout=rocket?.nozzleLayout||getNozzleLayout(rocket);
  const group=new THREE.Group();group.name=`${layout.rocketId} engine plumes`;
  group.userData={rocketId:layout.rocketId,nozzleLayout:layout};
  const main=emitter(layout.core);
  const upper=emitter(layout.upper,layout.upperBase);
  const side=layout.boosters.map(section=>emitter(section));
  group.add(main.group);if(upper)group.add(upper.group);for(const item of side)group.add(item.group);
  const light=new THREE.PointLight(STYLES[layout.core.fuel].light,0,130,2);light.position.y=-4;group.add(light);
  let disposed=false;
  return {group,root:group,update(state,{upperBase=layout.upperBase,boosterOnly=false}={}){
    if(disposed)return;
    const time=Number.isFinite(state.time)?state.time:0;
    const core=boosterOnly?Boolean(state.booster?.engineOn):Boolean(state.firstEngineOn);
    const upperOn=Boolean(upper&&!boosterOnly&&state.secondEngineOn);
    main.update(time,core?1:0);
    if(upper){upper.group.position.y=upperBase;upper.update(time,upperOn?.85:0);}
    const boostersOn=!boosterOnly&&Boolean(state.boostersEngineOn??(!state.boostersSeparated&&state.firstEngineOn));
    for(const item of side)item.update(time,boostersOn?1:0);
    light.intensity=(core||upperOn||boostersOn)?75:0;
    light.position.y=upperOn&&!core?upperBase-4:-4;
    light.color.set(STYLES[upperOn&&!core?layout.upper.fuel:layout.core.fuel].light);
  },dispose(){if(disposed)return;disposed=true;main.dispose();upper?.dispose();side.forEach(item=>item.dispose());light.dispose();}};
}

export function createLaunchVapor(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const c=canvas.getContext('2d'),gradient=c.createRadialGradient(64,64,4,64,64,62);
  gradient.addColorStop(0,'rgba(245,240,228,.65)');gradient.addColorStop(.4,'rgba(229,228,218,.38)');gradient.addColorStop(1,'rgba(214,218,216,0)');c.fillStyle=gradient;c.fillRect(0,0,128,128);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.PointsMaterial({map:texture,size:16,transparent:true,opacity:.7,depthWrite:false,color:'#e2dfd1',sizeAttenuation:true});
  const coords=new Float32Array(360*3),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(coords,3));
  const points=new THREE.Points(geometry,material);points.frustumCulled=false;
  return{mesh:points,update(time,anchor,size=1){points.visible=time>=-3&&time<75;if(!points.visible)return;const strength=Math.min(1,(time+3)/8)*Math.max(0,1-(time-30)/45);material.opacity=.56*strength;material.size=(8+Math.min(20,Math.max(0,time+3)))*size;
    for(let i=0;i<360;i++){const age=((time+3)*.08+i/360)%1,angle=i*2.399963;const radius=age*120*size;coords[i*3]=Math.cos(angle)*radius-anchor.x;coords[i*3+1]=4+age*22*size+Math.sin(i*.9)*4-anchor.y;coords[i*3+2]=Math.sin(angle)*radius*.55-anchor.z;}geometry.attributes.position.needsUpdate=true;
  },dispose(){geometry.dispose();material.dispose();texture.dispose();}};
}
