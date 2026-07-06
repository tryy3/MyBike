import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStravaAuthConfig, useSignInWithStrava } from "./api";

function StravaMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-4 fill-current">
      <path d="M15.387 17.944 11.36 9.155l-4.027 8.789H1.103L11.36 2.056l10.257 15.888h-6.23Z" />
    </svg>
  );
}

interface StravaAuthButtonProps {
  mode: "login" | "register";
}

export function StravaAuthButton({ mode }: StravaAuthButtonProps) {
  const config = useStravaAuthConfig();
  const signInWithStrava = useSignInWithStrava();

  if (config.isLoading || !config.data?.configured) {
    return null;
  }

  const label = mode === "register" ? "Sign up with Strava" : "Continue with Strava";

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full border-[#FC4C02] bg-[#FC4C02] text-white hover:bg-[#e34402] hover:text-white"
      disabled={signInWithStrava.isPending}
      onClick={() => {
        signInWithStrava.mutate(
          { requestSignUp: mode === "register" },
          {
            onError: (err) => {
              toast.error(err.message);
            },
          },
        );
      }}
    >
      <StravaMark />
      {signInWithStrava.isPending ? "Redirecting to Strava…" : label}
    </Button>
  );
}

interface AuthDividerProps {
  label?: string;
}

export function AuthDivider({ label = "or" }: AuthDividerProps) {
  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-background px-2 text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
