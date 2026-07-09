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
  return {
    ...bike,
    components: bike.components.map(toComponentRow),
  };
}
