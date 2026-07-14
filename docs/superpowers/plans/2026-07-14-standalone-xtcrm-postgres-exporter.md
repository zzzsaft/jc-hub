# Standalone XTools CRM PostgreSQL Exporter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Windows Node.js tool that captures an operator-authorized XTools CRM browser session, exports orders and order follow-up details through a local JSONL buffer, and idempotently synchronizes them into the jc-hub PostgreSQL database.

**Architecture:** A visible Playwright browser performs manual login and captures the three module request templates through CRM menu navigation. A single-threaded HTTP client decodes legacy HTML and writes normalized records to local JSONL/checkpoints before a small `pg` repository batch-upserts them into an isolated `xtcrm_import` schema.

**Tech Stack:** Node.js 20 ESM, Playwright, `pg`, `dotenv`, Node standard library test runner, PostgreSQL.

## Global Constraints

- The package lives under `tools/xtcrm-exporter/` and must run after copying that directory alone.
- Windows Node.js 20 LTS is the supported deployment target.
- Production dependencies are limited to `playwright`, `pg`, and `dotenv`.
- CRM access remains single-threaded with `XCRM_DELAY_MS=800` by default.
- Credentials, cookies, browser profiles, session tokens, `.env`, `data/`, and real exports must never enter the ZIP or git.
- The tool may create and write only the PostgreSQL `xtcrm_import` schema.
- Attachments are metadata-only; no attachment bytes are downloaded.

---

### Task 1: Standalone package, configuration, and Windows entry points

**Files:**
- Create: `tools/xtcrm-exporter/package.json`
- Create: `tools/xtcrm-exporter/.gitignore`
- Create: `tools/xtcrm-exporter/.env.example`
- Create: `tools/xtcrm-exporter/src/config.js`
- Create: `tools/xtcrm-exporter/test/config.test.js`
- Create: `tools/xtcrm-exporter/setup.cmd`
- Create: `tools/xtcrm-exporter/start.cmd`
- Create: `tools/xtcrm-exporter/start-full.cmd`
- Create: `tools/xtcrm-exporter/upload.cmd`
- Create: `tools/xtcrm-exporter/refresh-details.cmd`

**Interfaces:**
- Produces: `loadConfig(env = process.env)` returning `{ databaseUrl, crmBaseUrl, delayMs, batchSize, dataDir }`.
- Produces: npm scripts `test`, `start`, `full`, `upload`, `refresh-details`, and `package`.

- [ ] **Step 1: Write the failing configuration test**

```js
test("loads safe defaults and requires DATABASE_URL", () => {
  assert.deepEqual(loadConfig({ DATABASE_URL: "postgresql://db/test" }), {
    databaseUrl: "postgresql://db/test",
    crmBaseUrl: "https://t22.xtcrm.com",
    delayMs: 800,
    batchSize: 100,
    dataDir: resolve("data"),
  });
  assert.throws(() => loadConfig({}), /DATABASE_URL/);
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `cd tools/xtcrm-exporter && node --test test/config.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/config.js`.

- [ ] **Step 3: Implement the minimal package and configuration loader**

```js
export const loadConfig = (env = process.env) => {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required in .env");
  return {
    databaseUrl: env.DATABASE_URL,
    crmBaseUrl: env.XCRM_BASE_URL || "https://t22.xtcrm.com",
    delayMs: positiveInt(env.XCRM_DELAY_MS, 800),
    batchSize: positiveInt(env.XCRM_DB_BATCH_SIZE, 100),
    dataDir: resolve(env.XCRM_DATA_DIR || "data"),
  };
};
```

`setup.cmd` runs `npm install` and `npx playwright install chromium`. Each run command uses `node src/cli.js` with only the matching flag.

- [ ] **Step 4: Run the configuration test**

Run: `cd tools/xtcrm-exporter && npm test`

Expected: PASS.

- [ ] **Step 5: Commit the standalone skeleton**

```bash
git add tools/xtcrm-exporter
git commit -m "feat: scaffold standalone xtcrm exporter"
```

### Task 2: Legacy CRM parsing and single-threaded HTTP client

**Files:**
- Create: `tools/xtcrm-exporter/src/parsing.js`
- Create: `tools/xtcrm-exporter/src/http-client.js`
- Create: `tools/xtcrm-exporter/test/parsing.test.js`
- Create: `tools/xtcrm-exporter/test/http-client.test.js`

**Interfaces:**
- Produces: `extractOrderNumbers`, `parseOrdersPage`, `parseActionsPage`, `parseActionDetail`, `buildOrderFollowupLinks`.
- Produces: `XtcrmHttpClient.fetchModule(template, args)`, `SessionExpiredError`, and `PermissionDeniedError`.

- [ ] **Step 1: Copy the existing synthetic fixtures into failing standalone tests**

The parser test asserts nested attachment tables still yield 30 logical list records, `行动描述` maps to `content`, multiple order numbers normalize, and download paths omit `sid`, `ssn`, `ccn`, `cr`, and `ma`.

The HTTP test constructs `new Response(Uint8Array.from([0xba, 0xcf, 0xcd, 0xac]))` and expects `合同`, then verifies 503 retry and login-page failure.

- [ ] **Step 2: Run tests and verify missing modules**

Run: `cd tools/xtcrm-exporter && node --test test/parsing.test.js test/http-client.test.js`

Expected: FAIL with missing `src/parsing.js` and `src/http-client.js`.

- [ ] **Step 3: Port the already-validated parser and client without jc-hub imports**

```js
const responseText = async (response) => {
  const bytes = await response.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new TextDecoder("gb18030").decode(bytes); }
};
```

The client builds `/system/runmod.xt` with captured session/module parameters, sleeps before each request, uses retry delays `[2000, 5000, 10000]`, and never logs the URL.

- [ ] **Step 4: Run parsing and client tests**

Run: `cd tools/xtcrm-exporter && npm test`

Expected: PASS with no token values in output.

- [ ] **Step 5: Commit parsing and HTTP support**

```bash
git add tools/xtcrm-exporter/src tools/xtcrm-exporter/test
git commit -m "feat: parse and request legacy xtcrm data"
```

### Task 3: Visible browser login and module-template capture

**Files:**
- Create: `tools/xtcrm-exporter/src/session-capture.js`
- Create: `tools/xtcrm-exporter/test/session-capture.test.js`

**Interfaces:**
- Produces: `parsePageTemplates(scriptText, moduleNames)` as a pure parser.
- Produces: `captureAuthorizedSession({ baseUrl, progress })` returning `{ browser, page, session, modules }`.

- [ ] **Step 1: Write pure session-script parsing tests**

```js
test("extracts nos and qlist/gedit templates without retaining credentials", () => {
  const result = parsePageTemplates(actionScriptFixture, ["qlist", "gedit"]);
  assert.equal(result.session.sid, "13");
  assert.equal(result.modules.qlist.scname, "pp_action");
  assert.equal(result.modules.gedit.comname, "gedit");
});
```

Add a failure assertion when `nos`, `qlist`, or `gedit` is absent.

- [ ] **Step 2: Run the session test and verify failure**

Run: `cd tools/xtcrm-exporter && node --test test/session-capture.test.js`

Expected: FAIL with missing module.

- [ ] **Step 3: Implement pure parsing and visible Playwright flow**

```js
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
await page.goto(`${baseUrl}/login.xt`);
await page.waitForURL(/\/xcrm\/desktop\//, { timeout: 0 });
await page.getByRole("link", { name: "日程任务", exact: true }).click();
const actionScript = await page.locator("script").allTextContents();
await page.getByRole("link", { name: "合同订单", exact: true }).click();
```

Join script text, parse both pages, require their session values to match, and keep all token-bearing values in memory only. Do not use persistent browser context or storage-state export.

- [ ] **Step 4: Run the session parser tests**

Run: `cd tools/xtcrm-exporter && npm test`

Expected: PASS without launching a real browser.

- [ ] **Step 5: Commit session capture**

```bash
git add tools/xtcrm-exporter/src/session-capture.js tools/xtcrm-exporter/test/session-capture.test.js
git commit -m "feat: capture authorized xtcrm browser session"
```

### Task 4: Local JSONL buffer and checkpoints

**Files:**
- Create: `tools/xtcrm-exporter/src/local-store.js`
- Create: `tools/xtcrm-exporter/test/local-store.test.js`

**Interfaces:**
- Produces: `LocalStore.open(dataDir)`, `appendUnique(name, record)`, `append(name, record)`, `readAll(name)`, and `saveCheckpoint(checkpoint)`.
- Checkpoint shape: `{ stage, nextPage, completedDetailIds, runId, mode }`.

- [ ] **Step 1: Write restart and idempotency tests**

Open a temporary directory, append IDs `1`, `1`, `2`, save a detail checkpoint, reopen, append `2`, `3`, and assert exactly three JSONL lines and the restored checkpoint.

- [ ] **Step 2: Run the store test and verify failure**

Run: `cd tools/xtcrm-exporter && node --test test/local-store.test.js`

Expected: FAIL with missing module.

- [ ] **Step 3: Implement append-only JSONL and atomic checkpoint rename**

Use only `node:fs/promises`. Create files with mode `0o600`, cache known IDs per dataset, write `checkpoint.json.tmp`, then rename it to `checkpoint.json`.

- [ ] **Step 4: Run store tests**

Run: `cd tools/xtcrm-exporter && npm test`

Expected: PASS.

- [ ] **Step 5: Commit local durability**

```bash
git add tools/xtcrm-exporter/src/local-store.js tools/xtcrm-exporter/test/local-store.test.js
git commit -m "feat: add durable xtcrm jsonl checkpoints"
```

### Task 5: PostgreSQL schema and idempotent repository

**Files:**
- Create: `tools/xtcrm-exporter/schema.sql`
- Create: `tools/xtcrm-exporter/src/postgres.js`
- Create: `tools/xtcrm-exporter/test/postgres.test.js`

**Interfaces:**
- Produces: `PostgresStore.connect(databaseUrl)`, `initSchema()`, `startRun(mode)`, `upsertOrders(records)`, `upsertActions(records)`, `upsertDetails(records)`, `replaceLinks(links)`, `existingDetailIds()`, and `finishRun(result)`.

- [ ] **Step 1: Write repository mapping tests with a fake pg client**

Assert that batches issue `BEGIN`, parameterized insert/update statements, and `COMMIT`; force one query failure and assert `ROLLBACK`. Assert no SQL string contains customer data from the record.

- [ ] **Step 2: Run repository tests and verify failure**

Run: `cd tools/xtcrm-exporter && node --test test/postgres.test.js`

Expected: FAIL with missing module.

- [ ] **Step 3: Create the exact five-table schema and repository**

`schema.sql` creates `xtcrm_import`, `orders`, `actions`, `action_details`, `order_action_links`, and `sync_runs`, including primary/foreign keys and indexes on order-number arrays, customer names, fetched timestamps, and action follow-up status.

Each upsert uses positional parameters and `ON CONFLICT (...) DO UPDATE`; the generic batch helper owns transaction begin/commit/rollback.

- [ ] **Step 4: Run repository tests**

Run: `cd tools/xtcrm-exporter && npm test`

Expected: PASS.

- [ ] **Step 5: Commit PostgreSQL support**

```bash
git add tools/xtcrm-exporter/schema.sql tools/xtcrm-exporter/src/postgres.js tools/xtcrm-exporter/test/postgres.test.js
git commit -m "feat: persist xtcrm exports in postgres"
```

### Task 6: Full, incremental, refresh, and upload-only orchestration

**Files:**
- Create: `tools/xtcrm-exporter/src/export-runner.js`
- Create: `tools/xtcrm-exporter/src/upload.js`
- Create: `tools/xtcrm-exporter/src/cli.js`
- Create: `tools/xtcrm-exporter/test/export-runner.test.js`
- Create: `tools/xtcrm-exporter/test/upload.test.js`

**Interfaces:**
- Produces: `runExport({ client, localStore, postgresStore, templates, mode, progress })`.
- Produces: `uploadLocalData({ localStore, postgresStore, batchSize, progress })`.
- CLI flags: `--full`, `--upload-only`, and `--refresh-details`.

- [ ] **Step 1: Write orchestration tests with fake CRM and database objects**

The full test asserts order pages, action pages, all order-follow-up details, links, local writes, and DB upserts. The incremental test preloads detail IDs and asserts only missing details are requested. The refresh test asserts all follow-up details are requested. The upload-only test asserts zero CRM calls.

- [ ] **Step 2: Run orchestration tests and verify failure**

Run: `cd tools/xtcrm-exporter && node --test test/export-runner.test.js test/upload.test.js`

Expected: FAIL with missing modules.

- [ ] **Step 3: Implement the minimal staged runner**

```js
for (let page = checkpoint.nextPage; page <= totalPages; page += 1) {
  const parsed = parsePage(await client.fetchModule(template, listArgs(page)), page, now());
  for (const record of parsed.records) await localStore.appendUnique(dataset, record);
  await postgresStore[upsertMethod](parsed.records);
  await localStore.saveCheckpoint({ ...checkpoint, nextPage: page + 1 });
}
```

After list stages, perform a bounded first-page stabilization loop until one pass yields no new IDs. Select details based on mode and `existingDetailIds()`. Write every detail locally, checkpoint every 10 processed IDs, and upsert database batches of the configured size.

- [ ] **Step 4: Implement CLI cleanup and safe failure behavior**

Load `.env`, initialize the schema, create a sync run, skip browser startup for `--upload-only`, and always close PostgreSQL and browser objects in `finally`. On `SessionExpiredError`, preserve local checkpoint and print only a relogin instruction, never token-bearing URLs.

- [ ] **Step 5: Run all tests**

Run: `cd tools/xtcrm-exporter && npm test`

Expected: all tests PASS.

- [ ] **Step 6: Commit orchestration**

```bash
git add tools/xtcrm-exporter/src tools/xtcrm-exporter/test
git commit -m "feat: run full and incremental xtcrm sync"
```

### Task 7: Documentation, packaging, and end-to-end verification

**Files:**
- Create: `tools/xtcrm-exporter/README.md`
- Create: `tools/xtcrm-exporter/scripts/package.js`
- Modify: `docs/operations/codex-implementation-log.md`
- Create at runtime: `tmp/xtcrm-exporter/xtcrm-exporter.zip`

**Interfaces:**
- Produces: a ZIP containing only standalone source, lockfile, SQL, README, example environment, and Windows command files.

- [ ] **Step 1: Write Windows-first README instructions**

Document Node.js 20 installation, copying jc-hub `.env`, `setup.cmd`, visible login, first/full/incremental/upload/refresh commands, expected progress output, database tables, session-expiry recovery, and explicit non-inclusion of credentials and attachments.

- [ ] **Step 2: Implement a standard-library packaging script**

Use an installed ZIP-capable workspace utility only if already present; otherwise call the platform archive command from the root package script. The file allowlist must exclude `.env`, `data`, `node_modules`, coverage, browser profiles, and token/session files. Fail packaging if any excluded basename is selected.

- [ ] **Step 3: Run final automated verification**

Run:

```bash
cd tools/xtcrm-exporter
npm test
node --check src/cli.js
node --check src/session-capture.js
npm run package
```

Expected: tests PASS, syntax checks exit 0, and ZIP is created.

- [ ] **Step 4: Inspect the ZIP allowlist and SQL**

List ZIP entries and assert there is no `.env`, `data/`, `node_modules/`, session file, or exported JSONL. Parse `schema.sql` in a rollback-only PostgreSQL transaction when `DATABASE_URL` is available; otherwise report that real DB schema execution remains for the Windows machine.

- [ ] **Step 5: Update implementation log and commit delivery**

```bash
git add tools/xtcrm-exporter docs/operations/codex-implementation-log.md
git commit -m "feat: deliver standalone xtcrm postgres exporter"
```
