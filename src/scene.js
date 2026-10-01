import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createVehicle } from './fleet-model.js';
import { getRocket } from './fleet-data.js';
import { flightPose } from './flight-space.js';
import { createAtmosphere } from './atmosphere.js';
import { createLaunchPad } from './launch-pads.js';
import { createCinematic } from './cinematic.js';
import { createPlumes, createLaunchVapor } from './plumes.js';
import { createEarthGlobe } from './earth.js';
import { createCutaway } from './cutaway.js';
import { createAssemblyView } from './assembly-view.js';
import { getStudioTheme } from './studio-themes.js';
import { createSelectionView } from './selection-view.js';

const R = 6371000;
const clamp = THREE.MathUtils.clamp;
const tmp = new THREE.Vector3();

function material(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.78, ...extra });
}
function box(parent, size, position, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
function cylinder(parent, radius, height, position, mat, segments = 32) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), mat);
  mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
function beam(parent, a, b, radius, mat) {
  const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, av.distanceTo(bv), 6), mat);
  mesh.position.copy(av).add(bv).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bv.sub(av).normalize());
  parent.add(mesh);
}
function labelTexture(text) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#aab8a9'; ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 64px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(text, 256, 87);
  return new THREE.CanvasTexture(canvas);
}

export function createScene(container,onPartSelect,initialRocket=getRocket('falcon9'),{onAssemblyDrop}={}) {
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,logarithmicDepthBuffer:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled=true;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;
  renderer.domElement.setAttribute('aria-label','可拖动旋转、滚轮缩放的三维火箭场景');renderer.domElement.setAttribute('role','img');
  container.appendChild(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#030a14');
  const flightFog=new THREE.FogExp2('#bad1dc',.000038);
  const atmosphere=createAtmosphere(renderer);scene.add(atmosphere.group);
  const environmentGenerator=new THREE.PMREMGenerator(renderer);
  const studioRoom=new RoomEnvironment();
  const studioEnvironment=environmentGenerator.fromScene(studioRoom,.025,.1,100);studioRoom.dispose();
  const lightSky=new Sky();lightSky.scale.setScalar(10000);
  lightSky.material.uniforms.rayleigh.value=2;
  lightSky.material.uniforms.turbidity.value=3;
  lightSky.material.uniforms.mieCoefficient.value=.006;
  const lightScene=new THREE.Scene();lightScene.add(lightSky);
  let environmentTarget=null;
  const camera=new THREE.PerspectiveCamera(42,1,.2,35000000);
  const cinema=createCinematic(renderer,scene,camera);
  camera.position.set(105,55,140);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.065;controls.target.set(0,34,0);controls.minDistance=8;controls.maxDistance=2000000;controls.maxPolarAngle=Math.PI*.96;
  const hemi=new THREE.HemisphereLight('#c1d9f2','#787363',1.7);scene.add(hemi);
  const sun=new THREE.DirectionalLight('#ffe0ba',4.5);sun.position.set(150,160,100);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-90;sun.shadow.camera.right=90;sun.shadow.camera.top=100;sun.shadow.camera.bottom=-90;sun.shadow.camera.far=700;sun.shadow.normalBias=.04;scene.add(sun);scene.add(sun.target);
  const rim=new THREE.DirectionalLight('#8fbcdd',.7);rim.position.set(-100,60,-90);scene.add(rim);
  const fill=new THREE.DirectionalLight('#e8f4ff',0);fill.position.set(0,35,160);scene.add(fill);
  const earthGlobe=createEarthGlobe(),earth=earthGlobe.root;scene.add(earth);
  let rocket=initialRocket,vehicle=createVehicle(rocket),booster=createVehicle(rocket);scene.add(vehicle.root,booster.root);
  let cutaway=createCutaway(vehicle,rocket),cutawayEnabled=false;
  let selection=createSelectionView(vehicle);scene.add(selection.group);
  let exhaust=createPlumes(rocket),boosterExhaust=createPlumes(rocket);vehicle.root.add(exhaust.group);booster.root.add(boosterExhaust.group);
  const vapor=createLaunchVapor();scene.add(vapor.mesh);
  const display=new THREE.Group();scene.add(display);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(2200,2200),material('#859ead'));
  floor.rotation.x=-Math.PI/2;floor.position.y=-1.4;floor.receiveShadow=true;display.add(floor);
  const platform=cylinder(display,21,1,[0,-.8,0],material('#172b39',{metalness:.6,roughness:.4}));
  const displayRings=[];
  for(const r of [10,23,34,50,72]) {
    const ring=new THREE.Mesh(new THREE.RingGeometry(r,r+.06,128),new THREE.MeshBasicMaterial({color:'#34576a',side:THREE.DoubleSide,transparent:true,opacity:.6}));ring.rotation.x=-Math.PI/2;ring.position.y=-.25;display.add(ring);displayRings.push(ring);
  }
  const grid=new THREE.GridHelper(240,48,'#294652','#182c36');grid.position.y=-.3;display.add(grid);
  const starGeo=new THREE.BufferGeometry();const starPositions=[];
  for(let i=0;i<1800;i++) {const y=1-2*(i+.5)/1800,a=i*2.399963,rad=Math.sqrt(1-y*y);starPositions.push(rad*Math.cos(a)*8000000,y*8000000,rad*Math.sin(a)*8000000);}
  starGeo.setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3));const stars=new THREE.Points(starGeo,new THREE.PointsMaterial({color:'#c2d9ed',size:1.3,sizeAttenuation:false,transparent:true,opacity:0}));scene.add(stars);
  let mode='launch',view='orbit',subject='vehicle',explode=0,selected=null,isolated=false,pad=null,site=null,needsCamera=true,lastState=null,disposed=false,environmentTime=0;
  let studioTheme=getStudioTheme(),assemblyView=null,assemblyState={placed:[],selectedId:null},assemblyDrag=null;
  const anchor=new THREE.Vector3();const previousFocus=new THREE.Vector3();const raycaster=new THREE.Raycaster();const mouse=new THREE.Vector2();let pointerStart=null;
  function resize(){const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();cinema.resize(w,h);}
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  function release(group,externalMaterials=new Set()){const geometry=new Set(),materials=new Set(),textures=new Set();group.traverse(o=>{if(o.geometry)geometry.add(o.geometry);for(const m of o.material?[o.material].flat():[]){if(externalMaterials.has(m))continue;materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}
  function releasePad(){if(!pad)return;scene.remove(pad.group);pad.group.remove(pad.terrain.group,pad.details.group);release(pad.group,new Set([pad.details.concreteMaterial,pad.details.roadMaterial]));pad.terrain.dispose();pad.details.dispose();}
  function setSite(next){site=next;releasePad();pad=createLaunchPad(next,rocket);scene.add(pad.group);earthGlobe.setSite(site);atmosphere.setSite(next);lightSky.material.uniforms.sunPosition.value.copy(atmosphere.sunDirection);environmentTarget?.dispose();environmentTarget=environmentGenerator.fromScene(lightScene,.025,.1,20000);scene.environment=environmentTarget.texture;needsCamera=true;}
  function releaseAssembly(){cancelDrag();assemblyView?.dispose();assemblyView=null;}
  function releaseVehicles(){releaseAssembly();selection.dispose();cutaway.dispose();scene.remove(vehicle.root,booster.root);vehicle.root.remove(exhaust.group);booster.root.remove(boosterExhaust.group);exhaust.dispose();boosterExhaust.dispose();vehicle.dispose();booster.dispose();}
  function setRocket(next){if(next.id===rocket.id)return;releaseVehicles();rocket=next;vehicle=createVehicle(rocket);booster=createVehicle(rocket);cutaway=createCutaway(vehicle,rocket);cutawayEnabled=false;selection=createSelectionView(vehicle);selection.setTheme(studioTheme);selection.setEnabled(mode==='structure');scene.add(selection.group);exhaust=createPlumes(rocket);boosterExhaust=createPlumes(rocket);vehicle.root.add(exhaust.group);booster.root.add(boosterExhaust.group);scene.add(vehicle.root,booster.root);selected=null;explode=0;isolated=false;subject='vehicle';needsCamera=true;}
  function setQuality(value){cinema.setQuality(value);if(site)atmosphere.setSite(site);const shadowSize=value==='cinema'?4096:2048;if(sun.shadow.mapSize.x!==shadowSize){sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.mapSize.set(shadowSize,shadowSize);sun.shadow.needsUpdate=true;}resize();}
  function setStudioTheme(id){
    studioTheme=getStudioTheme(id);floor.material.color.set(studioTheme.ground);platform.material.color.set(studioTheme.platform);
    selection.setTheme(studioTheme);
    displayRings.forEach(r=>r.material.color.set(studioTheme.gridCenter));
    const colors=new THREE.GridHelper(240,48,studioTheme.gridCenter,studioTheme.grid);
    grid.geometry.attributes.color.copy(colors.geometry.attributes.color);grid.geometry.attributes.color.needsUpdate=true;
    colors.geometry.dispose();colors.material.dispose();
  }
  function ensureAssembly(){
    if(assemblyView)return;
    vehicle.root.position.set(0,0,0);vehicle.root.rotation.set(0,0,0);vehicle.setExplode(0);vehicle.selectPart(null);
    assemblyView=createAssemblyView(vehicle,rocket);assemblyView.setState(assemblyState);
  }
  function setAssemblyState(state){cancelDrag();assemblyState={...state};if(mode==='assembly'){ensureAssembly();assemblyView.setState(assemblyState);}}
  function assemblyFeedback(success){assemblyView?.showFeedback(success);}
  function setMode(next){
    if(next!==mode)releaseAssembly();
    if(next!=='structure')setCutaway(false);mode=next;needsCamera=true;controls.enablePan=true;
    selection.setEnabled(next==='structure');vehicle.selectPart(null);
    if(next!=='launch'){subject='vehicle';view='orbit';}
    if(next==='assembly'){isolated=false;selected=null;ensureAssembly();}
  }
  function setView(next){view=next;needsCamera=true;}
  function setSubject(next){subject=next;needsCamera=true;}
  function setExplode(value){if(value>0&&cutawayEnabled)setCutaway(false);explode=value;needsCamera=true;}
  function setSelected(id){selected=id;vehicle.selectPart(null);selection.setSelected(id);if(cutawayEnabled&&isolated)cutaway.setFocusPart?.(id);if(isolated&&mode==='structure'&&id)focusSelected();}
  function setIsolated(value){isolated=Boolean(value);if(cutawayEnabled)cutaway.setFocusPart?.(isolated?selected:null);vehicle.selectPart(null);if(!isolated)needsCamera=true;}
  function setCutaway(value){cutawayEnabled=Boolean(value)&&mode==='structure';if(cutawayEnabled){explode=0;isolated=false;vehicle.setExplode(0);}cutaway.setFocusPart?.(null);cutaway.setEnabled(cutawayEnabled);controls.minAzimuthAngle=cutawayEnabled?-1.1:-Infinity;controls.maxAzimuthAngle=cutawayEnabled?1.1:Infinity;needsCamera=true;}
  function setCutawayOffset(value){cutaway.setOffset(value);}
  function focusSelected(){if(!selected)return;const part=vehicle.parts.get(selected);if(part){const bounds=new THREE.Box3();if(cutawayEnabled)part.traverse(o=>{if(o.userData.cutawayInterior&&o.visible&&o.isMesh)bounds.union(new THREE.Box3().setFromObject(o));});if(bounds.isEmpty())bounds.setFromObject(part);bounds.getCenter(tmp);const size=bounds.getSize(new THREE.Vector3()).length();controls.target.copy(tmp);camera.position.copy(tmp).add(cutawayEnabled?new THREE.Vector3(0,size*.06,Math.max(size*1.65,8)):new THREE.Vector3(size*.75,size*.2,size));camera.fov=42;camera.updateProjectionMatrix();needsCamera=false;controls.update();}}
  function pointRay(x,y){const rect=renderer.domElement.getBoundingClientRect();mouse.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);raycaster.setFromCamera(mouse,camera);return rect;}
  function visibleHit(hit){for(let node=hit.object;node;node=node.parent)if(!node.visible)return false;return true;}
  function getAssemblyTargetScreen(){
    const point=assemblyView?.getDropTarget(assemblyState.selectedId);if(!point)return null;
    vehicle.root.updateWorldMatrix(true,false);point.applyMatrix4(vehicle.root.matrixWorld).project(camera);
    return{x:(point.x*.5+.5)*container.clientWidth,y:(-.5*point.y+.5)*container.clientHeight,visible:point.z>-1&&point.z<1&&Math.abs(point.x)<1&&Math.abs(point.y)<1};
  }
  function tryAssemblyDrop(id,x,y){
    if(mode!=='assembly'||id!==assemblyState.selectedId||!assemblyView)return false;
    const rect=pointRay(x,y),target=getAssemblyTargetScreen();
    if(!target?.visible)return false;
    // A generous screen-space target works for small hands and narrow engines.
    if(Math.hypot(x-rect.left-target.x,y-rect.top-target.y)<56)return true;
    return raycaster.intersectObjects(assemblyView.getTargetMeshes(),false).some(visibleHit);
  }
  function cancelDrag(event){
    if(!assemblyDrag)return;
    if(event?.pointerId!==undefined&&event.pointerId!==assemblyDrag.pointerId)return;
    const pointerId=assemblyDrag.pointerId;assemblyDrag=null;assemblyView?.endDrag();
    if(renderer.domElement.hasPointerCapture(pointerId))renderer.domElement.releasePointerCapture(pointerId);
    controls.enabled=view==='orbit'||mode!=='launch';renderer.domElement.style.cursor='';
  }
  function down(e){
    if(mode==='assembly'&&(assemblyDrag||e.button!==0))return;
    pointerStart=[e.clientX,e.clientY];
    if(mode!=='assembly'||e.button!==0||!assemblyView||!assemblyState.selectedId)return;
    const rect=pointRay(e.clientX,e.clientY);
    const part=vehicle.parts.get(assemblyState.selectedId);
    if(!part)return;
    const center=assemblyView.getPartCenter(assemblyState.selectedId).applyMatrix4(vehicle.root.matrixWorld);
    const screen=center.clone().project(camera);
    const nearCenter=screen.z>-1&&screen.z<1&&Math.hypot(e.clientX-rect.left-(screen.x*.5+.5)*rect.width,e.clientY-rect.top-(-screen.y*.5+.5)*rect.height)<26;
    if(!nearCenter&&!raycaster.intersectObject(part,true).some(visibleHit))return;
    const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),center);
    const start=raycaster.ray.intersectPlane(plane,new THREE.Vector3());if(!start)return;
    assemblyDrag={id:assemblyState.selectedId,pointerId:e.pointerId,plane,offset:center.sub(start)};
    controls.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);renderer.domElement.style.cursor='grabbing';e.stopImmediatePropagation();
  }
  function move(e){
    if(!assemblyDrag||e.pointerId!==assemblyDrag.pointerId)return;
    pointRay(e.clientX,e.clientY);const hit=raycaster.ray.intersectPlane(assemblyDrag.plane,new THREE.Vector3());
    if(hit)assemblyView.setDrag(assemblyDrag.id,vehicle.root.worldToLocal(hit.add(assemblyDrag.offset)));
    e.preventDefault();
  }
  function up(e){
    if(mode==='assembly'){
      if(e.button!==0||(assemblyDrag&&e.pointerId!==assemblyDrag.pointerId))return;
      if(assemblyDrag){const id=assemblyDrag.id,near=tryAssemblyDrop(id,e.clientX,e.clientY);onAssemblyDrop?.(id,near);cancelDrag();}
      else if(pointerStart&&Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])<5&&tryAssemblyDrop(assemblyState.selectedId,e.clientX,e.clientY))onAssemblyDrop?.(assemblyState.selectedId,true);
      pointerStart=null;return;
    }
    if(mode!=='structure'||!pointerStart||Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>5)return;
    pointRay(e.clientX,e.clientY);const hits=raycaster.intersectObject(vehicle.root,true).filter(hit=>{if(!visibleHit(hit))return false;const m=Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex||0]:hit.object.material;return !m?.clippingPlanes?.some(p=>p.distanceToPoint(hit.point)<-1e-5);});
    for(const hit of hits){let node=hit.object;while(node&&!node.userData.partId)node=node.parent;if(node){onPartSelect(node.userData.partId);break;}}pointerStart=null;
  }
  // Capture before OrbitControls so picking up a part never rotates the camera.
  renderer.domElement.addEventListener('pointerdown',down,true);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',cancelDrag);renderer.domElement.addEventListener('lostpointercapture',cancelDrag);
  setStudioTheme(studioTheme.id);
  function update(state,dt=0) {
    if(disposed||!pad)return;lastState=state;
    const isStructure=mode==='structure',isAssembly=mode==='assembly',isStudio=isStructure||isAssembly;
    display.visible=isStudio;display.position.y=isStructure?-9*explode:0;earth.visible=!isStudio;
    const boosterActive=subject==='booster'&&state.hasRecovery&&state.separated&&!isStudio;
    const pose=flightPose(state);
    const primaryWorld=new THREE.Vector3(pose.vehicle.x,pose.vehicle.y,pose.vehicle.z);
    primaryWorld.y+=pad.mount-3.2;
    const boosterWorld=new THREE.Vector3(pose.booster.x,pose.booster.y,pose.booster.z);
    let detachedRotation=pose.booster.rotation;
    if(state.separated&&!state.hasRecovery){
      const elapsed=state.stageSeparationElapsed||0;
      boosterWorld.y+=pad.mount-3.2;
      const behind=new THREE.Vector3(-Math.sin(pose.vehicle.rotation),Math.cos(pose.vehicle.rotation),0).multiplyScalar(-(elapsed*2+elapsed*elapsed*.12));
      const nearPose=primaryWorld.clone().add(behind);
      const blend=THREE.MathUtils.smoothstep(elapsed,0,35);
      boosterWorld.lerpVectors(nearPose,boosterWorld,blend);
      detachedRotation=THREE.MathUtils.lerp(pose.vehicle.rotation,pose.booster.rotation,blend);
    }
    anchor.copy(isStudio?new THREE.Vector3():boosterActive?boosterWorld:primaryWorld);
    vehicle.root.position.copy(primaryWorld).sub(anchor);booster.root.position.copy(boosterWorld).sub(anchor);
    vehicle.root.rotation.z=pose.vehicle.rotation;booster.root.rotation.z=detachedRotation;
    pad.group.position.copy(anchor).negate();earth.position.set(-anchor.x,-R-anchor.y,-anchor.z);
    const altitude=isStudio?0:boosterActive?state.booster.altitude:state.altitude;
    if(isStudio){
      vehicle.root.position.set(0,0,0);vehicle.root.rotation.set(0,0,0);
      if(isAssembly){ensureAssembly();assemblyView.update(dt);}else vehicle.setExplode(explode);
      booster.root.visible=false;vapor.mesh.visible=false;
      if(isStructure&&isolated&&selected)for(const [id,part]of vehicle.parts)part.visible=id===selected;
      scene.background.set(studioTheme.background);scene.fog=null;exhaust.group.visible=false;stars.material.opacity=studioTheme.showStars?.45:0;
      renderer.toneMappingExposure=studioTheme.exposure;scene.environmentIntensity=studioTheme.environmentIntensity;
      hemi.color.set(studioTheme.hemisphereSky);hemi.groundColor.set(studioTheme.hemisphereGround);hemi.intensity=studioTheme.hemisphereIntensity;
      sun.color.set(studioTheme.keyColor);sun.position.set(150,160,100);sun.intensity=studioTheme.keyIntensity;
      rim.color.set(studioTheme.rimColor);rim.intensity=studioTheme.rimIntensity;fill.color.set(studioTheme.fillColor);fill.intensity=studioTheme.fillIntensity;
    }else{
      vehicle.setFlight({...state,escapeTowerElapsed:state.escapeElapsed,deploymentElapsed:state.deploymentElapsed||0});
      booster.root.visible=state.separated&&(state.hasRecovery||state.stageSeparationElapsed<70);booster.setFlight({...state,boosterOnly:true,detachedStageOnly:!state.hasRecovery,legsDeployed:state.hasRecovery?clamp((state.time-458)/10,0,1):0,gridFinsDeployed:clamp(state.stageSeparationElapsed/8,0,1)});
      scene.background.set('#030911');
      exhaust.group.visible=true;exhaust.update(state,{upperBase:vehicle.upperBase});
      boosterExhaust.update(state,{boosterOnly:true,upperBase:vehicle.upperBase});
      vapor.update(state.time,anchor,Math.max(1,rocket.diameter/3.7));
      pad.update(state.time);
    }
    sun.target.position.set(0,25,0);
    const sizeScale=rocket.height/70;
    const centerY=isStudio?rocket.height*(.52+(isStructure?explode*.28:0)):view==='engine'?(boosterActive||!state.separated?3:vehicle.upperBase+2):boosterActive?vehicle.firstTop*.5:state.separated?(vehicle.upperBase+vehicle.height)*.5:rocket.height*.5;
    const center=new THREE.Vector3(isAssembly?-rocket.height*.06:0,centerY,0);
    if(!isStudio){
      const pivot=(boosterActive?booster.root:vehicle.root);
      center.set(0,centerY,0).applyQuaternion(pivot.quaternion).add(pivot.position);
    }
    controls.enabled=!assemblyDrag&&(view==='orbit'||isStudio);
    if(needsCamera){
      camera.fov=42;camera.updateProjectionMatrix();controls.target.copy(center);
      camera.position.copy(center).add(new THREE.Vector3(isStructure?90:-110,isStructure?12:22,isStructure?130:145).multiplyScalar(sizeScale));
      if(isStructure&&explode>0)camera.position.copy(center).add(new THREE.Vector3(80,18,145+explode*25).multiplyScalar(sizeScale));
      if(isStructure&&cutawayEnabled)camera.position.copy(center).add(new THREE.Vector3(0,2,110).multiplyScalar(sizeScale));
      if(isAssembly)camera.position.copy(center).add(new THREE.Vector3(0,4,rocket.height*2.0));
      previousFocus.copy(center);
      needsCamera=false;
    }
    if(!isStudio&&view==='orbit'){
      const shift=center.clone().sub(previousFocus);camera.position.add(shift);controls.target.add(shift);
    }
    previousFocus.copy(center);
    if(!isStudio&&view!=='orbit'){
      let offset=(state.separated&&!boosterActive?new THREE.Vector3(42,16,64):new THREE.Vector3(75,20,110)).multiplyScalar(sizeScale);
      if(view==='engine')offset.set(13,altitude<50?6:-12,18);
      if(view==='wide')offset.set(350+altitude*.015,160+altitude*.006,460+altitude*.018);
      if(view==='cinematic'){const angle=environmentTime*.045+.5;const radius=(state.separated?70:155)*sizeScale;offset.set(Math.sin(angle)*radius,18*sizeScale+Math.sin(angle*.7)*8,Math.cos(angle)*radius);}
      if(view==='pad'){
        const pos=new THREE.Vector3(180,40,220).sub(anchor);camera.position.copy(pos);camera.lookAt(center);
        camera.fov=clamp(THREE.MathUtils.radToDeg(2*Math.atan(rocket.height/Math.max(100,pos.distanceTo(center)))),.04,42);camera.updateProjectionMatrix();
      }else{
        camera.fov=view==='engine'?65:42;camera.updateProjectionMatrix();
        offset.applyAxisAngle(new THREE.Vector3(0,0,1),-((boosterActive?state.booster.pitch:state.pitch)*.6));
        camera.position.copy(center).add(offset);camera.lookAt(center);
      }
    }else if(!assemblyDrag)controls.update(dt);
    // Use the observer's height, not the rocket's: a ground tracking camera
    // still sees atmosphere and terrain when its target is already in space.
    const cameraAltitude=Math.max(0,Math.hypot(camera.position.x+anchor.x,camera.position.y+anchor.y+R,camera.position.z+anchor.z)-R);
    if(cinema.quality==='cinema'&&cinema.hdrReady)atmosphere.setSunDirection(cinema.sunDirection);
    atmosphere.update({camera,anchor,altitude:cameraAltitude,missionTime:state.time,deltaTime:dt,isStructure:isStudio});
    pad.group.visible=!isStudio&&cameraAltitude<24000;
    stars.position.copy(camera.position);
    if(!isStudio){
      fill.intensity=0;rim.color.set('#8fbcdd');
      const air=1-THREE.MathUtils.smoothstep(cameraAltitude,18000,100000);
      renderer.toneMappingExposure=.9+(.18*(1-air));
      scene.environmentIntensity=cinema.quality==='cinema'?.28+.9*air:.06+.3*air;
      stars.material.opacity=clamp((cameraAltitude-45000)/110000,0,.85);
      flightFog.color.copy(atmosphere.fogColor);flightFog.density=Math.max(.000038*Math.exp(-cameraAltitude/8500),cameraAltitude<24000?.000022:0);
      scene.fog=cameraAltitude<50000?flightFog:null;
      hemi.color.set('#b8d4f4');hemi.groundColor.set(site.terrain==='desert'?'#927a57':site.terrain==='tropical'?'#365936':site.terrain==='west'?'#76634d':'#536343');hemi.intensity=.6+1.1*air;
      if(view==='pad')sun.target.position.copy(pad.group.position).add(new THREE.Vector3(0,25,0));
      const lightDirection=cinema.quality==='cinema'&&cinema.hdrReady?cinema.sunDirection:atmosphere.sunDirection;
      sun.color.set('#fff0d6');sun.intensity=3.4;sun.position.copy(lightDirection).multiplyScalar(300).add(sun.target.position);rim.intensity=.5;
      environmentTime+=Math.max(0,Math.min(.1,dt));
      pad.terrain.update({time:environmentTime,sunDirection:lightDirection});
    }
    if(cutawayEnabled)cutaway.update();
    selection.update({camera,width:container.clientWidth,height:container.clientHeight,isolated});
    cinema.render(dt,{isStructure:isStudio,cameraAltitude,anchor,standardEnvironment:environmentTarget?.texture,studioEnvironment:studioEnvironment.texture});
  }
  return {setSite,setRocket,setQuality,setMode,setView,setSubject,setExplode,setSelected,setIsolated,setCutaway,setCutawayOffset,focusSelected,setStudioTheme,setAssemblyState,assemblyFeedback,tryAssemblyDrop,getAssemblyTargetScreen,update,resize,
    getInfo(){return{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,mode,view};},
    dispose(){disposed=true;observer.disconnect();controls.dispose();releasePad();releaseVehicles();scene.remove(atmosphere.group,vapor.mesh,earth);earthGlobe.dispose();atmosphere.dispose();vapor.dispose();cinema.dispose();sun.shadow.dispose();environmentTarget?.dispose();studioEnvironment.dispose();environmentGenerator.dispose();release(lightScene);release(scene);renderer.dispose();renderer.domElement.remove();}
  };
}
