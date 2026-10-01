/** Local audio playback only. No microphone, online TTS or automatic playback. */
export function createNarrator({createAudio=src=>new Audio(src),onChange=()=>{}}={}){
  let audio=null,lesson=null,status='idle',slow=false,disposed=false,version=0,playRequest=0,error='';
  const snapshot=()=>({status,slow,key:lesson?.key??null,error});
  const emit=()=>{if(!disposed)onChange(snapshot());};
  function release(){
    version++;playRequest++;
    if(audio){audio.onended=null;audio.onerror=null;audio.onplaying=null;audio.pause();audio.removeAttribute('src');audio.load();audio=null;}
  }
  function setLesson(next){release();lesson=next;status='idle';error='';emit();}
  function stop(){release();status='idle';error='';emit();}
  function fail(message){release();status='error';error=message;emit();}
  async function play(){
    if(disposed||!lesson?.audio){fail('这段讲解暂时无法播放，可以先看看下面的部件介绍。');return;}
    if(!audio){
      audio=createAudio(lesson.audio);audio.preload='auto';audio.playbackRate=slow?.8:1;audio.preservesPitch=true;
      const current=version;
      audio.onplaying=()=>{if(current!==version||disposed||status==='paused')return;status='playing';emit();};
      audio.onended=()=>{if(current!==version||disposed)return;release();status='ended';emit();};
      audio.onerror=()=>{if(current!==version||disposed)return;fail('音频暂时没有打开，再点一次试试。');};
    }
    const current=version,request=++playRequest;status='loading';error='';emit();
    try{await audio.play();if(current===version&&request===playRequest&&!disposed){status='playing';emit();}}
    catch{if(current===version&&request===playRequest&&!disposed)fail('音频暂时没有打开，请再点一次“听讲解”。');}
  }
  function pause(){if(!audio||!['loading','playing'].includes(status))return;playRequest++;audio.pause();status='paused';emit();}
  function toggle(){if(['loading','playing'].includes(status))pause();else return play();}
  function replay(){stop();return play();}
  function setSlow(value){slow=Boolean(value);if(audio)audio.playbackRate=slow?.8:1;emit();}
  function dispose(){release();disposed=true;}
  return{setLesson,play,pause,toggle,replay,stop,setSlow,dispose,get state(){return snapshot();}};
}
