// The same transmitted colors appear in the pouring glass and on the table.
// Each stop describes a thick path through the brew, a lit side, and a thin edge.
const brews = [
  [0,    [215, 125, 28], [243, 159, 45], [254, 214, 122]],
  [.25,  [165,  49,  9], [211,  87, 12], [252, 174,  58]],
  [.50,  [112,  18, 12], [181,  41, 12], [245, 129,  32]],
  [.80,  [ 83,  12, 15], [148,  31, 18], [231, 100,  27]],
  [1,    [ 70,  10, 15], [133,  26, 16], [224,  86,  24]]
];

export function teaColors(strength) {
  const value = Math.max(0, Math.min(1, strength));
  const index = brews.findIndex((stop, i) => i > 0 && value <= stop[0]);
  const lower = brews[index - 1], upper = brews[index];
  const t = (value - lower[0]) / (upper[0] - lower[0]);
  function blend(band) {
    const rgb = lower[band].map((v, i) => Math.round(v + (upper[band][i] - v) * t));
    return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
  }
  return { deep: blend(1), amber: blend(2), edge: blend(3) };
}

export function teaName(d) {
  if (!d.dem && !d.water) return 'Boş bardak';
  if (!d.dem) return 'Sıcak su';
  const ratio = d.dem/(d.dem+d.water);
  if (ratio >= .80) return 'Tavşan kanı';
  if (ratio >= .55) return 'Demli çay';
  return ratio < .34 ? 'Açık çay' : 'Çay';
}
