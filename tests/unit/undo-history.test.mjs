import assert from 'node:assert/strict';
import test from 'node:test';
import { editHistory } from '../../src/editor/undo-history.js';

test('restores the topping, spread and rotation independently after reopening the draft', () => {
  const cheese = {food:'white-cheese', a:0};
  const coating = {food:'cream', line:[[124,295]]};
  const bare = JSON.stringify({pieces:[cheese]});
  const coated = JSON.stringify({pieces:[{...cheese, marks:[coating]}]});
  const rotated = JSON.stringify({pieces:[{...cheese, a:0.262, marks:[coating]}]});
  const history = editHistory();
  history.push(bare, 0);
  history.push(coated, 0);
  history.push(rotated, 0);

  const reopened = editHistory(JSON.parse(JSON.stringify(history.pack(10000))));
  for (const state of [rotated, coated, bare]) assert.deepEqual(reopened.pop(), {state, selected:0});
  assert.equal(reopened.pop(), null);
});

test('keeps the newest 200 checkpoints and can save a shorter history without changing it', () => {
  const history = editHistory();
  for (let i = 0; i < 240; i++) history.push(JSON.stringify({angle:i}), -1);
  assert.equal(history.length, 200);
  const small = editHistory(history.pack(90));
  assert.ok(small.length > 0 && small.length < 200);
  assert.equal(small.pop().state, '{"angle":239}');
  const restored = editHistory(history.pack(100000));
  for (let i = 239; i >= 40; i--) assert.equal(JSON.parse(restored.pop().state).angle, i);
  assert.equal(history.length, 200);
  assert.equal(restored.length, 0);
});
