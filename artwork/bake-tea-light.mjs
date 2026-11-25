// Serve the source tree on loopback and set SOFRA_LOCAL_URL to its address.
// Run with Playwright (or PLAYWRIGHT_PATH) and cwebp installed.
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const site=new URL(process.env.SOFRA_LOCAL_URL||'http://127.0.0.1:4211/');
if(!['localhost','127.0.0.1','[::1]'].includes(site.hostname))throw Error('Serve the source tree on loopback.');
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage();
  await page.goto(new URL('workbench.css',site).href);
  const png=await page.evaluate(async()=>{
    const THREE=await import('./node_modules/three/build/three.module.js');
    const {renderTeaLight}=await import('./tea-glass.js');
    const renderer=new THREE.WebGLRenderer(),gl=renderer.getContext(),cube=renderTeaLight(renderer);
    const levels=cube.texture.mipmaps,atlas=document.createElement('canvas');
    atlas.width=6*cube.width;atlas.height=2*levels.reduce((sum,level)=>sum+level.height,0);
    const ctx=atlas.getContext('2d',{alpha:false});
    let row=0;
    for(const [lod,{width:size}] of levels.entries()){
      for(const [face,source] of [1,0,2,3,4,5].entries()){
        renderer.setRenderTarget(cube,source,lod);
        const hdr=new Uint16Array(size*size*4);
        gl.readPixels(0,0,size,size,gl.RGBA,gl.HALF_FLOAT,hdr);
        if(gl.getError()!==gl.NO_ERROR)throw Error('Cannot read the reflection cube.');
        const tile=ctx.createImageData(size,2*size);
        for(let y=0;y<size;y++)for(let x=0;x<size;x++){
          // File cubemaps use the opposite X axis from Three render-target cubemaps.
          const src=(y*size+size-1-x)*4,high=(y*size+x)*4,low=high+4*size*size;
          for(let c=0;c<3;c++){
            tile.data[high+c]=hdr[src+c]>>8;tile.data[low+c]=hdr[src+c]&255;
          }
          tile.data[high+3]=tile.data[low+3]=255;
        }
        ctx.putImageData(tile,face*size,row);
      }
      row+=size*2;
    }
    cube.dispose();renderer.dispose();
    return atlas.toDataURL('image/png').split(',')[1];
  });
  const image=execFileSync('cwebp',['-quiet','-lossless','-m','6','-o','-','--','-'],{
    input:Buffer.from(png,'base64'),maxBuffer:8*1024*1024
  });
  await writeFile(new URL('../assets/tea-light.webp',import.meta.url),image);
}finally{await browser.close();}
