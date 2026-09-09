/** Deterministic, renderer-independent spatial simulation. Distances are room-local. */
export const EYE_HEIGHT = 1.6;
export const PLAYER_RADIUS = .24;
export const MAX_RAY_PORTALS = 4;
const EPS = 1e-6;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const vec = v => Array.isArray(v) && v.length === 3 && v.every(finite);
export const add = (a,b) => a.map((v,i)=>v+b[i]);
export const sub = (a,b) => a.map((v,i)=>v-b[i]);
export const mul = (a,k) => a.map(v=>v*k);
export const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
export const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const length = a => Math.hypot(...a);
export const normalize = (a,fallback=[0,0,-1]) => length(a)>EPS ? mul(a,1/length(a)) : [...fallback];
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const clone = value => JSON.parse(JSON.stringify(value));
export const getRoom = (world,id) => world.rooms.find(room=>room.id===id);
const getPortal = (world,id) => world.portals.find(portal=>portal.id===id);
const portalsIn = (world,room)=>world.portals.filter(portal=>portal.room===room);
const cardinal = value => {
  if (!vec(value) || length(value)<EPS) return null;
  const axis = value.map(Math.abs).indexOf(Math.max(...value.map(Math.abs)));
  if (Math.abs(value[axis])/length(value)<.9999) return null;
  return value.map((v,i)=>i===axis?Math.sign(v):0);
};

export function condition(state,requires) {
  if (requires == null) return true;
  if (typeof requires === 'boolean') return requires;
  if (typeof requires === 'string') return !!state.flags[requires];
  if (Array.isArray(requires)) return requires.every(value=>condition(state,value));
  if (typeof requires === 'object') {
    if ('not' in requires) return !condition(state,requires.not);
    if ('any' in requires) return requires.any.some(value=>condition(state,value));
    if ('all' in requires) return requires.all.every(value=>condition(state,value));
  }
  return false;
}

function frame(portal) {
  const n=normalize(portal.normal,[0,0,1]);
  const r=normalize(cross(portal.up,n),[1,0,0]);
  return {n,r,u:normalize(cross(n,r),[0,1,0])};
}

export function portalTransform(source,dest) {
  const a=frame(source),b=frame(dest),scale=dest.height/source.height;
  if (!finite(scale) || scale<=0) throw new Error('Portal apertures require positive heights.');
  const direction=v=>add(add(mul(b.r,-dot(v,a.r)),mul(b.u,dot(v,a.u))),mul(b.n,-dot(v,a.n)));
  return {scale,direction,point:v=>add(dest.center,mul(direction(sub(v,source.center)),scale))};
}

function portalOpen(world,state,portal) {
  const dest=getPortal(world,portal.to);
  return !!dest && condition(state,portal.requires) && condition(state,dest.requires);
}
function replacedPortal(world,state,portal) {
  if(portalOpen(world,state,portal))return false;
  return portalsIn(world,portal.room).some(other=>other.id!==portal.id&&portalOpen(world,state,other)&&length(sub(other.center,portal.center))<EPS&&dot(other.normal,portal.normal)>.999&&Math.abs(other.width-portal.width)<EPS&&Math.abs(other.height-portal.height)<EPS);
}

function playerBody(player,p=player.p) {
  const center=sub(p,mul(player.up,.7*player.scale));
  const extents=player.up.map(v=>(Math.abs(v)>.5?.9:PLAYER_RADIUS)*player.scale);
  return {center,extents};
}
const cubeBody=(p,size)=>({center:p,extents:[size/2,size/2,size/2]});
function apertureFits(portal,body,padding=0) {
  const {r,u}=frame(portal),delta=sub(body.center,portal.center);
  const er=dot(r.map(Math.abs),body.extents),eu=dot(u.map(Math.abs),body.extents);
  return Math.abs(dot(delta,r))+er<=portal.width/2-padding+EPS && Math.abs(dot(delta,u))+eu<=portal.height/2-padding+EPS;
}
function overlaps(body,box) {
  return body.center.every((v,i)=>v+body.extents[i]>box.min[i]+EPS && v-body.extents[i]<box.max[i]-EPS);
}
const objectBox=object=>({min:object.p.map(v=>v-object.size/2),max:object.p.map(v=>v+object.size/2)});
function boundsFit(world,state,room,body) {
  for(let axis=0;axis<3;axis++) for(const sign of [-1,1]) {
    const edge=sign<0?room.bounds.min[axis]:room.bounds.max[axis];
    // Do not accumulate the aperture tolerance as floor penetration: a tiny
    // local error would otherwise grow on every return through a scale arch.
    if (sign*(body.center[axis]+sign*body.extents[axis]-edge)<=EPS*.001) continue;
    const opening=portalsIn(world,room.id).some(portal=> {
      const n=frame(portal).n;
      return Math.abs(portal.center[axis]-edge)<1e-4 && n[axis]*sign<-.999 && portalOpen(world,state,portal) && apertureFits(portal,body) && dot(sub(body.center,portal.center),n)>=-dot(n.map(Math.abs),body.extents)-EPS;
    });
    if (!opening) return false;
  }
  return true;
}
function bodyFits(world,state,roomId,body,ignoreObject=null,includeObjects=true) {
  const room=getRoom(world,roomId);
  if (!room || !boundsFit(world,state,room,body)) return false;
  if ((room.solids||[]).some(solid=>condition(state,solid.requires)&&overlaps(body,solid))) return false;
  if (includeObjects && Object.values(state.objects).some(object=>object.id!==ignoreObject&&object.id!==state.held&&object.room===roomId&&condition(state,object.requires)&&overlaps(body,objectBox(object)))) return false;
  return true;
}
export function canPlaceObject(world,state,object,room=object.room,p=object.p,size=object.size) {
  if (!vec(p)||!finite(size)||size<=0) return false;
  return bodyFits(world,state,room,cubeBody(p,size),object.id);
}

export function createState(world) {
  const room=getRoom(world,world.startRoom)||world.rooms[0];
  if (!room) throw new Error('A world needs at least one room.');
  const spawn=room.spawn||{p:[0,1.6,0],forward:[0,0,-1],up:[0,1,0]};
  return {
    version:1, player:{room:room.id,p:[...spawn.p],forward:normalize(spawn.forward||[0,0,-1]),up:cardinal(spawn.up)||[0,1,0],velocity:[0,0,0],scale:spawn.scale||1},
    objects:Object.fromEntries((world.objects||[]).map(object=>[object.id,{...clone(object),home:clone(object.home||{room:object.room,p:object.p,size:object.size}),velocity:[0,0,0]}])),
    flags:{},solved:[],held:null,journal:[],elapsed:0,checkpoint:room.id,events:[]
  };
}
function event(state,type,details={}) { (state.events ||= []).push({type,...details}); }

export function crossPortal(world,state,portalId) {
  const source=getPortal(world,portalId);
  if (!source || source.room!==state.player.room || !portalOpen(world,state,source)) return false;
  const dest=getPortal(world,source.to),transform=portalTransform(source,dest),player=state.player;
  const nextScale=player.scale*transform.scale;
  if (!finite(nextScale)||nextScale<(world.minScale??.0625)-EPS||nextScale>(world.maxScale??4)+EPS) {
    event(state,'scaleBlocked',{portal:source.id,scale:nextScale,min:world.minScale??.0625,max:world.maxScale??4});return false;
  }
  player.p=transform.point(player.p);
  player.forward=normalize(transform.direction(player.forward));
  player.up=cardinal(transform.direction(player.up))||normalize(transform.direction(player.up));
  player.velocity=mul(transform.direction(player.velocity),transform.scale);
  player.scale=nextScale;
  player.room=dest.room;
  // An arrival establishes the destination's current local floor. This keeps
  // loose objects and the visitor under the same gravity after re-entering a
  // gallery through an ordinary versus a wall-oriented aperture.
  state.flags[`gravity:${dest.room}`]=[...player.up];
  const held=state.objects[state.held];
  if (held && held.room===source.room) {
    held.p=transform.point(held.p);held.size*=transform.scale;held.room=dest.room;
    held.velocity=mul(transform.direction(held.velocity||[0,0,0]),transform.scale);
  }
  event(state,'crossing',{portal:source.id,from:source.room,to:dest.room,scale:transform.scale});
  return true;
}

function segmentPortal(world,state,roomId,start,end,bodyAt) {
  let earliest=null;
  for(const portal of portalsIn(world,roomId)) {
    if(replacedPortal(world,state,portal))continue;
    const {n}=frame(portal),d0=dot(sub(start,portal.center),n),d1=dot(sub(end,portal.center),n);
    if(d0 < -EPS || d1>=-EPS || d0-d1<EPS) continue;
    const t=clamp(d0/(d0-d1),0,1),p=add(start,mul(sub(end,start),t));
    if (!apertureFits(portal,bodyAt(p))) continue;
    if (!earliest||t<earliest.t) earliest={portal,t,p,open:portalOpen(world,state,portal)};
  }
  return earliest;
}

// Back faces and disabled freestanding portals are solid. The front of an open
// aperture is traversable; its reciprocal aperture provides the return journey.
function crossesClosedPlane(world,state,roomId,start,end,bodyAt) {
  for(const portal of portalsIn(world,roomId)) {
    if(replacedPortal(world,state,portal))continue;
    const {n}=frame(portal),a=dot(sub(start,portal.center),n),b=dot(sub(end,portal.center),n);
    if ((a>EPS&&b>EPS)||(a<-EPS&&b<-EPS)||Math.abs(a-b)<EPS) continue;
    const t=clamp(a/(a-b),0,1),p=add(start,mul(sub(end,start),t));
    const body=bodyAt(p),delta=sub(body.center,portal.center),{r,u}=frame(portal);
    const touches=Math.abs(dot(delta,r))<portal.width/2+dot(r.map(Math.abs),body.extents) && Math.abs(dot(delta,u))<portal.height/2+dot(u.map(Math.abs),body.extents);
    if(touches && (a<-EPS||!portalOpen(world,state,portal)||!apertureFits(portal,body))) return true;
  }
  return false;
}

function movePlayer(world,state,delta,depth=0) {
  if(depth>=8) return;
  const player=state.player,start=[...player.p],end=add(start,delta);
  const crossing=segmentPortal(world,state,player.room,start,end,p=>playerBody(player,p));
  if(crossing?.open) {
    const source=crossing.portal,dest=getPortal(world,source.to),transform=portalTransform(source,dest);
    const before=add(crossing.p,mul(frame(source).n,EPS*8));
    if(bodyFits(world,state,player.room,playerBody(player,before))) {
      const proposed={...player,p:add(transform.point(crossing.p),mul(frame(dest).n,EPS*8)),up:cardinal(transform.direction(player.up))||transform.direction(player.up),scale:player.scale*transform.scale};
      if(bodyFits(world,state,dest.room,playerBody(proposed))) {
        player.p=crossing.p;
        if(!crossPortal(world,state,source.id)){player.p=before;return;}
        player.p=proposed.p;
        movePlayer(world,state,mul(transform.direction(delta),(1-crossing.t)*transform.scale),depth+1);
        return;
      }
    }
  }
  // Resolve one axis at a time to slide along exhibits and walls. Very small
  // fixed substeps prevent tunnelling at ordinary and sprint movement speeds.
  for(let axis=0;axis<3;axis++) {
    if(Math.abs(delta[axis])<EPS) continue;
    const candidate=[...player.p];candidate[axis]+=delta[axis];
    const axisCross=segmentPortal(world,state,player.room,player.p,candidate,p=>playerBody(player,p));
    if(axisCross?.open) {
      const axisDelta=[0,0,0];axisDelta[axis]=delta[axis];
      // The full-vector attempt above can fail on a lateral obstacle. An axis
      // crossing is retried with its own destination clearance check.
      const source=axisCross.portal,dest=getPortal(world,source.to),transform=portalTransform(source,dest);
      const proposed={...player,p:add(transform.point(axisCross.p),mul(frame(dest).n,EPS*8)),up:cardinal(transform.direction(player.up))||transform.direction(player.up),scale:player.scale*transform.scale};
      if(bodyFits(world,state,player.room,playerBody(player,axisCross.p))&&bodyFits(world,state,dest.room,playerBody(proposed))) {
        const before=[...player.p];player.p=axisCross.p;if(!crossPortal(world,state,source.id)){player.p=before;return;}player.p=proposed.p;
        movePlayer(world,state,mul(transform.direction(axisDelta),(1-axisCross.t)*transform.scale),depth+1);
        return;
      }
      player.velocity[axis]=0;continue;
    }
    if(!crossesClosedPlane(world,state,player.room,player.p,candidate,p=>playerBody(player,p))&&bodyFits(world,state,player.room,playerBody(player,candidate))) player.p=candidate;
    else {
      // Binary contact placement keeps eye height stable and avoids floating
      // above the floor by a substep's worth of gravity.
      let low=0,high=1;
      for(let i=0;i<12;i++) {
        const t=(low+high)/2,test=[...player.p];test[axis]+=delta[axis]*t;
        if(!crossesClosedPlane(world,state,player.room,player.p,test,p=>playerBody(player,p))&&bodyFits(world,state,player.room,playerBody(player,test))) low=t;else high=t;
      }
      player.p[axis]+=delta[axis]*low;player.velocity[axis]=0;
    }
  }
}

function rayBox(origin,direction,box,maxDistance=Infinity) {
  let near=0,far=maxDistance;
  for(let i=0;i<3;i++) {
    if(Math.abs(direction[i])<EPS) {if(origin[i]<box.min[i]-EPS||origin[i]>box.max[i]+EPS)return null;continue;}
    let a=(box.min[i]-origin[i])/direction[i],b=(box.max[i]-origin[i])/direction[i];
    if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);
    if(near>far+EPS)return null;
  }
  return far>=0?Math.max(0,near):null;
}
function raySphere(origin,direction,p,radius) {
  const oc=sub(origin,p),b=dot(oc,direction),c=dot(oc,oc)-radius*radius,disc=b*b-c;
  if(disc<0)return null;
  const t=-b-Math.sqrt(disc);return t>=0?t:c<=0?0:null;
}
function rayWall(room,origin,direction) {
  let distance=Infinity;
  for(let i=0;i<3;i++) if(Math.abs(direction[i])>EPS) {
    const edge=direction[i]>0?room.bounds.max[i]:room.bounds.min[i];
    const t=(edge-origin[i])/direction[i];
    if(t>=-EPS)distance=Math.min(distance,Math.max(0,t));
  }
  return distance;
}
function rayEnvironment(world,state,roomId,origin,direction,maxDistance) {
  const room=getRoom(world,roomId);
  if(!room)return {distance:0,portal:null,blocked:true};
  const wallDistance=rayWall(room,origin,direction);
  let distance=Math.min(maxDistance,wallDistance),portal=null,blocked=wallDistance<=maxDistance;
  for(const solid of room.solids||[]) if(condition(state,solid.requires)) {
    const hit=rayBox(origin,direction,solid,maxDistance);
    if(hit!==null&&hit<distance){distance=hit;blocked=true;}
  }
  for(const candidate of portalsIn(world,roomId)) {
    if(replacedPortal(world,state,candidate))continue;
    const {n,r,u}=frame(candidate),denom=dot(direction,n);
    if(Math.abs(denom)<EPS)continue;
    const t=dot(sub(candidate.center,origin),n)/denom;
    if(t<-EPS||t>distance+EPS)continue;
    const p=add(origin,mul(direction,Math.max(0,t))),d=sub(p,candidate.center);
    if(Math.abs(dot(d,r))>candidate.width/2+EPS||Math.abs(dot(d,u))>candidate.height/2+EPS)continue;
    distance=Math.max(0,t);
    blocked=true;
    portal=denom<-EPS&&portalOpen(world,state,candidate)?candidate:null;
  }
  return {distance,portal,blocked};
}

export function trace(world,state,options={}) {
  let origin=[...(options.origin||state.player.p)],direction=normalize(options.direction||state.player.forward),room=options.room||state.player.room;
  let remaining=options.maxDistance??2.5*state.player.scale,total=0,metric=1;
  if(!finite(remaining)||remaining<0||!vec(origin))return null;
  for(let hops=0;hops<=MAX_RAY_PORTALS;hops++) {
    const environment=rayEnvironment(world,state,room,origin,direction,remaining);
    let best=null;
    for(const object of Object.values(state.objects)) if(object.id!==state.held&&!object.socketed&&!state.flags[`socketed:${object.id}`]&&object.room===room&&condition(state,object.requires)) {
      const distance=rayBox(origin,direction,objectBox(object),remaining);
      if(distance!==null&&distance<=environment.distance+EPS&&(!best||distance<best.localDistance))best={kind:'object',id:object.id,localDistance:distance};
    }
    for(const item of world.interactables||[]) if(item.room===room&&condition(state,item.requires)&&!(item.hideFlag&&state.flags[item.hideFlag])) {
      const distance=raySphere(origin,direction,item.p,item.radius??.35);
      if(distance!==null&&distance<=environment.distance+EPS&&(!best||distance<best.localDistance))best={kind:'interactable',id:item.id,localDistance:distance};
    }
    if(best)return {kind:best.kind,id:best.id,distance:total+best.localDistance/metric,room};
    if(!environment.portal||hops===MAX_RAY_PORTALS||environment.distance>=remaining-EPS)return null;
    const dest=getPortal(world,environment.portal.to),transform=portalTransform(environment.portal,dest);
    total+=environment.distance/metric;
    remaining=(remaining-environment.distance)*transform.scale;
    origin=add(transform.point(add(origin,mul(direction,environment.distance))),mul(frame(dest).n,EPS*8));
    direction=normalize(transform.direction(direction));room=dest.room;metric*=transform.scale;
  }
  return null;
}

function heldPlacement(world,state,distance,side=1) {
  const player=state.player;
  const right=normalize(cross(player.forward,player.up),[1,0,0]);
  // Cast from the eye to the actual offset hand pose. Casting only along the
  // viewing ray then adding an offset afterward would place cubes through
  // aperture edges, walls or in the wrong room. The complete offset is part
  // of this ray and therefore transforms before the visitor when appropriate.
  const handOffset=mul(add(add(mul(player.forward,distance),mul(right,.37*side)),mul(player.up,-.32)),player.scale);
  let room=player.room,origin=[...player.p],direction=normalize(handOffset),remaining=length(handOffset);
  let size=(state.heldRatio||state.objects[state.held].size/player.scale)*player.scale;
  const endpoint=(limit)=> {
    const fits=travel=>bodyFits(world,state,room,cubeBody(add(origin,mul(direction,travel)),size),state.held);
    // Solve against the complete cube, not just its centre ray. Backing up by
    // a fixed amount fails at oblique walls and near the floor when looking
    // down. Search back along the physical hand path, then refine contact.
    if(fits(limit))return {room,p:add(origin,mul(direction,limit)),size};
    let high=limit;
    for(let i=1;i<=32;i++) {
      const low=limit*(1-i/32);
      if(fits(low)) {
        let a=low,b=high;
        for(let j=0;j<12;j++){const mid=(a+b)/2;if(fits(mid))a=mid;else b=mid;}
        return {room,p:add(origin,mul(direction,a)),size};
      }
      high=low;
    }
    return {room,p:add(origin,mul(direction,limit)),size};
  };
  for(let hop=0;hop<=MAX_RAY_PORTALS;hop++) {
    const hit=rayEnvironment(world,state,room,origin,direction,remaining);
    if(hit.portal&&hit.distance<remaining&&hop<MAX_RAY_PORTALS) {
      const destination=getPortal(world,hit.portal.to),transform=portalTransform(hit.portal,destination);
      // A held cube cannot enter an aperture narrower than itself.
      if(!apertureFits(hit.portal,cubeBody(add(origin,mul(direction,hit.distance)),size))) return {...endpoint(Math.max(0,hit.distance-size*.6)),preferAlternate:true};
      origin=add(transform.point(add(origin,mul(direction,hit.distance))),mul(frame(destination).n,EPS*8));
      direction=normalize(transform.direction(direction));remaining=(remaining-hit.distance)*transform.scale;size*=transform.scale;room=destination.room;
    } else return endpoint(Math.max(0,hit.blocked?Math.min(remaining,hit.distance):remaining));
  }
  return {room,p:origin,size};
}
function updateHeld(world,state) {
  const object=state.objects[state.held];if(!object)return;
  // In a tight corner the hand can tuck toward the centre or the opposite
  // side. Every alternative still uses the same portal-aware physical path.
  let fallback=null;
  for(const side of [1,.5,0,-.5,-1]) {
    const desired=heldPlacement(world,state,1.05+(state.heldRatio||.5)*.25,side);
    if(bodyFits(world,state,desired.room,cubeBody(desired.p,desired.size),object.id)) {
      const pose={room:desired.room,p:desired.p,size:desired.size,velocity:[0,0,0]};
      if(desired.preferAlternate){fallback ||= pose;continue;}
      Object.assign(object,pose);return;
    }
  }
  if(fallback)Object.assign(object,fallback);
}

export function pickUp(world,state,id) {
  if(state.held)return false;
  const hit=trace(world,state),object=state.objects[id];
  if(!object||object.socketed||state.flags[`socketed:${id}`]||hit?.kind!=='object'||hit.id!==id)return false;
  // A remotely grasped object follows the same scale transformation as the
  // player's reach. Move it into the hand via reverse portal mapping first.
  let apparentSize=object.size;
  if(object.room!==state.player.room) {
    let room=state.player.room,origin=state.player.p,direction=state.player.forward,remaining=2.5*state.player.scale,metric=1;
    for(let i=0;i<MAX_RAY_PORTALS&&room!==object.room;i++) {
      const env=rayEnvironment(world,state,room,origin,direction,remaining);if(!env.portal)break;
      const dest=getPortal(world,env.portal.to),t=portalTransform(env.portal,dest);
      origin=add(t.point(add(origin,mul(direction,env.distance))),mul(frame(dest).n,EPS*8));direction=normalize(t.direction(direction));remaining=(remaining-env.distance)*t.scale;metric*=t.scale;room=dest.room;
    }
    apparentSize=object.size/metric;
  }
  if(apparentSize>state.player.scale*(world.pickupMaxSize??1.3)) {event(state,'tooLarge',{id});return false;}
  state.held=id;state.heldRatio=apparentSize/state.player.scale;object.velocity=[0,0,0];
  updateHeld(world,state);event(state,'pickup',{id});return true;
}

export function drop(world,state) {
  const object=state.objects[state.held];if(!object)return false;
  const candidates=[{room:object.room,p:[...object.p],size:object.size}];
  for(const distance of [1.2,1.6,2,.8])candidates.push(heldPlacement(world,state,distance));
  const placement=candidates.find(candidate=>canPlaceObject(world,state,object,candidate.room,candidate.p,candidate.size) && (candidate.room!==state.player.room||!overlaps(playerBody(state.player),objectBox(candidate))));
  if(!placement){event(state,'dropBlocked',{id:object.id});return false;}
  Object.assign(object,placement,{velocity:[0,0,0]});state.held=null;delete state.heldRatio;
  event(state,'drop',{id:object.id,room:object.room});return true;
}

function stepObjects(world,state,dt) {
  for(const object of Object.values(state.objects)) {
    if(object.id===state.held||object.socketed||state.flags[`socketed:${object.id}`]||!condition(state,object.requires))continue;
    const room=getRoom(world,object.room);if(!room){resetObject(world,state,object.id);continue;}
    const up=cardinal(state.flags[`gravity:${room.id}`])||cardinal(room.gravity)||[0,1,0];
    const v=object.velocity||[0,0,0];object.velocity=add(v,mul(up,-13*dt));
    const delta=mul(object.velocity,dt),end=add(object.p,delta);
    const crossing=segmentPortal(world,state,object.room,object.p,end,p=>cubeBody(p,object.size));
    if(crossing?.open) {
      const dest=getPortal(world,crossing.portal.to),t=portalTransform(crossing.portal,dest),p=add(t.point(end),mul(frame(dest).n,EPS*8));
      if(bodyFits(world,state,dest.room,cubeBody(p,object.size*t.scale),object.id)) {
        object.p=p;object.room=dest.room;object.size*=t.scale;object.velocity=mul(t.direction(object.velocity),t.scale);continue;
      }
    }
    for(let axis=0;axis<3;axis++) {
      const candidate=[...object.p];candidate[axis]+=delta[axis];
      const can=p=>bodyFits(world,state,object.room,cubeBody(p,object.size),object.id)&&!crossesClosedPlane(world,state,object.room,object.p,p,p2=>cubeBody(p2,object.size));
      if(can(candidate))object.p=candidate;
      else {
        let low=0,high=1;
        for(let i=0;i<10;i++){const t=(low+high)/2,p=[...object.p];p[axis]+=delta[axis]*t;if(can(p))low=t;else high=t;}
        object.p[axis]+=delta[axis]*low;object.velocity[axis]=0;
      }
    }
    if(!vec(object.p)||length(object.p)>1e5)resetObject(world,state,object.id);
  }
}

export function step(world,state,input={},dt=1/60) {
  if(!finite(dt)||dt<=0)return state;
  dt=Math.min(dt,.1);state.elapsed+=dt;
  const count=Math.ceil(dt/(1/90)),slice=dt/count;
  for(let i=0;i<count;i++) {
    const player=state.player,flat=sub(player.forward,mul(player.up,dot(player.forward,player.up)));
    const forward=normalize(flat,Math.abs(player.up[2])<.5?[0,0,-1]:[0,-1,0]),right=normalize(cross(forward,player.up),[1,0,0]);
    let move=add(mul(forward,clamp(input.forward||0,-1,1)),mul(right,clamp(input.strafe||0,-1,1)));
    if(length(move)>1)move=normalize(move);
    const vertical=dot(player.velocity,player.up)-13*player.scale*slice;
    player.velocity=add(mul(move,(input.sprint?4.8:3)*player.scale),mul(player.up,vertical));
    movePlayer(world,state,mul(player.velocity,slice));
    stepObjects(world,state,slice);
    updateHeld(world,state);
  }
  if(!vec(state.player.p)||length(state.player.p)>1e5)recover(world,state);
  return state;
}

function rotateAround(v,axis,angle) {
  const c=Math.cos(angle),s=Math.sin(angle);
  return add(add(mul(v,c),mul(cross(axis,v),s)),mul(axis,dot(axis,v)*(1-c)));
}
export function look(state,yawDelta=0,pitchDelta=0) {
  if(!finite(yawDelta)||!finite(pitchDelta))return;
  const player=state.player;
  let forward=normalize(rotateAround(player.forward,player.up,-yawDelta));
  const pitch=Math.asin(clamp(dot(forward,player.up),-1,1));
  const next=clamp(pitch-pitchDelta,-Math.PI*.485,Math.PI*.485);
  const right=normalize(cross(forward,player.up),[1,0,0]);
  forward=rotateAround(forward,right,next-pitch);
  player.forward=normalize(forward);
}

export function setGravity(world,state,newUp) {
  const up=cardinal(newUp);if(!up)return false;
  const player=state.player;if(dot(player.up,up)>.999){state.flags[`gravity:${player.room}`]=[...up];return true;}
  // Keep body centre fixed while the eye rotates around it; shift to the
  // nearest valid body position if the new orientation touches a wall.
  const oldUp=player.up,center=playerBody(player).center,room=getRoom(world,player.room);
  const desired=add(center,mul(up,.7*player.scale));
  let axis=cross(oldUp,up),angle=Math.acos(clamp(dot(oldUp,up),-1,1));
  if(length(axis)<EPS)axis=normalize(cross(oldUp,player.forward),[1,0,0]);else axis=normalize(axis);
  const proposed={...player,up,p:desired,forward:normalize(rotateAround(player.forward,axis,angle)),velocity:[0,0,0]};
  const body=playerBody(proposed);
  for(let i=0;i<3;i++) {
    const low=room.bounds.min[i]+body.extents[i],high=room.bounds.max[i]-body.extents[i];
    const shift=clamp(body.center[i],low,high)-body.center[i];proposed.p[i]+=shift;
  }
  if(!bodyFits(world,state,room.id,playerBody(proposed))) {
    let found=null;
    for(const distance of [.3,.6,1,1.5,2]) for(const direction of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
      const test={...proposed,p:add(proposed.p,mul(direction,distance*player.scale))};
      if(bodyFits(world,state,room.id,playerBody(test))){found=test;break;}
    }
    if(!found){event(state,'gravityBlocked');return false;}
    Object.assign(proposed,found);
  }
  Object.assign(player,proposed);state.flags[`gravity:${room.id}`]=[...up];updateHeld(world,state);
  event(state,'gravity',{room:room.id,up:[...up]});return true;
}

export function resetObject(world,state,id) {
  const authored=(world.objects||[]).find(object=>object.id===id);if(!authored)return false;
  const object=state.objects[id],home=authored.home||{room:authored.room,p:authored.p,size:authored.size};
  Object.assign(object,{room:home.room,p:[...home.p],size:home.size,velocity:[0,0,0]});
  if(state.held===id){state.held=null;delete state.heldRatio;}return true;
}
export function recover(world,state) {
  const room=getRoom(world,state.checkpoint)||getRoom(world,world.startRoom)||world.rooms[0];
  for(const object of Object.values(state.objects)) if(!object.socketed&&!state.flags[`socketed:${object.id}`])resetObject(world,state,object.id);
  const spawn=room.spawn;
  state.player={room:room.id,p:[...spawn.p],forward:normalize(spawn.forward||[0,0,-1]),up:cardinal(spawn.up)||[0,1,0],velocity:[0,0,0],scale:spawn.scale||1};
  // Recovery is a safety net even if a released cube was left on the landing.
  for(const object of Object.values(state.objects)) if(object.room===room.id&&overlaps(playerBody(state.player),objectBox(object)))resetObject(world,state,object.id);
  state.flags[`gravity:${room.id}`]=[...state.player.up];
  event(state,'recovery',{room:room.id});return state;
}

export function serialize(state) {
  const {events,...saved}=state;return JSON.stringify(saved);
}
function safeFlag(value,depth=0) {
  if(depth>4)return undefined;
  if(typeof value==='boolean'||typeof value==='string'&&value.length<=10000||finite(value)||value===null)return value;
  if(Array.isArray(value)&&value.length<=100)return value.map(v=>safeFlag(v,depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>k.length<128&&!['__proto__','constructor','prototype'].includes(k)).slice(0,100).map(([k,v])=>[k,safeFlag(v,depth+1)]));
  return undefined;
}
export function restore(world,string) {
  const state=createState(world);let saved;
  try{if(typeof string!=='string'||string.length>2e6)return state;saved=JSON.parse(string);}catch{return state;}
  if(!saved||saved.version!==1||typeof saved!=='object')return state;
  if(saved.flags&&typeof saved.flags==='object'&&!Array.isArray(saved.flags))state.flags=safeFlag(saved.flags)||{};
  state.solved=Array.isArray(saved.solved)?[...new Set(saved.solved.filter(v=>typeof v==='string'&&v.length<=128||Number.isInteger(v)&&v>=0&&v<=100))].slice(0,100):[];
  state.journal=Array.isArray(saved.journal)?saved.journal.slice(0,200).map(v=>safeFlag(v)).filter(v=>v!==undefined):[];
  state.elapsed=finite(saved.elapsed)&&saved.elapsed>=0?Math.min(saved.elapsed,1e9):0;
  if(getRoom(world,saved.checkpoint))state.checkpoint=saved.checkpoint;
  state.hints=saved.hints&&typeof saved.hints==='object'?Object.fromEntries(Object.entries(saved.hints).filter(([key,value])=>/^\d{1,3}$/.test(key)&&Number.isInteger(value)&&value>=0&&value<=3)):{};
  state.visited=Array.isArray(saved.visited)?[...new Set(saved.visited.filter(id=>getRoom(world,id)))]:[world.startRoom];
  for(const [id,object] of Object.entries(state.objects)) {
    const candidate=saved.objects?.[id];
    if(candidate&&getRoom(world,candidate.room)&&vec(candidate.p)&&finite(candidate.size)&&candidate.size>=1e-4&&candidate.size<=1e4) {
      Object.assign(object,{room:candidate.room,p:[...candidate.p],size:candidate.size,velocity:vec(candidate.velocity)&&length(candidate.velocity)<1e4?[...candidate.velocity]:[0,0,0]});
      if(candidate.socketed===true)object.socketed=true;
      if(typeof candidate.socket==='string'&&(world.interactables||[]).some(item=>item.id===candidate.socket))object.socket=candidate.socket;
      if(!bodyFits(world,state,object.room,cubeBody(object.p,object.size),id,false))resetObject(world,state,id);
    }
  }
  const p=saved.player;
  if(p&&getRoom(world,p.room)&&vec(p.p)&&vec(p.forward)&&length(p.forward)>EPS&&cardinal(p.up)&&finite(p.scale)&&p.scale>=(world.minScale??.0625)-EPS&&p.scale<=(world.maxScale??4)+EPS) {
    state.player={room:p.room,p:[...p.p],forward:normalize(p.forward),up:cardinal(p.up),velocity:vec(p.velocity)&&length(p.velocity)<1e4?[...p.velocity]:[0,0,0],scale:p.scale};
    if(Math.abs(dot(state.player.forward,state.player.up))>.999)state.player.forward=normalize(cross(state.player.up,Math.abs(state.player.up[0])<.5?[1,0,0]:[0,0,1]));
    if(!bodyFits(world,state,p.room,playerBody(state.player),null,false))recover(world,state);
  }
  if(typeof saved.held==='string'&&state.objects[saved.held]) {
    const object=state.objects[saved.held];
    state.held=saved.held;state.heldRatio=finite(saved.heldRatio)&&saved.heldRatio>0&&saved.heldRatio<=20?saved.heldRatio:object.size/state.player.scale;
    updateHeld(world,state);
  }
  state.events=[];return state;
}
