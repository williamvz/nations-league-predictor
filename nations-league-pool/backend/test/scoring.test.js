import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePoints } from '../src/services/scoring.js';

test('exact score = 5', () => {
  assert.equal(calculatePoints(2, 1, 2, 1), 5);
  assert.equal(calculatePoints(0, 0, 0, 0), 5);
});

test('correct winner + goal difference = 3', () => {
  assert.equal(calculatePoints(3, 2, 2, 1), 3);
  assert.equal(calculatePoints(1, 1, 2, 2), 3); // draw with wrong score = correct GD
});

test('correct winner only = 2', () => {
  assert.equal(calculatePoints(1, 0, 3, 1), 2);
  assert.equal(calculatePoints(0, 1, 1, 4), 2);
});

test('wrong outcome = 0', () => {
  assert.equal(calculatePoints(2, 0, 0, 2), 0);
  assert.equal(calculatePoints(1, 1, 2, 1), 0);
  assert.equal(calculatePoints(0, 2, 0, 0), 0);
});

test('joker doubles', () => {
  assert.equal(calculatePoints(2, 1, 2, 1, 1, true), 10);
  assert.equal(calculatePoints(1, 0, 3, 1, 1, true), 4);
  assert.equal(calculatePoints(2, 0, 0, 2, 1, true), 0);
});

test('stage multiplier applies', () => {
  assert.equal(calculatePoints(2, 1, 2, 1, 1.5), 7.5);
  assert.equal(calculatePoints(2, 1, 2, 1, 2.5, true), 25);
});
