import { Outlet, createRootRoute } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";

export const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <Toaster position="bottom-right" />
    </>
  ),
});
