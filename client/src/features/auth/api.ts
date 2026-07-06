import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { signIn, signOut, signUp } from "@/lib/auth-client";
import { api, queryKeys } from "@/lib/api";
import { clearAuthReturnTo, peekAuthReturnTo } from "@/lib/auth-return-to";
import type { LoginInput, RegisterInput } from "shared";

export function useStravaAuthConfig() {
  return useQuery({
    queryKey: queryKeys.stravaConfig,
    queryFn: () => api.getStravaConfig(),
    staleTime: 60_000,
  });
}

export function useSignInWithStrava() {
  return useMutation({
    mutationFn: async (options?: { requestSignUp?: boolean }) => {
      const result = await signIn.social({
        provider: "strava",
        callbackURL: peekAuthReturnTo(),
        requestSignUp: options?.requestSignUp,
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Strava sign-in failed");
      }
      return result.data;
    },
  });
}

export function useSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: LoginInput) => {
      const result = await signIn.email({
        email: data.email,
        password: data.password,
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Sign in failed");
      }
      return result.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.bikes });
    },
  });
}

export function useSignUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: RegisterInput) => {
      const result = await signUp.email({
        name: data.name,
        email: data.email,
        password: data.password,
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Sign up failed");
      }
      return result.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.bikes });
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async () => {
      const result = await signOut();
      if (result.error) {
        throw new Error(result.error.message ?? "Sign out failed");
      }
    },
    onSuccess: () => {
      qc.clear();
      clearAuthReturnTo();
      void navigate({ to: "/login", replace: true });
    },
  });
}
