import { useEffect } from "react";
import { createRoute, createRouter, Link, NotFoundRoute, redirect } from "@tanstack/react-router";

import { rootRoute } from "./routes/root";
import { appLayoutRoute } from "./routes/app-layout";
import { BikesListPage } from "./routes/bikes-list";
import {
  BikeActivitiesTabPage,
  BikeComponentsTabPage,
  BikeDetailLayout,
  BikeMaintenanceTabPage,
  BikeOverviewTabPage,
} from "./routes/bike-detail";
import type { MaintenanceTabSearch } from "./routes/bike-routes";
import { IntegrationsPage } from "./routes/integrations";
import { ApiKeysPage } from "./routes/api-keys";
import { LoginPage } from "./routes/login";
import { RegisterPage } from "./routes/register";
import { redirectIfAuthenticated } from "./lib/auth-guard";

const indexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/",
  component: BikesListPage,
});

export const bikeLayoutRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/bikes/$bikeId",
  component: BikeDetailLayout,
});

const bikeIndexRoute = createRoute({
  getParentRoute: () => bikeLayoutRoute,
  path: "/",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/bikes/$bikeId/components",
      params: { bikeId: params.bikeId },
    });
  },
});

export const bikeComponentsRoute = createRoute({
  getParentRoute: () => bikeLayoutRoute,
  path: "/components",
  component: BikeComponentsTabPage,
});

export const bikeOverviewRoute = createRoute({
  getParentRoute: () => bikeLayoutRoute,
  path: "/overview",
  component: BikeOverviewTabPage,
});

export const bikeMaintenanceRoute = createRoute({
  getParentRoute: () => bikeLayoutRoute,
  path: "/maintenance",
  validateSearch: (search: Record<string, unknown>): MaintenanceTabSearch => ({
    category: typeof search.category === "string" ? search.category : undefined,
  }),
  component: BikeMaintenanceTabPage,
});

export const bikeActivitiesRoute = createRoute({
  getParentRoute: () => bikeLayoutRoute,
  path: "/activities",
  component: BikeActivitiesTabPage,
});

const bikeRoute = bikeLayoutRoute.addChildren([
  bikeIndexRoute,
  bikeComponentsRoute,
  bikeOverviewRoute,
  bikeMaintenanceRoute,
  bikeActivitiesRoute,
]);

const integrationsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/settings/integrations",
  component: IntegrationsPage,
});

const apiKeysRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/settings/api-keys",
  component: ApiKeysPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: () => redirectIfAuthenticated(),
  component: LoginPage,
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  beforeLoad: () => redirectIfAuthenticated(),
  component: RegisterPage,
});

const notFoundRoute = new NotFoundRoute({
  getParentRoute: () => rootRoute,
  component: NotFound,
});

function NotFound() {
  useEffect(() => {
    document.title = "Page not found | MyBike";
    return () => {
      document.title = "MyBike";
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <h1 className="text-3xl font-semibold">404</h1>
      <p className="text-sm text-muted-foreground">That page rolled away. Let's get you back.</p>
      <Link to="/" className="text-sm underline">
        Back to bikes
      </Link>
    </div>
  );
}

const routeTree = rootRoute.addChildren([
  appLayoutRoute.addChildren([indexRoute, bikeRoute, integrationsRoute, apiKeysRoute]),
  loginRoute,
  registerRoute,
]);

export const router = createRouter({
  routeTree,
  notFoundRoute,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
