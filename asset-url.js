// The production build substitutes content-addressed URLs. Local play uses
// the same artwork directly from the source tree.
export function assetURL(id){
  return typeof SOFRA_ART_URLS==='undefined'?'./assets/'+id+'.webp':SOFRA_ART_URLS[id];
}
