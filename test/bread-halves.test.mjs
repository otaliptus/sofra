import assert from 'node:assert/strict';
import test from 'node:test';
import { parkedCrown } from '../bread-crown.js';
import { emptyRecipe, photoCoverFor, readRecipe, recipeFromHash } from '../recipe.js';

test('the parked crust clears the plate even for a wide, asymmetric loaf', () => {
  const perimeter = [[-.5, -.14], [.4, -.25], [.48, .17], [-.28, .30]];
  const plateRadius = .78;
  const {x, z, yaw} = parkedCrown({perimeter}, plateRadius);
  for (const [px, pz] of perimeter) {
    const worldX = x + Math.cos(yaw)*px + Math.sin(yaw)*pz;
    const worldZ = z - Math.sin(yaw)*px + Math.cos(yaw)*pz;
    assert.ok(Math.hypot(worldX, worldZ) >= plateRadius + .0549);
  }
});

test('fresh and older breakfasts start with the spare half beside the plate', () => {
  const draft = emptyRecipe('tas-ekmek');
  assert.equal(photoCoverFor(readRecipe(draft)), 'side');
  assert.equal(photoCoverFor(readRecipe({...draft, closed: true})), 'full');
  assert.equal(photoCoverFor(readRecipe({...draft, photoCover: 'open'})), 'open');
});

test('a shared workbench keeps its own top half position and any separate photo arrangement', () => {
  const coverPose = {x: -.31, z: .14, yaw: 1.25};
  const photoCoverPose = {x: .42, z: -.22, yaw: -.3};
  const draft = {...emptyRecipe(), coverPose};
  assert.equal(photoCoverFor(readRecipe(draft)), 'custom');
  const shared = recipeFromHash('#simit=' + btoa(JSON.stringify({...draft, photoCover: 'custom', photoCoverPose})));
  assert.deepEqual(shared.coverPose, coverPose);
  assert.deepEqual(shared.photoCoverPose, photoCoverPose);
  assert.equal(photoCoverFor(shared), 'custom');
  const broken = readRecipe({...draft, coverPose: {x: 9}, photoCover: 'custom'});
  assert.equal(photoCoverFor(broken), 'side');
});
