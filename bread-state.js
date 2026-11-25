import {breads, boundedCoverPose, pantry} from './recipe.js';

// The stored flags are part of existing share links and album records.
// These events are the only editor operations that change either bread half.
export function editBread(recipe,event,position){
  switch(event){
    case 'toggleLid':
      if(recipe.baseRemoved||!breads[recipe.bread].closable)return;
      recipe.closed=!recipe.closed;
      delete recipe.coverRemoved;
      break;
    case 'toggleBase':
      if(recipe.baseRemoved)delete recipe.baseRemoved;
      else{
        if(recipe.closed)recipe.coverPose=boundedCoverPose(position);
        recipe.closed=false;recipe.baseRemoved=true;recipe.strokes=[];
      }
      return;
    case 'removeAll':
      recipe.baseRemoved=true;recipe.strokes=[];
      recipe.pieces=recipe.pieces.filter(piece=>!pantry[piece.food].bread);
      // Removing every bread also removes the matching top.
    case 'removeTop':
      recipe.coverRemoved=true;recipe.closed=false;
      break;
    case 'restoreTop':
      if(!recipe.coverRemoved)return;
      delete recipe.coverRemoved;
      break;
    case 'placeTop': {
      const pose=boundedCoverPose(position);
      if(!pose)return;
      delete recipe.coverRemoved;recipe.closed=false;recipe.coverPose=pose;
      delete recipe.photoCover;delete recipe.photoCoverPose;
      return;
    }
    default: return;
  }
  delete recipe.coverPose;delete recipe.photoCover;delete recipe.photoCoverPose;
}
