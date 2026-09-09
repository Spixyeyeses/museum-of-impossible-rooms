import test from 'node:test';
import assert from 'node:assert/strict';
import {world,updateCampaign,interactCampaign,recallWeights,nextHint,initializeCampaign} from '../src/campaign.mjs';
import {Pilot,runChamber,runFullCampaign} from './replay.mjs';
import {createState,trace,pickUp,drop,serialize,restore,recover,step,normalize,sub,condition,canPlaceObject} from '../src/engine.mjs';

for(let chapter=1;chapter<=10;chapter++)test(`Campaign ${chapter}: continuous movement, visible interactions and a completed index`,()=> {
  const {pilot,report}=runChamber(chapter);
  assert.equal(report.passed,true);assert.ok(report.portalCrossings>0);
  assert.equal(pilot.state.hints[chapter],1);assert.ok(pilot.state.journal.some(note=>note.id===`plate:${chapter}`));
  assert.equal(pilot.state.checkpoint,`c${chapter}`);
});

test('complete campaign: continuous hub progression, all ten indices and departure without repositioning',()=> {
  const {pilot,report}=runFullCampaign();
  assert.equal(pilot.state.flags.finished,true);assert.equal(pilot.state.player.room,'courtyard');
  assert.deepEqual(pilot.state.solved,[1,2,3,4,5,6,7,8,9,10]);assert.ok(report.portalCrossings>50);
});

test('room authoring has unique IDs, valid reciprocal portal targets and matching aperture proportions',()=> {
  for(const entries of [world.rooms,world.portals,world.objects,world.interactables])assert.equal(new Set(entries.map(item=>item.id)).size,entries.length);
  for(const portal of world.portals) {
    const destination=world.portals.find(other=>other.id===portal.to);
    assert.ok(destination,portal.id);assert.equal(destination.to,portal.id);assert.ok(world.rooms.some(room=>room.id===portal.room));
    assert.ok(Math.abs(portal.width/portal.height-destination.width/destination.height)<1e-9,portal.id);
  }
});

test('socketed cubes remain fixed, cannot be picked up, and survive saving and recovery',()=> {
  const {pilot:p}=runChamber(1),cube=p.state.objects.weight1,original=structuredClone(cube);
  p.aim(cube.p);assert.equal(pickUp(world,p.state,cube.id),false);
  p.wait(3);assert.deepEqual(cube.p,original.p);assert.equal(cube.socket,'plinth1');
  p.saveRoundtrip();assert.equal(p.state.objects.weight1.socketed,true);assert.equal(p.state.objects.weight1.socket,'plinth1');
  recover(world,p.state);assert.deepEqual(p.state.objects.weight1.p,original.p);assert.equal(p.state.flags['complete:1'],true);
  assert.equal(p.state.solved.includes(1),true);
});

test('two neutral return loops can be reversed to restore full scale after the quarter collection',()=> {
  const {pilot:p}=runChamber(7);assert.equal(p.state.player.scale,.25);
  p.through('cabinet7-out');
  p.through('neutral7-in');p.through('half7-out');assert.equal(p.state.player.scale,.5);
  p.through('neutral7-in');p.through('half7-out');assert.equal(p.state.player.scale,1);
  assert.equal(p.state.objects.weight7.size,.2);assert.equal(p.state.objects.weight7.socketed,true);
});

test('repeated measure loops stop at the lower scale bound and recovery makes the puzzle playable again',()=> {
  const p=new Pilot(7);p.take('weight7');
  for(let i=0;i<4;i++){p.through('half7-in');p.through('neutral7-out');}
  assert.equal(p.state.player.scale,.0625);assert.equal(p.state.objects.weight7.size,.05);
  const portal=world.portals.find(item=>item.id==='half7-in');
  p.move([3.5,.1,-9.7],'minimum-size measure approach');p.state.player.forward=[0,0,-1];
  for(let i=0;i<180;i++)p.tick({forward:1});
  assert.equal(p.state.player.room,'c7');assert.equal(p.state.player.scale,.0625);assert.ok(p.state.events.some(event=>event.type==='scaleBlocked'));
  recover(world,p.state);assert.equal(p.state.player.room,'c7');assert.equal(p.state.player.scale,1);assert.equal(p.state.held,null);
  assert.deepEqual(p.state.objects.weight7.p,p.state.objects.weight7.home.p);assert.equal(p.state.objects.weight7.size,.8);
  p.take('weight7');assert.equal(p.state.held,'weight7');
});

test('the observation arrangement will not change while its frame is watched or approached',()=> {
  const p=new Pilot(4);p.use('garden-shutter');
  p.aim([0,1.8,-9]);p.wait(2);assert.equal(!!p.state.flags.summer,false);
  p.state.player.forward=[0,0,1];p.wait(1);assert.equal(p.state.flags.summer,true);
  p.through('garden-summer');p.through('summer-return');
  p.use('garden-shutter',[0,0,-1]);p.state.player.forward=[0,0,1];p.wait(1);assert.equal(p.state.flags.summer,false);
  p.through('garden-winter');assert.equal(p.state.player.room,'c4-winter');
});

test('perspective connection requires the authored viewpoint and gravity orientation',()=> {
  const p=new Pilot(9);p.aim([4.2,6,-10]);p.wait(2);assert.equal(!!p.state.flags['wall-sight'],false);
  p.use('gravity9');p.wait(2);p.align('wall-mark9');assert.equal(p.state.flags['wall-sight'],true);
  p.state.player.forward=[0,0,1];p.wait(1);assert.equal(p.state.flags['wall-sight'],true,'Established connection stays available');
});

test('hint graduation, optional notes, numeric solved IDs and visited rooms survive a save',()=> {
  const p=new Pilot(1);assert.equal(nextHint(p.state).title.includes('1 of 3'),true);
  nextHint(p.state);nextHint(p.state);nextHint(p.state);assert.equal(p.state.hints[1],3);
  p.through('c1-east');p.use('c1-lore');const state=restore(world,serialize(p.state));initializeCampaign(state);
  assert.equal(state.hints[1],3);assert.ok(state.visited.includes('c1-gallery'));assert.ok(state.journal.some(note=>note.id==='c1-lore'&&note.optional));
  assert.equal(state.checkpoint,'c1');
});

test('recalling a misplaced unsocketed weight restores its chapter home without erasing discoveries',()=> {
  const p=new Pilot(3);p.take('weight3');p.through('quarter-in');p.state.flags.testDiscovery=true;
  recallWeights(p.state);assert.equal(p.state.held,null);assert.equal(p.state.objects.weight3.room,'c3');assert.equal(p.state.objects.weight3.size,.8);
  assert.equal(p.state.player.scale,.25);assert.equal(p.state.flags.testDiscovery,true);
  p.through('quarter-out');p.take('weight3',[0,0,-1]);assert.equal(p.state.held,'weight3');
});

test('every solid exhibition stand has one invisible collision record, while observation marks remain clear',()=> {
  const s=createState(world);s.flags['final-open']=true;
  for(const item of world.interactables) {
    const room=world.rooms.find(room=>room.id===item.room),solid=room.solids.find(solid=>solid.id===`furniture:${item.id}`);
    if(item.type==='align'){assert.equal(solid,undefined);continue;}
    assert.ok(solid,`Missing furniture collision for ${item.id}`);assert.equal(solid.invisible,true);
    if(condition(s,solid.requires))assert.equal(canPlaceObject(world,s,{id:'test-probe',room:room.id,p:solid.min.map((n,i)=>(n+solid.max[i])/2),size:.01}),false,item.id);
  }
  assert.equal(world.rooms.find(room=>room.id==='courtyard').solids.filter(solid=>solid.id.startsWith('furniture:courtyard-')).length,5);
});

test('the player stops at a rendered plinth and can walk around its physical footprint',()=> {
  const p=new Pilot(1);p.approach('plinth1');p.state.player.forward=[0,0,-1];
  for(let i=0;i<120;i++)p.tick({forward:1});
  assert.ok(p.state.player.p[2]>=2.7999&&p.state.player.p[2]<2.801);
  p.move([-1.1,1.6,3.15],'step beside the plinth');p.move([-1.1,1.6,1],'walk past the plinth');
  assert.ok(p.state.player.p[2]<1.01);
});

for(const [chapter,entry,exit,weight,shutter,flag] of [
  [4,'garden-winter','winter-return','weight4','garden-shutter','summer'],
  [8,'transit-collection','collection-return','weight8','transit-shutter','transit'],
])test(`recovery preserves a route to a loose weight in the inactive annex of chapter ${chapter}`,()=> {
  const p=new Pilot(chapter);p.through(entry);p.take(weight);p.state.player.forward=[0,0,-1];p.tick();
  assert.equal(drop(world,p.state),true);p.wait(.2);const annex=p.state.objects[weight].room;
  p.through(exit);p.change(shutter);assert.equal(p.state.flags[flag],true);assert.equal(p.state.objects[weight].room,annex);
  recover(world,p.state);assert.equal(p.state.player.room,`c${chapter}`);assert.equal(p.state.player.scale,1);
  assert.equal(p.state.flags[flag],true,'Recovery preserves the selected arrangement');assert.equal(p.state.held,null);
  assert.deepEqual(p.state.objects[weight].p,p.state.objects[weight].home.p);assert.equal(p.state.objects[weight].size,.8);
  // The preserved arrangement initially hides the weight's room. The same
  // visible stand can switch it back, so recovery leaves a usable route.
  p.use(shutter);p.state.player.forward=[0,0,1];p.wait(1);assert.equal(p.state.flags[flag],false);
  const stand=world.interactables.find(item=>item.id===shutter);
  p.move([stand.p[0]-1.1,p.state.player.p[1],p.state.player.p[2]],'step beside the reset arrangement stand');
  p.through(entry);p.take(weight);assert.equal(p.state.held,weight);
});

test('recovery at partial finale OPEN, HOLD and RELEASE states preserves a complete route to the ledger',()=> {
  const p=new Pilot(10);p.through('final-pavilion');p.take('weight10');p.through('final-half');p.use('plinth10');
  const socketed=structuredClone(p.state.objects.weight10);
  const checkRecovery=phase=> {
    recover(world,p.state);assert.equal(p.state.player.room,'c10',phase);assert.equal(p.state.player.scale,1,phase);
    assert.deepEqual(p.state.player.up,[0,1,0],phase);assert.equal(p.state.held,null,phase);
    assert.equal(p.state.flags['final-open'],true,phase);assert.equal(p.state.objects.weight10.socketed,true,phase);
    assert.deepEqual(p.state.objects.weight10.p,socketed.p,phase);assert.equal(p.state.objects.weight10.size,.4,phase);
  };
  checkRecovery('OPEN');assert.equal(!!p.state.flags['final-hold'],false);
  p.change('final-shutter');p.through('final-hold-in');p.use('gravity10');p.wait(2);
  checkRecovery('HOLD');assert.equal(p.state.flags['final-hold'],true);assert.equal(!!p.state.flags['final-release'],false);
  p.through('final-hold-in');p.use('gravity10');p.wait(2);p.align('final-mark');
  checkRecovery('RELEASE');assert.equal(p.state.flags['final-hold'],true);assert.equal(p.state.flags['final-release'],true);
  p.through('final-hold-in');p.use('gravity10');p.wait(2);
  p.move([4.4,7.1,-6.7],'walk around the wall compass after recovery');p.through('exit-created');p.use('last-ledger');
  assert.equal(p.state.flags.finished,true);assert.ok(p.state.solved.includes(10));
});

test('a wrong-size socket keeps the weight usable and accepts it after the route corrects its measure',()=> {
  const p=new Pilot(7);p.take('weight7');p.through('half7-in');p.through('neutral7-out');p.through('cabinet7-in');
  assert.equal(p.state.player.scale,.5);assert.equal(p.state.objects.weight7.size,.4);
  const refusal=p.use('plinth7');assert.equal(refusal.type,'toast');assert.match(refusal.text,/needs 0\.20/);
  assert.equal(p.state.held,'weight7');assert.equal(!!p.state.flags['complete:7'],false);assert.equal(!!p.state.objects.weight7.socketed,false);
  p.through('cabinet7-out');p.through('half7-in');p.through('neutral7-out');p.through('cabinet7-in');
  assert.equal(p.state.player.scale,.25);assert.equal(p.state.objects.weight7.size,.2);assert.equal(p.use('plinth7').type,'socket');
  assert.equal(p.state.flags['complete:7'],true);assert.equal(p.state.held,null);assert.equal(p.state.objects.weight7.socketed,true);
});
