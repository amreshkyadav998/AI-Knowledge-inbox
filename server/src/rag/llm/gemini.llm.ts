import type { CompletionProvider } from './provider.js';
import { postJson } from '../http-json.js';
import { AppError } from '../../http/errors.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

interface GenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

export function createGeminiCompletions(apiKey: string, model: string): CompletionProvider {
  const modelPath = model.startsWith('models/') ? model : `models/${model}`;

  return {
    id: `gemini:${model}`,
    async complete(request) {
      const response = await postJson<GenerateContentResponse>({
        provider: 'gemini',
        url: `${BASE_URL}/${modelPath}:generateContent`,
        headers: { 'x-goog-api-key': apiKey },
        timeoutMs: 45_000,
        body: {
          systemInstruction: { parts: [{ text: request.systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: request.userPrompt }] }],
          generationConfig: {
            temperature: request.temperature ?? 0.2,
            // Gemini 3.x models spend part of this budget on internal
            // reasoning before emitting any text, so a budget sized only for
            // the visible answer comes back empty with finishReason MAX_TOKENS.
            maxOutputTokens: request.maxOutputTokens ?? 2048,
          },
        },
      });

      if (response.promptFeedback?.blockReason) {
        throw new AppError(
          'provider_error',
          `Gemini blocked the prompt (${response.promptFeedback.blockReason}).`,
        );
      }

      const candidate = response.candidates?.[0];
      const text = (candidate?.content?.parts ?? [])
        .map((part) => part.text ?? '')
        .join('')
        .trim();

      if (!text) {
        const reason = candidate?.finishReason ?? 'unknown';
        throw new AppError(
          'provider_error',
          reason === 'MAX_TOKENS'
            ? 'Gemini hit its output token limit before producing an answer. Raise maxOutputTokens or shorten the retrieved context.'
            : `Gemini returned no text (finishReason: ${reason}).`,
        );
      }
      return text;
    },
  };
}
