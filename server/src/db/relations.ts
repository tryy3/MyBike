import { defineRelations } from "drizzle-orm";
import {
  bikes,
  components,
  stravaActivities,
  stravaActivityComponents,
  stravaBikes,
} from "./schema.js";
import { account, session, user, verification } from "./auth-schema.js";

const schema = {
  bikes,
  components,
  stravaBikes,
  stravaActivities,
  stravaActivityComponents,
  user,
  session,
  account,
  verification,
};

export const relations = defineRelations(schema, (r) => ({
  user: {
    sessions: r.many.session(),
    accounts: r.many.account(),
  },
  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
    }),
  },
  account: {
    user: r.one.user({
      from: r.account.userId,
      to: r.user.id,
    }),
  },
  bikes: {
    components: r.many.components(),
    stravaActivities: r.many.stravaActivities(),
    stravaBike: r.one.stravaBikes({
      from: r.bikes.id,
      to: r.stravaBikes.bikeId,
    }),
  },
  stravaBikes: {
    bike: r.one.bikes({
      from: r.stravaBikes.bikeId,
      to: r.bikes.id,
    }),
  },
  components: {
    bike: r.one.bikes({
      from: r.components.bikeId,
      to: r.bikes.id,
    }),
    stravaActivityComponents: r.many.stravaActivityComponents(),
  },
  stravaActivities: {
    bike: r.one.bikes({
      from: r.stravaActivities.bikeId,
      to: r.bikes.id,
    }),
    components: r.many.stravaActivityComponents(),
  },
  stravaActivityComponents: {
    activity: r.one.stravaActivities({
      from: r.stravaActivityComponents.activityId,
      to: r.stravaActivities.id,
    }),
    component: r.one.components({
      from: r.stravaActivityComponents.componentId,
      to: r.components.id,
    }),
  },
}));
