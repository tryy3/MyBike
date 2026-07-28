export type ConfigDraftValue = string | boolean;

export type ConfigDraftSetting = {
  key: string;
  isSecret: boolean;
  value: unknown;
};

export function initialConfigDraftValue(setting: ConfigDraftSetting): ConfigDraftValue {
  if (setting.isSecret) return "";
  if (typeof setting.value === "boolean") return setting.value;
  if (typeof setting.value === "string") return setting.value;
  if (typeof setting.value === "number") return String(setting.value);
  return "";
}

/**
 * Merge server settings into local drafts, preserving edits for dirty keys.
 * Used when `adminSettings` refetches so reconnect/background updates do not
 * wipe in-progress changes.
 */
export function mergeConfigDrafts(
  settings: ConfigDraftSetting[],
  currentDrafts: Record<string, ConfigDraftValue>,
  dirtyKeys: ReadonlySet<string>,
): Record<string, ConfigDraftValue> {
  const next: Record<string, ConfigDraftValue> = {};
  for (const setting of settings) {
    if (dirtyKeys.has(setting.key) && Object.hasOwn(currentDrafts, setting.key)) {
      next[setting.key] = currentDrafts[setting.key]!;
    } else {
      next[setting.key] = initialConfigDraftValue(setting);
    }
  }
  return next;
}

export function draftsFromSettings(
  settings: ConfigDraftSetting[],
): Record<string, ConfigDraftValue> {
  const next: Record<string, ConfigDraftValue> = {};
  for (const setting of settings) {
    next[setting.key] = initialConfigDraftValue(setting);
  }
  return next;
}
