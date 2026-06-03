# Converting a Claude Code `SKILL.md` into an AnythingLLM agent skill

This is the repeatable pattern for porting the remaining Jira `SKILL.md` files
(issue authoring, epic writing, etc.) into AnythingLLM custom agent skills. The
reference implementation is `agent-skills/create-jira-issue/` — copy it and
follow the steps below.

## The two-file anatomy

Each skill is a folder under `agent-skills/<hubId>/` containing exactly:

| File          | Role                                                            |
| ------------- | -------------------------------------------------------------- |
| `plugin.json` | Manifest: identity, the secrets/config form, and the LLM-facing tool signature. |
| `handler.js`  | The code that runs when the agent invokes the skill.           |

`<hubId>` must be a unique slug **and equal the folder name**.

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

## Conventions to keep across all ported skills (from the reference)

1. **Validate config first.** Bail with a clear message if a required
   `setup_arg` is empty — the agent surfaces it to the user.
2. **Normalize the base URL** with `new URL()`, accept only http/https, strip any
   accidental `/rest/...` path. Reuse `normalizeBaseUrl()` from the reference.
3. **Auth:** Jira DC PAT → `Authorization: Bearer <pat>`. (Jira Cloud is
   different and out of scope.)
4. **One egress only:** `fetch` the configured Jira host. No shell, ever.
5. **Return structured JSON** (`{ success, message, ... }`) as a string. Map Jira
   HTTP statuses (401/403/404/…) to human messages — see `jiraErrorMessage()`.
6. **`introspect` the milestones** ("Creating a Bug in ENG…") so the chat shows
   progress; **`logger` the raw errors** (never leak tokens to the user).

## Step-by-step

1. `cp -r agent-skills/create-jira-issue agent-skills/<new-hubId>`.
2. Edit `plugin.json`: set `hubId` (= folder name), `name`, `description`,
   `entrypoint.params`, and `examples`. Reuse the same three `setup_args`
   (`JIRA_BASE_URL`, `JIRA_PAT`, `JIRA_DEFAULT_PROJECT_KEY`) so one config powers
   every skill.
3. Rewrite `runtime.handler` for the new operation (different endpoint/verb/body).
   Keep the helpers (`normalizeBaseUrl`, `safeJson`, `jiraErrorMessage`,
   `failure`) — copy them or factor them into a shared file you concatenate in
   (skills must be self-contained at the storage path, so prefer copying).
4. Test offline with a mocked `global.fetch` and a fake `this` (see the harness
   pattern used during development) before installing.
5. Add the new `hubId` to the install list in `build/seed.cjs` (the `HUB_ID`
   handling) — or generalize it to install every folder under `agent-skills/`.
6. Re-run the seed step; toggle the skill on in AnythingLLM if needed.

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
