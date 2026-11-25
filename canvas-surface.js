// The editor uses DOM canvases. The Pano print worker uses the same drawing code.
export function canvasSurface(width,height){
  if(typeof document==='undefined')return new OffscreenCanvas(width,height);
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  return canvas;
}
