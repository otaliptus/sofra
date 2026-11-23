import { catalog, clamp } from './model.js';
import { teaColors } from './tea-colors.js';

export const images = {};
export async function loadArt() {
  await Promise.all([...Object.keys(catalog),'demlik','kettle','walnut','sini'].map(async id=>{
    const image = new Image();
    image.src = new URL('./assets/'+id+'.webp',import.meta.url).href;
    await image.decode();
    images[id]=image;
  }));
}
function random(seed) {
  let n=seed;
  return ()=>{n=(1664525*n+1013904223)>>>0;return n/4294967296;};
}
function trayDiameter(w,h) { return Math.min(h*.95,w*1.08); }

// The middle of saved layouts follows the round tray on both portrait and landscape
// screens. The outer bands let players move dishes all the way to the table edges.
function axisMap(value, length, diameter, inverse=false) {
  const inner=Math.min(length*.84,diameter*.85);
  const edge=(length-inner)/2;
  const input=inverse?[0,edge,length-edge,length]:[0,.10,.90,1];
  const output=inverse?[0,.10,.90,1]:[0,edge,length-edge,length];
  const i=value<input[1]?0:value>input[2]?2:1;
  const fraction=(value-input[i])/(input[i+1]-input[i]);
  return output[i]+fraction*(output[i+1]-output[i]);
}
export function tablePoint(x,y,w,h) {
  const diameter=trayDiameter(w,h);
  return {x:axisMap(x,w,diameter,true),y:axisMap(y,h,diameter,true)};
}
export function boxFor(d,w,h) {
  const diameter=trayDiameter(w,h);
  const size=diameter*catalog[d.type].size;
  const x=clamp(axisMap(d.x,w,diameter),size*.43,w-size*.43);
  const y=clamp(axisMap(d.y,h,diameter),size*.43,h-size*.43);
  return {x,y,size};
}
let backdrop;
function tableSurface(width,height,cloth) {
  if(backdrop?.width===width && backdrop.height===height && backdrop.cloth===cloth) return backdrop.canvas;
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const c=canvas.getContext('2d');
  const wood=images.walnut;
  const scale=Math.max(width/wood.width,height/wood.height);
  const left=(width-wood.width*scale)*.14, top=(height-wood.height*scale)*.14;
  c.save();c.translate(left,top);c.scale(scale,scale);c.drawImage(wood,0,0);
  if(cloth!=='brick'){
    // The linen occupies the top-left corner of the tabletop photograph.
    c.save();c.beginPath();
    for(const [i,[x,y]] of [[0,0],[.305,0],[.25,.05],[.185,.13],[.133,.22],[.076,.33],[.03,.41],[0,.49]].entries()){
      if(!i)c.moveTo(x*wood.width,y*wood.height);else c.lineTo(x*wood.width,y*wood.height);
    }
    c.closePath();c.clip();c.filter=cloth==='olive'?'hue-rotate(52deg) saturate(.7)':'hue-rotate(194deg) saturate(.65)';c.drawImage(wood,0,0);c.restore();
  }
  c.restore();
  const diameter=trayDiameter(width,height),x=width/2,y=height/2;
  c.save();c.translate(x,y);
  c.shadowColor='#120c09bb';c.shadowBlur=diameter*.023;c.shadowOffsetX=diameter*.011;c.shadowOffsetY=diameter*.019;
  c.drawImage(images.sini,-diameter/2,-diameter/2,diameter,diameter);c.restore();
  backdrop={width,height,cloth,canvas};return canvas;
}
function cupLiquid(c,d) {
  const amount=(d.dem+d.water)/10;if(!amount)return;
  const ratio=d.dem/(d.dem+d.water), y=279-amount*187;
  const points=[[92,84],[123,73],[164,61],[199,58],[233,61],[260,66],[279,61]];
  const next=points.findIndex(p=>p[0]>=y),i=Math.max(1,next);
  const [ay,ar]=points[i-1],[by,br]=points[i],rx=ar+(br-ar)*clamp((y-ay)/(by-ay),0,1);
  const ry=10+amount*8;
  c.save();c.beginPath();c.moveTo(209-rx,y);
  for(const [py,pr] of points.filter(p=>p[0]>y))c.lineTo(209-pr,py);
  c.bezierCurveTo(152,300,258,304,270,279);
  for(const [py,pr] of points.filter(p=>p[0]>y).reverse())c.lineTo(209+pr,py);
  c.lineTo(209+rx,y);c.ellipse(209,y,rx,ry,0,0,Math.PI,true);c.closePath();c.clip();
  const brew=ratio>0?teaColors(ratio):null;
  if(ratio>0){
    const grad=c.createLinearGradient(209-rx,0,209+rx,0);
    for(const [stop,color] of [[0,brew.edge],[.10,brew.amber],[.30,brew.deep],[.59,brew.deep],[.79,brew.amber],[.94,brew.amber],[1,brew.edge]]){
      grad.addColorStop(stop,color);
    }
    c.fillStyle=grad;c.fillRect(113,y-ry,202,320);
    const glow=c.createRadialGradient(197,286,2,197,281,60);
    glow.addColorStop(0,brew.edge+'b0');glow.addColorStop(.5,brew.amber+'64');glow.addColorStop(1,brew.amber+'00');
    c.fillStyle=glow;c.fillRect(115,180,195,120);
    c.save();c.globalCompositeOperation='soft-light';c.globalAlpha=.26;
    c.drawImage(images.cay,0,0,418,418);c.restore();
    c.beginPath();c.moveTo(153,y-5);c.bezierCurveTo(166,197,152,248,151,264);
    c.strokeStyle='#fff1ca62';c.lineWidth=3;c.stroke();
    c.beginPath();c.moveTo(265,y);c.quadraticCurveTo(254,215,269,257);c.strokeStyle='#ffddb12b';c.lineWidth=2;c.stroke();
  }else{
    c.fillStyle='#b8cac630';c.fillRect(112,65,207,250);
  }
  c.restore();
  const surface=c.createLinearGradient(209-rx,y,209+rx,y);
  surface.addColorStop(0,brew?brew.edge:'#c7d9d18a');
  surface.addColorStop(.14,brew?brew.amber:'#d8e4de8a');
  surface.addColorStop(.64,brew?brew.deep:'#d8e4de8a');
  surface.addColorStop(.93,brew?brew.amber:'#c9d6d28a');
  surface.addColorStop(1,brew?brew.edge:'#c9d6d28a');
  c.beginPath();c.ellipse(209,y,rx,ry,0,0,Math.PI*2);c.fillStyle=surface;c.fill();
  c.strokeStyle=brew?brew.edge+'be':'#f5ecda88';c.lineWidth=1.5;c.stroke();
  c.beginPath();c.ellipse(209,y,rx-3,ry-1,0,Math.PI,Math.PI*1.39);c.strokeStyle='#fff2d6a6';c.lineWidth=2.3;c.stroke();
}
// Both parts use the same uneven break line, so the two torn ends match.
function tearEdge(angle) {
  return [0,56,83,94,106,114,126,138,151,164,180,320].map((r,i)=>{
    const rough=[0,0,-2,3,-3,4,0,-3,3,-2,0,0][i];
    return [209+Math.cos(angle)*r-Math.sin(angle)*rough,209+Math.sin(angle)*r+Math.cos(angle)*rough];
  });
}
const cutStart=tearEdge(-.50),cutEnd=tearEdge(1.08);
function tornClip(c,piece) {
  const edge=(points)=>points.forEach(([x,y])=>c.lineTo(x,y));
  c.beginPath();c.moveTo(209,209);edge(cutStart);c.arc(209,209,320,-.50,1.08,piece!=='piece');
  edge([...cutEnd].reverse());c.closePath();c.clip();
}
function crumbFace(c,angle,inner,outer) {
  c.save();c.translate(209,209);c.rotate(angle);
  const face=c.createLinearGradient(0,-6,0,4);
  face.addColorStop(0,'#a86430');face.addColorStop(.35,'#e0b07c');face.addColorStop(1,'#f0ce99');
  c.beginPath();c.moveTo(inner,0);c.lineTo(inner+6,-4);c.lineTo(inner+15,-3);c.lineTo(inner+27,-6);
  c.lineTo(outer-10,-4);c.lineTo(outer,-1);c.lineTo(outer-4,3);c.lineTo(inner+8,4);c.closePath();c.fillStyle=face;c.fill();
  const rand=random(91);
  for(let i=0;i<20;i++){const x=inner+5+rand()*(outer-inner-12);c.fillStyle=i%3?'#a77344':'#fbdfac';c.fillRect(x,-2+rand()*4,1+rand()*2,1);}
  c.restore();
}
export function drawDish(c,d,x,y,size,lifted=false) {
  const image=images[d.type];if(!image)return;
  c.save();c.translate(x,y);c.rotate(d.angle+(lifted?-.045:0));c.scale(size/418,size/418);
  // Center a torn bite under its own handle so dragging follows the visible piece.
  c.translate(d.part==='piece'?-317:-209,d.part==='piece'?-239:-209);
  c.save();
  if(d.part)tornClip(c,d.part);
  c.shadowColor=lifted?'#160c08a1':'#26191092';c.shadowBlur=lifted?14:5;c.shadowOffsetX=lifted?9:3;c.shadowOffsetY=lifted?14:5;
  c.drawImage(image,0,0,418,418);c.restore();
  if(d.part){
    c.save();tornClip(c,d.part);crumbFace(c,-.50,68,159);crumbFace(c,1.08,72,160);c.restore();
  }
  if(d.type==='cay')cupLiquid(c,d);
  if(d.dipped){
    c.save();tornClip(c,'piece');
    c.beginPath();c.ellipse(330,156,27,9,-.47,0,Math.PI*2);c.fillStyle='#f5e3a8';c.fill();
    c.beginPath();c.ellipse(331,157,20,4,-.47,0,Math.PI*2);c.fillStyle='#d88a1d';c.fill();c.restore();
  }
  c.restore();
}
// Cache the textured tabletop at the canvas backing resolution between gestures.
export function drawTable(c,w,h,table,lifted=-1) {
  const density=c.getTransform().a;
  c.drawImage(tableSurface(Math.round(w*density),Math.round(h*density),table.cloth),0,0,w,h);
  const draw=(d,isLifted)=>{
    const {x,y,size}=boxFor(d,w,h);
    drawDish(c,d,x,y,size*(isLifted?1.035:1),isLifted);
  };
  table.dishes.forEach((d,i)=>{if(i!==lifted)draw(d,false);});
  if(lifted>=0 && table.dishes[lifted])draw(table.dishes[lifted],true);
}
export function drawPour(c,d,kind,progress) {
  const w=c.canvas.width,h=c.canvas.height;c.clearRect(0,0,w,h);
  drawDish(c,{...d,angle:0},w*.42,h*.59,h*.91);
  if(!kind)return;
  const phase=Math.sin(Math.PI*progress),spoutX=w*.46,spoutY=h*.16;
  c.save();c.translate(spoutX,spoutY);c.rotate(-phase*.32);
  const pot=images[kind==='dem'?'demlik':'kettle'];
  if(pot)c.drawImage(pot,-3,-h*.15,w*.54,h*.48);
  c.restore();
  if(phase>.2){c.strokeStyle=kind==='dem'?'#b4430cde':'#a2c6cbad';c.lineWidth=phase*4;c.beginPath();c.moveTo(spoutX+4,spoutY+4);c.quadraticCurveTo(spoutX-6,h*.27,w*.42,h*.35);c.stroke();}
}
