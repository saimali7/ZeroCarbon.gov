"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Resource<T> =
  | { status: "loading"; data?: undefined; error?: undefined }
  | { status: "ready"; data: T; error?: undefined }
  | { status: "error"; data?: T; error: string };

/**
 * Fetch data on mount and on `reload()`. Keeps the previous data while reloading,
 * so screens don't flash back to skeletons after a mutation.
 */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[] = []) {
  const [state, setState] = useState<Resource<T>>({ status: "loading" });
  const loadRef = useRef(load);
  loadRef.current = load;
  const controllerRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const data = await loadRef.current(controller.signal);
      if (!controller.signal.aborted) setState({ status: "ready", data });
      return data;
    } catch (err) {
      if (controller.signal.aborted) return undefined;
      const message = err instanceof Error ? err.message : "Something went wrong";
      setState((prev) => ({ status: "error", data: prev.data, error: message }));
      return undefined;
    }
  }, []);

  useEffect(() => {
    void run();
    return () => controllerRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  /** Replace the data locally (optimistic update or a mutation's response). */
  const setData = useCallback((update: T | ((prev: T | undefined) => T)) => {
    setState((prev) => ({
      status: "ready",
      data: typeof update === "function" ? (update as (p: T | undefined) => T)(prev.data) : update,
    }));
  }, []);

  return { ...state, reload: run, setData };
}
