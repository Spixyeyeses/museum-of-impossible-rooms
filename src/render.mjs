import * as THREE from '../vendor/three.module.js';
import {condition,portalTransform} from './engine.mjs';

const V=a=>new THREE.Vector3(...a);
const palette={wall:0xc6c6ba,floor:0x273d43,ceiling:0x172c34,brass:0xb99452,ink:0x10232c};
const unitBox=new THREE.BoxGeometry(1,1,1);
const unitPlane=new THREE.PlaneGeometry(1,1);

export class MuseumRenderer {
  constructor(canvas,world,state,settings={}) {
    this.world=world;this.state=state;this.settings=settings;this.rooms=new Map();this.targets=[];this.frame=0;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',stencil:false});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,settings.quality==='low'?1:1.5));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;
    this.renderer.localClippingEnabled=true;this.objectGhosts=new Map();
    this.camera=new THREE.PerspectiveCamera(settings.fov||72,1,.025,160);
    this.camera.position.set(0,1.6,7);
    this.up=V(state.player.up);this.displayRoom=state.player.room;
    this.labelCache=new Map();this.materials=new Map();
    this.study=new THREE.TextureLoader().load('assets/curators-study.png');this.study.colorSpace=THREE.SRGBColorSpace;this.study.anisotropy=4;
    const env=new THREE.Scene();env.background=new THREE.Color(0x778d89);
    const panel=new THREE.MeshBasicMaterial({color:0xf5ecdc});this.box(env,[0,5,0],[12,.05,12],panel);this.box(env,[-5,0,0],[.05,8,8],panel);
    const pmrem=new THREE.PMREMGenerator(this.renderer);this.environment=pmrem.fromScene(env,.06,.1,100).texture;pmrem.dispose();
    const grain=new Uint8Array(128*128*4);let seed=49291;for(let i=0;i<128*128;i++){seed=(seed*1664525+1013904223)>>>0;const v=126+((seed>>>24)%19);grain[i*4]=grain[i*4+1]=grain[i*4+2]=v;grain[i*4+3]=255;}
    this.stone=new THREE.DataTexture(grain,128,128,THREE.RGBAFormat);this.stone.wrapS=this.stone.wrapT=THREE.RepeatWrapping;this.stone.repeat.set(8,8);this.stone.needsUpdate=true;
    const sc=document.createElement('canvas');sc.width=sc.height=128;const sx=sc.getContext('2d'),sg=sx.createRadialGradient(64,64,4,64,64,62);sg.addColorStop(0,'rgba(0,8,13,.5)');sg.addColorStop(.4,'rgba(0,8,13,.24)');sg.addColorStop(1,'rgba(0,8,13,0)');sx.fillStyle=sg;sx.fillRect(0,0,128,128);this.shadowTexture=new THREE.CanvasTexture(sc);
    for(const room of world.rooms)this.buildRoom(room);
    this.resize();this.metrics={passes:0,triangles:0,calls:0};
    this.debug=false;
  }
  mat(color,extra={}) {return new THREE.MeshStandardMaterial({color,roughness:.78,metalness:.08,...extra});}
  shadow(scene,p,w=2,d=w){return this.plane(scene,[p[0],.025,p[2]],[w,d],[0,1,0],[0,0,-1],new THREE.MeshBasicMaterial({map:this.shadowTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));}
  box(scene,pos,size,material){const m=new THREE.Mesh(unitBox,material);m.position.fromArray(pos);m.scale.fromArray(size);scene.add(m);return m;}
  plane(scene,pos,size,normal,up,material){const m=new THREE.Mesh(unitPlane,material);m.position.fromArray(pos);m.scale.set(size[0],size[1],1);m.quaternion.copy(this.frameQuat(normal,up));scene.add(m);return m;}
  frameQuat(normal,up){let n=V(normal),u=V(up),r=new THREE.Vector3().crossVectors(u,n);return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(r,u,n));}
  textTexture(text,sub='',color='#e6d7b1',bg='#12272e') {
    const key=[text,sub,color,bg].join('|');if(this.labelCache.has(key))return this.labelCache.get(key);
    const c=document.createElement('canvas');c.width=1024;c.height=256;const x=c.getContext('2d');x.fillStyle=bg;x.fillRect(0,0,c.width,c.height);x.fillStyle=color;x.textAlign='center';
    x.font='40px Georgia';x.fillText(text,512,sub?115:143,940);if(sub){x.font='21px sans-serif';x.fillStyle='#aaa995';x.fillText(sub.toUpperCase(),512,177,940);}
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;this.labelCache.set(key,t);return t;
  }
  label(scene,text,sub,p,w=3,normal=[0,0,1],up=[0,1,0]) {return this.plane(scene,p,[w,w/4],normal,up,new THREE.MeshBasicMaterial({map:this.textTexture(text,sub),side:THREE.DoubleSide}));}
  painting(scene,p,width,normal=[0,0,1],up=[0,1,0]){const g=new THREE.Group();g.position.fromArray(p);g.quaternion.copy(this.frameQuat(normal,up));scene.add(g);const h=width/1.5,frame=this.mat(palette.brass,{metalness:.6,roughness:.34});this.box(g,[0,0,0],[width+.22,h+.22,.1],frame);this.plane(g,[0,0,.062],[width,h],[0,0,1],[0,1,0],new THREE.MeshBasicMaterial({map:this.study,color:0xe3ddc8}));this.label(g,'Study for an unfinished museum','Iona Vale · Lithograph',[0,-h/2-.25,.04],Math.min(width,3));}
  buildRoom(room){
    const scene=new THREE.Scene();const atmosphere=room.openSky?0xb6d0d7:(room.fog||0x142a33);scene.background=new THREE.Color(atmosphere);scene.fog=new THREE.Fog(atmosphere,Math.max(24,room.bounds.max[2]*2),120);
    const record={scene,room,portals:[],dynamic:[],objects:new Map(),interactables:new Map(),decor:[]};this.rooms.set(room.id,record);
    scene.environment=this.environment;scene.environmentIntensity=.6;
    const wall=this.mat(room.wall||palette.wall,{bumpMap:this.stone,bumpScale:.016}),floor=this.mat(room.floor||palette.floor,{roughness:.38,metalness:.26,bumpMap:this.stone,bumpScale:.014}),ceiling=this.mat(palette.ceiling),brass=this.mat(palette.brass,{metalness:.68,roughness:.32}),dark=this.mat(palette.ink);
    const {min,max}=room.bounds;
    // Six surfaces are partitioned around real aperture rectangles. No hidden corridor geometry.
    for(let axis=0;axis<3;axis++)for(const side of [-1,1]){
      if(room.openSky&&axis===1&&side===1)continue;
      const value=side<0?min[axis]:max[axis],a=(axis+1)%3,b=(axis+2)%3;
      const apertures=this.world.portals.filter(p=>p.room===room.id&&Math.abs(p.center[axis]-value)<.06&&Math.abs(p.normal[axis])>.9);
      const holes=apertures.map(p=>{const r=V(p.up).cross(V(p.normal));return {lo:[p.center[a]-Math.abs(r.getComponent(a))*p.width/2-Math.abs(p.up[a])*p.height/2,p.center[b]-Math.abs(r.getComponent(b))*p.width/2-Math.abs(p.up[b])*p.height/2],hi:[p.center[a]+Math.abs(r.getComponent(a))*p.width/2+Math.abs(p.up[a])*p.height/2,p.center[b]+Math.abs(r.getComponent(b))*p.width/2+Math.abs(p.up[b])*p.height/2]};});
      const aa=[min[a],max[a],...holes.flatMap(h=>[h.lo[0],h.hi[0]])].sort((x,y)=>x-y),bb=[min[b],max[b],...holes.flatMap(h=>[h.lo[1],h.hi[1]])].sort((x,y)=>x-y);
      for(let i=0;i<aa.length-1;i++)for(let j=0;j<bb.length-1;j++){
        if(aa[i+1]-aa[i]<.001||bb[j+1]-bb[j]<.001)continue;
        const ac=(aa[i]+aa[i+1])/2,bc=(bb[j]+bb[j+1])/2;if(holes.some(h=>ac>h.lo[0]&&ac<h.hi[0]&&bc>h.lo[1]&&bc<h.hi[1]))continue;
        const pos=[0,0,0],size=[0,0,0];pos[axis]=value+side*.12;pos[a]=ac;pos[b]=bc;size[axis]=.24;size[a]=aa[i+1]-aa[i];size[b]=bb[j+1]-bb[j];this.box(scene,pos,size,axis===1?(side<0?floor:ceiling):wall);
      }
    }
    scene.add(new THREE.HemisphereLight(room.openSky?0xe4f3ff:0xe6efff,room.openSky?0x718a79:0x274750,room.openSky?2.7:2.05));
    const sun=new THREE.DirectionalLight(0xffe3b2,2.7);sun.position.set(-5,15,8);scene.add(sun);
    const fill=new THREE.PointLight(room.accent||0x8fccc1,35,38,2);fill.position.set(0,Math.min(max[1]-1,7),0);scene.add(fill);
    // Brass inlaid floor grid, ceiling coffers and architectural pilasters.
    for(let x=Math.ceil(min[0]/3)*3;x<max[0];x+=3)this.box(scene,[x,.013,(min[2]+max[2])/2],[.017,.012,max[2]-min[2]],brass);
    for(let z=Math.ceil(min[2]/3)*3;z<max[2];z+=3)this.box(scene,[(min[0]+max[0])/2,.013,z],[max[0]-min[0],.012,.017],brass);
    for(let z=min[2]+2;z<max[2];z+=4){
      for(const side of [-1,1]){const x=side<0?min[0]:max[0];const nearDoor=this.world.portals.some(p=>p.room===room.id&&Math.abs(p.center[0]-x)<.1&&Math.abs(p.center[2]-z)<p.width/2+.45);if(!nearDoor)this.box(scene,[x-side*.012,max[1]/2,z],[.025,max[1],.35],dark);}
      if(!room.openSky)this.box(scene,[(min[0]+max[0])/2,max[1]-.13,z],[max[0]-min[0],.24,.24],brass);
    }
    const lightMat=new THREE.MeshBasicMaterial({color:0xffedbd});
    if(!room.openSky)this.box(scene,[(min[0]+max[0])/2,max[1]-.18,(min[2]+max[2])/2],[Math.min(3,(max[0]-min[0])*.3),.07,Math.max(2,(max[2]-min[2])*.6)],lightMat);
    for(const solid of room.solids||[]){const p=solid.min.map((v,i)=>(v+solid.max[i])/2),s=solid.min.map((v,i)=>solid.max[i]-v);if(solid.invisible)continue;const m=this.box(scene,p,s,solid.material==='glass'?this.mat(0x8aacac,{transparent:true,opacity:.23,metalness:.3,depthWrite:false}):wall);record.dynamic.push({mesh:m,requires:solid.requires});if(solid.min[1]<.1&&s[0]<8&&s[2]<8)this.shadow(scene,p,s[0]*1.7,s[2]*1.7);}
    for(const portal of this.world.portals.filter(p=>p.room===room.id)){
      if(portal.hideInactive&&!this.world.portals.some(q=>q.room===room.id&&q.id!==portal.id&&V(q.center).distanceTo(V(portal.center))<.01)){
        const cover=this.plane(scene,V(portal.center).addScaledVector(V(portal.normal),.003).toArray(),[portal.width,portal.height],portal.normal,portal.up,wall);record.dynamic.push({mesh:cover,requires:{not:portal.requires}});
      }
      const group=new THREE.Group();group.position.fromArray(portal.center);group.quaternion.copy(this.frameQuat(portal.normal,portal.up));scene.add(group);
      for(const x of [-1,1])this.box(group,[x*(portal.width/2+.09),0,.04],[.18,portal.height+.36,.23],brass);
      for(const y of [-1,1])this.box(group,[0,y*(portal.height/2+.09),.04],[portal.width,.18,.23],brass);
      const material=new THREE.ShaderMaterial({uniforms:{view:{value:null},resolution:{value:new THREE.Vector2(1,1)},live:{value:0},tint:{value:new THREE.Color(room.accent||0x71b8b0)}},vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform sampler2D view; uniform vec2 resolution; uniform float live; uniform vec3 tint; void main(){vec2 uv=gl_FragCoord.xy/resolution; if(live>.5){gl_FragColor=texture2D(view,uv);}else{gl_FragColor=vec4(mix(vec3(.035,.068,.077),tint*.17,clamp(uv.y,0.,1.)),1.);}\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',side:THREE.FrontSide,toneMapped:true});
      const surface=new THREE.Mesh(new THREE.PlaneGeometry(portal.width,portal.height),material);group.add(surface);
      const badge=this.label(group,portal.label||'PASSAGE',portal.subtitle||'', [0,portal.height/2+.46,.06],Math.min(3.6,portal.width+1));
      record.portals.push({portal,group,surface,material,badge});
    }
    for(const object of this.world.objects.filter(o=>o.room===room.id))this.addObject(object);
    for(const item of this.world.interactables.filter(o=>o.room===room.id)){
      const g=new THREE.Group();g.position.fromArray(item.p);scene.add(g);const color=item.color||room.accent||0x83c5b9;
      if(item.type==='socket'){
        const k=(item.acceptSize||.8)/.8;this.box(g,[0,-.5*k,0],[1.12*k,k,1.12*k],dark);this.box(g,[0,.03*k,0],[1.18*k,.06*k,1.18*k],brass);this.shadow(scene,item.p,2*k);
        const ring=new THREE.Mesh(new THREE.TorusGeometry((item.acceptSize||.65)*.7,.025,8,4),new THREE.MeshBasicMaterial({color}));ring.rotation.set(Math.PI/2,0,Math.PI/4);ring.position.y=.085;g.add(ring);
      }else if(item.type==='note'||item.type==='lore'){
        this.box(g,[0,-.42,0],[.65,.85,.5],dark);this.label(g,item.title||'Curator’s note','E · READ',[0,.1,.28],1.2);
      }else if(item.type==='gravity'){
        const mountedUp=item.up||[0,1,0],wallAxis=mountedUp.findIndex(v=>Math.abs(v)>.5);
        const support=wallAxis>=0?(mountedUp[wallAxis]<0?max[wallAxis]:min[wallAxis]):0;
        if(wallAxis!==1&&Math.abs(item.p[wallAxis]-support)<1.7)g.quaternion.copy(this.frameQuat([0,0,1],mountedUp));
        const ring=new THREE.Mesh(new THREE.TorusGeometry(.44,.055,12,48),brass);g.add(ring);this.box(g,[0,0,0],[.07,.7,.07],lightMat);this.box(g,[0,-.6,0],[.5,.5,.5],dark);
      }else if(item.type==='align'){
        // The authored mark is an eye position. Project it onto its own floor,
        // including the east-wall floor, rather than onto global y=0.
        const floorUp=item.up||[0,1,0],foot=V(floorUp).multiplyScalar(-1.6+.025);
        const ring=new THREE.Mesh(new THREE.RingGeometry(.5,.53,64),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));ring.quaternion.copy(this.frameQuat(floorUp,[0,0,-1]));ring.position.copy(foot);g.add(ring);
        const marker=this.label(g,'STAND HERE','Hold your gaze',foot.clone().addScaledVector(V(floorUp),.008).toArray(),.84,floorUp,[0,0,-1]);
      }else if(item.type==='finish'){
        const paper=this.mat(0xe9dfbc,{roughness:.95}),leather=this.mat(0x31453b);
        this.box(g,[0,0,0],[1.8,.12,.9],brass);
        for(const x of [-.68,.68])for(const z of [-.3,.3])this.box(g,[x,-.56,z],[.07,1.12,.07],dark);
        this.box(g,[0,.085,0],[.98,.035,.64],leather);
        for(const side of [-1,1]){const page=this.box(g,[side*.225,.115,0],[.44,.03,.59],paper);page.rotation.z=side*.035;for(let row=0;row<5;row++)this.box(g,[side*.225,.137,-.18+row*.07],[.28,.004,.009],dark);}
        this.box(g,[.68,.1,.08],[.018,.018,.48],dark);
      }else if(item.type==='memory'){
        const art=new THREE.Mesh(new THREE.OctahedronGeometry(.38),this.mat(color,{metalness:.75,roughness:.18,emissive:color,emissiveIntensity:.2}));g.add(art);record.decor.push({mesh:art,base:0,spin:true});this.box(g,[0,-.72,0],[.6,.65,.6],dark);
      }else {this.box(g,[0,-.4,0],[.65,.8,.65],dark);this.box(g,[0,.03,0],[.5,.08,.5],brass);}
      if(!['note','lore','align'].includes(item.type)){const k=item.type==='socket'?(item.acceptSize||.8)/.8:1;this.label(g,item.label,'E · INTERACT',[0,-.18*k,.6*k],1.8*k);}
      record.interactables.set(item.id,{mesh:g,item});
    }
    // Exhibits are tangible sculptural constructions of the spatial rule.
    for(const art of room.art||[]){
      const g=new THREE.Group();g.position.fromArray(art.p||[0,2,0]);scene.add(g);if(art.requires)record.dynamic.push({mesh:g,requires:art.requires});
      if(art.kind==='rings')for(let i=0;i<3;i++){const m=new THREE.Mesh(new THREE.TorusGeometry((art.size||1.3)*(1+i*.18),.025,8,96),brass);m.rotation.set(i*.8,i*.6,i*.2);g.add(m);}
      else if(art.kind==='stairs')for(let i=0;i<10;i++){const angle=i*Math.PI/5;this.box(g,[Math.cos(angle)*1.5,i*.17,Math.sin(angle)*1.5],[.8,.13,.8],brass);}
      else if(art.kind==='frame'||art.kind==='partialFrame'){
        const width=art.width||(art.size||1)*2,height=art.height||(art.size||1)*2;
        const sides=art.kind==='partialFrame'?[art.side==='right'?1:-1]:[-1,1];
        for(const side of sides){this.box(g,[side*width/2,0,0],[.055,height,.055],brass);for(const edge of [-1,1])this.box(g,[side*width/4,edge*height/2,0],[width/2,.055,.055],brass);}
      }
      else {const m=new THREE.Mesh(new THREE.IcosahedronGeometry(art.size||.8,0),this.mat(room.accent||0x5ab7ad,{metalness:.6,roughness:.27}));g.add(m);}
      if(art.rotate)g.rotation.fromArray(art.rotate);
      if(art.up)g.quaternion.copy(this.frameQuat(art.normal||[0,0,1],art.up));
      record.decor.push({mesh:g,base:g.position.y,spin:!!art.spin});
    }
    if(room.titleWall!==false)this.label(scene,room.name,room.subtitle||'',[(min[0]+max[0])/2,max[1]-.9,min[2]+.04],Math.min(7,max[0]-min[0]-2));
    if(room.id==='hub'){
      record.indexes=[];
      for(let i=0;i<10;i++){const side=i<5?-1:1,x=side*(4.3+(i%5)*2.65);const group=new THREE.Group();group.position.set(x,1.15,min[2]+.07);group.scale.setScalar(.75);scene.add(group);this.box(group,[0,0,0],[1.7,2.3,.08],dark);const plateMat=this.mat(0x425b60,{metalness:.65,roughness:.25});this.box(group,[0,.2,.07],[1.15,1.35,.055],plateMat);this.label(group,String(i+1).padStart(2,'0'),'', [0,-.79,.13],1.15);record.indexes.push({mat:plateMat,index:i+1});}
      this.painting(scene,[-9,5.2,min[2]+.08],7.6);
      const schema=new THREE.Group();schema.position.set(9,5.1,min[2]+.04);scene.add(schema);this.box(schema,[0,0,0],[7.6,4.5,.05],dark);for(let i=0;i<3;i++){const g=new THREE.Group();g.position.set((i-1)*2.1,0,.07);schema.add(g);for(const x of [-1,1])this.box(g,[x*.6,0,0],[.035,2.4,.04],brass);for(const y of [-1,1])this.box(g,[0,y*1.2,0],[1.2,.035,.04],brass);this.label(g,['SPACE','VIEW','MEASURE'][i],'',[0,-1.6,.03],1.6);}
      this.label(scene,'A way out is still being written','NINE DISCOVERIES WILL GIVE IT A DOOR',[0,5.8,min[2]+.06],8);
      for(const side of [-1,1])for(let i=0;i<3;i++){const y=4.3+i*.75;const m=this.box(scene,[side*(3.5-i*.7),y,-10-i*2],[.08,.65,.08],brass);record.dynamic.push({mesh:m,requires:`solved:${(i+1)*3}`});}
    }
    if(room.id==='c1-gallery')this.painting(scene,[-5.94,3.4,-3],4.8,[1,0,0]);
    if(room.id==='c2')this.painting(scene,[-9.94,3.7,3],5.4,[1,0,0]);
    if(room.id==='c9-record')this.painting(scene,[5.94,3.5,-2],4.5,[-1,0,0]);
    if(room.openSky)this.buildCourtyard(scene,room,brass,dark);
  }

  buildCourtyard(scene,room,brass,dark){
    const stone=this.mat(0xbfc6b2),wood=this.mat(0x778a72),leaf=this.mat(0x728e6b),earth=this.mat(0x34483e),porcelain=this.mat(0xf4ecd7,{roughness:.32});
    // Morning is visibly outside: open sky, distant clouds, garden beds, and a
    // table set for two. The ledger itself is the final usable interaction.
    const sun=new THREE.Mesh(new THREE.SphereGeometry(3,16,12),new THREE.MeshBasicMaterial({color:0xfff2c9}));sun.position.set(-26,52,-46);scene.add(sun);
    for(const [x,y,z,s]of [[-26,29,-60,1],[30,37,-70,1.3],[44,28,12,.8]]){const cloud=new THREE.Mesh(new THREE.SphereGeometry(1,16,8),new THREE.MeshBasicMaterial({color:0xdce9e6}));cloud.position.set(x,y,z);cloud.scale.set(13*s,1.4*s,3*s);scene.add(cloud);}
    for(const x of [-9,9]){
      this.box(scene,[x,.23,-3],[2,.46,9],stone);this.box(scene,[x,.47,-3],[1.75,.025,8.7],earth);
      for(const z of [-6,-3,0]){const shrub=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),leaf);shrub.position.set(x,1.12,z);shrub.scale.set(.8,.8,.9);scene.add(shrub);}
    }
    const table=new THREE.Group();table.position.set(-4,0,2);scene.add(table);
    this.box(table,[0,.78,0],[1.2,.08,1.05],stone);this.box(table,[0,.38,0],[.2,.76,.2],dark);this.box(table,[0,.055,0],[.7,.11,.7],dark);
    for(const side of [-1,1]){
      const chair=new THREE.Group();chair.position.set(-4+side*1.15,0,2);chair.rotation.y=side*Math.PI/2;scene.add(chair);
      this.box(chair,[0,.48,0],[.72,.09,.7],wood);this.box(chair,[0,.9,.31],[.72,.76,.08],wood);
      for(const x of [-.28,.28])for(const z of [-.26,.26])this.box(chair,[x,.24,z],[.065,.48,.065],brass);
      const cup=new THREE.Mesh(new THREE.CylinderGeometry(.12,.09,.17,16),porcelain);cup.position.set(-4+side*.31,.905,2);scene.add(cup);
      const tea=new THREE.Mesh(new THREE.CircleGeometry(.104,16),this.mat(0x725d38));tea.rotation.x=-Math.PI/2;tea.position.set(-4+side*.31,.994,2);scene.add(tea);
      const handle=new THREE.Mesh(new THREE.TorusGeometry(.065,.018,6,14),porcelain);handle.position.set(-4+side*.43,.92,2);scene.add(handle);
    }
  }
  addObject(object){
    for(const r of this.rooms.values())if(r.objects.has(object.id))return;
    const g=new THREE.Group();const m=new THREE.Mesh(unitBox,this.mat(object.color||0xd5ad61,{metalness:.6,roughness:.28}));g.add(m);
    const edge=new THREE.LineSegments(new THREE.EdgesGeometry(unitBox),new THREE.LineBasicMaterial({color:0xffe6ad}));edge.scale.setScalar(1.01);g.add(edge);
    const r=this.rooms.get(object.room);if(r){r.scene.add(g);r.objects.set(object.id,g);}
  }
  resize(){const w=innerWidth,h=innerHeight;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();const s=this.renderer.getDrawingBufferSize(new THREE.Vector2());this.size=s;const factor=Math.min(this.settings.quality==='low'?.65:.85,1280/s.x,900/s.y);this.targetSize=new THREE.Vector2(Math.round(s.x*factor),Math.round(s.y*factor));for(const t of this.targets)t.setSize(this.targetSize.x,this.targetSize.y);}
  getTarget(index){if(!this.targets[index]){const t=new THREE.WebGLRenderTarget(this.targetSize.x,this.targetSize.y,{depthBuffer:true,stencilBuffer:false,type:THREE.UnsignedByteType});t.texture.colorSpace=THREE.SRGBColorSpace;this.targets[index]=t;}return this.targets[index];}
  sync(dt){
    const player=this.state.player;
    const desired=V(player.up);if(this.displayRoom!==player.room||this.settings.reducedMotion){this.up.copy(desired);this.displayRoom=player.room;}else this.up.lerp(desired,1-Math.exp(-dt*7)).normalize();
    this.camera.position.fromArray(player.p);this.camera.up.copy(this.up);this.camera.near=Math.max(.0002,.025*player.scale);
    for(const p of this.world.portals){if(p.room!==player.room||!condition(this.state,p.requires))continue;const delta=this.camera.position.clone().sub(V(p.center)),n=V(p.normal);let d=delta.dot(n);if(Math.abs(delta.dot(V(p.up)))<p.height/2&&Math.abs(delta.dot(V(p.up).cross(n)))<p.width/2){
      // Ordinary steps can land exactly on a boundary (including a negative
      // floating-point epsilon). Stabilize only the render eye by half a
      // millimetre at visitor scale so the aperture never has zero clip W.
      const minimum=.0005*player.scale;if(Math.abs(d)<minimum){this.camera.position.addScaledVector(n,minimum-d);d=minimum;}
      if(d>0&&d<this.camera.near*2)this.camera.near=Math.max(.000001,d*.2);
    }}
    this.camera.lookAt(this.camera.position.clone().add(V(player.forward)));
    this.camera.far=160*Math.max(1,player.scale);this.camera.fov=this.settings.fov||72;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);
    for(const r of this.rooms.values()){
      for(const index of r.indexes||[]){const done=this.state.solved.includes(index.index);index.mat.color.set(done?0xd8ba75:0x425b60);index.mat.emissive.set(done?0x735725:0x000000);index.mat.emissiveIntensity=done?.38:0;}
      for(const d of r.dynamic)d.mesh.visible=condition(this.state,d.requires);
      for(const {mesh,item} of r.interactables.values())mesh.visible=condition(this.state,item.requires)&&!(item.hideFlag&&this.state.flags[item.hideFlag]);
      for(const d of r.decor)if(d.spin&&!this.settings.reducedMotion){d.mesh.rotation.y+=dt*.15;d.mesh.position.y=d.base+Math.sin(this.frame*.006)*.06;}
    }
    for(const proxy of this.objectGhosts.values())proxy.visible=false;
    for(const [id,o] of Object.entries(this.state.objects)){
      let mesh,old;for(const r of this.rooms.values())if(r.objects.has(id)){mesh=r.objects.get(id);old=r;break;}if(!mesh)continue;
      let room=o.room,p=o.p,size=o.size;
      const dest=this.rooms.get(room);if(dest&&dest!==old){old.objects.delete(id);dest.objects.set(id,mesh);dest.scene.add(mesh);}
      mesh.visible=!o.consumed;mesh.position.fromArray(p);mesh.scale.setScalar(size);mesh.rotation.y=0;
      mesh.traverse(child=>{if(child.material)child.material.clippingPlanes=null;});
      // A carried weight can straddle a boundary before its carrier. Clip and
      // draw a transformed counterpart, using the simulation's authoritative pose.
      for(const source of this.world.portals){if(source.room!==room||!condition(this.state,source.requires))continue;const target=this.world.portals.find(q=>q.id===source.to);if(!target||!condition(this.state,target.requires))continue;
        const delta=V(p).sub(V(source.center)),normal=V(source.normal),right=V(source.up).cross(normal);if(Math.abs(delta.dot(normal))>size*.51||Math.abs(delta.dot(right))>source.width/2+size/2||Math.abs(delta.dot(V(source.up)))>source.height/2+size/2)continue;
        const key=`${id}:${source.id}`,tr=portalTransform(source,target);let ghost=this.objectGhosts.get(key);if(!ghost){ghost=mesh.clone(true);ghost.traverse(child=>{if(child.material)child.material=child.material.clone();});this.rooms.get(target.room).scene.add(ghost);this.objectGhosts.set(key,ghost);}ghost.visible=true;ghost.position.fromArray(tr.point(p));ghost.scale.setScalar(size*tr.scale);
        const sourcePlane=new THREE.Plane(normal,-normal.dot(V(source.center))),dn=V(target.normal),destPlane=new THREE.Plane(dn,-dn.dot(V(target.center)));mesh.traverse(child=>{if(child.material)child.material.clippingPlanes=[sourcePlane];});ghost.traverse(child=>{if(child.material)child.material.clippingPlanes=[destPlane];});break;
      }
    }
  }
  portalVisible(p,camera){
    const n=V(p.normal),center=V(p.center);if(camera.position.clone().sub(center).dot(n)<-.03)return false;
    // A portal's centre can be far off-screen while its aperture fills the
    // screen at the crossing plane. Test its full bounds against the frustum.
    const r=V(p.up).cross(n),half=new THREE.Vector3(Math.abs(r.x)*p.width/2+Math.abs(p.up[0])*p.height/2+.002,Math.abs(r.y)*p.width/2+Math.abs(p.up[1])*p.height/2+.002,Math.abs(r.z)*p.width/2+Math.abs(p.up[2])*p.height/2+.002);
    const box=new THREE.Box3(center.clone().sub(half),center.clone().add(half));const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));return frustum.intersectsBox(box);
  }
  virtualCamera(camera,source,dest){
    const tr=portalTransform(source,dest),c=new THREE.PerspectiveCamera();c.copy(camera,false);c.position.fromArray(tr.point(camera.position.toArray()));
    const f=camera.getWorldDirection(new THREE.Vector3());const u=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
    c.up.fromArray(tr.direction(u.toArray()));c.lookAt(c.position.clone().add(V(tr.direction(f.toArray()))));c.near=camera.near*tr.scale;c.far=camera.far*tr.scale;c.updateProjectionMatrix();c.updateMatrixWorld(true);
    // The destination plane is the virtual near clip plane, preventing geometry behind the doorway leaking through.
    // A five-millimetre inset at ordinary doorway scale keeps depth precision
    // stable even when the eye is micrometres from the source plane. Nothing
    // behind the doorway leaks through; only this thin boundary slice is cut.
    const plane=new THREE.Plane(V(dest.normal),-V(dest.normal).dot(V(dest.center))-.005*dest.height/3.6).applyMatrix4(c.matrixWorldInverse);
    const clip=new THREE.Vector4(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
    const e=c.projectionMatrix.elements,q=new THREE.Vector4((Math.sign(clip.x)+e[8])/e[0],(Math.sign(clip.y)+e[9])/e[5],-1,(1+e[10])/e[14]);clip.multiplyScalar(2/clip.dot(q));e[2]=clip.x;e[6]=clip.y;e[10]=clip.z+1;e[14]=clip.w;c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
    return c;
  }
  renderView(roomId,camera,target,depth,skip){
    const r=this.rooms.get(roomId);if(!r)return;
    const saved=[];
    for(const entry of r.portals){const {portal:p,surface,material:m}=entry;saved.push([entry,m.uniforms.view.value,m.uniforms.live.value,surface.visible,entry.group.visible]);
      surface.visible=p.id!==skip;m.uniforms.live.value=0;m.uniforms.resolution.value.copy(this.size);
      const dest=this.world.portals.find(q=>q.id===p.to),active=!!dest&&condition(this.state,p.requires)&&condition(this.state,dest.requires);
      entry.group.visible=!(p.hideInactive&&!active);
      if(!active||!dest||p.id===skip||!this.portalVisible(p,camera))continue;
      if(depth===0)this.rootReserve=Math.max(0,this.rootReserve-1);
      if(depth<(this.settings.quality==='low'?1:2)&&this.pass<12-this.rootReserve){const slot=this.pass++,t=this.getTarget(slot),cam=this.virtualCamera(camera,p,dest);this.renderView(dest.room,cam,t,depth+1,dest.id);m.uniforms.view.value=t.texture;m.uniforms.live.value=1;}
    }
    for(const entry of r.portals)entry.material.uniforms.resolution.value.set(target?target.width:this.size.x,target?target.height:this.size.y);
    this.renderer.setRenderTarget(target);this.renderer.render(r.scene,camera);this.metrics.calls+=this.renderer.info.render.calls;this.metrics.triangles+=this.renderer.info.render.triangles;
    for(const [entry,view,live,visible,groupVisible]of saved){entry.material.uniforms.view.value=view;entry.material.uniforms.live.value=live;entry.surface.visible=visible;entry.group.visible=groupVisible;}
  }
  render(dt){this.frame++;this.sync(dt);this.pass=0;this.rootReserve=this.world.portals.filter(p=>p.room===this.state.player.room&&condition(this.state,p.requires)&&this.portalVisible(p,this.camera)&&condition(this.state,this.world.portals.find(q=>q.id===p.to)?.requires)).length;this.metrics.calls=0;this.metrics.triangles=0;this.renderView(this.state.player.room,this.camera,null,0,null);this.metrics.passes=this.pass+1;}
  dispose(){for(const t of this.targets)t.dispose();this.renderer.dispose();}
}
