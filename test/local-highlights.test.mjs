import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestLocalRecording, chooseLocalRecording, cancelLocalRecordingChoice, startLocalHighlight, drawLocalHighlight, finishLocalHighlight, pauseLocalHighlight, cancelLocalCapture, useLocalHighlight, clearLocalHighlight, adaptLocalHighlight } from '../src/engine/localHighlights.ts';

test('recording consent, microphone lifetime, adaptive segments, and clip attribution', async t => {
  const track = kind => ({kind,enabled:true,stopped:false,stop(){this.stopped=true;}});
  const stream = tracks => ({getTracks:()=>tracks,getAudioTracks:()=>tracks.filter(t=>t.kind==='audio'),getVideoTracks:()=>tracks.filter(t=>t.kind==='video'),addTrack:t=>tracks.push(t)});
  let mic=track('audio'), calls=0;
  const navigatorValue={hardwareConcurrency:8,deviceMemory:8,mediaDevices:{getUserMedia:async()=>{calls++;return stream([mic]);}}};
  const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:navigatorValue});
  const ctx=new Proxy({}, {get:()=>()=>{}});
  class Canvas { width=640;height=360;getContext(){return ctx;}captureStream(){return stream([track('video')]);} }
  const recorders=[];
  class Recorder {
    static isTypeSupported(){return true;}
    constructor(stream,options){this.stream=stream;this.options=options;this.mimeType=options.mimeType;this.state='inactive';recorders.push(this);}
    start(){this.state='recording';}pause(){this.state='paused';}resume(){this.state='recording';}
    stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['clip'])});this.onstop?.();});}
  }
  const original={document:globalThis.document,HTMLCanvasElement:globalThis.HTMLCanvasElement,MediaRecorder:globalThis.MediaRecorder};
  Object.assign(globalThis,{document:{createElement:()=>new Canvas()},HTMLCanvasElement:Canvas,MediaRecorder:Recorder});
  t.after(()=>{cancelLocalCapture();cancelLocalRecordingChoice();clearLocalHighlight();Object.assign(globalThis,original);if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);});
  let decision=requestLocalRecording();await chooseLocalRecording('off');assert.equal(await decision,true);assert.equal(calls,0);
  startLocalHighlight('Penalty Duel','penaltyduel');assert.equal(useLocalHighlight.getState().recording,false);
  decision=requestLocalRecording();await chooseLocalRecording('audio');await decision;assert.equal(mic.enabled,false,'mic muted before gameplay');
  startLocalHighlight('Penalty Duel','penaltyduel');assert.equal(mic.enabled,true);
  const video={readyState:0},board={width:640,height:360};
  drawLocalHighlight(video,board,100,['0','0']);
  assert.equal(recorders[0].stream.getAudioTracks()[0],mic);
  pauseLocalHighlight(true);assert.equal(mic.enabled,false);assert.equal(recorders[0].state,'paused');
  pauseLocalHighlight(false);assert.equal(mic.enabled,true);
  drawLocalHighlight(video,board,2500,['1','0']);
  adaptLocalHighlight(18,2500);assert.equal(adaptLocalHighlight(18,4600),true);
  await Promise.resolve();drawLocalHighlight(video,board,4700,['1','0']);
  assert.equal(recorders[1].stream.getAudioTracks()[0],mic,'same audio survives quality switch');
  assert.equal(recorders[0].stream.getVideoTracks()[0].stopped,true);
  assert.ok(recorders[1].options.videoBitsPerSecond<recorders[0].options.videoBitsPerSecond);
  drawLocalHighlight(video,board,6500,['2','0']);finishLocalHighlight();await Promise.resolve();
  assert.equal(mic.stopped,true);assert.equal(useLocalHighlight.getState().gameId,'penaltyduel');assert.ok(useLocalHighlight.getState().file);
  decision=requestLocalRecording();await chooseLocalRecording('video');await decision;
  assert.equal(useLocalHighlight.getState().gameId,'penaltyduel','old clip retains its game until replaced');assert.equal(calls,1);
  // A permission request can complete after Back/route navigation.
  let resolvePermission;
  navigatorValue.mediaDevices.getUserMedia=()=>new Promise(resolve=>{resolvePermission=resolve;});
  decision=requestLocalRecording();const pending=chooseLocalRecording('audio');cancelLocalRecordingChoice();
  const late=track('audio');resolvePermission(stream([late]));await pending;
  assert.equal(await decision,false);assert.equal(late.stopped,true);assert.equal(useLocalHighlight.getState().choosing,false);
});
