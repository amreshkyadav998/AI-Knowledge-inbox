import { Router } from 'express';
import type { Container } from '../../container.js';

export function healthRoutes(container: Container): Router {
  const router = Router();

  /**
   * GET /api/health
   *
   * Deliberately more than `{ ok: true }`. It answers the questions that
   * actually get asked when something looks wrong: which models am I really
   * using, did the app quietly fall back to the offline provider, is anything
   * stuck in the queue, and is there an embedding-model mismatch between the
   * stored chunks and the live provider (which would make retrieval return
   * nothing while looking perfectly healthy).
   */
  router.get('/health', (_req, res) => {
    const statusCounts = container.items.countByStatus();
    const storedModels = container.chunks.distinctModels();
    const activeModel = container.ai.embeddings.id;
    const staleModels = storedModels.filter((model) => model !== activeModel);

    res.json({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      ai: {
        configuredProvider: container.config.ai.provider,
        embeddingModel: activeModel,
        chatModel: container.ai.completions.id,
        degraded: container.ai.fellBack,
        ...(container.ai.fellBack
          ? { degradedReason: 'No API key configured; using the offline local provider.' }
          : {}),
      },
      index: {
        items: statusCounts,
        chunks: container.chunks.count(),
        ...(staleModels.length > 0
          ? {
              warning: 'Some chunks were embedded with a different model and are not searchable.',
              staleEmbeddingModels: staleModels,
            }
          : {}),
      },
      queue: container.worker.depth,
      retrieval: {
        topK: container.config.rag.topK,
        minScore: container.config.rag.minScore ?? container.ai.embeddings.suggestedMinScore,
        minScoreSource: container.config.rag.minScore === null ? 'embedding-model' : 'config',
        chunkTargetChars: container.config.rag.chunkTargetChars,
        chunkOverlapChars: container.config.rag.chunkOverlapChars,
      },
    });
  });

  return router;
}
