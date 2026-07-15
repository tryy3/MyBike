export const BIKE_TAB_IDS = ["components", "overview", "maintenance", "activities"] as const;
export type BikeTabId = (typeof BIKE_TAB_IDS)[number];

export interface MaintenanceTabSearch {
  category?: string;
}

export const bikeTabPaths = {
  components: "/bikes/$bikeId/components",
  overview: "/bikes/$bikeId/overview",
  maintenance: "/bikes/$bikeId/maintenance",
  activities: "/bikes/$bikeId/activities",
} as const;
