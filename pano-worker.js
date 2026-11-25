import {printAssetURL} from './pano-textures.js';
import {prepareArt,recipeArt} from './board-art.js';

function loadArt(recipe,base,priority){
  return prepareArt(recipeArt(recipe),async id=>{
    const response=await fetch(new URL(printAssetURL(id),base),{priority});
    if(!response.ok)throw new Error('Artwork unavailable');
    const image=await createImageBitmap(await response.blob());
    try{
      // Canvas textures keep the same WebGL flip and alpha handling as the editor.
      const surface=new OffscreenCanvas(image.width,image.height);
      surface.getContext('2d').drawImage(image,0,0);return surface;
    }finally{image.close();}
  });
}
let canvas,foregroundArt;
self.onmessage=async({data:{post,size,base,warm}})=>{
  if(warm){
    try{await foregroundArt;await loadArt(warm,base,'low');}catch{/* A visible print can retry. */}
    return;
  }
  try{
    canvas??=new OffscreenCanvas(1,1);
    foregroundArt=loadArt(post.recipe,base,'high');
    const [{printRecipe}]=await Promise.all([import('./pano-renderer.js'),foregroundArt]);
    await printRecipe(post,size,canvas);
    self.postMessage({blob:await canvas.convertToBlob({type:'image/webp',quality:.83})});
  }catch{self.postMessage({failed:true});}
};
