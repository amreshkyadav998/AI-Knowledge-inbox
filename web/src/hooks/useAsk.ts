import { useCallback, useRef, useState } from 'react';
import { ApiError, api } from '../lib/api';
import type { Answer } from '../lib/types';

interface AskState {
  answer: Answer | null;
  isAsking: boolean;
  error: ApiError | null;
}

/**
 * Owns one question at a time.
 *
 * A request id guard drops responses from superseded questions: without it, a
 * slow first answer can land after a fast second one and overwrite it, which
 * looks exactly like the model answering the wrong question.
 */
export function useAsk() {
  const [state, setState] = useState<AskState>({ answer: null, isAsking: false, error: null });
  const latestRequest = useRef(0);

  const ask = useCallback(async (question: string) => {
    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;

    setState((previous) => ({ ...previous, isAsking: true, error: null }));

    try {
      const answer = await api.query(question);
      if (latestRequest.current !== requestId) return;
      setState({ answer, isAsking: false, error: null });
    } catch (error) {
      if (latestRequest.current !== requestId) return;
      setState({
        answer: null,
        isAsking: false,
        error:
          error instanceof ApiError
            ? error
            : new ApiError('Something went wrong asking that question.', 'unknown_error', 0, null),
      });
    }
  }, []);

  const reset = useCallback(() => {
    latestRequest.current += 1; // invalidate any in-flight response
    setState({ answer: null, isAsking: false, error: null });
  }, []);

  return { ...state, ask, reset };
}
