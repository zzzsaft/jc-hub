import "../../../config/env.js";

import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { JiandaoyunClient } from "../client.js";

type JsonObject = Record<string, unknown>;

type SyncStats = {
  apps: number;
  forms: number;
  formsWithData: number;
  activeForms: number;
  fields: number;
  skippedOldOrEmpty: number;
  failedForms: number;
};

const client = new JiandaoyunClient();

const recentDays = Number(process.env.JDY_ACTIVE_FORM_RECENT_DAYS || 180);
const cutoff = new Date(Date.now() - recentDays * 24 * 60 * 60 * 1000);

const main = async () => {
  const stats: SyncStats = { apps: 0, forms: 0, formsWithData: 0, activeForms: 0, fields: 0, skippedOldOrEmpty: 0, failedForms: 0 };
  const apps = await listAll<{ app_id: string; name: string }>((page) => client.listApps(page), "apps");
  stats.apps = apps.length;
  console.log(`[jdy sync] apps=${apps.length} recentDays=${recentDays} cutoff=${cutoff.toISOString()}`);

  for (const [appIndex, app] of apps.entries()) {
    await upsertApp(app);
    const forms = await listAll<{ app_id?: string; entry_id: string; name: string }>((page) => client.listEntries({ appId: app.app_id, ...page }), "forms");
    console.log(`[jdy sync] app ${appIndex + 1}/${apps.length} ${app.name} forms=${forms.length}`);

    for (const [formIndex, form] of forms.entries()) {
      stats.forms += 1;
      try {
        console.log(`[jdy sync] probe app=${appIndex + 1}/${apps.length} form=${formIndex + 1}/${forms.length} ${form.name}`);
        await upsertForm(app.app_id, form, { hasData: false, inUse: false, lastDataAt: null });
        const sample = await withTimeout(
          client.listData({ appId: app.app_id, entryId: form.entry_id, limit: 1 }),
          20000,
          `data/list ${form.entry_id}`,
        );
        const records = extractArray<JsonObject>(sample, ["data", "data_list", "records", "items"]);
        const lastDataAt = records[0] ? extractDate(records[0]) : null;
        const hasData = records.length > 0;
        const inUse = hasData && (!lastDataAt || lastDataAt >= cutoff);
        if (hasData) stats.formsWithData += 1;

        await upsertForm(app.app_id, form, { hasData, inUse, lastDataAt });
        if (!inUse) {
          stats.skippedOldOrEmpty += 1;
          continue;
        }

        const widgets = extractArray<JsonObject>(
          await withTimeout(client.listWidgets({ appId: app.app_id, entryId: form.entry_id }), 20000, `widget/list ${form.entry_id}`),
          ["widgets", "fields"],
        );
        for (const widget of widgets) {
          if (await upsertField(app.app_id, form.entry_id, widget)) stats.fields += 1;
        }
        stats.activeForms += 1;
      } catch (error) {
        stats.failedForms += 1;
        console.error(`[jdy sync] failed form ${form.name} (${form.entry_id}): ${error instanceof Error ? error.message : String(error)}`);
      }

      if ((formIndex + 1) % 10 === 0 || formIndex + 1 === forms.length) {
        console.log(`[jdy sync] progress app=${appIndex + 1}/${apps.length} forms=${formIndex + 1}/${forms.length} active=${stats.activeForms} skipped=${stats.skippedOldOrEmpty} failed=${stats.failedForms}`);
      }
    }
  }

  console.log(`[jdy sync] done apps=${stats.apps} forms=${stats.forms} withData=${stats.formsWithData} activeForms=${stats.activeForms} fields=${stats.fields} skipped=${stats.skippedOldOrEmpty} failed=${stats.failedForms}`);
};

const listAll = async <T>(fetchPage: (page: { limit: number; skip: number }) => Promise<unknown>, key: string) => {
  const rows: T[] = [];
  for (let skip = 0; ; skip += 100) {
    const page = extractArray<T>(await fetchPage({ limit: 100, skip }), [key]);
    rows.push(...page);
    if (page.length < 100) return rows;
  }
};

const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string) =>
  Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);

const extractArray = <T>(value: unknown, keys: string[]): T[] => {
  if (!isObject(value)) return [];
  for (const key of keys) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate as T[];
  }
  return [];
};

const extractDate = (record: JsonObject) => {
  for (const key of ["updated_at", "update_time", "updateTime", "_updated_at", "_update_time", "createTime", "created_at"]) {
    const value = extractValue(record[key]);
    if (typeof value !== "string" && typeof value !== "number") continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
};

const extractValue = (value: unknown): unknown => {
  if (isObject(value) && "value" in value) return value.value;
  return value;
};

const upsertApp = (app: { app_id: string; name: string }) =>
  prisma.$executeRaw(Prisma.sql`
    INSERT INTO integration.jdy_apps (app_id, name, raw, last_synced_at, updated_at)
    VALUES (${app.app_id}, ${app.name}, ${jsonb(app)}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (app_id) DO UPDATE SET
      name = EXCLUDED.name,
      raw = EXCLUDED.raw,
      last_synced_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `);

const upsertForm = (appId: string, form: { entry_id: string; name: string }, state: { hasData: boolean; inUse: boolean; lastDataAt: Date | null }) =>
  prisma.$executeRaw(Prisma.sql`
    INSERT INTO integration.jdy_forms (id, app_id, entry_id, name, raw, has_data, in_use, last_data_at, last_synced_at, updated_at)
    VALUES (${cryptoRandomId()}, ${appId}, ${form.entry_id}, ${form.name}, ${jsonb(form)}, ${state.hasData}, ${state.inUse}, ${state.lastDataAt}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (app_id, entry_id) DO UPDATE SET
      name = EXCLUDED.name,
      raw = EXCLUDED.raw,
      has_data = EXCLUDED.has_data,
      in_use = EXCLUDED.in_use,
      last_data_at = EXCLUDED.last_data_at,
      last_synced_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `);

const upsertField = async (appId: string, entryId: string, widget: JsonObject) => {
  const widgetId = stringValue(widget.widget_id) || stringValue(widget.widgetName) || stringValue(widget.name);
  if (!widgetId) return false;
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO integration.jdy_fields (id, app_id, entry_id, widget_id, name, label, type, raw, updated_at)
    VALUES (${cryptoRandomId()}, ${appId}, ${entryId}, ${widgetId}, ${stringValue(widget.name)}, ${stringValue(widget.label)}, ${stringValue(widget.type)}, ${jsonb(widget)}, CURRENT_TIMESTAMP)
    ON CONFLICT (app_id, entry_id, widget_id) DO UPDATE SET
      name = EXCLUDED.name,
      label = EXCLUDED.label,
      type = EXCLUDED.type,
      raw = EXCLUDED.raw,
      updated_at = CURRENT_TIMESTAMP
  `);
  return true;
};

const jsonb = (value: unknown) => Prisma.sql`${JSON.stringify(value)}::jsonb`;

const isObject = (value: unknown): value is JsonObject => Boolean(value && typeof value === "object" && !Array.isArray(value));

const stringValue = (value: unknown) => typeof value === "string" && value.length > 0 ? value : null;

const cryptoRandomId = () => crypto.randomUUID();

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
