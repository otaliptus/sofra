// Keep the most recent checkpoint whole. Adjacent recipes usually differ by
// just one angle, serving or piece, so store only the text needed to go back.
const limit = 200;

function difference(newer, older, selection) {
  const end = Math.min(newer.length, older.length);
  let start = 0, suffix = 0;
  while (start < end && newer[start] === older[start]) start++;
  while (suffix < end - start && newer[newer.length-1-suffix] === older[older.length-1-suffix]) suffix++;
  return [start, newer.length-start-suffix, older.slice(start, older.length-suffix), selection];
}

export function editHistory(saved) {
  let top = null, selection = -1, older = [];
  if (typeof saved?.top === 'string' && Number.isInteger(saved.selection) && Array.isArray(saved.older) &&
      saved.older.length < limit && saved.older.every(edit => Array.isArray(edit) && edit.length === 4 &&
        Number.isInteger(edit[0]) && edit[0] >= 0 && Number.isInteger(edit[1]) && edit[1] >= 0 &&
        typeof edit[2] === 'string' && Number.isInteger(edit[3]))) {
    top = saved.top; selection = saved.selection; older = saved.older.slice();
  }
  return {
    get length() { return top === null ? 0 : older.length + 1; },
    push(state, selected) {
      if (state === top) { selection = selected; return; }
      if (top !== null) {
        older.push(difference(state, top, selection));
        if (older.length >= limit) older.shift();
      }
      top = state; selection = selected;
    },
    peek() { return top === null ? null : {state:top,selected:selection}; },
    pop() {
      if (top === null) return null;
      const entry = {state: top, selected: selection};
      const edit = older.pop();
      if (edit && edit[0] + edit[1] <= top.length) {
        const [start, count, text, previousSelection] = edit;
        top = top.slice(0,start) + text + top.slice(start+count);
        selection = previousSelection;
      } else {
        top = null; older = [];
      }
      return entry;
    },
    pack(budget) {
      if (top === null || top.length > budget) return undefined;
      let size = top.length, i = older.length;
      while (i > 0 && (size += older[i-1][2].length + 32) <= budget) i--;
      return {top, selection, older: older.slice(i)};
    }
  };
}
