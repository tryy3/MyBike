import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { account, user } from "../db/auth-schema.js";

const BOOTSTRAP_ADMIN_EMAIL = "admin@example.com";
const BOOTSTRAP_ADMIN_PASSWORD = "admin123";
const BOOTSTRAP_ADMIN_ROLE = "admin";

async function ensureAdminRole(userId: string): Promise<void> {
  await db.run(sql`
    INSERT INTO user_roles (user_id, role_id)
    VALUES (${userId}, ${BOOTSTRAP_ADMIN_ROLE})
    ON CONFLICT(user_id) DO UPDATE SET role_id = ${BOOTSTRAP_ADMIN_ROLE}
  `);
}

export async function ensureBootstrapAdmin(): Promise<void> {
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, BOOTSTRAP_ADMIN_EMAIL))
    .get();

  if (existing) {
    await ensureAdminRole(existing.id);
    return;
  }

  const { auth } = await import("./auth.js");
  const ctx = await auth.$context;
  const passwordHash = await ctx.password.hash(BOOTSTRAP_ADMIN_PASSWORD);
  const userId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx
      .insert(user)
      .values({
        id: userId,
        name: "Admin",
        email: BOOTSTRAP_ADMIN_EMAIL,
        emailVerified: true,
      })
      .run();

    await tx
      .insert(account)
      .values({
        id: crypto.randomUUID(),
        issuer: "local:credential",
        providerAccountId: userId,
        providerId: "credential",
        userId,
        password: passwordHash,
      })
      .run();

    await tx.run(sql`
      INSERT INTO user_roles (user_id, role_id)
      VALUES (${userId}, ${BOOTSTRAP_ADMIN_ROLE})
      ON CONFLICT(user_id) DO UPDATE SET role_id = ${BOOTSTRAP_ADMIN_ROLE}
    `);
  });
}
