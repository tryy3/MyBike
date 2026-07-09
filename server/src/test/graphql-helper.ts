import request from "supertest";

type GqlAgent = ReturnType<typeof request>;

export async function graphqlRequest<T = unknown>(
  agent: GqlAgent,
  query: string,
  variables?: Record<string, unknown>,
): Promise<{
  status: number;
  body: { data?: T; errors?: { message: string; extensions?: { code?: string } }[] };
}> {
  const res = await agent
    .post("/graphql")
    .send({ query, variables })
    .set("Content-Type", "application/json");
  return { status: res.status, body: res.body };
}

export async function createBikeViaGraphql(
  agent: GqlAgent,
  name: string,
): Promise<{ id: string; name: string }> {
  const res = await graphqlRequest<{ createBike: { id: string; name: string } }>(
    agent,
    `mutation($input: BikeInsertInput!) {
      createBike(input: $input) { id name }
    }`,
    { input: { name } },
  );
  if (res.body.errors?.length) {
    throw new Error(res.body.errors[0]?.message ?? "GraphQL createBike failed");
  }
  return res.body.data!.createBike;
}

export async function createComponentViaGraphql(
  agent: GqlAgent,
  bikeId: string,
  input: Record<string, unknown>,
): Promise<{ id: string; isActive: boolean; category: string }> {
  const res = await graphqlRequest<{
    createComponent: { id: string; isActive: boolean; category: string };
  }>(
    agent,
    `mutation($bikeId: ID!, $input: ComponentInsertInput!) {
      createComponent(bikeId: $bikeId, input: $input) { id isActive category }
    }`,
    { bikeId, input },
  );
  if (res.body.errors?.length) {
    throw new Error(res.body.errors[0]?.message ?? "GraphQL createComponent failed");
  }
  return res.body.data!.createComponent;
}

export interface BikeDetailGqlResult {
  id: string;
  rideStats: {
    distanceMeters: number;
    movingTimeMinutes: number;
    activityCount: number;
  } | null;
  components: {
    id: string;
    wear: { distanceMeters: number | null; movingTimeMinutes: number | null };
  }[];
}

const BIKE_DETAIL_QUERY = `query($id: ID!) {
  bike(id: $id) {
    id
    rideStats { distanceMeters movingTimeMinutes activityCount }
    components {
      id
      wear { distanceMeters movingTimeMinutes }
    }
  }
}`;

export async function getBikeViaGraphql(
  agent: GqlAgent,
  bikeId: string,
): Promise<BikeDetailGqlResult> {
  const res = await graphqlRequest<{ bike: BikeDetailGqlResult }>(agent, BIKE_DETAIL_QUERY, {
    id: bikeId,
  });
  if (res.body.errors?.length) {
    throw new Error(res.body.errors[0]?.message ?? "GraphQL bike query failed");
  }
  return res.body.data!.bike;
}
