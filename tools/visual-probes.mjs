#!/usr/bin/env node
/** Optional rendered pose/edge/performance probes. Requires external Playwright. */
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const pwPath=option('--playwright-dir',process.env.MUSEUM_PLAYWRIGHT_DIR),executablePath=option('--browser',process.env.MUSEUM_BROWSER),url=option('--url','http://127.0.0.1:4173/?test=1');
if(!pwPath)throw Error('Supply --playwright-dir PATH and --browser PATH. These developer tools are not required to play.');
const out=resolve(option('--output',resolve(root,'evidence/visual-probes.json'))),images=resolve(dirname(out),'visual-probes');await mkdir(images,{recursive:true});
const {chromium}=createRequire(import.meta.url)(resolve(pwPath));const browser=await chromium.launch({headless:true,executablePath});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
const report={method:'Diagnostic poses for rendered edge/carry/angle inspection; not a played walkthrough. Benchmarks explicitly synchronize GPU completion for each frame. Screenshots contain the actual WebGL output.',browser:browser.version(),viewport:{width:1440,height:900},probes:[],benchmarks:[],errors};
try{
  await page.goto(url);await page.waitForFunction(()=>window.museum);await page.getByRole('button',{name:'Enter the museum'}).click();await page.getByRole('button',{name:'Begin the visit'}).click();await page.keyboard.press('Escape');
  await page.evaluate(()=>{for(const id of ['modal-backdrop','chapter-card','toast'])document.getElementById(id).style.display='none';});
  const cases=[
    {id:'01-hub-initial',room:'hub',p:[10,2.7,12],f:[-.52,-.045,-.85]},
    {id:'02-hub-evolved',room:'hub',p:[0,1.6,-10],f:[0,.06,-1],solved:9},
    {id:'03-door-front',room:'c1',p:[4,1.6,1],f:[1,0,0]},
    {id:'04-door-millimetre',room:'c1',p:[5.999,1.6,1],f:[1,0,0]},
    {id:'05-door-ten-microns',room:'c1',p:[5.99999,1.6,1],f:[1,0,0]},
    {id:'05b-door-exact-plane',room:'c1',p:[6,1.6,1],f:[1,0,0]},
    {id:'05c-hub-float-plane',room:'hub',p:[-17.999999999999957,1.6,-12],f:[-1,0,0]},
    {id:'05d-wall-float-plane',room:'c9',p:[4.399999949137366,6,-10.00000000000001],f:[0,0,-1],up:[-1,0,0],flags:{'wall-sight':true}},
    {id:'06-door-oblique',room:'c1',p:[4.8,1.6,2.65],f:[1.2,0,-1.65]},
    {id:'07-door-low-angle',room:'c1',p:[4,1.6,1],f:[1,.55,0]},
    {id:'08-weight-straddling',room:'c1',p:[4.9,1.6,1],f:[1,0,0],held:'weight1'},
    {id:'09-quarter-passage',room:'c3',p:[0,1.6,-6.9],f:[0,0,-1],held:'weight3'},
    {id:'10-quarter-interior',room:'c3-cabinet',p:[0,.4,1.4],f:[0,0,-1],scale:.25,held:'weight3'},
    {id:'11-winter',room:'c4',p:[1,1.6,-5],f:[-1,0,-4]},
    {id:'12-summer',room:'c4',p:[1,1.6,-5],f:[-1,0,-4],flags:{summer:true}},
    {id:'13-perspective-before',room:'c5',p:[0,1.6,5],f:[0,.2,-15]},
    {id:'14-perspective-settled',room:'c5',p:[0,1.6,5],f:[0,.2,-15],flags:{sightline:true}},
    {id:'15-wall-floor',room:'c9',p:[4.4,6,2],f:[-.2,0,-12],up:[-1,0,0]},
    {id:'16-wall-connected',room:'c9',p:[4.4,6,-7],f:[0,0,-1],up:[-1,0,0],flags:{'wall-sight':true},held:'weight9'},
    {id:'17-courtyard',room:'courtyard',p:[0,1.6,6],f:[0,.08,-1]},
  ];
  for(const fixture of cases){
    const record=await page.evaluate(async f=>{
      const m=window.museum,s=m.engine.createState(m.world);s.flags={onboarded:true,...f.flags};s.player={...s.player,room:f.room,p:f.p,forward:m.engine.normalize(f.f),up:f.up||[0,1,0],scale:f.scale||1};s.flags['gravity:'+f.room]=s.player.up;
      if(f.solved){s.solved=Array.from({length:f.solved},(_,i)=>i+1);for(const i of s.solved)s.flags['solved:'+i]=true;}
      if(f.held){s.held=f.held;s.heldRatio=.8;s.objects[f.held].room=f.room;s.objects[f.held].size=.8*s.player.scale;s.objects[f.held].p=[...s.player.p];m.engine.step(m.world,s,{},.000001);}
      m.setState(s);m.renderer.up.fromArray(s.player.up);m.renderer.render(0);await new Promise(requestAnimationFrame);m.renderer.render(0);const gl=m.renderer.renderer.getContext();gl.finish();
      const pixels=new Uint8Array(4),colors=new Set();for(let y=2;y<18;y++)for(let x=2;x<30;x++){gl.readPixels(Math.floor(gl.drawingBufferWidth*x/32),Math.floor(gl.drawingBufferHeight*y/20),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixels);colors.add([...pixels.slice(0,3)].map(v=>v>>3).join(','));}
      return {id:f.id,room:s.player.room,p:s.player.p,scale:s.player.scale,up:s.player.up,held:s.held,object:s.held?s.objects[s.held]:null,near:m.renderer.camera.near,views:m.renderer.metrics.passes,framebufferColors:colors.size,webglError:gl.getError(),ghosts:[...m.renderer.objectGhosts.values()].filter(g=>g.visible).length};
    },fixture);
    assert.equal(record.webglError,0,fixture.id);assert.ok(record.views<=13,fixture.id);if(/^0[345]/.test(fixture.id))assert.ok(record.framebufferColors>12,`${fixture.id}: live architecture must not become a blank doorway`);await page.screenshot({path:resolve(images,fixture.id+'.png')});record.screenshot='visual-probes/'+fixture.id+'.png';report.probes.push(record);
  }
  report.benchmarks=await page.evaluate(()=>{
    const m=window.museum,gl=m.renderer.renderer.getContext(),out=[];const ext=gl.getExtension('WEBGL_debug_renderer_info');
    const gpu={vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION)};
    for(const quality of ['high','low'])for(const room of ['hub','c1','c2-archive','c9']){
      m.settings.quality=quality;m.renderer.resize();const s=m.engine.createState(m.world);s.flags={onboarded:true,'wall-sight':true};for(let i=1;i<=9;i++)s.flags['solved:'+i]=true;s.solved=[1,2,3,4,5,6,7,8,9];s.player.room=room;
      if(room==='hub'){s.player.p=[0,1.6,0];s.player.forward=[1,0,0];}else if(room==='c1'){s.player.p=[4,1.6,1];s.player.forward=[1,0,0];}else if(room==='c2-archive'){s.player.p=[-10,1.6,17];s.player.forward=[0,0,-1];}else{s.player.p=[4.4,6,2];s.player.forward=[0,0,-1];s.player.up=[-1,0,0];}
      m.setState(s);m.renderer.up.fromArray(s.player.up);for(let i=0;i<8;i++){m.renderer.render(0);gl.finish();}const durations=[];for(let i=0;i<45;i++){const t=performance.now();m.renderer.render(1/60);gl.finish();durations.push(performance.now()-t);}durations.sort((a,b)=>a-b);out.push({room,quality,medianMs:+durations[22].toFixed(2),p95Ms:+durations[42].toFixed(2),minMs:+durations[0].toFixed(2),maxMs:+durations[44].toFixed(2),...m.renderer.metrics,allocatedTargets:m.renderer.targets.length,targetSize:m.renderer.targetSize.toArray(),textureCount:m.renderer.renderer.info.memory.textures,gpu});
    }return out;
  });
  report.audio=await page.evaluate(async()=>{const a=window.museum.audio;await a.start();a.setVolume(.35);const analyser=a.ctx.createAnalyser();analyser.fftSize=2048;a.master.connect(analyser);a.event('solved');await new Promise(r=>setTimeout(r,300));const sample=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(sample);const rms=Math.sqrt(sample.reduce((sum,x)=>sum+x*x,0)/sample.length),peak=Math.max(...sample.map(Math.abs));a.master.disconnect(analyser);return {context:a.ctx.state,sampleRate:a.ctx.sampleRate,rms,peak,signalVerified:rms>0&&peak<1,scope:'Actual browser audio graph sampled; no subjective listening or hardware-speaker check.'};});
  assert.ok(report.audio.signalVerified,'Audio has a bounded nonzero signal');assert.equal(errors.length,0);report.passed=true;
}catch(e){report.passed=false;report.failure=e.stack;process.exitCode=1;}
finally{report.completedAt=new Date().toISOString();await writeFile(out,JSON.stringify(report,null,2));await browser.close();process.stdout.write(`${report.passed?'PASS':'FAIL'}: ${report.probes.length} visual probes, ${report.benchmarks.length} benchmark cases. ${out}\n`);if(report.failure)process.stdout.write(report.failure+'\n');}
