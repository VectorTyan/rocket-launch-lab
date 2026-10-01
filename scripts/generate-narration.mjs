// Run once on Windows with installed Microsoft Huihui Desktop Chinese voice.
// Generated WAV files are runtime assets; the browser never calls this script.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ROCKETS } from '../src/fleet-data.js';
import { getModuleNarration } from '../src/module-narration.js';
const directory=new URL('../public/assets/narration/',import.meta.url);
await mkdir(directory,{recursive:true});
const unique=new Map(),clips={},jobs=[];
for(const rocket of ROCKETS)for(const partId of rocket.moduleIds){
  const lesson=getModuleNarration(rocket.id,partId),hash=createHash('sha256').update(lesson.text).digest('hex');
  if(!unique.has(hash)){unique.set(hash,`${lesson.key}.wav`);jobs.push({file:unique.get(hash),text:lesson.text});}
  clips[lesson.key]={audio:`/assets/narration/${unique.get(hash)}`,text:lesson.text};
}
await writeFile(new URL('jobs.json',directory),JSON.stringify(jobs,null,2),'utf8');
await writeFile(new URL('../src/narration-audio.js',import.meta.url),`// Generated from module-narration.js. Regenerate after changing spoken copy.\nexport const NARRATION_AUDIO=${JSON.stringify(clips,null,2)};\n`,'utf8');
console.log(`${Object.keys(clips).length} module explanations use ${jobs.length} unique local clips.`);
