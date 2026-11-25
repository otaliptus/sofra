import {createBoard} from './board-3d.js';
import {prepareArt,recipeArt} from './board-art.js';
let studio;
export async function printRecipe(post,size){
  await prepareArt(recipeArt(post.recipe));
  studio??=createBoard(document.querySelector('#studio canvas'),post.recipe,true).catch(cause=>{
    const error=new Error('3D renderer unavailable',{cause});error.name='ViewerUnavailable';throw error;
  });
  const board=await studio;
  board.sync(post.recipe);
  board.setView(post.angle,post);
  return board.capture(size);
}
