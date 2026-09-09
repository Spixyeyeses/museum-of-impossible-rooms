import {condition, setGravity, resetObject} from './engine.mjs';

const UP=[0,1,0],N=[0,0,1],S=[0,0,-1],E=[-1,0,0],W=[1,0,0];
const rooms=[],portals=[],objects=[],interactables=[],chapters=[];
function room(id,name,chapter,size=[12,6,16],extra={}){const [x,y,z]=size;const r={id,name,chapter,bounds:{min:[-x/2,0,-z/2],max:[x/2,y,z/2]},spawn:{p:[0,1.6,z/2-3],forward:[0,0,-1],up:UP},solids:[],art:[],...extra};rooms.push(r);return r;}
function arch(id,room,center,normal=N,height=3.6,width=2.6,up=UP,extra={}){return {id,room,center,normal,up,height,width,...extra};}
function link(a,b){a.to=b.id;b.to=a.id;portals.push(a,b);return [a,b];}
function obj(id,room,p,size=.8,label='Index weight'){const o={id,room,p,size,label,color:0xcaab64,home:{room,p:[...p],size}};objects.push(o);return o;}
function item(id,room,p,type,label,extra={}){const o={id,room,p,type,label,radius:.62,...extra};interactables.push(o);return o;}
function socket(id,room,p,acceptSize,flag,extra={}){return item(id,room,p,'socket',extra.label||'Index plinth',{acceptSize,flag,...extra});}
function note(id,room,p,title,text,optional=false){return item(id,room,p,optional?'lore':'note',title,{title,text,radius:.65});}
function memory(id,room,p,flag,label){return item(id,room,p,'memory',label,{flag,hideFlag:flag});}
function gravity(id,room,p){return item(id,room,p,'gravity','Change the floor',{up:E});}
function align(id,room,p,target,flag,extra={}){return item(id,room,p,'align','The observation mark',{target,flag,hold:1.1,tolerance:.992,spotRadius:.82,...extra});}
function shutter(id,room,p,target,flag,extra={}){return item(id,room,p,'shutter','Release the arrangement',{target,flag,...extra});}
function gate(n){return n===1?undefined:`solved:${n-1}`;}
function chapter(n,title,rule,objective,hints,reflection){const c={id:n,title,rule,objective,hints,reflection,entry:`c${n}`,completeFlag:`complete:${n}`};chapters.push(c);return c;}

const hub=room('hub','Court of Unfinished Plans',0,[36,9,36],{subtitle:'THE MUSEUM OF IMPOSSIBLE ROOMS',accent:0x82c6ba,art:[{kind:'rings',p:[0,3.7,-2],size:2.2,spin:true},{kind:'stairs',p:[0,1,-2]}]});
hub.solids.push({id:'central-plinth',min:[-2,0,-4],max:[2,.65,0]});
note('welcome','hub',[0,1.1,7],'To the visitor','My name is Iona Vale. I tried to draw a final plan of this museum. The plan became so exact that it left no room for an exit.\n\nI am still here, making corrections. Follow the numbered exhibitions. Bring each index weight to its matching plinth. Learn what a doorway actually promises.\n\nWhen you have understood the building, please leave a way out for both of us.');
note('hub-map','hub',[-4,1.1,4],'An unfinished plan','Ten exhibitions restore ten index plates. Each plate illuminates another doorway in this court.\n\nJ opens your notebook and exhibition map. H offers a hint, one step at a time. If a weight is misplaced, use Recall weight in the notebook. R returns you safely to the current exhibition entrance. Your discoveries are retained.');
note('hub-lore','hub',[4,1.1,4],'Accession 000','A key, exhibited without a lock.\n\n“Before we collected rooms, we collected the things that made rooms possible.”',true);

chapter(1,'The Gallery of Two Norths','Connection','Bring the weight behind the glass to the entrance plinth.',[
  'A doorway promises a destination. It does not promise a direction.',
  'The weight is behind the glass. The east arch and the arch beyond it reach the other side.',
  'Enter the arch on the right, then the far arch in the long gallery. Take the weight behind the glass. Retrace both arches and place it on the entrance plinth.'
],'A plan can be accurate and still fail to fit on paper.');
const c1=room('c1','The Gallery of Two Norths',1,[12,6,16],{subtitle:'I · CONNECTION',accent:0x8bbcc4});
c1.solids.push({id:'glass-divider',min:[-6,0,-3],max:[6,6,-2.8],material:'glass'});
room('c1-gallery','The Other North',1,[12,7,22],{accent:0xb7a276,art:[{kind:'rings',p:[0,3,-2],spin:true}]});
link(arch('c1-east','c1',[6,1.8,1],E,3.6,2.6,UP,{label:'THE OTHER NORTH'}),arch('c1-gallery-in','c1-gallery',[0,1.8,11],S));
link(arch('c1-gallery-out','c1-gallery',[0,1.8,-11],N,3.6,2.6,UP,{label:'BEYOND THE GLASS'}),arch('c1-enclosure','c1',[-6,1.8,-5.5],W));
obj('weight1','c1',[0,.4,-5.8]);socket('plinth1','c1',[-2.4,1,2],.8,'complete:1');
note('c1-note','c1',[-3,1.1,5],'Two norths','The glass is continuous. The room is not. Follow the bronze frames, and carry the index weight back to the plinth.');
note('c1-lore','c1-gallery',[-3,1.1,-4],'All points north','Four compasses, all labelled NORTH.\n\n“The plan was accurate. Its paper was the problem.” — I.V.',true);

chapter(2,'The Small Pavilion','Interior','Move the archive weight from the west collection to the east plinth.',[
  'The exterior of a room does not determine its interior.',
  'The two pavilion doors lead to opposite sides of the archive’s glass wall.',
  'Enter the pavilion’s front door, take the weight on the west side, and return outside. Walk around the little pavilion and enter its rear door. Place the weight on the east plinth.'
],'Storage exceeded the building. We retained the building.');
const c2=room('c2','The Small Pavilion',2,[20,7,22],{subtitle:'II · INTERIOR',accent:0xa2c1a5});
c2.solids.push({id:'pavilion-left',min:[-1.65,0,-3.15],max:[-1.35,4,.15]},{id:'pavilion-right',min:[1.35,0,-3.15],max:[1.65,4,.15]},{id:'pavilion-roof',min:[-1.65,3.7,-3.15],max:[1.65,4,.15]});
const archive=room('c2-archive','The Archive Within',2,[36,12,40],{subtitle:'THE PAVILION · INTERIOR',spawn:{p:[-10,1.6,17],forward:[0,0,-1],up:UP},accent:0xcab88e,art:[{kind:'rings',p:[-10,4,-9],size:2,spin:true},{kind:'rings',p:[10,4,-9],size:2,spin:true}]});
archive.solids.push({id:'archive-divider',min:[-.12,0,-20],max:[.12,12,20],material:'glass'});
for(const x of [-15,-7,7,15])for(const z of [-14,-7,0,7])archive.solids.push({id:`shelf${x}:${z}`,min:[x-1,0,z-.4],max:[x+1,3.1,z+.4]});
link(arch('pavilion-front','c2',[0,1.8,0],N,3.6,2.6,UP,{label:'WEST COLLECTION'}),arch('archive-west','c2-archive',[-10,1.8,20],S));
link(arch('pavilion-rear','c2',[0,1.8,-3],S,3.6,2.6,UP,{label:'EAST COLLECTION'}),arch('archive-east','c2-archive',[10,1.8,20],S));
obj('weight2','c2-archive',[-10,.4,10]);socket('plinth2','c2-archive',[10,1,10],.8,'complete:2');
note('c2-note','c2',[-3,1.1,4],'The inside exceeds the outside','The west collection holds the weight. The east collection holds its plinth. The archive’s glass partition has no opening. Both collections belong to this little pavilion.');
note('c2-lore','c2-archive',[-4,1.1,14],'A request for more drawers','June: interior enlarged.\nJuly: interior enlarged.\nAugust: exterior dimensions unchanged.\n\nNo planning permission was required for the additional inside.',true);

chapter(3,'The Scale Cabinet','Measure','Carry a quarter-size weight through the low cabinet opening.',[
  'The measure applies to everything that crosses with you.',
  'Take the weight through the measuring arch. Your body, reach and weight become one quarter of their former size.',
  'Pick up the weight beside the plinth, enter the 1:4 measuring arch, and walk under the low cabinet lip ahead. Place the tiny weight on the tiny plinth. Reverse the arch to become full size again.'
],'I stopped calling one size the real one.');
room('c3','The Scale Cabinet',3,[14,6,16],{subtitle:'III · MEASURE',accent:0x91b9d2,art:[{kind:'frame',p:[-3,2,-2],size:1.2}]});
const cabinet=room('c3-cabinet','Conservation Cabinet',3,[8,5,14],{subtitle:'LIFE SIZE',accent:0x9eb3ce});
cabinet.solids.push({id:'cabinet-lip',min:[-4,.9,-.25],max:[4,5,.25]},{id:'cabinet-left',min:[-4,0,-.25],max:[-.7,.9,.25]},{id:'cabinet-right',min:[.7,0,-.25],max:[4,.9,.25]});
link(arch('quarter-in','c3',[0,1.8,-8],N,3.6,2.6,UP,{label:'1 : 4',subtitle:'Everything that crosses'}),arch('quarter-out','c3-cabinet',[0,.45,7],S,.9,.65,UP,{label:'4 : 1',subtitle:'The return measure'}));
obj('weight3','c3',[2,.4,-2]);socket('plinth3','c3-cabinet',[0,.27,-3],.2,'complete:3',{label:'Quarter measure'});
note('c3-note','c3',[-2.5,1.1,3],'Everything that crosses','Carry the weight into the measuring frame. Measure is shared by the visitor and the things they carry.\n\nA quarter-size weight belongs beyond the low cabinet lip. The inverse passage restores your size.');
note('c3-lore','c3',[3.5,1.1,3],'Life size','An enormous pencil and a miniature tea service. Both catalogue cards read: LIFE SIZE.\n\n“I stopped calling one size the real one.” — I.V.',true);

chapter(4,'The Unseen Garden','Attention','Carry the winter weight into the summer conservatory.',[
  'An observed arrangement remains settled.',
  'Release the arrangement at the brass stand, then turn fully away from the arch. It changes only while you are not looking.',
  'Enter WINTER and take its weight. Return, use Release the arrangement, and face the entrance until the latch sounds. Turn back and enter SUMMER. Fill its plinth.'
],'I was the one preventing change.');
room('c4','The Unseen Garden',4,[14,7,18],{subtitle:'IV · ATTENTION',accent:0xa7bd9a,art:[{kind:'rings',p:[-3,2,-2],spin:true}]});
room('c4-winter','Winter Conservatory',4,[10,7,16],{accent:0x9cbdd8,art:[{kind:'rings',p:[0,2,-3],size:1.4}]});
room('c4-summer','Summer Conservatory',4,[10,7,16],{accent:0xd5b57c,wall:0xcdbd96,art:[{kind:'rings',p:[0,2,-3],size:1.4,spin:true}]});
link(arch('garden-winter','c4',[0,1.8,-9],N,3.6,2.6,UP,{requires:{not:'summer'},hideInactive:true,label:'WINTER'}),arch('winter-return','c4-winter',[0,1.8,8],S));
link(arch('garden-summer','c4',[0,1.8,-9],N,3.6,2.6,UP,{requires:'summer',hideInactive:true,label:'SUMMER'}),arch('summer-return','c4-summer',[0,1.8,8],S));
obj('weight4','c4-winter',[2,.4,-1]);socket('plinth4','c4-summer',[-2,1,-1],.8,'complete:4');shutter('garden-shutter','c4',[2.3,1.1,-2],[0,1.8,-9],'summer');
note('c4-note','c4',[-2.5,1.1,4],'A settled arrangement','Winter keeps the weight; summer holds its plinth.\n\nUse the brass stand to release the current arrangement. While the arch stays in view it cannot move. Turn your whole view away for a moment, then look back.');
note('c4-lore','c4-summer',[2,1.1,3],'Maintenance log','Watered the plants that were present.\n\n“I thought I was being watched. I was the one preventing change.” — I.V.',true);

chapter(5,'The Sightline','Perspective','Complete the broken outline and retrieve its index weight.',[
  'Separate frames can share a single outline.',
  'Stand on the ivory observation mark and look through the bronze frames. Hold the view until the connection settles.',
  'Stand inside the marked ring near the entrance. Aim at the centre of the far bronze frame and hold for a moment. The doorway stays open. Cross it, take the weight, return and fill the entrance plinth.'
],'A perspective is useful. It need not be universal.');
room('c5','The Sightline',5,[14,8,20],{subtitle:'V · PERSPECTIVE',accent:0xc6aea4,art:[{kind:'partialFrame',p:[0,1.6+.2*7/15,-2],width:2.6*7/15,height:3.6*7/15,side:'left'},{kind:'partialFrame',p:[0,1.6+.2*11/15,-6],width:2.6*11/15,height:3.6*11/15,side:'right'}]});
room('c5-beyond','The Completed Outline',5,[10,6,14],{accent:0xb1cfce,art:[{kind:'rings',p:[0,2,-3],spin:true}]});
link(arch('sight-in','c5',[0,1.8,-10],N,3.6,2.6,UP,{requires:'sightline',label:'THE COMPLETED OUTLINE'}),arch('sight-out','c5-beyond',[0,1.8,7],S));
align('sight-mark','c5',[0,1.6,5],[0,1.8,-10],'sightline');obj('weight5','c5-beyond',[2,.4,-1]);socket('plinth5','c5',[-3,1,3],.8,'complete:5');
note('c5-note','c5',[3,1.1,5],'One useful viewpoint','Stand on the ivory rings. Let the scattered frames become a single outline. Hold that view for one quiet breath.\n\nA discovered connection remains available. You are free to look around after it settles.');
note('c5-lore','c5-beyond',[-2,1.1,1],'Here','A sculptor tried to represent every view of a doorway at once. The result had no opening.\n\n“A perspective is useful. It need not be universal.” — I.V.',true);

chapter(6,'The Gravity Atrium','Orientation','Reach the high gallery by walking on its other floor.',[
  'Floor describes an agreement, not a material.',
  'The compass makes the east wall down. The high arch then becomes a doorway at walking height.',
  'Use Change the floor. Let yourself settle on the right wall. Move along that wall to the elevated north arch, at height seven on the old wall. Cross to the record gallery and take the index plate. Use the wall compass after returning to restore the floor.'
],'An object is not falling wrongly. We labelled the room prematurely.');
room('c6','The Gravity Atrium',6,[12,11,18],{subtitle:'VI · ORIENTATION',accent:0xb5bbc9,art:[{kind:'stairs',p:[-2,4,-3]}]});
room('c6-record','The Other Floor',6,[10,6,14],{accent:0xcdb79a});
gravity('gravity6','c6',[0,1.1,2]);gravity('gravity6wall','c6',[4.85,7,-5.4]);
link(arch('wall6-in','c6',[4.2,7,-9],N,3.6,2.6,E,{label:'THE OTHER FLOOR'}),arch('wall6-out','c6-record',[0,1.8,7],S));
memory('plate6','c6-record',[0,1.25,-2],'complete:6','The orientation plate');
note('c6-note','c6',[-2.5,1.1,4],'The other floor','The right-hand wall is another gallery floor. The compass changes the direction in which you fall.\n\nAfter you settle, W still walks forward; A and D walk across the new floor. The high north arch leads to the index plate. A second compass is mounted beside it for your return.');
note('c6-lore','c6-record',[2,1.1,2],'Premature labels','The chair was not attached to the wall. The chair was standing on a floor we had not yet agreed to use.',true);

chapter(7,'The Hall of Measures','Measure × connection','Choose a route that makes the weight one quarter without undoing it.',[
  'You can return to a place without returning to your former measure.',
  'The blue UNMEASURED arch keeps your size. Two trips through the half-size arch make a quarter.',
  'Carry the weight through 1:2. Return through UNMEASURED, not through 2:1. Repeat this loop once. At quarter size, enter the little cabinet on the left and fill its plinth. Reverse the measuring route twice to grow back, or use entrance recovery.'
],'Same place. Different person.');
room('c7','The Hall of Measures',7,[16,7,20],{subtitle:'VII · MEASURE × CONNECTION',accent:0x9bbad4});
room('c7-loop','The Unmeasured Return',7,[10,6,14],{accent:0x8fbac7});
room('c7-cabinet','The Quarter Collection',7,[12,8,18],{accent:0xc5b596,art:[{kind:'rings',p:[0,3,-2],size:2,spin:true}]});
link(arch('half7-in','c7',[3.5,1.8,-10],N,3.6,2.6,UP,{label:'1 : 2'}),arch('half7-out','c7-loop',[0,.9,7],S,1.8,1.3,UP,{label:'2 : 1'}));
link(arch('neutral7-out','c7-loop',[0,.9,-7],N,1.8,1.3,UP,{label:'UNMEASURED',subtitle:'Preserve your measure'}),arch('neutral7-in','c7',[-3.5,.9,-10],N,1.8,1.3,UP,{label:'UNMEASURED'}));
link(arch('cabinet7-in','c7',[-8,.45,0],W,.9,.65,UP,{label:'QUARTER COLLECTION'}),arch('cabinet7-out','c7-cabinet',[0,.45,9],S,.9,.65));
obj('weight7','c7',[2,.4,4]);socket('plinth7','c7-cabinet',[0,.27,3],.2,'complete:7',{label:'One quarter'});
note('c7-note','c7',[-2.5,1.1,5],'A route without a fixed scale','The measuring arch halves all that passes. Its reverse doubles. The blue return preserves measure.\n\nThe little collection accepts one quarter of the starting weight. Find a route whose two halves do not undo one another.');
note('c7-lore','c7-loop',[2,1.1,1],'Same place','A visitor’s route: HALF → UNMEASURED → HALF → UNMEASURED.\n\nAt the bottom: “Same place. Different person.”',true);

chapter(8,'Blind Transit','Attention × measure','Reach the conservation side with the correctly measured weight.',[
  'The arrangement selects both a destination and a measure.',
  'COLLECTION holds a full weight. CONSERVATION measures everything to one half.',
  'Take the weight from COLLECTION and return. Release the arrangement and turn away. Enter the newly revealed 1:2 CONSERVATION route while carrying the weight. Place the half-size weight on its plinth.'
],'Not trapped. Connected to the wrong side.');
room('c8','Blind Transit',8,[14,8,20],{subtitle:'VIII · ATTENTION × MEASURE',accent:0x9baabf});
room('c8-collection','The Full Collection',8,[18,8,24],{accent:0x88b4c3,art:[{kind:'stairs',p:[-3,2,-4]}]});
room('c8-conservation','The Half Conservation',8,[18,8,24],{accent:0xcfb3b0,art:[{kind:'rings',p:[3,3,-4],size:2}]});
link(arch('transit-collection','c8',[0,1.8,-10],N,3.6,2.6,UP,{requires:{not:'transit'},hideInactive:true,label:'COLLECTION · 1 : 1'}),arch('collection-return','c8-collection',[9,1.8,5],E));
link(arch('transit-conservation','c8',[0,1.8,-10],N,3.6,2.6,UP,{requires:'transit',hideInactive:true,label:'CONSERVATION · 1 : 2'}),arch('conservation-return','c8-conservation',[0,.9,12],S,1.8,1.3));
obj('weight8','c8-collection',[2,.4,5]);socket('plinth8','c8-conservation',[0,.55,5],.4,'complete:8',{label:'Half measure'});shutter('transit-shutter','c8',[2.4,1.1,-2],[0,1.8,-10],'transit');
note('c8-note','c8',[-2.5,1.1,5],'The same arch, another agreement','The collection keeps a full weight. Conservation needs a half measure.\n\nRelease the arrangement, give it a moment outside your view, and the same frame takes on another destination — and another measure.');
note('c8-lore','c8-collection',[-2,1.1,3],'A correction','TRAPPED is struck out.\n\n“Connected to the wrong side.”\n\nBelow it, in a steadier hand: “I am alive. I can see the sky. Please finish the route.”',true);

chapter(9,'The Ceiling Observatory','Orientation × perspective','Reach the wall viewpoint and carry its weight into the record room.',[
  'Some viewpoints have to be reached before they can be understood.',
  'The observation mark is on the other floor. Change gravity and walk to it.',
  'Take the weight, use the compass, then walk on the east wall to the ivory mark at old height six, near the centre. Aim at the high north frame until it opens. Carry the weight through and fill the record-room plinth.'
],'I can see the outside. I need a route that admits it.');
room('c9','The Ceiling Observatory',9,[12,11,20],{subtitle:'IX · ORIENTATION × PERSPECTIVE',accent:0xa1aebe,art:[{kind:'partialFrame',p:[4.4-.2/3,6,-2],width:2.6/3,height:3.6/3,side:'left',up:E,normal:N},{kind:'partialFrame',p:[4.4-.2*2/3,6,-6],width:2.6*2/3,height:3.6*2/3,side:'right',up:E,normal:N}]});
room('c9-record','The Last Plan',9,[12,7,16],{accent:0xd2c1a3});
gravity('gravity9','c9',[0,1.1,3]);gravity('gravity9wall','c9',[4.85,6,-6]);
align('wall-mark9','c9',[4.4,6,2],[4.2,6,-10],'wall-sight',{up:E,spotRadius:.95});
link(arch('wall9-in','c9',[4.2,6,-10],N,3.6,2.6,E,{requires:'wall-sight',label:'THE LAST PLAN'}),arch('wall9-out','c9-record',[0,1.8,8],S));
obj('weight9','c9',[-2,.4,3]);socket('plinth9','c9-record',[0,1,-2],.8,'complete:9');
note('c9-note','c9',[-3,1.1,5],'The unreachable viewpoint','Take the weight. Turn the wall into a floor, and the ivory observation mark becomes somewhere you can stand. From there, the scattered frames admit a route.');
note('c9-lore','c9-record',[3,1.1,2],'The three corrections','The last plan has three corrections:\n\nOPEN — a room may be larger than its enclosure. Carry a half measure into its index.\nHOLD — attention holds an arrangement. Release it to reach the other floor.\nRELEASE — take that floor’s viewpoint. A complete outline admits the sky.\n\nThere is no combination to guess. Only a route to understand.',true);

chapter(10,'Exit Without Exterior','The six rules together','Complete OPEN, HOLD and RELEASE to make a route into the morning.',[
  'The unfinished plan asks for an interior, a measure, an arrangement and a viewpoint you already understand.',
  'OPEN: take the weight inside the little pavilion, then through its half-measure passage. HOLD: release the arrangement after filling OPEN. RELEASE: reach the other floor’s viewpoint.',
  'Enter the pavilion, take its weight, carry it through 1:2 and fill OPEN. Use 2:1 RETURN to restore your size. Release the main arrangement and look away. Enter HOLD, use its compass, reach the wall’s ivory mark and align the far frame. Walk through RELEASE into the courtyard, then sign the ledger.'
],'A way out is something we make possible for one another.');
const c10=room('c10','Exit Without Exterior',10,[20,10,26],{subtitle:'X · THE UNFINISHED PLAN',accent:0xcbb883});
c10.solids.push({id:'last-pavilion-left',min:[-5.65,0,-3.1],max:[-5.35,4,.1]},{id:'last-pavilion-right',min:[-2.65,0,-3.1],max:[-2.35,4,.1]},{id:'last-pavilion-roof',min:[-5.65,3.7,-3.1],max:[-2.35,4,.1]},{id:'last-pavilion-back',min:[-5.65,0,-3.1],max:[-2.35,3.7,-2.9]});
room('c10-inside','An Interior Without a Plan',10,[28,10,32],{accent:0xaabeb8,art:[{kind:'rings',p:[0,4,-5],size:3,spin:true}]});
room('c10-measure','The OPEN Index',10,[10,6,16],{accent:0xc8b083});
room('c10-hold','The HOLD Gallery',10,[12,11,20],{accent:0xb1b7c7,art:[{kind:'partialFrame',p:[4.4-.2/3,6,-2],width:2.6/3,height:3.6/3,side:'left',up:E,normal:N},{kind:'partialFrame',p:[4.4-.2*2/3,6,-6],width:2.6*2/3,height:3.6*2/3,side:'right',up:E,normal:N}]});
link(arch('final-pavilion','c10',[-4,1.8,0],N,3.6,2.6,UP,{label:'OPEN · THE INTERIOR'}),arch('final-inside','c10-inside',[0,1.8,16],S));
link(arch('final-half','c10-inside',[0,1.8,-16],N,3.6,2.6,UP,{label:'1 : 2 · OPEN'}),arch('final-small','c10-measure',[0,.9,8],S,1.8,1.3));
link(arch('final-restore','c10-measure',[0,.9,-8],N,1.8,1.3,UP,{label:'2 : 1 · RETURN'}),arch('final-restored','c10',[10,1.8,3],E,3.6,2.6));
obj('weight10','c10-inside',[2,.4,7]);socket('plinth10','c10-measure',[0,.55,0],.4,'final-open',{label:'OPEN · half measure'});
shutter('final-shutter','c10',[2.5,1.1,-4],[0,1.8,-13],'final-hold',{requires:'final-open',latch:true});
link(arch('final-hold-in','c10',[0,1.8,-13],N,3.6,2.6,UP,{requires:'final-hold',label:'HOLD · THE OTHER FLOOR'}),arch('final-hold-out','c10-hold',[0,1.8,10],S));
gravity('gravity10','c10-hold',[0,1.1,3]);gravity('gravity10wall','c10-hold',[4.85,6,-6]);
align('final-mark','c10-hold',[4.4,6,2],[4.2,6,-10],'final-release',{up:E,spotRadius:.95});
link(arch('exit-created','c10-hold',[4.2,6,-10],N,3.6,2.6,E,{requires:'final-release',label:'RELEASE · MORNING'}),arch('courtyard-return','courtyard',[0,1.8,12],S,3.6,2.6,UP,{label:'THE MUSEUM',subtitle:'The gate remains open'}));
room('courtyard','A Door into Morning',10,[24,14,24],{subtitle:'THE GATE REMAINS OPEN',openSky:true,wall:0xd4d6c1,floor:0x657575,fog:0xa7bec3,accent:0xd8c99d,art:[{kind:'rings',p:[-6,3,-5],size:1.5}]});
item('last-ledger','courtyard',[0,1.1,-3],'finish','Sign the departure ledger',{radius:.75});
note('c10-note','c10',[-3,1.1,8],'Three corrections','OPEN — A half measure, carried through an impossible interior.\nHOLD — Release the arrangement from your attention.\nRELEASE — A view from the other floor.\n\nYou have already learned every part of this route. There is no secret sequence. Follow the named exhibitions.');
note('last-note','courtyard',[2.5,1.1,-1],'Iona Vale, outside','I am safely outside. The door held. I have left the gate open for you.\n\nI thought that preserving this museum meant finishing its plan. You have shown me that a building can remain unfinished and still make room for someone.\n\nThe second cup is yours.\n— Iona Vale');

for(let n=1;n<=10;n++){
  const side=n<=5?-1:1,z=-12+((n-1)%5)*6;
  const entry=rooms.find(r=>r.id===`c${n}`),zh=entry.bounds.max[2];
  link(arch(`hub-${n}`,'hub',n===10?[0,1.8,-18]:[side*18,1.8,z],n===10?N:side<0?W:E,3.6,2.6,UP,{label:`${String(n).padStart(2,'0')} · ${chapters[n-1].title}`,subtitle:n===1?'BEGIN HERE':chapters[n-1].rule,requires:gate(n),hideInactive:n===10}),arch(`c${n}-hub`,`c${n}`,[0,1.8,zh],S,3.6,2.6,UP,{label:'THE COURT',subtitle:'Return to the museum'}));
}

// Rendered exhibition furniture has matching physical support. The renderer
// already builds these meshes from interactables, so these collision records
// are deliberately invisible to prevent drawing the furniture twice.
function furnitureBox(id,roomId,center,size,requires){
  rooms.find(r=>r.id===roomId).solids.push({id:`furniture:${id}`,min:center.map((v,i)=>v-size[i]/2),max:center.map((v,i)=>v+size[i]/2),invisible:true,...(requires===undefined?{}:{requires})});
}
for(const exhibit of interactables){
  const p=exhibit.p,requires=exhibit.hideFlag?[exhibit.requires??true,{not:exhibit.hideFlag}]:exhibit.requires;
  if(exhibit.type==='socket'){
    const k=exhibit.acceptSize/.8;furnitureBox(exhibit.id,exhibit.room,[p[0],p[1]-.5*k,p[2]],[1.12*k,k,1.12*k],requires);
  }else if(exhibit.type==='note'||exhibit.type==='lore')furnitureBox(exhibit.id,exhibit.room,[p[0],p[1]-.42,p[2]],[.65,.85,.5],requires);
  else if(exhibit.type==='shutter')furnitureBox(exhibit.id,exhibit.room,[p[0],p[1]-.4,p[2]],[.65,.8,.65],requires);
  else if(exhibit.type==='gravity')furnitureBox(exhibit.id,exhibit.room,p[0]===4.85?[p[0]+.6,p[1],p[2]]:[p[0],p[1]-.6,p[2]],[.5,.5,.5],requires);
  else if(exhibit.type==='memory')furnitureBox(exhibit.id,exhibit.room,[p[0],p[1]-.72,p[2]],[.6,.65,.6],requires);
  else if(exhibit.type==='finish')furnitureBox(exhibit.id,exhibit.room,[p[0],.61,p[2]],[1.8,1.22,.9],requires);
}
for(const x of [-9,9])furnitureBox(`courtyard-planter:${x}`,'courtyard',[x,.23,-3],[2,.46,9]);
furnitureBox('courtyard-tea-table','courtyard',[-4,.41,2],[1.2,.82,1.05]);
for(const x of [-5.15,-2.85])furnitureBox(`courtyard-chair:${x}`,'courtyard',[x,.64,2],[.72,1.28,.72]);

export const world={title:'The Museum of Impossible Rooms',version:1,startRoom:'hub',rooms,portals,objects,interactables,chapters};
export function initializeCampaign(state){state.flags||={};state.solved||=[];state.journal||=[];state.hints||={};state.events||=[];state.checkpoint||='hub';state.visited||=['hub'];}
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]),len=a=>Math.hypot(...a);
function event(state,type,text,extra={}){state.events.push({type,text,...extra});}
export function currentChapter(state){const room=rooms.find(r=>r.id===state.player.room);return chapters.find(c=>c.id===room?.chapter)||null;}
export function updateCampaign(state,dt){
  initializeCampaign(state);const p=state.player,r=rooms.find(r=>r.id===p.room),c=currentChapter(state);
  if(!state.visited.includes(p.room)){state.visited.push(p.room);event(state,'arrival',r.name);}
  if(c)state.checkpoint=c.entry;
  for(const it of interactables.filter(i=>i.room===p.room&&condition(state,i.requires))){
    if(it.type==='align'&&!state.flags[it.flag]){
      const dist=len(sub(p.p,it.p)),dir=sub(it.target,p.p),d=dot(p.forward,dir)/len(dir),upOkay=!it.up||dot(p.up,it.up)>.95;
      const good=dist<it.spotRadius&&d>it.tolerance&&upOkay;state.flags[`charge:${it.id}`]=good?Math.min(it.hold,(state.flags[`charge:${it.id}`]||0)+dt):0;
      if(state.flags[`charge:${it.id}`]>=it.hold){state.flags[it.flag]=true;event(state,'connection','The outline settles. A connection remains.',{flag:it.flag});}
    }
    if(it.type==='shutter'&&state.flags[`armed:${it.id}`]){
      const dir=sub(it.target,p.p),visible=dot(p.forward,dir)/len(dir)>-.05,near=len(dir)<3;
      state.flags[`unseen:${it.id}`]=!visible&&!near?(state.flags[`unseen:${it.id}`]||0)+dt:0;
      if(state.flags[`unseen:${it.id}`]>.75){state.flags[it.flag]=it.latch?true:!state.flags[it.flag];state.flags[`armed:${it.id}`]=false;state.flags[`unseen:${it.id}`]=0;event(state,'arrangement','A latch sounds behind you. The arrangement has changed.',{flag:it.flag});}
    }
  }
  for(const chapter of chapters)if(state.flags[chapter.completeFlag]&&!state.solved.includes(chapter.id)){
    state.solved.push(chapter.id);state.flags[`solved:${chapter.id}`]=true;state.journal.push({id:`plate:${chapter.id}`,title:`${String(chapter.id).padStart(2,'0')} · ${chapter.title}`,text:chapter.reflection});event(state,'solved',chapter.title,{chapter:chapter.id});
  }
  if(state.player.room==='courtyard'&&!state.flags['outside']){state.flags.outside=true;event(state,'outside','The morning has an address now.');}
}
export function interactCampaign(state,id){
  const it=interactables.find(i=>i.id===id);if(!it||!condition(state,it.requires))return null;
  if(it.type==='note'||it.type==='lore'){
    if(!state.journal.some(n=>n.id===id))state.journal.push({id,title:it.title,text:it.text,optional:it.type==='lore'});
    return {type:'note',title:it.title,text:it.text};
  }
  if(it.type==='socket'){
    if(state.flags[it.flag])return {type:'toast',text:'This index is complete.'};
    if(!state.held)return {type:'toast',text:`This plinth accepts a ${it.acceptSize.toFixed(2)} m index weight. Carry a weight here and press E.`};
    const o=state.objects[state.held];if(Math.abs(o.size-it.acceptSize)>.008)return {type:'toast',text:`The weight is ${o.size.toFixed(2)} m. This plinth needs ${it.acceptSize.toFixed(2)} m. The weight remains in your hands.`};
    o.room=it.room;o.p=[it.p[0],it.p[1]+o.size/2+.08,it.p[2]];o.socketed=true;o.socket=it.id;state.held=null;state.flags[it.flag]=true;event(state,'socket','The weight fits. The index is restored.',{flag:it.flag});return {type:'socket'};
  }
  if(it.type==='gravity'){const target=dot(state.player.up,it.up)>.9?UP:it.up;setGravity(world,state,target);return {type:'toast',text:target===UP?'The original floor becomes down.':'The east wall becomes down. Let yourself settle, then walk along it.'};}
  if(it.type==='shutter'){
    if(it.latch&&state.flags[it.flag])return {type:'toast',text:'This arrangement is settled.'};
    state.flags[`armed:${it.id}`]=true;state.flags[`unseen:${it.id}`]=0;return {type:'toast',text:'The arrangement is released. Turn fully away from the arch for a moment.'};
  }
  if(it.type==='memory'){state.flags[it.flag]=true;return {type:'toast',text:'The index plate returns to your notebook.'};}
  if(it.type==='align')return {type:'toast',text:state.flags[it.flag]?'This connection is settled.':'Stand on the mark and hold your gaze through the centre of the far frame.'};
  if(it.type==='finish'){state.flags['complete:10']=true;state.flags.finished=true;return {type:'ending',title:'Visitor, and co-author of the way out.',text:'Iona Vale — departed safely at dawn.\n\nYou add your name beneath hers. For the first time, the ledger records a departure without erasing an arrival.\n\nThe museum remains impossible. Its door remains open.\n\nThank you for leaving room for someone else.'};}
  return null;
}
export function recallWeights(state){const c=currentChapter(state);for(const o of Object.values(state.objects)){if(o.socketed)continue;const home=rooms.find(r=>r.id===o.home?.room);if(!c||home?.chapter===c.id){if(state.held===o.id)state.held=null;resetObject(world,state,o.id);}}event(state,'recovery','Loose weights have returned to their exhibition stands.');}
export function nextHint(state){const c=currentChapter(state);if(!c)return {title:'Finding your route',text:'Begin at exhibition 01 on the left side of the court. Each completed index illuminates the next doorway. The notebook map lists your route.'};const level=Math.min(3,(state.hints[c.id]||0)+1);state.hints[c.id]=level;return {title:`${c.title} · Hint ${level} of 3`,text:c.hints[level-1]};}
