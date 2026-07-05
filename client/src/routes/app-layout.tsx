import { Outlet, Link } from "@tanstack/react-router";
import { BikeIcon, LogOutIcon, SettingsIcon } from "lucide-react";
import { createRoute } from "@tanstack/react-router";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { useSignOut } from "@/features/auth/api";
import { useSession } from "@/lib/auth-client";
import { requireSession } from "@/lib/auth-guard";
import { rootRoute } from "./root";

function AppHeader() {
  const { data: session } = useSession();
  const signOut = useSignOut();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BikeIcon className="size-4" />
          </span>
          MyBike
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/settings/integrations">
              <SettingsIcon data-icon="inline-start" />
              <span className="sr-only sm:not-sr-only">Integrations</span>
            </Link>
          </Button>
          {user ? (
            <>
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {user.name || user.email}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut.mutate()}
                disabled={signOut.isPending}
              >
                <LogOutIcon className="size-4" />
                <span className="sr-only sm:not-sr-only">Sign out</span>
              </Button>
            </>
          ) : null}
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}

function AppLayout() {
  return (
    <div className="min-h-svh bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md"
      >
        Skip to main content
      </a>
      <AppHeader />
      <main id="main-content" className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

export const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: () => requireSession(),
  component: AppLayout,
});
