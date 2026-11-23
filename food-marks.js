import { clamp, pantry } from './recipe.js';

const flakes={
  'pul-biber':{colors:['#7f2110','#ad3216','#cc4922','#e19b37'],size:4.3,stretch:.63,count:14},
  karabiber:{colors:['#2e261e','#41382f','#69604e','#958570'],size:2.15,stretch:.85,count:19},
  kekik:{colors:['#68633e','#879057','#a39b6c','#6d754a'],size:3.5,stretch:.38,count:14},
  nane:{colors:['#424f30','#5a6942','#727c4e','#354831'],size:2.65,stretch:.65,count:19}
};

function sampler(seed){
  return ()=>{seed=Math.imul(1664525,seed)+1013904223|0;return (seed>>>0)/4294967296;};
}
function alongPath(points,spacing,visit){
  let traveled=0,next=0;
  for(let i=1;i<points.length;i++){
    const [x,y]=points[i-1],dx=points[i][0]-x,dy=points[i][1]-y,len=Math.hypot(dx,dy);
    if(!len)continue;
    const heading=Math.atan2(dy,dx);
    while(next<=traveled+len){
      const f=(next-traveled)/len;visit(x+dx*f,y+dy*f,heading,next);next+=spacing;
    }
    traveled+=len;
  }
  if(!traveled)visit(points[0][0],points[0][1],-.28,0);
}
function scatter(ctx,spec,points,unit,random){
  alongPath(points,22*unit,(x,y)=>{
    for(let i=0;i<spec.count;i++){
      const a=random()*Math.PI*2,r=Math.sqrt(random())*44*unit;
      const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r*.83;
      const size=spec.size*unit*(.45+random()),tilt=random()*Math.PI;
      ctx.save();ctx.translate(px,py);ctx.rotate(tilt);ctx.scale(size,size*spec.stretch);
      ctx.beginPath();ctx.moveTo(-1,0);ctx.lineTo(-.45,-.82);ctx.lineTo(.62,-.94);ctx.lineTo(1,.17);ctx.lineTo(.22,1);ctx.lineTo(-.72,.63);ctx.closePath();
      ctx.fillStyle=spec.colors[Math.floor(random()*spec.colors.length)];ctx.fill();
      ctx.fillStyle='#ffefb076';ctx.fillRect(-.52,-.55,.63,.24);ctx.restore();
    }
  });
}
function squeeze(ctx,id,points,unit,load){
  const red=id==='ketcap',shadow=red?'#6a160b':'#a28a58',body=red?'#ba3019':'#eed8a8',light=red?'#e3532c':'#fff0ce';
  const size=unit*(red?15:17)*(.7+.3*load);
  function line(dx,dy,width,color){
    ctx.beginPath();ctx.moveTo(points[0][0]+dx,points[0][1]+dy);
    for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0]+dx,points[i][1]+dy);
    if(points.length===1)ctx.lineTo(points[0][0]+dx+.01,points[0][1]+dy);
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
  }
  line(size*.11,size*.15,size*.98,shadow);line(0,0,size,body);
  line(-size*.12,-size*.17,size*.38,light);line(-size*.15,-size*.24,size*.11,red?'#f79b70':'#fff7e5');
  const [x,y]=points[0],g=ctx.createRadialGradient(x-size*.22,y-size*.28,0,x,y,size*.66);
  g.addColorStop(0,light);g.addColorStop(.62,body);g.addColorStop(1,shadow);
  ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(x,y,size*.66,size*.60,0,0,Math.PI*2);ctx.fill();
}
// Pull one continuous photographed knife mark along the actual path. Its
// loaded leading edge, streaks, and dry trailing edge occur once per stroke.
function knife(ctx,image,points,unit,load){
  if(points.length===1){
    const [x,y]=points[0],size=68*unit*(.6+.4*load);
    ctx.drawImage(image,x-size*.5,y-size*.34,size,size*.67);return;
  }
  const path=[{x:points[0][0],y:points[0][1],d:0}];
  for(const [x,y] of points.slice(1)){
    const prev=path.at(-1),len=Math.hypot(x-prev.x,y-prev.y);
    if(len>.01)path.push({x,y,d:prev.d+len});
  }
  if(path.length<2){knife(ctx,image,[points[0]],unit,load);return;}
  const length=path.at(-1).d;
  const tip=19*unit,tail=24*unit,total=length+tip+tail;
  function position(d){
    let lo=0,hi=path.length-1;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(path[mid].d<=d)lo=mid;else hi=mid;}
    const a=path[lo],b=path[hi],f=(d-a.d)/(b.d-a.d);
    return [a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f];
  }
  const strips=Math.min(450,Math.ceil(total/(3*unit)));
  for(let i=0;i<strips;i++){
    const t=(i+.5)/strips,d=t*total-tip,[x,y]=position(d);
    const a=position(d-4*unit),b=position(d+4*unit);
    const width=unit*(84+9*Math.sin(t*3.4))*(.64+.36*load)*(1-.36*clamp((d/unit)/950,0,1));
    const sourceX=i*image.width/strips,sourceWidth=image.width/strips;
    ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(b[1]-a[1],b[0]-a[0]));
    const stripWidth=total/strips+.9*unit;
    ctx.drawImage(image,sourceX,0,sourceWidth,image.height,-stripWidth/2,-width/2,stripWidth,width);ctx.restore();
  }
}
function canvas(w,h){
  const surface=document.createElement('canvas');surface.width=w;surface.height=h;return surface;
}

// The last stroke changes on pointer movement. Cache the dry surface so adding
// a point never repaints the entire recipe, including older spice pinches.
export function createCoating(base,width,height,art){
  const w=Math.round(1100*width),h=Math.round(1100*height);
  const dry=canvas(w,h),wet=canvas(w,h),dryCtx=dry.getContext('2d'),ctx=wet.getContext('2d');
  let frozen=[],lastMark=null,lastLength=-1,lastCount=-1;
  function draw(c,mark){
    if(!mark?.line.length)return;
    const points=mark.line.map(([x,y])=>[x*w/1024,y*h/1024]),unit=w/(width*1000);
    const [sx,sy]=mark.line[0],random=sampler(sx*16381+sy*97+mark.food.length*29);
    c.save();c.globalCompositeOperation='source-atop';
    const kind=pantry[mark.food].kind;
    if(kind==='spice')scatter(c,flakes[mark.food],points,unit,random);
    else if(kind==='sauce')squeeze(c,mark.food,points,unit,mark.load??1);
    else knife(c,art['smear-'+mark.food],points,unit,mark.load??1);
    c.restore();
  }
  function update(marks){
    const last=marks.at(-1),length=last?.line.length??0;
    if(lastMark===last&&lastLength===length&&lastCount===marks.length)return false;
    let count=Math.max(0,marks.length-1),reuse=frozen.length<=count&&frozen.every((m,i)=>m===marks[i]);
    if(lastCount<0||!reuse){dryCtx.clearRect(0,0,w,h);dryCtx.drawImage(base,0,0,w,h);frozen=[];}
    for(let i=frozen.length;i<count;i++)draw(dryCtx,marks[i]);
    frozen=marks.slice(0,count);
    ctx.clearRect(0,0,w,h);ctx.drawImage(dry,0,0);draw(ctx,last);
    lastLength=length;lastMark=last;lastCount=marks.length;return true;
  }
  update([]);
  return {surface:wet,update};
}
