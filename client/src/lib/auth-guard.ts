import { redirect } from "@tanstack/react-router";
import { getSession } from "@/lib/auth-client";
import { saveAuthReturnTo } from "@/lib/auth-return-to";

export async function requireSession() {
  const { data: session } = await getSession();
  if (!session) {
    saveAuthReturnTo();
    throw redirect({ to: "/login" });
  }
  return session;
}

export async function redirectIfAuthenticated() {
  const { data: session } = await getSession();
  if (session) {
    throw redirect({ to: "/" });
  }
}
