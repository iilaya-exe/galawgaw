import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPenaltyDuel } from '../src/game/penaltyDuel.js';

function game() { const g = createPenaltyDuel(); g.init({view:{width:1280,height:720,videoWidth:1280,videoHeight:720}}); return g; }
function settle(g) { for (let i=0;i<30 && g.phase==='flight';i++) g.update(.05); }
function next(g) { for (let i=0;i<33;i++) g.update(.05); }
test('duel scores real keeper saves, goals and wide shots, and alternates roles', () => {
  const g=game();
  g.players[0].aim=.5;g.players[0].lift=1;g.players[1].tracked=true;g.players[1].gloves=[{x:.5,y:.65}];
  g.kick();settle(g);
  assert.equal(g.outcome,'saved');assert.equal(g.players[1].saves,1);assert.equal(g.players[0].goals,0);
  next(g);assert.equal(g.striker,1);
  g.players[1].aim=.9;g.players[1].lift=1;g.players[0].gloves=[];
  g.kick();settle(g);assert.equal(g.players[1].goals,1);
  next(g);g.players[0].aim=1.1;g.kick();settle(g);
  assert.equal(g.outcome,'wide');assert.equal(g.players[0].goals,0);
});
test('idle duel finishes with equal shot counts; final state cannot score again', () => {
  const g=game();
  for(let i=0;i<2000&&!g.isOver();i++)g.update(.05);
  assert.equal(g.isOver(),true);assert.deepEqual(g.players.map(p=>p.shots.length),[5,5]);
  assert.equal(g.getSummary().winner,null);
  const before=JSON.stringify(g.getSummary());g.update(100);assert.equal(JSON.stringify(g.getSummary()),before);
});
test('body controls require a fresh lower-then-lift kick and a present keeper', () => {
  const g=game();const [p,k]=g.players;
  Object.assign(p,{tracked:true,legs:true,lift:1.4});k.tracked=true;g.update(.05);
  assert.equal(g.phase,'aim','raised knee on entry cannot auto-shoot');
  p.lift=0;g.update(.05);p.lift=1.2;k.tracked=false;g.update(.05);assert.equal(g.phase,'aim');
  k.tracked=true;g.update(.05);assert.equal(g.phase,'flight');
});
test('pose tracking maps visible wrists and rejects missing knees', () => {
  const g=game();
  const pose=Array.from({length:33},()=>({x:.75,y:.5,visibility:1}));
  for(const [i,x,y] of [[11,.72,.3],[12,.78,.3],[23,.73,.55],[24,.77,.55],[15,.63,.3],[16,.87,.3],[25,.73,.8],[26,.77,.8]]) pose[i]={x,y,visibility:1};
  g.onResults([pose]);assert.equal(g.players[0].tracked,true);assert.equal(g.players[0].gloves.length,2);assert.ok(Math.abs(g.players[0].aim-.5)<.01);
  pose[25].visibility=0;pose[26].visibility=0;g.onResults([pose]);assert.equal(g.players[0].legs,false);
  g.onResults([]);assert.equal(g.players[0].tracked,false);assert.equal(g.players[0].gloves.length,0);
});
