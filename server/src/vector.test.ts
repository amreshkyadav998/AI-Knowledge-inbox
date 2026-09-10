import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cosineSimilarity, decodeVector, dot, encodeVector, normalise } from './vector.js';

describe('vector encoding', () => {
  it('round-trips through the BLOB representation', () => {
    const original = Float32Array.from([0.5, -0.25, 1, 0]);
    const decoded = decodeVector(encodeVector(original));
    assert.deepEqual(Array.from(decoded), Array.from(original));
  });

  it('decodes an unaligned buffer without corrupting values', () => {
    const original = Float32Array.from([1, 2, 3, 4]);
    // Simulate the misaligned slice SQLite can hand back.
    const padded = Buffer.concat([Buffer.alloc(1), encodeVector(original)]);
    const decoded = decodeVector(padded.subarray(1));
    assert.deepEqual(Array.from(decoded), Array.from(original));
  });
});

describe('normalise', () => {
  it('scales to unit length', () => {
    const unit = normalise(Float32Array.from([3, 4]));
    assert.ok(Math.abs(Math.hypot(unit[0]!, unit[1]!) - 1) < 1e-6);
  });

  it('leaves a zero vector alone rather than dividing by zero', () => {
    const zero = normalise(Float32Array.from([0, 0]));
    assert.deepEqual(Array.from(zero), [0, 0]);
  });

  it('makes the dot product equal the cosine similarity', () => {
    const a = normalise(Float32Array.from([1, 2, 3]));
    const b = normalise(Float32Array.from([2, 1, 0]));
    assert.ok(Math.abs(dot(a, b) - cosineSimilarity(a, b)) < 1e-6);
  });
});

describe('cosineSimilarity', () => {
  it('scores identical vectors at 1', () => {
    const a = Float32Array.from([1, 2, 3]);
    assert.ok(Math.abs(cosineSimilarity(a, a) - 1) < 1e-6);
  });

  it('scores orthogonal vectors at 0', () => {
    assert.equal(cosineSimilarity(Float32Array.from([1, 0]), Float32Array.from([0, 1])), 0);
  });

  it('returns 0 rather than NaN when a vector is empty', () => {
    assert.equal(cosineSimilarity(Float32Array.from([0, 0]), Float32Array.from([1, 1])), 0);
  });

  it('refuses to compare mismatched dimensions', () => {
    assert.throws(
      () => cosineSimilarity(Float32Array.from([1]), Float32Array.from([1, 2])),
      /dimension mismatch/,
    );
  });
});
