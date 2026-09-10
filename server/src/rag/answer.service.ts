import type { Answer, Citation, RetrievedChunk } from '../domain.js';
import type { Config } from '../config.js';
import type { Logger } from '../logger.js';
import type { CompletionProvider } from './llm/provider.js';
import type { Retriever } from './retriever.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt.js';

const SNIPPET_CHARS = 320;

export interface AskOptions {
  topK?: number;
  minScore?: number;
}

/**
 * Orchestrates retrieve -> prompt -> generate -> cite. Deliberately thin: the
 * interesting decisions live in the retriever, the chunker and the prompt.
 */
export class AnswerService {
  constructor(
    private readonly retriever: Retriever,
    private readonly completions: CompletionProvider,
    private readonly config: Config,
    private readonly logger: Logger,
  ) {}

  async ask(question: string, options: AskOptions = {}): Promise<Answer> {
    const startedAt = Date.now();
    const topK = options.topK ?? this.config.rag.topK;
    // Precedence: per-request override -> configured override -> the floor the
    // embedding model itself recommends.
    const minScore =
      options.minScore ?? this.config.rag.minScore ?? this.retriever.defaultMinScore;

    const retrievalStart = Date.now();
    const retrieval = await this.retriever.retrieve(question, { topK, minScore });
    const retrievalMs = Date.now() - retrievalStart;

    this.logger.info('retrieval complete', {
      event: 'rag.retrieve',
      topK,
      minScore,
      candidatesScanned: retrieval.candidatesScanned,
      hits: retrieval.chunks.length,
      topScore: retrieval.chunks[0]?.score ?? null,
      retrievalMs,
    });

    // Nothing cleared the score floor: answering anyway would mean answering
    // from the model's own memory, which is exactly what this app must not do.
    if (retrieval.chunks.length === 0) {
      const totalMs = Date.now() - startedAt;
      return {
        question,
        answer:
          retrieval.candidatesScanned === 0
            ? 'Nothing is indexed yet. Save a note or a URL first, then ask again.'
            : 'None of your saved content is relevant enough to answer that. Try rephrasing, or save a source that covers it.',
        citations: [],
        grounded: false,
        model: this.completions.id,
        embeddingModel: this.retriever.embeddingModelId,
        timings: { retrievalMs, generationMs: 0, totalMs },
      };
    }

    const { userPrompt, included } = buildUserPrompt(question, retrieval.chunks);

    const generationStart = Date.now();
    const text = await this.completions.complete({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      grounding: {
        question,
        passages: included.map((chunk, index) => ({ marker: index + 1, text: chunk.content })),
      },
    });
    const generationMs = Date.now() - generationStart;
    const totalMs = Date.now() - startedAt;

    this.logger.info('answer generated', {
      event: 'rag.generate',
      model: this.completions.id,
      passages: included.length,
      promptChars: userPrompt.length,
      answerChars: text.length,
      generationMs,
      totalMs,
    });

    return {
      question,
      answer: text,
      citations: included.map(toCitation),
      grounded: true,
      model: this.completions.id,
      embeddingModel: this.retriever.embeddingModelId,
      timings: { retrievalMs, generationMs, totalMs },
    };
  }
}

function toCitation(chunk: RetrievedChunk, index: number): Citation {
  return {
    marker: index + 1,
    chunkId: chunk.id,
    itemId: chunk.itemId,
    itemTitle: chunk.itemTitle,
    sourceType: chunk.itemSourceType,
    url: chunk.itemUrl,
    score: Number(chunk.score.toFixed(4)),
    snippet:
      chunk.content.length <= SNIPPET_CHARS
        ? chunk.content
        : `${chunk.content.slice(0, SNIPPET_CHARS).trimEnd()}...`,
  };
}
