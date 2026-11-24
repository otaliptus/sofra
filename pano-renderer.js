import {createBoard} from './board-3d.js';
let studio;
export async function printRecipe(post,size){
  studio??=createBoard(document.querySelector('#studio canvas'));
  const board=await studio;
  board.sync(post.recipe);
  board.setView(post.angle,post);
  return board.capture(size);
}
