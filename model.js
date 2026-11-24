export const foods = [
  { id: 'simit', name: 'Simit', en: 'Sesame bread ring', size: .54 },
  { id: 'menemen', name: 'Menemen', en: 'Eggs, tomato and peppers', size: .52 },
  { id: 'peynir', name: 'Beyaz peynir', en: 'White cheese', size: .365 },
  { id: 'zeytin', name: 'Zeytin', en: 'Mixed olives', size: .31 },
  { id: 'salad', name: 'Söğüş', en: 'Tomato and cucumber', size: .36 },
  { id: 'kaymak', name: 'Bal kaymak', en: 'Honey and clotted cream', size: .31 },
  { id: 'cay', name: 'Çay', en: 'Turkish tea glass', size: .32 },
  { id: 'recel', name: 'Vişne reçeli', en: 'Sour cherry jam', size: .275 },
  { id: 'sucuk', name: 'Sucuklu yumurta', en: 'Eggs with sucuk', size: .40 },
];
export const catalog = Object.fromEntries(foods.map(food => [food.id, food]));
export const cloths = { brick: [154,65,48], olive: [98,113,66], blue: [74,105,132] };
export const limit = 48;
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const makeDish = (type, x, y) => ({ type, x, y, angle: 0, dem: 0, water: 0, part: '', dipped: false });
export function starter() {
  const arrangement = [
    ['simit', .32, .43, -.31], ['menemen', .67, .34, .20],
    ['kaymak', .39, .75, -.13], ['cay', .70, .67, -.10]
  ];
  return { v: 1, cloth: 'brick', dishes: arrangement.map(([type,x,y,angle]) =>
    ({ ...makeDish(type,x,y), angle, dem:type==='cay'?2:0, water:type==='cay'?3:0 })) };
}
export function readTable(value) {
  if (value?.v !== 1 || typeof value.cloth!=='string' || !Object.hasOwn(cloths,value.cloth) || !Array.isArray(value.dishes) || value.dishes.length > limit) return null;
  const dishes = [];
  for (const d of value.dishes) {
    if (!d || typeof d.type!=='string' || !Object.hasOwn(catalog,d.type) || ![d.x,d.y,d.angle].every(Number.isFinite)) return null;
    const tea = n => Number.isInteger(n) ? clamp(n,0,10) : 0;
    const dem = d.type === 'cay' ? tea(d.dem) : 0;
    dishes.push({...makeDish(d.type,clamp(d.x,0,1),clamp(d.y,0,1)),angle:d.angle%(2*Math.PI),
      dem, water:d.type==='cay'?Math.min(tea(d.water),10-dem):0,
      part:d.type==='simit' && ['ring','piece'].includes(d.part)?d.part:'', dipped:d.type==='simit' && d.part==='piece' && d.dipped===true});
  }
  return {v:1,cloth:value.cloth,dishes};
}
// Only stable catalogue identifiers and numeric state travel in a table link.
export function encodeTable(table) {
  const rows=table.dishes.map(d=>[d.type,Math.round(d.x*1000),Math.round(d.y*1000),Math.round(d.angle*1000),d.dem,d.water,d.part,d.dipped?1:0]);
  return btoa(JSON.stringify([1,table.cloth,rows])).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
export function decodeTable(hash) {
  if (!hash.startsWith('#sofra=') || hash.length>9000) return null;
  try {
    const [v,cloth,rows]=JSON.parse(atob(hash.slice(7).replaceAll('-','+').replaceAll('_','/')));
    if (!Array.isArray(rows)||rows.length>limit) return null;
    return readTable({v,cloth,dishes:rows.map(([type,x,y,a,dem,water,part,dipped])=>({type,x:x/1000,y:y/1000,angle:a/1000,dem,water,part,dipped:dipped===1}))});
  } catch { return null; }
}
export function teaName(d) {
  if (!d.dem && !d.water) return 'Boş bardak';
  if (!d.dem) return 'Sıcak su';
  const ratio = d.dem/(d.dem+d.water);
  if (ratio >= .80) return 'Tavşan kanı';
  if (ratio >= .55) return 'Demli çay';
  return ratio < .34 ? 'Açık çay' : 'Çay';
}
