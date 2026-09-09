import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,condition,portalTransform,crossPortal,step,look,trace,pickUp,drop,setGravity,recover,serialize,restore,canPlaceObject,dot,length,sub} from '../src/engine.mjs';

const near=(actual,expected,tolerance=1e-5)=> {
  if(Array.isArray(actual))actual.forEach((value,index)=>near(value,expected[index],tolerance));
  else assert.ok(Math.abs(actual-expected)<tolerance,`${actual} ≈ ${expected}`);
};
const room=(id,min=[-5,0,-5],max=[5,6,5],spawn=[0,1.6,2])=>({id,bounds:{min,max},spawn:{p:spawn,forward:[0,0,-1],up:[0,1,0]},solids:[]});
const portal=(id,room,center,normal,to,height=3.6,up=[0,1,0])=>({id,room,center,normal,up,to,width:height*2/3,height});
function world() {
  return {startRoom:'a',rooms:[room('a'),room('b'),room('c')],portals:[portal('ab','a',[0,1.8,-5],[0,0,1],'ba'),portal('ba','b',[5,1.8,0],[-1,0,0],'ab')],objects:[],interactables:[]};
}
function walk(w,s,forward,seconds,strafe=0) {for(let i=0;i<seconds*120;i++)step(w,s,{forward,strafe},1/120);}

test('conditions handle availability, inversions, and composed rules',()=> {
  const s={flags:{a:true,b:false}};
  assert.equal(condition(s),true);assert.equal(condition(s,'a'),true);assert.equal(condition(s,['a',{not:'b'}]),true);
  assert.equal(condition(s,{any:['a','b']}),true);assert.equal(condition(s,['a','b']),false);assert.equal(condition(s,{unknown:3}),false);
});

test('portal transform reverses handed aperture axes and has an exact reciprocal',()=> {
  const a=portal('a','a',[2,3,4],[0,0,1],'b',4);
  const b=portal('b','b',[-3,5,1],[-1,0,0],'a',1,[0,0,1]);
  const transform=portalTransform(a,b),inverse=portalTransform(b,a);
  near(transform.scale,.25);near(transform.point(a.center),b.center);
  near(transform.direction([0,1,0]),[0,0,1]);near(transform.direction([0,0,-1]),[-1,0,0]);
  for(const p of [[1,2,3],[100,-20,.025],[0,0,0]])near(inverse.point(transform.point(p)),p);
  for(const d of [[1,0,0],[0,1,0],[0,0,1]])near(inverse.direction(transform.direction(d)),d);
});

test('explicit repeated portal crossings preserve orientation, velocity, scale and carried cube',()=> {
  const w=world();w.portals[1].height=.9;w.portals[1].width=.6;
  w.objects=[{id:'cube',room:'a',p:[0,1,-4.5],size:.8}];
  const s=createState(w);s.player.p=[0,1.6,-5];s.player.velocity=[1,-2,-3];s.held='cube';s.heldRatio=.8;
  const original=structuredClone(s);
  for(let i=0;i<100;i++) {assert.equal(crossPortal(w,s,'ab'),true);near(s.player.scale,.25);near(s.objects.cube.size,.2);assert.equal(crossPortal(w,s,'ba'),true);}
  for(const key of ['p','forward','up','velocity'])near(s.player[key],original.player[key]);
  near(s.player.scale,1);near(s.objects.cube.p,original.objects.cube.p);near(s.objects.cube.size,.8);
  assert.equal(s.events.filter(e=>e.type==='crossing').length,200);
});

test('continuous wall aperture crossing rotates movement and supports a physical return journey',()=> {
  const w=world(),s=createState(w);s.player.p=[0,1.6,-4];
  walk(w,s,1,.6);assert.equal(s.player.room,'b');assert.ok(s.player.p[0]<4.4);near(s.player.forward,[-1,0,0]);near(s.player.up,[0,1,0]);
  walk(w,s,-1,.6);assert.equal(s.player.room,'a');near(s.player.p,[0,1.6,-4],.002);near(s.player.forward,[0,0,-1]);
});

test('quarter-scale crossing changes collision body, speed, eye height and held object together',()=> {
  const w=world();w.portals[1]=portal('ba','b',[5,.45,0],[-1,0,0],'ab',.9);
  w.objects=[{id:'cube',room:'a',p:[0,1.35,-3.2],size:.8}];
  const s=createState(w);s.player.p=[0,1.6,-2];s.player.forward=[0,-.08,-.9968];assert.equal(pickUp(w,s,'cube'),true);
  s.player.forward=[0,0,-1];walk(w,s,1,1.4);
  assert.equal(s.player.room,'b');near(s.player.scale,.25);near(s.player.p[1],.4,.005);near(s.objects.cube.size,.2);
  assert.equal(s.objects.cube.room,'b');assert.ok(s.player.p[0]>4);
  walk(w,s,-1,1.4);assert.equal(s.player.room,'a');near(s.player.scale,1);near(s.objects.cube.size,.8);
});

test('portal scale safety bounds reject the crossing without corrupting the player',()=> {
  const w=world();w.portals[1].height=.1;w.portals[1].width=.1/1.5;
  const s=createState(w);s.player.p=[0,1.6,-4.9];
  walk(w,s,1,.5);assert.equal(s.player.room,'a');near(s.player.scale,1);assert.ok(s.player.p[2]>=-5-EPSILON);
  assert.ok(s.events.some(e=>e.type==='scaleBlocked'));
});
const EPSILON=1e-4;

test('solid, disabled portal and narrow aperture collision cannot be walked through',()=> {
  for(const scenario of ['solid','locked','narrow']) {
    const w=world(),s=createState(w);s.player.p=[0,1.6,-3];
    if(scenario==='solid')w.rooms[0].solids=[{id:'screen',min:[-2,0,-4],max:[2,4,-3.8]}];
    if(scenario==='locked')w.portals[0].requires='unlocked';
    if(scenario==='narrow')w.portals[0].width=.3;
    walk(w,s,1,2);assert.equal(s.player.room,'a');assert.ok(s.player.p[2]>-4.77,scenario);
  }
});

test('walking diagonally into a wall slides and never tunnels at a long frame',()=> {
  const w=world(),s=createState(w);s.player.p=[4.7,1.6,2];
  for(let i=0;i<40;i++)step(w,s,{forward:1,strafe:1,sprint:true},.5);
  assert.ok(s.player.p[0]<=4.7601);assert.ok(s.player.p[2]<0);near(s.player.p[1],1.6,.001);
});

test('arbitrary cardinal gravity settles against a wall, movement and look remain tangent',()=> {
  const w=world(),s=createState(w);s.player.p=[0,1.6,2];
  assert.equal(setGravity(w,s,[-1,0,0]),true);near(s.player.up,[-1,0,0]);
  walk(w,s,0,2);near(s.player.p[0],3.4,.002);
  const old=[...s.player.p];walk(w,s,1,.25);near(s.player.p[0],old[0],.001);assert.ok(length(sub(s.player.p,old))>.5);
  look(s,.5,.4);near(length(s.player.forward),1);assert.ok(Math.abs(dot(s.player.forward,s.player.up))<1);
  assert.equal(setGravity(w,s,[.5,.5,0]),false);
});

test('sideways-gravity aperture restores an upright camera by actual spatial rotation',()=> {
  const w=world();w.rooms[0]=room('a',[-5,0,-5],[5,8,5],[0,1.6,2]);
  w.portals[0]=portal('ab','a',[3.2,4,-5],[0,0,1],'ba',3.6,[-1,0,0]);
  w.portals[1]=portal('ba','b',[0,1.8,5],[0,0,-1],'ab');
  const s=createState(w);s.player={room:'a',p:[3.4,4,-4],forward:[0,0,-1],up:[-1,0,0],velocity:[0,0,0],scale:1};
  walk(w,s,1,.5);assert.equal(s.player.room,'b');near(s.player.up,[0,1,0]);near(s.player.forward,[0,0,-1]);near(s.player.p[1],1.6,.002);
});

test('interaction ray traverses a scaled boundary and measures reach in source units',()=> {
  const w=world();w.portals[1]=portal('ba','b',[5,.45,0],[-1,0,0],'ab',.9);
  w.interactables=[{id:'button',room:'b',p:[4.7,.4,0],radius:.05,type:'button'}];
  const s=createState(w);s.player.p=[0,1.6,-4];
  const hit=trace(w,s);assert.equal(hit?.id,'button');assert.equal(hit.room,'b');near(hit.distance,2,.001);
  assert.equal(trace(w,s,{maxDistance:1.9}),null);
  w.rooms[1].solids=[{id:'block',min:[4.82,0,-1],max:[4.88,1,1]}];assert.equal(trace(w,s),null);
});

test('interaction ray obeys room walls, object occlusion and conditional visibility',()=> {
  const w=world(),s=createState(w);
  w.interactables=[{id:'switch',room:'a',p:[0,1.6,0],radius:.2,requires:'visible'}];
  assert.equal(trace(w,s),null);s.flags.visible=true;assert.equal(trace(w,s)?.id,'switch');
  s.objects.cube={id:'cube',room:'a',p:[0,1.6,1],size:.4};assert.equal(trace(w,s)?.kind,'object');
  w.rooms[0].solids=[{id:'wall',min:[-2,0,1.3],max:[2,4,1.4]}];assert.equal(trace(w,s),null);
  s.player.p=[4,1.6,0];s.player.forward=[1,0,0];w.interactables[0].p=[7,1.6,0];assert.equal(trace(w,s,{maxDistance:20}),null);
});

test('ray portal budget terminates a cycle',()=> {
  const w=world();w.rooms=[room('a')];w.portals=[portal('front','a',[0,1.8,-1],[0,0,1],'back'),portal('back','a',[0,1.8,1],[0,0,-1],'front')];
  const s=createState(w);s.player.p=[0,1.6,0];assert.equal(trace(w,s,{maxDistance:1e6}),null);
});

test('pickup must be a visible ray target and safe dropping cannot embed a cube in a wall',()=> {
  const w=world();w.objects=[{id:'cube',room:'a',p:[0,1.4,.7],size:.4},{id:'far',room:'a',p:[4,1.4,0],size:.4}];
  const s=createState(w);assert.equal(pickUp(w,s,'far'),false);assert.equal(pickUp(w,s,'cube'),true);
  assert.equal(s.held,'cube');s.player.p=[4.7,1.6,0];s.player.forward=[1,0,0];step(w,s,{},1/60);
  if(drop(w,s))assert.equal(canPlaceObject(w,s,s.objects.cube),true);else assert.equal(s.held,'cube');
  s.player.p=[0,1.6,2];s.player.forward=[0,0,-1];step(w,s,{},1/60);assert.equal(drop(w,s),true);
  walk(w,s,0,1);near(s.objects.cube.p[1],.2,.002);
});

test('grasping through a scaled portal transforms apparent object size consistently',()=> {
  const w=world();w.portals[1]=portal('ba','b',[5,.45,0],[-1,0,0],'ab',.9);
  w.objects=[{id:'cube',room:'b',p:[4.7,.4,0],size:.2}];
  const s=createState(w);s.player.p=[0,1.6,-4];assert.equal(pickUp(w,s,'cube'),true);near(s.heldRatio,.8);
  walk(w,s,-1,.6);near(s.objects.cube.size,.8);assert.equal(s.objects.cube.room,'a');
});

test('saving inside a scaled and reoriented room restores exact player and carried state',()=> {
  const w=world();w.objects=[{id:'cube',room:'a',p:[0,.4,0],size:.8}];
  const s=createState(w);s.player={room:'b',p:[4.6,3,1],forward:[0,.1,-.9949874371],up:[-1,0,0],velocity:[.2,0,-.1],scale:.25};
  s.checkpoint='b';s.flags['gravity:b']=[-1,0,0];s.flags.story=true;s.solved=['c1'];s.journal=['A note'];s.elapsed=33;
  s.objects.cube={...s.objects.cube,room:'b',p:[4.5,2.8,.1],size:.2};s.held='cube';s.heldRatio=.8;
  const restored=restore(w,serialize(s));assert.equal(restored.player.room,'b');near(restored.player.p,s.player.p);near(restored.player.up,s.player.up);near(restored.player.scale,.25);near(restored.player.velocity,s.player.velocity);
  assert.equal(restored.held,'cube');near(restored.objects.cube.size,.2);assert.deepEqual(restored.solved,['c1']);assert.equal(restored.events.length,0);
});

test('restore rejects malformed versions, invalid transforms, outside positions and poisoned flags safely',()=> {
  const w=world();w.objects=[{id:'cube',room:'a',p:[0,.3,0],size:.6}];
  for(const value of ['{broken','null','{}','{"version":7}'])assert.deepEqual(restore(w,value).player,createState(w).player);
  const s=createState(w);s.player.p=[0,1.6,-500];s.objects.cube.p=[1e8,0,0];s.objects.cube.size=-1;s.flags={valid:true};
  const restored=restore(w,serialize(s));near(restored.player.p,w.rooms[0].spawn.p);near(restored.objects.cube.p,[0,.3,0]);
  const poisoned=restore(w,'{"version":1,"flags":{"__proto__":{"polluted":true},"valid":true}}');
  assert.equal({}.polluted,undefined);assert.equal(poisoned.flags.valid,true);assert.equal(Object.hasOwn(poisoned.flags,'__proto__'),false);
});

test('recovery restores checkpoint and all unsocketed objects without losing campaign flags',()=> {
  const w=world();w.objects=[{id:'free',room:'a',p:[0,.3,0],size:.6},{id:'socket',room:'a',p:[2,.3,0],size:.6}];
  const s=createState(w);s.checkpoint='b';s.flags['socketed:socket']=true;s.flags.puzzle=true;s.solved=['a'];s.held='free';s.heldRatio=.6;
  s.objects.free.room='c';s.objects.free.p=[3,2,3];s.objects.free.size=.15;s.objects.socket.room='c';s.objects.socket.p=[2,3,1];
  recover(w,s);assert.equal(s.player.room,'b');near(s.player.scale,1);near(s.player.up,[0,1,0]);assert.equal(s.held,null);
  near(s.objects.free.p,[0,.3,0]);near(s.objects.free.size,.6);assert.equal(s.objects.socket.room,'c');assert.equal(s.flags.puzzle,true);assert.deepEqual(s.solved,['a']);
});

test('authoritative hand pose is offset right and down rather than centered on the view ray',()=> {
  const w=world();w.objects=[{id:'cube',room:'a',p:[0,1.4,.7],size:.4}];
  const s=createState(w);assert.equal(pickUp(w,s,'cube'),true);step(w,s,{},1/60);
  near(s.objects.cube.p,[.37,1.28,.85],.0001);assert.equal(canPlaceObject(w,s,s.objects.cube),true);
  const saved=restore(w,serialize(s));near(saved.objects.cube.p,s.objects.cube.p);near(saved.objects.cube.size,.4);
});

test('offset hand and cube cross a scale boundary before the body, without double scaling on arrival',()=> {
  const w=world();w.portals[1]=portal('ba','b',[5,.45,0],[-1,0,0],'ab',.9);
  w.objects=[{id:'cube',room:'a',p:[0,1.4,-4],size:.4}];
  const s=createState(w);s.player.p=[0,1.6,-3];assert.equal(pickUp(w,s,'cube'),true);
  walk(w,s,1,.5);assert.equal(s.player.room,'a');assert.equal(s.objects.cube.room,'b');near(s.objects.cube.size,.1);
  near(s.objects.cube.p,[4.8375,.32,-.0925],.0001);assert.equal(canPlaceObject(w,s,s.objects.cube),true);
  const saved=restore(w,serialize(s));assert.equal(saved.player.room,'a');assert.equal(saved.objects.cube.room,'b');near(saved.objects.cube.p,s.objects.cube.p,.0001);
  walk(w,s,1,.3);assert.equal(s.player.room,'b');near(s.player.scale,.25);near(s.objects.cube.size,.1);assert.equal(canPlaceObject(w,s,s.objects.cube),true);
});

test('hand tucks inward at an aperture edge and remains collision-safe at oblique walls and floor',()=> {
  const w=world();w.portals[1]=portal('ba','b',[5,.45,0],[-1,0,0],'ab',.9);
  w.objects=[{id:'cube',room:'a',p:[.95,1.4,-4],size:.4}];
  const s=createState(w);s.player.p=[.95,1.6,-3];assert.equal(pickUp(w,s,'cube'),true);
  walk(w,s,1,.5);assert.equal(s.player.room,'a');assert.equal(s.objects.cube.room,'b');assert.equal(canPlaceObject(w,s,s.objects.cube),true);
  walk(w,s,1,.3);assert.equal(s.player.room,'b');assert.equal(canPlaceObject(w,s,s.objects.cube),true);
  for(const direction of [[1,-.1,.3],[.5,-1,.2],[-1,-.5,.2]]) {
    s.player.forward=direction;step(w,s,{},1/60);assert.equal(canPlaceObject(w,s,s.objects.cube),true);
  }
});

test('portal arrival establishes the same destination gravity for the visitor and loose objects',()=> {
  const w=world(),s=createState(w);s.flags['gravity:b']=[-1,0,0];s.player.p=[0,1.6,-5];
  assert.equal(crossPortal(w,s,'ab'),true);assert.deepEqual(s.flags['gravity:b'],s.player.up);near(s.player.up,[0,1,0]);
  setGravity(w,s,[-1,0,0]);s.player.p=[5,2,0];assert.equal(crossPortal(w,s,'ba'),true);assert.deepEqual(s.flags['gravity:a'],s.player.up);
});

test('collected hidden interactables do not leave an invisible interaction target',()=> {
  const w=world(),s=createState(w);w.interactables=[{id:'plate',room:'a',p:[0,1.6,0],radius:.4,type:'memory',hideFlag:'collected'}];
  assert.equal(trace(w,s)?.id,'plate');s.flags.collected=true;assert.equal(trace(w,s),null);
});
