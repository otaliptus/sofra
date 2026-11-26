// Each accepted edge starts a new visit, including re-entry into the same phase.
// Async callers retain the visit that started their work.
export function workflow(edges) {
  let visit = {state: 'idle'};
  return {
    get state() { return visit.state; },
    get visit() { return visit; },
    send(event, owner = visit) {
      if (owner !== visit) return null;
      const next = event === 'dismiss' ? 'idle' : edges[visit.state][event];
      if (typeof next !== 'string') return null;
      visit = {state: next};
      return visit;
    }
  };
}

export const photoEdges = {
  idle: {capture: 'encoding', albumPhoto: 'preview'},
  encoding: {encoded: 'preview', failed: 'idle'},
  preview: {save: 'saving', compose: 'form'},
  saving: {saved: 'preview', failed: 'preview'},
  form: {back: 'preview', publish: 'publishing'},
  publishing: {published: 'published', back: 'preview', failed: 'form'},
  published: {}
};

export const detailEdges = {
  idle: {open: 'loading'},
  loading: {loaded: 'ready', failed: 'error'},
  ready: {vote: 'voting', askReport: 'confirmReport', askRemove: 'confirmRemove'},
  confirmReport: {cancel: 'ready', report: 'reporting'},
  confirmRemove: {cancel: 'ready', remove: 'removing'},
  voting: {success: 'ready', failed: 'ready'},
  reporting: {success: 'ready', failed: 'ready'},
  removing: {success: 'idle', failed: 'ready'},
  error: {}
};

export const radioEdges = {
  idle: {play: 'requested'},
  requested: {attempt: 'requested', playing: 'playing', denied: 'idle', exhausted: 'unavailable'},
  playing: {attempt: 'requested', exhausted: 'unavailable'},
  unavailable: {play: 'requested'}
};

export const gestureOwners = {
  'piece': 'canvas', 'cover-move': 'canvas', 'orbit': 'canvas', 'ink': 'canvas',
  'turn': 'handle', 'cover-turn': 'handle',
  'press': 'shelf', 'scroll': 'shelf', 'place': 'shelf',
  'lid': 'drink', 'straw': 'drink', 'slider': 'slider'
};

export function finishGesture(gesture, surface, event) {
  if (!gesture || gestureOwners[gesture.kind] !== surface || gesture.id !== event.pointerId) return null;
  if (event.type === 'pointerup') return 'commit';
  if (event.type === 'pointercancel' || event.type === 'lostpointercapture') return 'cancel';
  return null;
}
