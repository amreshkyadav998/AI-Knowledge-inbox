export interface GroundingPassage {
  /** 1-based citation marker, matching `[1]` in the rendered prompt. */
  marker: number;
  text: string;
}

export interface CompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
  /** Low by default: this is a grounded-answer task, not creative writing. */
  temperature?: number;
  /**
   * The same context that was rendered into `userPrompt`, in structured form.
   * Hosted models ignore it and read the prompt. The keyless local provider
   * uses it to build an extractive answer without re-parsing prose.
   */
  grounding?: { question: string; passages: readonly GroundingPassage[] };
}

export interface CompletionProvider {
  /** Stable identifier, e.g. `gemini:gemini-2.0-flash`. Echoed in responses. */
  readonly id: string;
  complete(request: CompletionRequest): Promise<string>;
}
