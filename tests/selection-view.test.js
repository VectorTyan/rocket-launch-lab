import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSelectionView } from '../src/selection-view.js';
import { createVehicle } from '../src/fleet-model.js';
import { createCutaway } from '../src/cutaway.js';

function camera() {
  const result = new THREE.PerspectiveCamera(45, 5/3, .1, 1000);
  result.position.set(0,10,45);result.lookAt(0,10,0);result.updateMatrixWorld();
  return result;
}
function fixture(t, { instanced = false } = {}) {
  const root = new THREE.Group(), part = new THREE.Group();root.add(part);
  const material = new THREE.MeshStandardMaterial({ color: '#f6f5ef', metalness: .24, roughness: .53 });
  const geometry = new THREE.BoxGeometry(instanced ? 1 : 4, instanced ? 2 : 12, instanced ? 1 : 4);
  const mesh = instanced ? new THREE.InstancedMesh(geometry,material,2) : new THREE.Mesh(geometry,material);
  if(instanced){mesh.setMatrixAt(0,new THREE.Matrix4().makeTranslation(0,10,-2));mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(0,10,2));mesh.instanceMatrix.needsUpdate=true;}
  else mesh.position.y=10;
  part.add(mesh);const vehicle={root,parts:new Map([['stage1',part]])};
  const selection=createSelectionView(vehicle),scene=new THREE.Scene();scene.add(root,selection.group);
  t.after(()=>{selection.dispose();geometry.dispose();material.dispose();if(instanced)mesh.dispose();});
  const view=camera();
  const update=(options={})=>selection.update({camera:view,width:1000,height:600,...options});
  return {root,part,mesh,material,geometry,vehicle,selection,scene,camera:view,update};
}
function close(actual,expected,message,tolerance=1e-5){assert.ok(Math.abs(actual-expected)<tolerance,`${message}: ${actual} versus ${expected}`);}

test('selection feedback is separate from the model and leaves paint and geometry untouched',t=>{
  const f=fixture(t),originalMaterial=f.mesh.material,originalGeometry=f.mesh.geometry;
  const paint={color:f.material.color.getHex(),emissive:f.material.emissive.getHex(),metalness:f.material.metalness,roughness:f.material.roughness,side:f.material.side};
  const before=new THREE.Box3().setFromObject(f.root);
  assert.equal(f.update(),false,'disabled by default');
  f.selection.setEnabled(true);f.selection.setSelected('stage1');
  assert.equal(f.update(),true);
  assert.equal(f.selection.group.parent,f.scene);assert.notEqual(f.selection.group.parent,f.root);
  assert.equal(f.mesh.material,originalMaterial);assert.equal(f.mesh.geometry,originalGeometry);
  assert.deepEqual({color:f.material.color.getHex(),emissive:f.material.emissive.getHex(),metalness:f.material.metalness,roughness:f.material.roughness,side:f.material.side},paint);
  const after=new THREE.Box3().setFromObject(f.root);
  assert.deepEqual(after.min.toArray(),before.min.toArray());assert.deepEqual(after.max.toArray(),before.max.toArray());
  const info=f.selection.getInfo();assert.ok(info.rect.left<info.rect.right&&info.rect.top<info.rect.bottom);
  assert.ok(f.selection.group.children.every(object=>object.geometry.drawRange.count>0));
});

test('all overlay layers are immune to picking and use pixel-space marks without depth writes',t=>{
  const f=fixture(t);f.selection.setSelected('stage1');f.selection.setEnabled(true);f.update();
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),f.camera);
  assert.deepEqual(ray.intersectObject(f.selection.group,true),[]);
  for(const object of f.selection.group.children){
    assert.equal(object.userData.ignoreVehicleBounds,true);
    assert.equal(object.userData.selectionOverlay,true);
    assert.equal(object.material.depthWrite,false);
    assert.equal(object.material.depthTest,false);
    assert.equal(object.material.toneMapped,false);
    assert.equal(object.material.side,THREE.DoubleSide,'screen-space winding cannot cull the markers');
    assert.equal(object.geometry.attributes.position.count%1,0);
  }
});

test('selection bounds track the retained half and disappear when clipping removes the whole module',t=>{
  const f=fixture(t),plane=new THREE.Plane(new THREE.Vector3(0,0,-1),-.7);
  f.material.clippingPlanes=[plane];f.selection.setEnabled(true);f.selection.setSelected('stage1');
  assert.equal(f.update(),true);
  close(f.selection.getInfo().bounds.max[2],-.7,'front edge follows the actual clipping plane');
  close(f.selection.getInfo().bounds.min[2],-2,'kept back surface');
  plane.constant=1.25;f.update();close(f.selection.getInfo().bounds.max[2],1.25,'changing offset updates cached bounds');
  plane.constant=-3;
  assert.equal(f.update(),false);assert.equal(f.selection.group.visible,false);assert.equal(f.selection.getInfo().bounds,null);
  f.material.clippingPlanes=null;
  assert.equal(f.update(),true);close(f.selection.getInfo().bounds.max[2],2,'disabling clipping restores the full selection extent');
});

test('removed heat-shield-style instances do not leak into selection bounds',t=>{
  const f=fixture(t,{instanced:true});
  f.material.clippingPlanes=[new THREE.Plane(new THREE.Vector3(0,0,-1),0)];
  f.selection.setEnabled(true);f.selection.setSelected('stage1');
  assert.equal(f.update(),true);
  const bounds=f.selection.getInfo().bounds;
  close(bounds.min[2],-2.5,'retained instance minimum');close(bounds.max[2],-1.5,'removed instance excluded');
  f.mesh.setMatrixAt(0,new THREE.Matrix4().makeTranslation(0,10,3));f.mesh.instanceMatrix.needsUpdate=true;
  assert.equal(f.update(),false,'a changed instance buffer invalidates the cached selection extent');
});

test('multiple clipping planes honor union versus intersection material semantics',t=>{
  const f=fixture(t);
  f.material.clippingPlanes=[new THREE.Plane(new THREE.Vector3(1,0,0),0),new THREE.Plane(new THREE.Vector3(0,0,1),0)];
  f.selection.setEnabled(true);f.selection.setSelected('stage1');f.update();
  close(f.selection.getInfo().bounds.min[0],0,'both kept half-spaces: x');close(f.selection.getInfo().bounds.min[2],0,'both kept half-spaces: z');
  f.material.clipIntersection=true;f.update();
  close(f.selection.getInfo().bounds.min[0],-2,'either kept half-space: x');close(f.selection.getInfo().bounds.min[2],-2,'either kept half-space: z');
});

test('exploded positions, isolation visibility and theme changes stay independent of model materials',t=>{
  const f=fixture(t);f.selection.setEnabled(true);f.selection.setSelected('stage1');f.update();
  const first=f.selection.getInfo();
  f.part.position.x=7;f.update();close(f.selection.getInfo().bounds.min[0],first.bounds.min[0]+7,'follows its selected module');
  for(const theme of ['technology','realistic','playful','space']){
    f.selection.setTheme({id:theme});assert.equal(f.update({isolated:true}),true);
    assert.equal(f.selection.group.children[0].material.uniforms.opacity.value,0,'isolation does not dim the only displayed model');
    assert.equal(f.material.color.getHex(),new THREE.Color('#f6f5ef').getHex());
  }
  f.part.visible=false;assert.equal(f.update(),false);
  f.part.visible=true;assert.equal(f.update(),true);
  f.selection.setEnabled(false);assert.equal(f.update(),false);
  f.selection.setEnabled(true);f.selection.setSelected('missing-part');assert.equal(f.update(),false);
});

test('real Falcon fairing cutaway retains only visible surfaces and does not recreate a removed shell',t=>{
  const model=createVehicle('falcon9'),cutaway=createCutaway(model,{id:'falcon9',diameter:3.7}),selection=createSelectionView(model);
  const scene=new THREE.Scene();scene.add(model.root,selection.group);
  t.after(()=>{selection.dispose();cutaway.dispose();model.dispose();});
  const view=camera();view.position.set(0,62,35);view.lookAt(0,62,0);view.updateMatrixWorld();
  selection.setEnabled(true);selection.setSelected('fairing-left');
  cutaway.setEnabled(true);cutaway.setOffset(-.4);cutaway.update();
  assert.equal(selection.update({camera:view,width:1000,height:600}),true);
  const selected=model.parts.get('fairing-left');
  const originals=new Map();selected.traverse(object=>{if(object.isMesh)originals.set(object,{geometry:object.geometry,material:object.material});});
  const clippingPlane=[...originals.values()].flatMap(value=>[value.material].flat()).find(material=>material.clippingPlanes?.length)?.clippingPlanes.at(-1);
  assert.ok(clippingPlane);
  const maxZ=selection.getInfo().bounds.max[2];
  assert.ok(maxZ<=clippingPlane.constant+.04,'box follows the clipped fairing rather than a copy of the whole shell');
  for(const [object,state]of originals){assert.equal(object.geometry,state.geometry);assert.equal(object.material,state.material);}
  cutaway.setEnabled(false);selection.update({camera:view,width:1000,height:600});
  assert.ok(selection.getInfo().bounds.max[2]>2.5,'exterior view can frame the complete shell again');
});

test('dispose releases exactly its own resources and removes the independent scene overlay',t=>{
  const f=fixture(t),resources=f.selection.group.children.flatMap(object=>[object.geometry,object.material]);
  const counts=new Map(resources.map(resource=>[resource,0]));
  for(const resource of resources)resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));
  let sourceDisposals=0;f.geometry.addEventListener('dispose',()=>sourceDisposals++);f.material.addEventListener('dispose',()=>sourceDisposals++);
  f.selection.setEnabled(true);f.selection.setSelected('stage1');f.update();
  f.selection.dispose();f.selection.dispose();
  assert.equal(f.selection.group.parent,null);assert.equal(f.update(),false);
  assert.equal(sourceDisposals,0);for(const count of counts.values())assert.equal(count,1);
});
