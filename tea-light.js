import {canvasSurface} from './canvas-surface.js';

// Six cube faces run across each mip. Two bands of RGB pixels preserve the
// high and low bytes of the original half-float lighting, including highlights above 1.
export function unpackTeaLight(image){
  const faceSize=256;
  if(image?.width!==6*faceSize||image.height!==1008)return null;
  const surface=image.getContext?image:canvasSurface(image.width,image.height);
  const ctx=surface.getContext('2d',{willReadFrequently:true});
  if(surface!==image)ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,image.width,image.height).data;
  const faces=Array.from({length:6},()=>({width:faceSize,height:faceSize,mipmaps:[]}));
  let row=0;
  for(let size=faceSize;size>=8;size/=2){
    for(let face=0;face<6;face++){
      const data=new Uint16Array(size*size*4);
      for(let y=0;y<size;y++){
        let high=((row+y)*image.width+face*size)*4,low=high+size*image.width*4;
        for(let x=0;x<size;x++,high+=4,low+=4){
          const index=(y*size+x)*4;
          for(let c=0;c<3;c++)data[index+c]=(pixels[high+c]<<8)|pixels[low+c];
          data[index+3]=0x3c00; // 1.0 in binary16
        }
      }
      faces[face].mipmaps.push({width:size,height:size,data});
    }
    row+=size*2;
  }
  return faces;
}
