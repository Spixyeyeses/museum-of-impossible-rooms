#!/usr/bin/env node
/** Static authoring validation. No renderer, browser, file writes, or mutation. */
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {world as museumWorld} from '../src/campaign.mjs';

const EPS=1e-6;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const positive=value=>finite(value)&&value>0;
const vector=value=>Array.isArray(value)&&value.length===3&&value.every(finite);
const dot=(a,b)=>a.reduce((sum,value,index)=>sum+value*b[index],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=value=>vector(value)&&Math.abs(Math.hypot(...value)-1)<EPS;
const cardinal=value=>unit(value)&&value.filter(v=>Math.abs(v)>EPS).length===1;
const identifier=value=>typeof value==='string'&&value.trim().length>0;
const boxValid=box=>box&&vector(box.min)&&vector(box.max)&&box.min.every((v,i)=>v<box.max[i]);
const boxContains=(outer,inner)=>inner.min.every((v,i)=>v>=outer.min[i]-EPS&&inner.max[i]<=outer.max[i]+EPS);
const overlaps=(a,b)=>a.min.every((v,i)=>v<b.max[i]-EPS&&a.max[i]>b.min[i]+EPS);
const centeredBox=(center,extent)=>({min:center.map((v,i)=>v-extent[i]),max:center.map((v,i)=>v+extent[i])});

/**
 * Validate a room-and-connection world without modifying it.
 * Unknown condition flags are warnings: callers can declare externally supplied
 * flags in options.knownFlags. Invalid condition syntax is an error.
 * Returns structured issues so tests, an editor, or the CLI can consume them.
 */
export function validateWorld(world,{knownFlags:externalFlags=[]}={}) {
  const errors=[],warnings=[];
  const issue=(collection,code,path,message)=>collection.push({code,path,message});
  const error=(code,path,message)=>issue(errors,code,path,message);
  const warning=(code,path,message)=>issue(warnings,code,path,message);
  if(!world||typeof world!=='object'||Array.isArray(world))return {valid:false,errors:[{code:'world',path:'world',message:'Expected a world object.'}],warnings,stats:{rooms:0,portals:0,objects:0,interactables:0,chapters:0}};
  const entries={};
  for(const name of ['rooms','portals','objects','interactables','chapters']) {
    if(!Array.isArray(world[name])){error('collection',name,'Expected an array.');entries[name]=[];}
    else entries[name]=world[name];
  }
  const maps={};
  for(const name of ['rooms','portals','objects','interactables']) {
    const map=new Map();maps[name]=map;
    entries[name].forEach((value,index)=>{
      const path=`${name}[${index}]`;
      if(!value||typeof value!=='object'||Array.isArray(value)){error('entry',path,'Expected an authoring object.');return;}
      if(!identifier(value.id)){error('id',`${path}.id`,'Use a nonempty string ID.');return;}
      if(map.has(value.id))error('duplicate-id',`${path}.id`,`Duplicate ${name} ID: ${value.id}.`);
      else map.set(value.id,value);
    });
  }
  for(const id of maps.objects.keys())if(maps.interactables.has(id))error('ambiguous-interaction-id',`objects.${id}`,`Object and interactable share ID ${id}; interaction lookup would be ambiguous.`);
  if(!identifier(world.startRoom)||!maps.rooms.has(world.startRoom))error('start-room','startRoom','The starting room must name an authored room.');
  const minScale=world.minScale??.0625,maxScale=world.maxScale??4;
  if(!positive(minScale)||!positive(maxScale)||minScale>maxScale)error('scale-range','minScale/maxScale','Supported scale limits must be positive and ordered.');

  const chapterIds=new Set(),knownFlags=new Set(['onboarded','outside','finished',...externalFlags]);
  entries.chapters.forEach((chapter,index)=>{
    const path=`chapters[${index}]`;
    if(!chapter||typeof chapter!=='object'){error('chapter',path,'Expected a chapter object.');return;}
    if(!Number.isInteger(chapter.id)||chapter.id<=0)error('chapter-id',`${path}.id`,'Chapter IDs must be positive integers.');
    else if(chapterIds.has(chapter.id))error('duplicate-id',`${path}.id`,`Duplicate chapter ID ${chapter.id}.`);
    else chapterIds.add(chapter.id);
    if(!maps.rooms.has(chapter.entry))error('chapter-entry',`${path}.entry`,'Chapter entry must name an authored room.');
    if(!identifier(chapter.completeFlag))error('flag',`${path}.completeFlag`,'A chapter needs a completion flag.');
    else knownFlags.add(chapter.completeFlag);
    knownFlags.add(`solved:${chapter.id}`);
    if(!Array.isArray(chapter.hints)||chapter.hints.length!==3||chapter.hints.some(h=>!identifier(h)))error('hints',`${path}.hints`,'Provide exactly three nonempty graduated hints.');
  });
  for(const room of maps.rooms.values())knownFlags.add(`gravity:${room.id}`);
  for(const object of maps.objects.values())knownFlags.add(`socketed:${object.id}`);
  for(const item of maps.interactables.values()){
    if(identifier(item.flag))knownFlags.add(item.flag);
    for(const prefix of ['armed','unseen','charge'])knownFlags.add(`${prefix}:${item.id}`);
  }

  const condition=(value,path,stack=new Set())=>{
    if(value==null||typeof value==='boolean')return;
    if(typeof value==='string'){
      if(!identifier(value))error('condition',path,'A flag reference cannot be empty.');
      else if(!knownFlags.has(value))warning('unknown-flag',path,`Flag ${value} is not declared by a chapter or trigger; declare it through knownFlags if another system supplies it.`);
      return;
    }
    if(typeof value!=='object'){error('condition',path,'Use a flag, boolean, array (all), or not/any/all condition.');return;}
    if(stack.has(value)||stack.size>=32){error('condition-cycle',path,'Condition nesting is cyclic or exceeds 32 levels.');return;}
    stack.add(value);
    if(Array.isArray(value))value.forEach((part,index)=>condition(part,`${path}[${index}]`,stack));
    else {
      const keys=Object.keys(value),operators=keys.filter(key=>['not','any','all'].includes(key));
      if(keys.length!==1||operators.length!==1)error('condition',path,'A condition object must contain exactly one operator: not, any, or all.');
      else if(operators[0]==='not')condition(value.not,`${path}.not`,stack);
      else if(!Array.isArray(value[operators[0]]))error('condition',path,`${operators[0]} requires an array.`);
      else {
        if(operators[0]==='any'&&!value.any.length)warning('never-open',path,'An empty any condition is always false.');
        value[operators[0]].forEach((part,index)=>condition(part,`${path}.${operators[0]}[${index}]`,stack));
      }
    }
    stack.delete(value);
  };

  for(const room of maps.rooms.values()){
    const path=`rooms.${room.id}`;
    if(!boxValid(room.bounds)){error('bounds',`${path}.bounds`,'Bounds need finite min/max vectors with min < max on every axis.');continue;}
    if(room.chapter!==undefined&&room.chapter!==0&&!chapterIds.has(room.chapter))error('room-chapter',`${path}.chapter`,'Room chapter must be zero or an authored chapter ID.');
    if(room.gravity!==undefined&&!cardinal(room.gravity))error('gravity',`${path}.gravity`,'Room gravity-up must be a normalized cardinal vector.');
    const solids=room.solids??[];
    if(!Array.isArray(solids)){error('solids',`${path}.solids`,'Expected an array of axis-aligned boxes.');continue;}
    const solidIds=new Set(),validSolids=[];
    solids.forEach((solid,index)=>{
      const solidPath=`${path}.solids[${index}]`;
      if(!boxValid(solid)){error('solid-bounds',solidPath,'A solid needs finite, positively sized min/max vectors.');return;}
      validSolids.push(solid);
      if(identifier(solid.id)){if(solidIds.has(solid.id))error('duplicate-id',`${solidPath}.id`,`Duplicate solid ID ${solid.id} in room ${room.id}.`);solidIds.add(solid.id);}
      if(!boxContains(room.bounds,solid))warning('solid-outside-room',solidPath,'Part of this solid extends outside the room bounds. Confirm this is deliberate.');
      condition(solid.requires,`${solidPath}.requires`);
    });
    const spawn=room.spawn;
    if(!spawn||!vector(spawn.p)){error('spawn',`${path}.spawn`,'A room needs a finite spawn eye-position vector.');continue;}
    const up=spawn.up??[0,1,0],forward=spawn.forward??[0,0,-1],scale=spawn.scale??1;
    if(!cardinal(up))error('spawn-up',`${path}.spawn.up`,'Spawn up must be a normalized cardinal vector.');
    if(!unit(forward)||unit(up)&&Math.abs(dot(forward,up))>.999)error('spawn-forward',`${path}.spawn.forward`,'Spawn forward must be normalized and must not point directly along up.');
    if(!positive(scale)||scale<minScale-EPS||scale>maxScale+EPS)error('spawn-scale',`${path}.spawn.scale`,'Spawn scale must be inside the supported positive range.');
    if(cardinal(up)&&positive(scale)){
      const center=spawn.p.map((v,i)=>v-up[i]*.7*scale),extent=up.map(v=>(Math.abs(v)>.5?.9:.24)*scale),body=centeredBox(center,extent);
      if(!boxContains(room.bounds,body))error('spawn-outside-room',`${path}.spawn.p`,'The full standing player body does not fit within the room bounds.');
      if(validSolids.some(solid=>(solid.requires==null||solid.requires===true)&&overlaps(body,solid)))error('spawn-obstructed',`${path}.spawn.p`,'The standing body intersects an unconditional solid.');
    }
  }

  const roomReference=(entry,path)=>{
    if(!maps.rooms.has(entry.room)){error('room-reference',`${path}.room`,`Unknown room ${String(entry.room)}.`);return null;}
    return maps.rooms.get(entry.room);
  };
  for(const portal of maps.portals.values()){
    const path=`portals.${portal.id}`,room=roomReference(portal,path),destination=maps.portals.get(portal.to);
    if(!destination)error('portal-target',`${path}.to`,`Unknown reciprocal portal ${String(portal.to)}.`);
    else if(destination.to!==portal.id||portal.to===portal.id)error('portal-reciprocal',`${path}.to`,'Every portal must link to a distinct endpoint that links back.');
    if(!vector(portal.center))error('portal-center',`${path}.center`,'Portal centre must be a finite vector.');
    if(!cardinal(portal.normal))error('portal-normal',`${path}.normal`,'Portal normal must be a normalized cardinal vector.');
    if(!cardinal(portal.up))error('portal-up',`${path}.up`,'Portal up must be a normalized cardinal vector.');
    if(cardinal(portal.normal)&&cardinal(portal.up)&&Math.abs(dot(portal.normal,portal.up))>EPS)error('portal-frame',path,'Portal normal and up must be orthogonal.');
    if(!positive(portal.width)||!positive(portal.height))error('portal-size',path,'Portal width and height must be positive finite numbers.');
    if(destination&&positive(portal.width)&&positive(portal.height)&&positive(destination.width)&&positive(destination.height)&&Math.abs(portal.width/portal.height-destination.width/destination.height)>EPS)error('portal-aspect',path,'Reciprocal apertures must share an aspect ratio; their height ratio is the uniform scale transform.');
    if(room&&boxValid(room.bounds)&&vector(portal.center)&&cardinal(portal.normal)&&cardinal(portal.up)&&positive(portal.width)&&positive(portal.height)){
      const right=cross(portal.up,portal.normal),extent=right.map((v,i)=>Math.abs(v)*portal.width/2+Math.abs(portal.up[i])*portal.height/2),aperture=centeredBox(portal.center,extent);
      if(!boxContains(room.bounds,aperture))error('portal-outside-room',path,'The complete aperture must lie inside or on the room bounds.');
      for(let axis=0;axis<3;axis++)if(Math.abs(portal.normal[axis])>.5){
        if(Math.abs(portal.center[axis]-room.bounds.min[axis])<EPS&&portal.normal[axis]<0||Math.abs(portal.center[axis]-room.bounds.max[axis])<EPS&&portal.normal[axis]>0)error('portal-facing',`${path}.normal`,'A wall-mounted endpoint must face into its source room.');
      }
    }
    condition(portal.requires,`${path}.requires`);
  }

  for(const object of maps.objects.values()){
    const path=`objects.${object.id}`,room=roomReference(object,path);
    if(!vector(object.p))error('object-position',`${path}.p`,'Object centre must be a finite vector.');
    if(!positive(object.size))error('object-size',`${path}.size`,'Object size must be positive and finite.');
    if(room&&boxValid(room.bounds)&&vector(object.p)&&positive(object.size)&&!boxContains(room.bounds,centeredBox(object.p,[object.size/2,object.size/2,object.size/2])))error('object-outside-room',path,'The full authored object must fit inside its room.');
    if(object.home){
      const home=object.home,homeRoom=roomReference(home,`${path}.home`);
      if(!vector(home.p)||!positive(home.size))error('object-home',`${path}.home`,'A recall home needs a finite position and positive size.');
      else if(homeRoom&&boxValid(homeRoom.bounds)&&!boxContains(homeRoom.bounds,centeredBox(home.p,[home.size/2,home.size/2,home.size/2])))error('object-home-outside-room',`${path}.home`,'The recalled object must fit inside its home room.');
    }
    condition(object.requires,`${path}.requires`);
  }

  const types=new Set(['socket','note','lore','gravity','align','shutter','memory','finish']);
  for(const item of maps.interactables.values()){
    const path=`interactables.${item.id}`;roomReference(item,path);
    if(!vector(item.p))error('interaction-position',`${path}.p`,'Interaction position must be a finite vector.');
    if(!types.has(item.type))error('interaction-type',`${path}.type`,'Unknown interaction type; add behavior before using a new type.');
    if(item.radius!==undefined&&!positive(item.radius))error('interaction-radius',`${path}.radius`,'Interaction radius must be positive and finite.');
    if(['socket','align','shutter','memory'].includes(item.type)&&!identifier(item.flag))error('flag',`${path}.flag`,'This interaction needs a nonempty state flag.');
    if(item.type==='socket'&&!positive(item.acceptSize))error('socket-size',`${path}.acceptSize`,'Socket measure must be positive and finite.');
    if(item.type==='gravity'&&!cardinal(item.up))error('gravity',`${path}.up`,'Gravity-up must be a normalized cardinal vector.');
    if(['align','shutter'].includes(item.type)&&!vector(item.target))error('trigger-target',`${path}.target`,'Gaze target must be a finite room-local vector.');
    if(item.type==='align'){
      if(!positive(item.hold)||!positive(item.spotRadius)||!finite(item.tolerance)||item.tolerance<=-1||item.tolerance>=1)error('alignment',path,'Alignment needs a positive hold/spotRadius and a cosine tolerance strictly between -1 and 1.');
      if(item.up!==undefined&&!cardinal(item.up))error('alignment-up',`${path}.up`,'Required alignment up must be a normalized cardinal vector.');
    }
    condition(item.requires,`${path}.requires`);
    if(item.hideFlag!==undefined)condition(item.hideFlag,`${path}.hideFlag`);
  }
  return {valid:errors.length===0,errors,warnings,stats:Object.fromEntries(Object.entries(entries).map(([name,values])=>[name,values.length]))};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=validateWorld(museumWorld);
  if(process.argv.includes('--json'))console.log(JSON.stringify(result,null,2));
  else {
    console.log(`${result.valid?'PASS':'FAIL'} authoring: ${Object.entries(result.stats).map(([name,count])=>`${count} ${name}`).join(', ')}.`);
    for(const item of result.errors)console.error(`ERROR [${item.code}] ${item.path}: ${item.message}`);
    for(const item of result.warnings)console.warn(`WARNING [${item.code}] ${item.path}: ${item.message}`);
  }
  if(!result.valid)process.exitCode=1;
}
