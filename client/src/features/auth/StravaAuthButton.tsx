import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useOAuthProvidersConfig, useSignInWithStrava, useSignInWithTsidp } from "./api";

function StravaMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-4 fill-current">
      <path d="M15.387 17.944 11.36 9.155l-4.027 8.789H1.103L11.36 2.056l10.257 15.888h-6.23Z" />
    </svg>
  );
}

function TailscaleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-4 fill-current">
      <circle cx="12" cy="5" r="2.25" />
      <circle cx="5" cy="12" r="2.25" />
      <circle cx="19" cy="12" r="2.25" />
      <circle cx="8.5" cy="18.5" r="2.25" />
      <circle cx="15.5" cy="18.5" r="2.25" />
    </svg>
  );
}

interface OAuthModeProps {
  mode: "login" | "register";
}

function StravaAuthButton({ mode }: OAuthModeProps) {
  const signInWithStrava = useSignInWithStrava();
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

function TsidpAuthButton({ mode }: OAuthModeProps) {
  const signInWithTsidp = useSignInWithTsidp();
  const label = mode === "register" ? "Sign up with Tailscale" : "Continue with Tailscale";

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={signInWithTsidp.isPending}
      onClick={() => {
        signInWithTsidp.mutate(
          { requestSignUp: mode === "register" },
          {
            onError: (err) => {
              toast.error(err.message);
            },
          },
        );
      }}
    >
      <TailscaleMark />
      {signInWithTsidp.isPending ? "Redirecting to Tailscale…" : label}
    </Button>
  );
}

/** Social/OIDC buttons for login/register; divider only when at least one is enabled. */
export function OAuthSignInButtons({ mode }: OAuthModeProps) {
  const config = useOAuthProvidersConfig();
  const providers = config.data?.providers;

  if (config.isLoading || !providers) {
    return null;
  }

  const hasAny = providers.tsidp || providers.strava;
  if (!hasAny) {
    return null;
  }

  return (
    <div className="space-y-3">
      {providers.tsidp ? <TsidpAuthButton mode={mode} /> : null}
      {providers.strava ? <StravaAuthButton mode={mode} /> : null}
      <AuthDivider />
    </div>
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
