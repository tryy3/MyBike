import { apiKeyClient } from "@better-auth/api-key/client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: "",
  plugins: [apiKeyClient()],
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
