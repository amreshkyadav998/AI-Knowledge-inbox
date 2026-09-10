import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chunkText, normaliseText } from './chunker.js';

const OPTIONS = { targetChars: 300, overlapChars: 50 };

describe('normaliseText', () => {
  it('collapses carriage returns and runs of blank lines', () => {
    assert.equal(normaliseText('a\r\n\r\n\r\n\r\nb'), 'a\n\nb');
  });

  it('trims trailing whitespace before newlines', () => {
    assert.equal(normaliseText('a   \nb'), 'a\nb');
  });
});

describe('chunkText', () => {
  it('returns nothing for blank input', () => {
    assert.deepEqual(chunkText('   \n\n  ', OPTIONS), []);
  });

  it('keeps short text as a single chunk', () => {
    const chunks = chunkText('One short paragraph about badgers.', OPTIONS);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]!.content, 'One short paragraph about badgers.');
  });

  it('produces offsets that resolve back to the source text', () => {
    const text = normaliseText(makeParagraphs(12));
    for (const chunk of chunkText(text, OPTIONS)) {
      // The stored content is trimmed, so it must be *contained* in the span.
      const span = text.slice(chunk.charStart, chunk.charEnd);
      assert.ok(
        span.includes(chunk.content.slice(0, 40)),
        `chunk ${chunk.ordinal} does not match its [${chunk.charStart}, ${chunk.charEnd}) span`,
      );
    }
  });

  it('covers the whole document with no gaps between consecutive spans', () => {
    const text = normaliseText(makeParagraphs(12));
    const chunks = chunkText(text, OPTIONS);

    assert.ok(chunks.length > 1, 'expected the document to split');
    assert.equal(chunks[0]!.charStart, 0);
    assert.equal(chunks.at(-1)!.charEnd, text.length);

    for (let i = 1; i < chunks.length; i += 1) {
      // Overlap means each chunk starts at or before the previous one ended.
      assert.ok(
        chunks[i]!.charStart <= chunks[i - 1]!.charEnd,
        `gap between chunk ${i - 1} and ${i}`,
      );
    }
  });

  it('overlaps consecutive chunks so a fact on a boundary stays retrievable', () => {
    const text = normaliseText(makeParagraphs(12));
    const chunks = chunkText(text, OPTIONS);
    const overlapping = chunks
      .slice(1)
      .filter((chunk, index) => chunk.charStart < chunks[index]!.charEnd);

    assert.ok(overlapping.length > 0, 'expected at least one overlapping boundary');
  });

  it('splits a single unbroken run of text instead of emitting one giant chunk', () => {
    const wall = 'x'.repeat(2000);
    const chunks = chunkText(wall, OPTIONS);

    assert.ok(chunks.length > 1);
    for (const chunk of chunks) {
      assert.ok(
        chunk.content.length <= OPTIONS.targetChars + OPTIONS.overlapChars,
        `chunk of ${chunk.content.length} chars exceeds the budget`,
      );
    }
  });

  it('does not emit a trailing fragment', () => {
    const text = normaliseText(`${makeParagraphs(6)}\n\nTiny.`);
    const chunks = chunkText(text, OPTIONS);
    assert.ok(chunks.at(-1)!.content.length > 5);
  });

  it('numbers chunks contiguously from zero', () => {
    const chunks = chunkText(normaliseText(makeParagraphs(10)), OPTIONS);
    assert.deepEqual(
      chunks.map((chunk) => chunk.ordinal),
      chunks.map((_, index) => index),
    );
  });
});

function makeParagraphs(count: number): string {
  return Array.from(
    { length: count },
    (_, index) =>
      `Paragraph ${index} discusses a distinct topic. It contains a couple of sentences so that the ` +
      `chunker has real boundaries to work with. This is sentence three of paragraph ${index}.`,
  ).join('\n\n');
}
