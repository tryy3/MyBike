import { defineRelations } from "drizzle-orm";
import { bikes, components } from "./schema";
import { account, session, user, verification } from "./auth-schema";

const schema = { bikes, components, user, session, account, verification };

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
}));
