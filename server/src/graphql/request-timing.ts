import { child } from "../lib/logging/index.js";
import { getLoadedAppConfigValue } from "../services/app-config.js";
import type { GraphQLContext } from "./context.js";

const log = child({ component: "graphql-timing" });

export interface TimingSpan {
  name: string;
  ms: number;
}

export interface RequestTiming {
  enabled: boolean;
  time: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
  summary: () => { totalMs: number; spans: TimingSpan[] };
}

export function isGraphQLTimingEnabled(): boolean {
  return getLoadedAppConfigValue<boolean>("graphql.timing") ?? false;
}

export function createRequestTiming(enabled = isGraphQLTimingEnabled()): RequestTiming {
  const startedAt = performance.now();
  const spans: TimingSpan[] = [];

  return {
    enabled,
    async time<T>(name: string, fn: () => Promise<T>): Promise<T> {
      if (!enabled) return fn();
      const t0 = performance.now();
      try {
        return await fn();
      } finally {
        spans.push({ name, ms: Math.round((performance.now() - t0) * 10) / 10 });
      }
    },
    summary() {
      return {
        totalMs: Math.round((performance.now() - startedAt) * 10) / 10,
        spans,
      };
    },
  };
}

export function logRequestTiming(context: GraphQLContext, operationName: string | null): void {
  const timing = context.timing;
  if (!timing?.enabled) return;
  const { totalMs, spans } = timing.summary();
  if (spans.length === 0) return;
  log.info(
    {
      operationName,
      totalMs,
      spans,
    },
    "GraphQL resolver timing",
  );
}
