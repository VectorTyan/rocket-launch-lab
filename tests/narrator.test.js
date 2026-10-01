import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROCKETS } from '../src/fleet-data.js';
import { getModuleNarration } from '../src/module-narration.js';
import { NARRATION_AUDIO } from '../src/narration-audio.js';
import { createNarrator } from '../src/narrator.js';

test('all 87 real modules have current child-friendly scripts and nonempty local WAV audio',()=>{
  const seen=new Set();let total=0;
  for(const rocket of ROCKETS)for(const id of rocket.moduleIds){
    const lesson=getModuleNarration(rocket.id,id),clip=NARRATION_AUDIO[lesson.key];
    assert.equal(lesson.text,clip.text);assert.ok(lesson.sentences.length>=3);assert.ok(lesson.text.length<200);
    assert.ok(!clip.audio.includes('://'));total++;
    if(seen.has(clip.audio))continue;seen.add(clip.audio);
    const bytes=readFileSync(new URL(`../public${clip.audio}`,import.meta.url));
    assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');assert.ok(bytes.length>10000);
  }
  assert.equal(total,87);assert.equal(seen.size,29);
});

test('scripts respect single-stage, no-fairing and non-propellant module distinctions',()=>{
  assert.match(getModuleNarration('cz5b','stage1').text,/只有一个芯级/);
  assert.equal(getModuleNarration('cz5b','stage2'),null);assert.equal(getModuleNarration('starship','fairing-left'),null);
  assert.match(getModuleNarration('falcon9','engine2').text,/一台主发动机/);
  assert.match(getModuleNarration('starship','engines1').text,/三十三台/);
  assert.match(getModuleNarration('falcon9','fairing-left').text,/留出载荷的空间/);
});

function fixture(){
  const created=[];const narrator=createNarrator({createAudio:src=>{
    const audio={src,playbackRate:1,paused:true,removed:false,load(){},removeAttribute(){this.removed=true;},pause(){this.paused=true;},async play(){this.paused=false;}};
    created.push(audio);return audio;
  }});
  narrator.setLesson({key:'one',audio:'/assets/narration/one.wav'});return{narrator,created};
}
test('narration is explicit, pauses/resumes, changes speed, replays and releases on module switch',async()=>{
  const{narrator,created}=fixture();assert.equal(created.length,0);
  await narrator.toggle();assert.equal(narrator.state.status,'playing');
  narrator.toggle();assert.equal(narrator.state.status,'paused');assert.equal(created[0].paused,true);
  narrator.setSlow(true);assert.equal(created[0].playbackRate,.8);
  await narrator.toggle();assert.equal(created.length,1);assert.equal(narrator.state.status,'playing');
  await narrator.replay();assert.equal(created.length,2);assert.equal(created[0].removed,true);
  const oldEnded=created[1].onended;narrator.setLesson({key:'two',audio:'/two.wav'});
  oldEnded();assert.equal(narrator.state.key,'two');assert.equal(narrator.state.status,'idle');assert.equal(created[1].removed,true);
  narrator.dispose();
});
test('pause while play is pending cannot be undone by its late promise',async()=>{
  let resolve;const audio={pause(){},removeAttribute(){},load(){},play:()=>new Promise(r=>{resolve=r;})};
  const narrator=createNarrator({createAudio:()=>audio});narrator.setLesson({key:'one',audio:'/one.wav'});
  const started=narrator.play();narrator.pause();resolve();await started;assert.equal(narrator.state.status,'paused');narrator.dispose();
});
test('loading failures are recoverable and stale playback cannot change a new module',async()=>{
  const{narrator,created}=fixture();await narrator.play();created[0].onerror();assert.equal(narrator.state.status,'error');
  await narrator.play();assert.equal(narrator.state.status,'playing');assert.equal(created.length,2);
  created[1].onended();assert.equal(narrator.state.status,'ended');narrator.stop();assert.equal(narrator.state.status,'idle');
  narrator.setLesson({key:'missing'});await narrator.play();assert.equal(narrator.state.status,'error');narrator.dispose();
});
