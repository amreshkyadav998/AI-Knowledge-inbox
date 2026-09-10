import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../lib/api';
import type { Item } from '../lib/types';

const POLL_INTERVAL_MS = 1500;

interface ItemsState {
  items: Item[];
  total: number;
  isLoading: boolean;
  error: string | null;
}

/**
 * Owns the saved-items list.
 *
 * Ingestion is asynchronous, so the list is not static: an item arrives as
 * `pending` and becomes `ready` or `failed` later. This hook polls while any
 * item is still in flight and stops as soon as everything settles - the
 * simplest thing that keeps the UI truthful without a websocket. For a
 * multi-user product this would become SSE or a socket; for a single-user
 * inbox, a 1.5s poll that switches itself off is the right amount of machinery.
 */
export function useItems() {
  const [state, setState] = useState<ItemsState>({
    items: [],
    total: 0,
    isLoading: true,
    error: null,
  });

  // Avoids a state update on an unmounted component during Strict Mode's
  // double-invoked effects.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const page = await api.listItems({ limit: 100 });
      if (!mountedRef.current) return;
      setState({
        items: page.items,
        total: page.pagination.total,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      if (!mountedRef.current) return;
      setState((previous) => ({
        ...previous,
        isLoading: false,
        error: error instanceof ApiError ? error.message : 'Could not load your saved items.',
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasWorkInFlight = state.items.some(
    (item) => item.status === 'pending' || item.status === 'processing',
  );

  useEffect(() => {
    if (!hasWorkInFlight) return;
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [hasWorkInFlight, refresh]);

  /** Shows the new item immediately; the poll reconciles it with the server. */
  const addOptimistically = useCallback((item: Item) => {
    setState((previous) => ({
      ...previous,
      items: [item, ...previous.items.filter((existing) => existing.id !== item.id)],
      total: previous.total + 1,
    }));
  }, []);

  const remove = useCallback(async (id: string) => {
    const snapshot = await new Promise<Item[]>((resolve) => {
      setState((previous) => {
        resolve(previous.items);
        return { ...previous, items: previous.items.filter((item) => item.id !== id) };
      });
    });

    try {
      await api.deleteItem(id);
    } catch (error) {
      // Roll back rather than leave the UI lying about what is stored.
      setState((previous) => ({
        ...previous,
        items: snapshot,
        error: error instanceof ApiError ? error.message : 'Could not delete that item.',
      }));
    }
  }, []);

  const reindex = useCallback(
    async (id: string) => {
      try {
        const { item } = await api.reindexItem(id);
        setState((previous) => ({
          ...previous,
          items: previous.items.map((existing) => (existing.id === id ? item : existing)),
        }));
      } catch (error) {
        setState((previous) => ({
          ...previous,
          error: error instanceof ApiError ? error.message : 'Could not retry that item.',
        }));
      }
    },
    [],
  );

  return { ...state, refresh, addOptimistically, remove, reindex, hasWorkInFlight };
}
