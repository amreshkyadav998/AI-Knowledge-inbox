/**
 * Vectors are stored as raw little-endian float32 BLOBs: compact, and decoding
 * is a zero-copy view rather than JSON.parse over thousands of numbers.
 */

export function encodeVector(values: readonly number[] | Float32Array): Buffer {
  const floats = values instanceof Float32Array ? values : Float32Array.from(values);
  return Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength);
}

export function decodeVector(buffer: Buffer): Float32Array {
  // Copy when the BLOB is not 4-byte aligned; Float32Array views demand it.
  if (buffer.byteOffset % 4 === 0) {
    return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  }
  const copy = Buffer.from(buffer);
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
}

/** L2-normalise in place so similarity collapses to a dot product. */
export function normalise(vector: Float32Array): Float32Array {
  let sumSquares = 0;
  for (let i = 0; i < vector.length; i += 1) sumSquares += vector[i]! * vector[i]!;
  const magnitude = Math.sqrt(sumSquares);
  if (magnitude === 0) return vector;
  for (let i = 0; i < vector.length; i += 1) vector[i] = vector[i]! / magnitude;
  return vector;
}

/** Dot product. Correct as cosine similarity only for normalised inputs. */
export function dot(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += a[i]! * b[i]!;
  return total;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dotProduct += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
}
