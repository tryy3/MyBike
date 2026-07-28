import { sql } from "drizzle-orm";
import { SETTING_VALUE_SOURCES, type AppRole } from "shared";
import type { EffectiveSetting } from "../../services/app-config.js";
import { appConfig } from "../../services/app-config.js";
import { assignUserRole, listAdminUsers, type AdminUserView } from "../../services/admin-users.js";
import { SERVER_RESTART_AUDIT_KEY, writeAdminAudit } from "../../services/admin-audit.js";
import { HttpError } from "../../lib/errors.js";
import { requestProcessRestart } from "../../lib/process-restart.js";
import { builder } from "../builder.js";
import { requireAppPermission } from "../context.js";
import { db } from "../../db/index.js";

type AdminSettingsPayload = {
  settings: EffectiveSetting[];
  pendingRestart: boolean;
};

type AdminConfigAuditEntry = {
  id: string;
  actorUserId: string | null;
  key: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: number;
};

const AdminSettingSourceEnum = builder.enumType("AdminSettingSource", {
  values: SETTING_VALUE_SOURCES,
});

const AdminSettingEffectEnum = builder.enumType("AdminSettingEffect", {
  values: ["hotReload", "restartRequired"] as const,
});

const AdminSettingRef = builder.objectRef<EffectiveSetting>("AdminSetting");

builder.objectType(AdminSettingRef, {
  fields: (t) => ({
    key: t.exposeString("key"),
    value: t.field({ type: "JSON", nullable: true, resolve: (parent) => parent.value }),
    isSecret: t.exposeBoolean("isSecret"),
    isSet: t.exposeBoolean("isSet"),
    readOnly: t.exposeBoolean("readOnly"),
    source: t.field({ type: AdminSettingSourceEnum, resolve: (parent) => parent.source }),
    effect: t.field({ type: AdminSettingEffectEnum, resolve: (parent) => parent.effect }),
    inheritWhen: t.exposeString("inheritWhen", { nullable: true }),
    inheritFrom: t.exposeString("inheritFrom", { nullable: true }),
    label: t.exposeString("label"),
    description: t.exposeString("description"),
    group: t.exposeString("group"),
  }),
});

const AdminSettingsPayloadRef = builder.objectRef<AdminSettingsPayload>("AdminSettingsPayload");

builder.objectType(AdminSettingsPayloadRef, {
  fields: (t) => ({
    settings: t.field({ type: [AdminSettingRef], resolve: (parent) => parent.settings }),
    pendingRestart: t.exposeBoolean("pendingRestart"),
  }),
});

const AdminUserRef = builder.objectRef<AdminUserView>("AdminUser");

builder.objectType(AdminUserRef, {
  fields: (t) => ({
    id: t.exposeID("id"),
    email: t.exposeString("email"),
    name: t.exposeString("name"),
    role: t.exposeString("role"),
  }),
});

const AdminConfigAuditEntryRef = builder.objectRef<AdminConfigAuditEntry>("AdminConfigAuditEntry");

builder.objectType(AdminConfigAuditEntryRef, {
  fields: (t) => ({
    id: t.exposeID("id"),
    actorUserId: t.exposeString("actorUserId", { nullable: true }),
    key: t.exposeString("key"),
    oldValue: t.exposeString("oldValue", { nullable: true }),
    newValue: t.exposeString("newValue", { nullable: true }),
    createdAt: t.field({ type: "DateTime", resolve: (parent) => parent.createdAt }),
  }),
});

const UpdateAdminSettingInput = builder.inputType("UpdateAdminSettingInput", {
  fields: (t) => ({
    key: t.string({ required: true }),
    value: t.field({ type: "JSON", required: false }),
  }),
});

function adminSettingsPayload(): AdminSettingsPayload {
  return {
    settings: appConfig.listEffective(),
    pendingRestart: appConfig.isRestartPending(),
  };
}

builder.queryField("adminSettings", (t) =>
  t.field({
    type: AdminSettingsPayloadRef,
    resolve: (_root, _args, context) => {
      requireAppPermission(context, "config.read");
      return adminSettingsPayload();
    },
  }),
);

builder.queryField("adminUsers", (t) =>
  t.field({
    type: [AdminUserRef],
    resolve: async (_root, _args, context) => {
      requireAppPermission(context, "users.read");
      return listAdminUsers();
    },
  }),
);

builder.queryField("adminConfigAudit", (t) =>
  t.field({
    type: [AdminConfigAuditEntryRef],
    args: {
      limit: t.arg.int({ required: false, defaultValue: 50 }),
    },
    resolve: async (_root, args, context) => {
      requireAppPermission(context, "audit.read");
      const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
      return db.all<AdminConfigAuditEntry>(sql`
        SELECT
          id,
          actor_user_id AS actorUserId,
          key,
          old_value AS oldValue,
          new_value AS newValue,
          created_at AS createdAt
        FROM config_audit_log
        ORDER BY created_at DESC
        LIMIT ${limit}
      `);
    },
  }),
);

builder.mutationField("updateAdminSettings", (t) =>
  t.field({
    type: AdminSettingsPayloadRef,
    args: {
      inputs: t.arg({ type: [UpdateAdminSettingInput], required: true }),
    },
    resolve: async (_root, args, context) => {
      const actorUserId = requireAppPermission(context, "config.write");
      const updates = args.inputs.map((input) => {
        if (input.value === null || input.value === undefined) {
          throw new HttpError(400, `Admin setting ${input.key} requires a value`);
        }
        return { key: input.key, value: input.value };
      });
      await appConfig.setMany(updates, actorUserId);
      return adminSettingsPayload();
    },
  }),
);

builder.mutationField("restartServer", (t) =>
  t.boolean({
    resolve: async (_root, _args, context) => {
      const actorUserId = requireAppPermission(context, "server.restart");
      await writeAdminAudit({
        actorUserId,
        key: SERVER_RESTART_AUDIT_KEY,
        oldValue: null,
        newValue: null,
      });
      requestProcessRestart();
      return true;
    },
  }),
);

builder.mutationField("assignUserRole", (t) =>
  t.field({
    type: AdminUserRef,
    args: {
      userId: t.arg.id({ required: true }),
      role: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, context) => {
      const actorUserId = requireAppPermission(context, "users.assign_role");
      return assignUserRole(args.userId, args.role as AppRole, actorUserId);
    },
  }),
);
