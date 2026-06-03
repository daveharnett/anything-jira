# Converting a Claude Code `SKILL.md` into an AnythingLLM agent skill

This is the repeatable pattern for porting the remaining Jira `SKILL.md` files
(issue authoring, epic writing, etc.) into AnythingLLM custom agent skills. The
reference implementation is `agent-skills/create-jira-issue/` — copy it and
follow the steps below.

## The anatomy

Each skill is a folder under `agent-skills/<hubId>/`. In source it holds:

| File          | Role                                                            |
| ------------- | -------------------------------------------------------------- |
| `plugin.json` | Manifest: identity, the secrets/config form, and the LLM-facing tool signature. Generated from `build/gen-manifests.cjs`. |
| `handler.js`  | The code that runs when the agent invokes the skill. Calls into the shared lib. |

`<hubId>` must be a unique slug **and equal the folder name**.

Shared REST helpers live once in `agent-skills/_shared/jira.js`. At install time
`build/seed.cjs` copies that file into every skill folder as `jira.js`, so each
**installed** skill is self-contained (skills run from the storage dir and cannot
import across sibling folders). Handlers therefore do `require("./jira.js")`.

## Mapping `SKILL.md` → the two files

A Claude Code `SKILL.md` typically has: a name/description, when-to-use guidance,
inputs, and a procedure (often shell or API steps). Map them like this:

| SKILL.md piece                         | Goes to                                                            |
| -------------------------------------- | ----------------------------------------------------------------- |
| Skill name                             | `plugin.json` → `name`, and a slug → `hubId`                       |
| One-line purpose + "use this when…"    | `plugin.json` → `description` (the model reads this to decide to call it). Be explicit about trigger phrases. |
| Inputs the model should supply         | `plugin.json` → `entrypoint.params` (each: `description` + `type`, where type ∈ string/number/boolean) |
| Connection config / secrets            | `plugin.json` → `setup_args` (rendered as a settings form; `input.type: "password"` for secrets) |
| Worked examples                        | `plugin.json` → `examples[]` (`prompt` + `call` JSON)             |
| The actual procedure / API calls       | `handler.js` → the body of `runtime.handler`                       |

### Rules that bite if you ignore them

- **Param types** are only `string`, `number`, `boolean`. Express lists as a
  comma-separated `string` and split inside the handler (see how `labels` is
  handled in the reference).
- **`imported` must be `true`** and **`schema` must be `"skill-1.0.0"`**.
- Set **`active: false`** in the source `plugin.json`. The seed script flips it
  to `true` at install time; leaving it false keeps the source inert.
- Secrets you want collected once (base URL, PAT) go in `setup_args`. Per-call
  values the model decides (summary, project, etc.) go in `entrypoint.params`.

## The handler contract (memorize this)

```js
module.exports.runtime = {
  handler: async function (args) {
    // args            -> the entrypoint.params the model supplied this call
    // this.runtimeArgs -> the configured setup_args values (secrets/config)
    // this.introspect(msg) -> show a "thinking" line in the chat UI
    // this.logger(msg)     -> server-side log (not shown to the user)
    // this.config          -> the full plugin.json
    // return a STRING (we return JSON.stringify({...})) back to the agent
  },
};
```

Do **not** `export` an arrow function for `handler` — `this` must bind to the
function-definition object at call time (`await fn.handler(args)`).

## Conventions to keep across all ported skills

The shared `_shared/jira.js` already provides these — reuse them, don't re-roll:

1. **Validate config first** with `requireConfig(getConfig(this.runtimeArgs))` —
   bail with its message if non-null.
2. **Normalize the base URL** (`getConfig` does this via `normalizeBaseUrl`):
   http/https only, strips any accidental `/rest/...` path.
3. **Auth:** every `jiraRequest` sends the PAT as `Authorization: Bearer <pat>`.
   (Jira Cloud auth is different and out of scope.)
4. **One egress only:** `jiraRequest` hits the configured Jira host. No shell, ever.
5. **Return** `success({...})` / `failure(msg)` (both stringify for you). Map Jira
   statuses to human messages with `jiraErrorMessage(status, data, context)`.
6. **`introspect` the milestones** ("Creating a Bug in ENG…") so the chat shows
   progress; **`logger` the raw status** (never leak tokens to the user).

`_shared/jira.js` exports: `getConfig`, `requireConfig`, `jiraRequest`,
`jiraErrorMessage`, `success`, `failure`, `issueRow`, `splitList`, `normalizeKey`,
`normalizeBaseUrl`, `safeJson`.

## Step-by-step (add a new skill)

1. **Add a spec entry** to `build/gen-manifests.cjs` keyed by `<hubId>`: `name`,
   `description` (the model reads this to decide to call it — be explicit about
   trigger phrases), `params` (use the `s()`/`n()` helpers), `examples`, and
   `project: true` if it should expose the optional default-project setting.
2. **Generate the manifest:** `node build/gen-manifests.cjs` (writes
   `agent-skills/<hubId>/plugin.json`).
3. **Write `handler.js`** following the contract above — typically ~25 lines:
   config check → validate `args` → `jiraRequest` → `success`/`failure`. Copy any
   existing handler (e.g. `jira-comment-issue`) as a template.
4. **Test offline** with a mocked `global.fetch` and a fake `this`
   (`{ runtimeArgs, introspect(){}, logger(){} }`), asserting the request shape
   and the returned JSON — as the dev test harness does for all 15 skills.
5. **Install:** re-run the seed step. It installs **every** folder under
   `agent-skills/` (skipping `_shared`), copies `jira.js` into each, sets
   `active: true`, and injects the configured secrets. Nothing else to register.

## Endpoints you'll likely need (Jira Server / Data Center, REST v2)

| Operation              | Method & path                                  |
| ---------------------- | ---------------------------------------------- |
| Create issue           | `POST /rest/api/2/issue`                        |
| Get issue              | `GET /rest/api/2/issue/{key}`                   |
| Edit issue fields      | `PUT /rest/api/2/issue/{key}`                   |
| Add comment            | `POST /rest/api/2/issue/{key}/comment`          |
| Transition (status)    | `POST /rest/api/2/issue/{key}/transitions`      |
| Search (JQL)           | `GET /rest/api/2/search?jql=…`                  |
| Create issue link      | `POST /rest/api/2/issueLink`                     |
| Epics (link children)  | set the epic-link custom field on `PUT /issue/{key}` (field id varies per instance) |

Epic writing maps cleanly onto create-issue (`issuetype: { name: "Epic" }`) plus
linking children via the instance's epic-link custom field — discover the field
id via `GET /rest/api/2/field` once and store it as another `setup_arg`.
