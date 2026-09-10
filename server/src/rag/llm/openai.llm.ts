import type { CompletionProvider } from './provider.js';
import { postJson } from '../http-json.js';
import { AppError } from '../../http/errors.js';

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
}

export function createOpenAiCompletions(apiKey: string, model: string): CompletionProvider {
  return {
    id: `openai:${model}`,
    async complete(request) {
      const response = await postJson<ChatCompletionResponse>({
        provider: 'openai',
        url: 'https://api.openai.com/v1/chat/completions',
        headers: { authorization: `Bearer ${apiKey}` },
        timeoutMs: 45_000,
        body: {
          model,
          temperature: request.temperature ?? 0.2,
          max_tokens: request.maxOutputTokens ?? 1024,
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
        },
      });

      const text = response.choices?.[0]?.message?.content?.trim();
      if (!text) throw new AppError('provider_error', 'OpenAI returned an empty completion.');
      return text;
    },
  };
}
