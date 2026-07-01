import { useEffect } from "react";
import {
  createRoute,
  createRouter,
  Link,
  NotFoundRoute,
} from "@tanstack/react-router";

import { rootRoute } from "./routes/root";
import { BikesListPage } from "./routes/bikes-list";
import { BikeDetailPage } from "./routes/bike-detail";

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: BikesListPage,
});

const bikeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/bikes/$bikeId",
  component: BikeDetailWrapper,
});

function BikeDetailWrapper() {
  const { bikeId } = bikeRoute.useParams();
  return <BikeDetailPage bikeId={bikeId} />;
}

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

const routeTree = rootRoute.addChildren([indexRoute, bikeRoute]);

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
