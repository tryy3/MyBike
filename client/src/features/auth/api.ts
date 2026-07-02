import { useMutation, useQueryClient } from "@tanstack/react-query";
import { signIn, signOut, signUp } from "@/lib/auth-client";
import { queryKeys } from "@/lib/api";
import type { LoginInput, RegisterInput } from "shared";

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
  return useMutation({
    mutationFn: async () => {
      const result = await signOut();
      if (result.error) {
        throw new Error(result.error.message ?? "Sign out failed");
      }
    },
    onSuccess: () => {
      qc.clear();
    },
  });
}
