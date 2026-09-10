import type { Config } from '../config.js';
import type { Logger } from '../logger.js';
import type { EmbeddingProvider } from './embeddings/provider.js';
import type { CompletionProvider } from './llm/provider.js';
import { createGeminiEmbeddings } from './embeddings/gemini.embeddings.js';
import { createOpenAiEmbeddings } from './embeddings/openai.embeddings.js';
import { createLocalEmbeddings } from './embeddings/local.embeddings.js';
import { createGeminiCompletions } from './llm/gemini.llm.js';
import { createOpenAiCompletions } from './llm/openai.llm.js';
import { createLocalCompletions } from './llm/local.llm.js';

export interface AiProviders {
  embeddings: EmbeddingProvider;
  completions: CompletionProvider;
  /** True when the configured provider was unavailable and `local` was used. */
  fellBack: boolean;
}

/**
 * Resolves the configured provider pair, degrading to the keyless local pair
 * when a key is missing. Degrading rather than crashing is a deliberate choice:
 * a reviewer who clones this repo with no key still gets a working app, and the
 * `/health` endpoint plus a startup warning make the degraded state obvious.
 */
export function createProviders(config: Config, logger: Logger): AiProviders {
  const { provider } = config.ai;

  if (provider === 'gemini') {
    if (!config.ai.gemini.apiKey) {
      logger.warn('GEMINI_API_KEY is not set - falling back to the keyless local provider', {
        configured: 'gemini',
        hint: 'Get a free key at https://aistudio.google.com/apikey and set GEMINI_API_KEY in server/.env',
      });
      return { ...localPair(), fellBack: true };
    }
    return {
      embeddings: createGeminiEmbeddings(config.ai.gemini.apiKey, config.ai.gemini.embeddingModel, {
        dimensions: config.ai.gemini.embeddingDimensions,
      }),
      completions: createGeminiCompletions(config.ai.gemini.apiKey, config.ai.gemini.chatModel),
      fellBack: false,
    };
  }

  if (provider === 'openai') {
    if (!config.ai.openai.apiKey) {
      logger.warn('OPENAI_API_KEY is not set - falling back to the keyless local provider', {
        configured: 'openai',
      });
      return { ...localPair(), fellBack: true };
    }
    return {
      embeddings: createOpenAiEmbeddings(config.ai.openai.apiKey, config.ai.openai.embeddingModel),
      completions: createOpenAiCompletions(config.ai.openai.apiKey, config.ai.openai.chatModel),
      fellBack: false,
    };
  }

  return { ...localPair(), fellBack: false };
}

function localPair(): Omit<AiProviders, 'fellBack'> {
  return { embeddings: createLocalEmbeddings(), completions: createLocalCompletions() };
}
