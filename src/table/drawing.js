import { catalog, clamp } from './model.js';
import { assetURL } from '../shared/asset-url.js';
import { drawDish, images } from '../shared/dish-drawing.js';

export async function loadArt() {
  await Promise.all([...Object.keys(catalog),'demlik','kettle','walnut','sini'].map(async id=>{
    const image = new Image();
    image.src = assetURL(id);
    await image.decode();
    images[id]=image;
  }));
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
