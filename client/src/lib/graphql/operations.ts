import type { Component } from "shared";

export interface RideStatsGql {
  distanceMeters: number;
  movingTimeMinutes: number;
  activityCount: number;
}

export interface WearGql {
  distanceMeters: number | null;
  movingTimeMinutes: number | null;
}

export interface BikeListItemGql {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  notes: string | null;
  stravaGearId: string | null;
  createdAt: number;
  updatedAt: number;
  componentCount: number;
  rideStats: RideStatsGql | null;
  maintenanceAlertCount: number;
}

export interface BikeDetailGql {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  notes: string | null;
  stravaGearId: string | null;
  createdAt: number;
  updatedAt: number;
  rideStats: RideStatsGql | null;
  maintenanceAlertCount: number;
  components: ComponentGql[];
}

export interface ComponentGql {
  id: string;
  bikeId: string;
  category: Component["category"];
  categoryLabel: string;
  name: string;
  brand: string | null;
  model: string | null;
  notes: string | null;
  isActive: boolean;
  purchaseDate: string | null;
  purchaseCost: number | null;
  purchaseStore: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  wear: WearGql;
  maintenanceAlertCount: number;
}

export const BIKES_LIST_QUERY = /* GraphQL */ `
  query BikesList {
    bikes {
      id
      name
      brand
      model
      year
      notes
      stravaGearId
      createdAt
      updatedAt
      componentCount
      rideStats {
        distanceMeters
        movingTimeMinutes
        activityCount
      }
      maintenanceAlertCount
    }
  }
`;

export const BIKE_DETAIL_QUERY = /* GraphQL */ `
  query BikeDetail($id: ID!) {
    bike(id: $id) {
      id
      name
      brand
      model
      year
      notes
      stravaGearId
      createdAt
      updatedAt
      rideStats {
        distanceMeters
        movingTimeMinutes
        activityCount
      }
      maintenanceAlertCount
      components {
        id
        bikeId
        category
        categoryLabel
        name
        brand
        model
        notes
        isActive
        purchaseDate
        purchaseCost
        purchaseStore
        sortOrder
        createdAt
        updatedAt
        wear {
          distanceMeters
          movingTimeMinutes
        }
        maintenanceAlertCount
      }
    }
  }
`;

export const FIELD_SUGGESTIONS_QUERY = /* GraphQL */ `
  query FieldSuggestions {
    fieldSuggestions {
      name
      brand
      model
      purchaseStore
    }
  }
`;

export const CREATE_BIKE_MUTATION = /* GraphQL */ `
  mutation CreateBike($input: BikeInsertInput!) {
    createBike(input: $input) {
      id
      name
      brand
      model
      year
      notes
      stravaGearId
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_BIKE_MUTATION = /* GraphQL */ `
  mutation UpdateBike($id: ID!, $input: BikeUpdateInput!) {
    updateBike(id: $id, input: $input) {
      id
      name
      brand
      model
      year
      notes
      stravaGearId
      createdAt
      updatedAt
    }
  }
`;

export const DELETE_BIKE_MUTATION = /* GraphQL */ `
  mutation DeleteBike($id: ID!) {
    deleteBike(id: $id)
  }
`;

export const CREATE_COMPONENT_MUTATION = /* GraphQL */ `
  mutation CreateComponent($bikeId: ID!, $input: ComponentInsertInput!) {
    createComponent(bikeId: $bikeId, input: $input) {
      id
      bikeId
      category
      categoryLabel
      name
      brand
      model
      notes
      isActive
      purchaseDate
      purchaseCost
      purchaseStore
      sortOrder
      createdAt
      updatedAt
      wear {
        distanceMeters
        movingTimeMinutes
      }
    }
  }
`;

export const UPDATE_COMPONENT_MUTATION = /* GraphQL */ `
  mutation UpdateComponent($id: ID!, $input: ComponentUpdateInput!) {
    updateComponent(id: $id, input: $input) {
      id
      bikeId
      category
      categoryLabel
      name
      brand
      model
      notes
      isActive
      purchaseDate
      purchaseCost
      purchaseStore
      sortOrder
      createdAt
      updatedAt
      wear {
        distanceMeters
        movingTimeMinutes
      }
    }
  }
`;

export const DELETE_COMPONENT_MUTATION = /* GraphQL */ `
  mutation DeleteComponent($id: ID!) {
    deleteComponent(id: $id)
  }
`;

export const ACTIVATE_COMPONENT_MUTATION = /* GraphQL */ `
  mutation ActivateComponent($id: ID!) {
    activateComponent(id: $id) {
      id
      isActive
    }
  }
`;

export const REORDER_COMPONENTS_MUTATION = /* GraphQL */ `
  mutation ReorderComponents($bikeId: ID!, $category: String!, $orderedIds: [ID!]!) {
    reorderComponents(bikeId: $bikeId, category: $category, orderedIds: $orderedIds)
  }
`;

/** Map GraphQL component to shared Component (baseline fields from wear for compat). */
export function toComponentRow(c: ComponentGql): Component {
  return {
    id: c.id,
    bikeId: c.bikeId,
    category: c.category,
    name: c.name,
    brand: c.brand,
    model: c.model,
    notes: c.notes,
    isActive: c.isActive,
    distanceMeters: c.wear.distanceMeters,
    movingTimeMinutes: c.wear.movingTimeMinutes,
    purchaseDate: c.purchaseDate,
    purchaseCost: c.purchaseCost,
    purchaseStore: c.purchaseStore,
    sortOrder: c.sortOrder,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export function toBikeDetailGql(bike: BikeDetailGql) {
  const maintenanceAlertByCategory = new Map<string, number>();
  for (const c of bike.components) {
    if (c.maintenanceAlertCount > 0) {
      maintenanceAlertByCategory.set(c.category, c.maintenanceAlertCount);
    }
  }
  return {
    ...bike,
    components: bike.components.map(toComponentRow),
    maintenanceAlertByCategory,
  };
}

export type MaintenanceTaskKindGql = "touch_up" | "periodic" | "eol";
export type MaintenanceTaskStatusGql = "ok" | "due" | "overdue" | "snoozed";

export interface MaintenanceTaskProgressGql {
  distanceUsedMeters: number | null;
  distanceLimitMeters: number | null;
  daysUsed: number | null;
  daysLimit: number | null;
  needsComponent: boolean;
}

export interface MaintenanceTaskGql {
  id: string;
  bikeId: string;
  source: "builtin" | "custom";
  templateKey: string | null;
  kind: MaintenanceTaskKindGql;
  title: string;
  description: string | null;
  componentCategory: string | null;
  triggerMode: "distance" | "time" | "both" | null;
  distanceMeters: number | null;
  intervalDays: number | null;
  guideUrl: string | null;
  enabled: boolean;
  customized: boolean;
  sortOrder: number;
  status: MaintenanceTaskStatusGql;
  progress: MaintenanceTaskProgressGql | null;
  lastCheckedAt: number | null;
  canDelete: boolean;
}

export interface ServiceRecordGql {
  id: string;
  taskId: string;
  action: "serviced" | "replaced";
  completedAt: number;
  notes: string | null;
  cost: number | null;
  wearDistanceMeters: number | null;
  component: { id: string; name: string; categoryLabel: string } | null;
}

export const BIKE_MAINTENANCE_QUERY = /* GraphQL */ `
  query BikeMaintenance($id: ID!) {
    bike(id: $id) {
      id
      maintenanceTasks {
        id
        bikeId
        source
        templateKey
        kind
        title
        description
        componentCategory
        triggerMode
        distanceMeters
        intervalDays
        guideUrl
        enabled
        customized
        sortOrder
        status
        lastCheckedAt
        canDelete
        progress {
          distanceUsedMeters
          distanceLimitMeters
          daysUsed
          daysLimit
          needsComponent
        }
      }
      serviceRecords(limit: 30) {
        id
        taskId
        action
        completedAt
        notes
        cost
        wearDistanceMeters
        component {
          id
          name
          categoryLabel
        }
      }
    }
  }
`;

export const CREATE_MAINTENANCE_TASK_MUTATION = /* GraphQL */ `
  mutation CreateMaintenanceTask($bikeId: ID!, $input: MaintenanceTaskInsertInput!) {
    createMaintenanceTask(bikeId: $bikeId, input: $input) {
      id
    }
  }
`;

export const UPDATE_MAINTENANCE_TASK_MUTATION = /* GraphQL */ `
  mutation UpdateMaintenanceTask($id: ID!, $input: MaintenanceTaskUpdateInput!) {
    updateMaintenanceTask(id: $id, input: $input) {
      id
    }
  }
`;

export const TOGGLE_MAINTENANCE_TASK_MUTATION = /* GraphQL */ `
  mutation ToggleMaintenanceTask($id: ID!, $enabled: Boolean!) {
    toggleMaintenanceTask(id: $id, enabled: $enabled) {
      id
      enabled
      status
      kind
      componentCategory
      progress {
        distanceUsedMeters
        distanceLimitMeters
        daysUsed
        daysLimit
        needsComponent
      }
    }
  }
`;

export const DELETE_MAINTENANCE_TASK_MUTATION = /* GraphQL */ `
  mutation DeleteMaintenanceTask($id: ID!) {
    deleteMaintenanceTask(id: $id)
  }
`;

export const RESET_MAINTENANCE_TASK_MUTATION = /* GraphQL */ `
  mutation ResetMaintenanceTask($id: ID!) {
    resetMaintenanceTaskToDefault(id: $id) {
      id
    }
  }
`;

export const COMPLETE_MAINTENANCE_TASK_MUTATION = /* GraphQL */ `
  mutation CompleteMaintenanceTask($id: ID!, $input: CompleteMaintenanceInput) {
    completeMaintenanceTask(id: $id, input: $input) {
      id
    }
  }
`;

export const REPLACE_MAINTENANCE_TASK_MUTATION = /* GraphQL */ `
  mutation ReplaceMaintenanceTask($id: ID!, $input: ReplaceMaintenanceInput!) {
    replaceComponentMaintenance(id: $id, input: $input) {
      id
    }
  }
`;

export const SNOOZE_MAINTENANCE_TASK_MUTATION = /* GraphQL */ `
  mutation SnoozeMaintenanceTask($id: ID!, $input: SnoozeMaintenanceInput!) {
    snoozeMaintenanceTask(id: $id, input: $input) {
      id
    }
  }
`;

export const TOGGLE_TOUCH_UP_MUTATION = /* GraphQL */ `
  mutation ToggleTouchUp($taskId: ID!) {
    toggleTouchUpCheckItem(taskId: $taskId) {
      id
      lastCheckedAt
      enabled
      status
      kind
      componentCategory
    }
  }
`;

export const CLEAR_TOUCH_UP_CHECKLIST_MUTATION = /* GraphQL */ `
  mutation ClearTouchUpChecklist($bikeId: ID!) {
    clearTouchUpChecklist(bikeId: $bikeId) {
      id
      lastCheckedAt
      enabled
      status
      kind
      componentCategory
    }
  }
`;
