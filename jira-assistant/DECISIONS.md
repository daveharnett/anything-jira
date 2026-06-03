# Decisions & Findings

This records the design-affecting findings (verified against the AnythingLLM
source in this repo, not just the public docs) and the choices made.

## 1. Portkey headers — CAN be sent via the Generic OpenAI provider

**Finding:** AnythingLLM's Generic OpenAI provider supports arbitrary custom HTTP
headers, so `x-portkey-*` headers reach Portkey.

Source: `server/utils/AiProviders/genericOpenAi/index.js`

```js
this.openai = new OpenAIApi({
  baseURL: this.basePath,                       // GENERIC_OPEN_AI_BASE_PATH
  apiKey: process.env.GENERIC_OPEN_AI_API_KEY ?? null,
  defaultHeaders: {
    "User-Agent": getAnythingLLMUserAgent(),
    ...GenericOpenAiLLM.parseCustomHeaders(),    // GENERIC_OPEN_AI_CUSTOM_HEADERS
  },
});
```

`parseCustomHeaders()` reads `GENERIC_OPEN_AI_CUSTOM_HEADERS`, a CSV of
`Header-Name:value` pairs (split on the first colon only), and merges them into
the OpenAI client's `defaultHeaders` — i.e. they are sent on **every** request.

**Consequence — two supported ways to route through Portkey:**

- **A. Portkey gateway URL + Portkey API key (simplest):**
  - `GENERIC_OPEN_AI_BASE_PATH=https://api.portkey.ai/v1`
  - `GENERIC_OPEN_AI_API_KEY=<PORTKEY_API_KEY>` (sent as `Authorization: Bearer`)
  - Select the upstream provider/model with a Portkey **virtual key** or **config**
    passed as a header:
    `GENERIC_OPEN_AI_CUSTOM_HEADERS="x-portkey-virtual-key:<vk>"`
    or `...="x-portkey-config:<config-id>"`.
- **B. Base URL + key only (no x-portkey headers):** works only if your Portkey
  setup encodes the routing in the API key / a saved config so no per-request
  header is required. Header support (A) exists, so we do **not** need this
  fallback — but it remains available.

The seed script (`build/seed.cjs`) emits `GENERIC_OPEN_AI_CUSTOM_HEADERS` from
`PORTKEY_VIRTUAL_KEY` / `PORTKEY_CONFIG` / `PORTKEY_PROVIDER` when provided.

**Open item for you:** confirm which Portkey routing you use — a virtual key, a
config id/slug, or a key that already pins the provider — so we seed the right
header. Default base URL assumed: `https://api.portkey.ai/v1`.

## 2. Jira capability — REST in JS (chosen), not the Jira CLI

**Chosen: reimplement the needed operations against the Jira Server / Data
Center REST API directly in the skill handler with `fetch`.**

Rationale:
- No external binary to bundle, sandbox, or keep from auto-updating — the stated
  goal ("simple install, no unmanaged auto-updating binaries").
- The handler runs inside the AnythingLLM Node runtime, which has global `fetch`
  (Node 18+). A self-contained skill is the cleaner desktop install.
- Target is Jira **Server / Data Center**, which authenticates Personal Access
  Tokens as `Authorization: Bearer <PAT>` and exposes `/rest/api/2/*`. (Jira
  Cloud differs: basic-auth `email:token` and `/rest/api/3` — out of scope.)

The reference skill calls `POST /rest/api/2/issue`. No shell is invoked and the
only network egress is to the configured `JIRA_BASE_URL`.

## 3. Where secrets live

- **Portkey API key** → server `.env` as `GENERIC_OPEN_AI_API_KEY`. This is the
  standard provider mechanism and the `.env` lives in the app's private data
  dir, outside the repo and not synced anywhere.
- **Jira PAT** → the skill's `plugin.json` `setup_args.JIRA_PAT.value`.

  **Trade-off (accepted):** `setup_args` values are stored **in plaintext** in
  `plugin.json` inside the storage dir
  (`server/utils/agents/imported.js` → `updateImportedPlugin` writes the JSON
  verbatim). This is the native AnythingLLM mechanism and gives a password-typed
  UI field, but it does **not** meet a strict "never plaintext / OS keychain"
  bar. We chose it for simplicity per the single-user desktop design point.

  If the keychain requirement is reinstated later, the migration is small and
  isolated to the handler: read the PAT from the OS keychain
  (`security`/`secret-tool`/Credential Manager, or a `keytar`-style dep) instead
  of `this.runtimeArgs.JIRA_PAT`, and have the installer store it there. Nothing
  else changes.

## 4. Skill / plugin contract (verified)

From `server/utils/agents/imported.js` and
`server/utils/agents/imported-manifest.schema.json`:

- Skills load from `STORAGE_DIR/plugins/agent-skills/<hubId>/` (dev fallback:
  `server/storage/plugins/agent-skills/`). Folder name **must** equal `hubId`.
- `plugin.json` required fields: `active, hubId, name, schema ("skill-1.0.0"),
  version, description, entrypoint{file, params}, imported (=true)`. Param types
  are limited to `string | number | boolean`.
- `handler.js` must be `module.exports.runtime = { handler: async function(args){…} }`.
  It is invoked as `await fn.handler(args)` (`aibitat/index.js:1022`), so inside
  the handler `this` is the function definition object exposing:
  `this.runtimeArgs` (the `setup_args` values), `this.introspect()` (chat
  "thinking" UI), `this.logger()`, `this.config`. `args` is the object of
  LLM-supplied `entrypoint.params`. The return value is stringified for the agent.
- Only skills with `active: true` are loaded into an agent
  (`activeImportedPlugins()`), and they are invoked via `@@<hubId>` / agent mode.

## 5. Pre-seeding is possible (no first-run UI clicks required)

Provider config is driven entirely by env vars loaded from the server `.env` at
startup (`server/index.js` top: `dotenv.config()`), so writing the
`GENERIC_OPEN_AI_*` / `LLM_PROVIDER` keys before first launch fully configures
the model provider. The skill is "pre-installed" by dropping its folder into
`STORAGE_DIR/plugins/agent-skills/` with `active: true`. Both are done by
`build/seed.cjs`.

## 6. Per-OS storage locations (AnythingLLM Desktop)

`STORAGE_DIR` resolves to `<userData>/storage`, where `userData` is Electron's
per-OS app data dir:

- **macOS:** `~/Library/Application Support/anythingllm-desktop/storage`
- **Windows:** `%APPDATA%\anythingllm-desktop\storage`
- **Linux:** `~/.config/anythingllm-desktop/storage`

(Confirm the exact app folder name against your build; Electron derives it from
the app name. The seed script takes `STORAGE_DIR` explicitly so it does not have
to guess.)

## 7. What a future centralized / Docker deployment would need to change

The single-user-per-machine design does not preclude a centralized deployment,
but these points would change:

- **Secrets:** per-user Jira PATs can no longer live in a shared `plugin.json`.
  Move the PAT out of `setup_args` and resolve it per-request from the calling
  user's identity (e.g. a secrets store keyed by user, or per-workspace config).
  The handler already isolates PAT access to one place (`this.runtimeArgs`), so
  this is the main change.
- **Provider config** moves from a baked `.env` to the multi-tenant System
  Settings / per-workspace LLM config; Portkey routing likely keys per user/team
  (distinct virtual keys), set via headers per workspace.
- **Seeding** becomes a provisioning step (DB/system-settings seed or admin API)
  rather than a file drop, since storage is shared and `STORAGE_DIR` is a volume.
- **Multi-user mode** in AnythingLLM must be enabled, with auth in front.

## 8. Skill granularity — one skill per operation + a shared lib

To cover the Jira CLI surface we ship ~15 skills (create/get/search/edit/assign/
transition/comment/link/worklog/epic-add/sprint+board list/sprint-add/projects/
me) rather than one mega-tool with an `operation` switch.

**Why not a single router tool:** a custom skill maps to exactly one function
with one flat parameter set (`server/utils/agents/imported.js` spreads
`runtime` into a single `aibitat.function(...)` whose `handler` is called as
`fn.handler(args)`). A single tool would force every operation's params into one
flat, mostly-optional bag plus a stringly-typed `operation` arg — worse tool-call
accuracy and no per-op schema. Params also can't be enums (type is only
string/number/boolean), so the union can't be expressed cleanly.

**Why one-per-operation works well here:** each tool gets a precise schema and
description (better model tool-use), each is individually toggleable in the UI,
and the duplicated `setup_args` are a non-issue because `build/seed.cjs` injects
the same `JIRA_BASE_URL`/`JIRA_PAT`/default-project into every skill at install
time (the user enters them once, in the installer).

**Avoiding code duplication:** shared REST logic lives once in
`agent-skills/_shared/jira.js`; the seed step copies it into each installed skill
folder as `jira.js` (handlers `require("./jira.js")`). Installed skills must be
self-contained at the storage path — they can't import across sibling folders —
so copying, not symlinking, is deliberate. The manifests are generated from one
spec (`build/gen-manifests.cjs`) to keep the shared `setup_args`/schema identical
across skills.

If a future host ever exposes a true multi-function plugin type, these handlers
collapse into it with no REST changes (the lib is already the seam).
