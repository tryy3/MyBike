import { useEffect } from "react";
import {
  createRoute,
  createRouter,
  Link,
  NotFoundRoute,
} from "@tanstack/react-router";

import { rootRoute } from "./routes/root";
import { appLayoutRoute } from "./routes/app-layout";
import { BikesListPage } from "./routes/bikes-list";
import { BikeDetailPage } from "./routes/bike-detail";
import { LoginPage } from "./routes/login";
import { RegisterPage } from "./routes/register";
import { redirectIfAuthenticated } from "./lib/auth-guard";

const indexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/",
  component: BikesListPage,
});

const bikeRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/bikes/$bikeId",
  component: BikeDetailWrapper,
});

function BikeDetailWrapper() {
  const { bikeId } = bikeRoute.useParams();
  return <BikeDetailPage bikeId={bikeId} />;
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: () => redirectIfAuthenticated(),
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
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
      <p className="text-sm text-muted-foreground">
        That page rolled away. Let's get you back.
      </p>
      <Link to="/" className="text-sm underline">
        Back to bikes
      </Link>
    </div>
  );
}

const routeTree = rootRoute.addChildren([
  appLayoutRoute.addChildren([indexRoute, bikeRoute]),
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
