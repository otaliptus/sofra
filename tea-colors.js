// The same transmitted colors appear in the pouring glass and on the table.
// Each stop describes a thick path through the brew, a lit side, and a thin edge.
const brews = [
  [0,    [220, 130, 30], [247, 164, 47], [255, 217, 126]],
  [.25,  [170,  53,  9], [217,  92, 12], [255, 179,  60]],
  [.50,  [116,  19, 12], [185,  45, 12], [248, 133,  34]],
  [1,    [ 66,   9, 13], [125,  24, 13], [221,  85,  23]]
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
