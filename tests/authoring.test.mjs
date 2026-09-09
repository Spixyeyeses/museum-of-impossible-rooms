import test from 'node:test';
import assert from 'node:assert/strict';
import {world} from '../src/campaign.mjs';
import {validateWorld} from '../tools/validate-world.mjs';

function fixture(){
  return {
    startRoom:'a',
    rooms:['a','b'].map(id=>({id,chapter:1,bounds:{min:[-4,0,-4],max:[4,6,4]},spawn:{p:[0,1.6,2],forward:[0,0,-1],up:[0,1,0]},solids:[]})),
    portals:[
      {id:'a-to-b',room:'a',to:'b-to-a',center:[0,1.8,-4],normal:[0,0,1],up:[0,1,0],width:2.6,height:3.6},
      {id:'b-to-a',room:'b',to:'a-to-b',center:[0,1.8,4],normal:[0,0,-1],up:[0,1,0],width:2.6,height:3.6}
    ],
    objects:[{id:'weight',room:'a',p:[-2,.4,0],size:.8}],
    interactables:[
      {id:'socket',room:'a',p:[-2,1,-2],type:'socket',radius:.62,acceptSize:.8,flag:'complete:1'},
      {id:'mark',room:'b',p:[0,1.6,0],type:'align',target:[0,1.8,-4],flag:'aligned',hold:1.1,spotRadius:.82,tolerance:.992}
    ],
    chapters:[{id:1,entry:'a',completeFlag:'complete:1',hints:['Notice the frame.','The frame links rooms.','Walk through the frame.']}]
  };
}
function deepFreeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);}return value;}

test('the shipped campaign has valid reusable authoring data',()=>{
  const result=validateWorld(world);
  assert.equal(result.valid,true,JSON.stringify(result.errors,null,2));
  assert.deepEqual(result.warnings,[]);
  assert.equal(result.stats.chapters,10);
});

test('validation is pure, accepts a frozen world, and exposes structured issues',()=>{
  const authored=fixture(),before=JSON.stringify(authored);deepFreeze(authored);
  const result=validateWorld(authored);
  assert.equal(result.valid,true);assert.deepEqual(result.errors,[]);assert.equal(JSON.stringify(authored),before);
  assert.equal(result.stats.portals,2);
});

const malformed=[
  ['duplicate IDs',w=>w.rooms.push(structuredClone(w.rooms[0])),'duplicate-id'],
  ['unknown room references',w=>w.objects[0].room='missing','room-reference'],
  ['missing starting room',w=>w.startRoom='missing','start-room'],
  ['ambiguous object/interaction IDs',w=>w.interactables[0].id='weight','ambiguous-interaction-id'],
  ['missing reciprocal target',w=>w.portals[0].to='missing','portal-target'],
  ['nonreciprocal links',w=>w.portals[1].to='b-to-a','portal-reciprocal'],
  ['unnormalized normals',w=>w.portals[0].normal=[0,0,2],'portal-normal'],
  ['noncardinal frame axes',w=>w.portals[0].normal=[Math.SQRT1_2,0,Math.SQRT1_2],'portal-normal'],
  ['parallel normal and up',w=>w.portals[0].up=[0,0,1],'portal-frame'],
  ['outward-facing wall endpoint',w=>w.portals[0].normal=[0,0,-1],'portal-facing'],
  ['incompatible aperture proportions',w=>w.portals[1].width=2,'portal-aspect'],
  ['negative aperture size',w=>w.portals[0].height=-3.6,'portal-size'],
  ['aperture beyond bounds',w=>w.portals[0].center[0]=4,'portal-outside-room'],
  ['invalid room bounds',w=>w.rooms[0].bounds.max[1]=0,'bounds'],
  ['invalid solid extents',w=>w.rooms[0].solids.push({min:[0,0,0],max:[0,1,1]}),'solid-bounds'],
  ['spawn intersects solid',w=>w.rooms[0].solids.push({min:[-.5,0,1],max:[.5,3,3]}),'spawn-obstructed'],
  ['standing body crosses floor',w=>w.rooms[0].spawn.p[1]=.5,'spawn-outside-room'],
  ['spawn looks directly up',w=>w.rooms[0].spawn.forward=[0,1,0],'spawn-forward'],
  ['invalid supported scale limits',w=>w.minScale=5,'scale-range'],
  ['nonfinite object size',w=>w.objects[0].size=NaN,'object-size'],
  ['object outside room',w=>w.objects[0].p[0]=4,'object-outside-room'],
  ['invalid recall home',w=>w.objects[0].home={room:'a',p:[0,0],size:.8},'object-home'],
  ['nonpositive socket measure',w=>w.interactables[0].acceptSize=0,'socket-size'],
  ['invalid trigger target',w=>w.interactables[1].target=[Infinity,0,0],'trigger-target'],
  ['impossible exact alignment threshold',w=>w.interactables[1].tolerance=1,'alignment'],
  ['missing graduated hint',w=>w.chapters[0].hints.pop(),'hints'],
  ['unknown condition syntax',w=>w.portals[0].requires={greaterThan:'aligned'},'condition'],
  ['invalid any operand',w=>w.portals[0].requires={any:'aligned'},'condition']
];
for(const [description,mutate,code] of malformed)test(`authoring rejects ${description}`,()=>{
  const authored=fixture();mutate(authored);const result=validateWorld(authored);
  assert.equal(result.valid,false,description);
  assert.ok(result.errors.some(issue=>issue.code===code),JSON.stringify(result.errors));
});

test('compatible unequal apertures encode a valid reciprocal uniform scale',()=>{
  const authored=fixture();Object.assign(authored.portals[1],{width:1.3,height:1.8,center:[0,.9,4]});
  assert.equal(validateWorld(authored).valid,true);
});

test('a wall-up spawn is validated using its standing body basis',()=>{
  const authored=fixture();Object.assign(authored.rooms[0].spawn,{p:[2.4,2,2],up:[-1,0,0]});
  assert.equal(validateWorld(authored).valid,true);
});

test('known nested conditions are accepted while externally supplied flags only warn',()=>{
  const authored=fixture();authored.portals[0].requires={all:['aligned',{not:'complete:1'},true]};
  assert.deepEqual(validateWorld(authored).warnings,[]);
  authored.portals[0].requires={any:['aligned','external-ready']};
  const result=validateWorld(authored);assert.equal(result.valid,true);assert.equal(result.warnings[0].code,'unknown-flag');
  assert.deepEqual(validateWorld(authored,{knownFlags:['external-ready']}).warnings,[]);
});

test('deliberately exterior portions of solids warn without rejecting a usable room',()=>{
  const authored=fixture();authored.rooms[0].solids.push({min:[5,0,0],max:[6,1,1]});
  const result=validateWorld(authored);assert.equal(result.valid,true);assert.equal(result.warnings[0].code,'solid-outside-room');
});

test('cyclic conditions and malformed world roots fail without throwing',()=>{
  const authored=fixture(),cycle={};cycle.not=cycle;authored.portals[0].requires=cycle;
  assert.ok(validateWorld(authored).errors.some(issue=>issue.code==='condition-cycle'));
  for(const input of [null,[],{},false])assert.equal(validateWorld(input).valid,false);
});
