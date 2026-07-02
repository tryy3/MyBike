import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { saveAuthReturnTo } from "./auth-return-to";
import { ApiError } from "./api";

function redirectToLogin(): void {
  if (window.location.pathname === "/login") return;
  saveAuthReturnTo();
  window.location.assign("/login");
}

function handleAuthError(queryClient: QueryClient, error: unknown): void {
  if (error instanceof ApiError && error.status === 401) {
    queryClient.clear();
    redirectToLogin();
  }
}

export function createQueryClient() {
  const queryClientRef: { current?: QueryClient } = {};
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (queryClientRef.current) {
          handleAuthError(queryClientRef.current, error);
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        if (queryClientRef.current) {
          handleAuthError(queryClientRef.current, error);
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
            return false;
          }
          return failureCount < 3;
        },
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
  queryClientRef.current = queryClient;
  return queryClient;
}
