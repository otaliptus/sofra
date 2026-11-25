import {createBoard} from './board-3d.js';
import {printAssetURL} from './pano-textures.js';
import {decodeImage,prepareArt,recipeArt} from './board-art.js';
let studio,lastPost;
export async function printRecipe(post,size,canvas){
  await prepareArt(recipeArt(post.recipe),id=>decodeImage(id,printAssetURL));
  studio??=createBoard(canvas,post.recipe,true).catch(cause=>{
    const error=new Error('3D renderer unavailable',{cause});error.name='ViewerUnavailable';throw error;
  });
  const board=await studio;
  if(post.id!==lastPost){
    board.sync(post.recipe);board.setView(post.angle,post);lastPost=post.id;
  }
  return board.capture(size);
}
