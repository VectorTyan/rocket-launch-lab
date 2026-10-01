import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const HDR_URL='/assets/environment/kloofendal_38d_partly_cloudy_2k.hdr';
const gradeShader={
  uniforms:{tDiffuse:{value:null},amount:{value:1}},
  vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:`uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv;
    void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;
      float l=dot(c,vec3(.2126,.7152,.0722));
      c=mix(vec3(l),c,1.035);
      c*=mix(vec3(.968,1.0,1.028),vec3(1.025,1.008,.975),smoothstep(.05,1.8,l));
      float vignette=1.0-smoothstep(.20,.78,distance(vUv,vec2(.5)))*.14*amount;
      gl_FragColor=vec4(max(c,vec3(0.0))*vignette,1.0);}`,
};

// Use only the sky hemisphere of the CC0 panorama. Its photographed terrain is
// never substituted for a launch site's own landscape.
function panoramaSky(){
  const uniforms={map:{value:null},up:{value:new THREE.Vector3(0,1,0)},air:{value:1}};
  const material=new THREE.ShaderMaterial({uniforms,side:THREE.BackSide,transparent:true,depthWrite:false,depthTest:true,
    vertexShader:`varying vec3 vRay;void main(){vRay=mat3(modelMatrix)*position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position.z=gl_Position.w;}`,
    fragmentShader:`uniform sampler2D map;uniform vec3 up;uniform float air;varying vec3 vRay;
      void main(){vec3 d=normalize(vRay);float h=dot(d,up);float opacity=smoothstep(.025,.12,h)*air;if(opacity<.002)discard;
        vec2 uv=vec2(atan(d.z,d.x)*.159154943+.5,asin(clamp(d.y,-1.0,1.0))*.318309886+.5);
        vec3 c=texture2D(map,uv).rgb;
        gl_FragColor=vec4(c*.7,opacity);
        #ifdef USE_LOGARITHMIC_DEPTH_BUFFER
          gl_FragDepth=1.0;
        #endif
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);
  mesh.name='CC0 photographic sky hemisphere';mesh.frustumCulled=false;mesh.renderOrder=-980;mesh.visible=false;
  return mesh;
}

export function createCinematic(renderer,scene,camera){
  const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true});
  target.samples=4;
  const composer=new EffectComposer(renderer,target);
  const renderPass=new RenderPass(scene,camera);
  const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.27,.45,1.6);
  const grade=new ShaderPass(gradeShader),output=new OutputPass();
  composer.addPass(renderPass);composer.addPass(bloom);composer.addPass(grade);composer.addPass(output);
  const hdrSky=panoramaSky();scene.add(hdrSky);
  const pmrem=new THREE.PMREMGenerator(renderer);
  let quality='standard',environment=null,hdr=null,disposed=false,width=1,height=1;
  const sunDirection=new THREE.Vector3(.3,.22,-.9).normalize();
  const ready=new HDRLoader().loadAsync(HDR_URL).then(texture=>{
    if(disposed){texture.dispose();return;}
    hdr=texture;hdr.mapping=THREE.EquirectangularReflectionMapping;
    environment=pmrem.fromEquirectangular(hdr);hdrSky.material.uniforms.map.value=hdr;
    const data=hdr.image.data,w=hdr.image.width,h=hdr.image.height;
    let peak=-Infinity,peakIndex=0;
    for(let i=0;i<data.length;i+=4){const r=THREE.DataUtils.fromHalfFloat(data[i]),g=THREE.DataUtils.fromHalfFloat(data[i+1]),b=THREE.DataUtils.fromHalfFloat(data[i+2]);const l=r*.2126+g*.7152+b*.0722;if(l>peak){peak=l;peakIndex=i/4;}}
    const az=((peakIndex%w+.5)/w-.5)*Math.PI*2;
    const el=(.5-(Math.floor(peakIndex/w)+.5)/h)*Math.PI;
    sunDirection.set(Math.cos(el)*Math.cos(az),Math.sin(el),Math.cos(el)*Math.sin(az)).normalize();
  }).catch(error=>{console.warn('Local HDR unavailable; using the procedural sky.',error.message);});
  function resize(w,h){width=w;height=h;composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(w,h);}
  function setQuality(value){quality=value==='cinema'?'cinema':'standard';renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,quality==='cinema'?2:1.35));resize(width,height);}
  function render(dt,{isStructure=false,cameraAltitude=0,anchor,standardEnvironment,studioEnvironment}={}){
    const cinema=quality==='cinema';
    hdrSky.visible=cinema&&!!hdr&&!isStructure&&cameraAltitude<12000;
    if(hdrSky.visible){hdrSky.position.copy(camera.position);hdrSky.scale.setScalar(Math.min(camera.far*.4,1000000));hdrSky.material.uniforms.air.value=1-THREE.MathUtils.smoothstep(cameraAltitude,3000,12000);hdrSky.material.uniforms.up.value.set(camera.position.x+(anchor?.x||0),camera.position.y+(anchor?.y||0)+6371000,camera.position.z+(anchor?.z||0)).normalize();}
    scene.environment=isStructure&&studioEnvironment?studioEnvironment:cinema&&environment?environment.texture:standardEnvironment;
    if(cinema){bloom.strength=isStructure?.12:.27;composer.render(dt);}else renderer.render(scene,camera);
  }
  function dispose(){disposed=true;scene.remove(hdrSky);hdrSky.geometry.dispose();hdrSky.material.dispose();hdr?.dispose();environment?.dispose();pmrem.dispose();bloom.dispose();grade.dispose();output.dispose();composer.dispose();}
  return {setQuality,resize,render,dispose,ready,sunDirection,get quality(){return quality;},get hdrReady(){return !!environment;}};
}
