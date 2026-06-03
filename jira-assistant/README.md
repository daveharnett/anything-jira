# anything-jira — a dead-simple Jira assistant on AnythingLLM Desktop

Chat with your Jira from AnythingLLM. Install, enter two keys, done. Model
traffic is routed through **Portkey**; Jira actions run as a custom AnythingLLM
**agent skill** that talks straight to your Jira Server / Data Center over its
REST API (no extra software, no command-line tools).

This folder is the customization layer that turns stock AnythingLLM Desktop into
the Jira assistant:

```
jira-assistant/
├── README.md                         ← you are here
├── DECISIONS.md                      ← findings + the choices made (read for "why")
├── CONVERSION.md                     ← how to port more Jira skills
├── agent-skills/
│   └── create-jira-issue/            ← the reference skill (working)
│       ├── plugin.json               ← identity, settings form, tool signature
│       └── handler.js                ← the Jira REST call
└── build/
    ├── seed.cjs                      ← one-time installer step (skill + provider)
    ├── env.defaults                  ← provider defaults to bake into the build
    └── package-desktop.md            ← how to assemble the installer
```

---

## For the person installing it (non-technical)

You need two things before you start:

1. **Your Jira personal access token (PAT).** In Jira: your avatar →
   *Profile* → *Personal Access Tokens* → *Create token*. Copy it.
2. **Your Portkey API key** (provided by whoever set up Portkey for your team).

Then:

1. **Install** the anything-jira app (the customized AnythingLLM Desktop
   installer your team provides). It installs like any normal app.
2. On **first launch**, paste your **Jira site address** (e.g.
   `https://jira.your-company.com`), your **Jira token**, and your **Portkey
   key** into the short setup window. (Optionally a default project key like
   `ENG`.)
3. That's it. Open a chat, switch on **agent mode**, and try:
   > file a task in ENG: update the onboarding docs

   The assistant creates the issue and replies with its key and a link.

If your build doesn't include the first-run window yet, your team can run the
one-time setup step described in `build/package-desktop.md` (Option B) — it asks
for the same three values and configures everything.

> **Note on your Jira token:** it is stored locally on your machine in the
> assistant's settings file (the skill's `plugin.json`). It never goes into this
> code repo and is never sent anywhere except your Jira server. See
> `DECISIONS.md` §3 for the details and the trade-off.

---

## How Portkey routing is wired

AnythingLLM's **Generic OpenAI** provider is pointed at the Portkey gateway:

| Setting (env var)                 | Value                                   |
| --------------------------------- | --------------------------------------- |
| `LLM_PROVIDER`                    | `generic-openai`                        |
| `GENERIC_OPEN_AI_BASE_PATH`       | `https://api.portkey.ai/v1`             |
| `GENERIC_OPEN_AI_API_KEY`         | your **Portkey** API key                |
| `GENERIC_OPEN_AI_MODEL_PREF`      | the model id Portkey routes (e.g. `claude-sonnet-4-6`) |
| `GENERIC_OPEN_AI_CUSTOM_HEADERS`  | `x-portkey-virtual-key:<vk>` (or `x-portkey-config:<id>`) |

The key finding (verified in the AnythingLLM source — see `DECISIONS.md` §1) is
that the Generic OpenAI provider **does** forward custom headers, so the
`x-portkey-*` headers Portkey expects are sent on every request. The seed step
writes all of the above for you; you only ever supply the Portkey **key** (and,
if your routing needs it, a virtual key / config id).

---

## How the Jira skill works

`agent-skills/create-jira-issue/` is a standard AnythingLLM custom agent skill:

- **`plugin.json`** declares the settings form (`JIRA_BASE_URL`, `JIRA_PAT`,
  optional `JIRA_DEFAULT_PROJECT_KEY`) and the tool the model can call (with
  params `summary`, `projectKey`, `issueType`, `description`, `labels`).
- **`handler.js`** validates config, normalizes the Jira URL, and calls
  `POST /rest/api/2/issue` with `Authorization: Bearer <PAT>`. It returns the new
  issue key + browse URL, and maps Jira errors (401/403/404/…) to plain messages.

It talks **only** to your configured Jira host and never runs a shell.

---

## Setting it up from this repo (developers)

The seed step installs the skill and writes the provider config in one go:

```bash
STORAGE_DIR="<AnythingLLM storage dir>" \
TARGET_ENV_FILE="<the server .env AnythingLLM reads>" \
PORTKEY_API_KEY="pk-…" \
PORTKEY_VIRTUAL_KEY="vk-…" \        # or PORTKEY_CONFIG="cfg-…"
MODEL="claude-sonnet-4-6" \
JIRA_BASE_URL="https://jira.your-company.com" \
JIRA_PAT="…" \
JIRA_DEFAULT_PROJECT_KEY="ENG" \
node jira-assistant/build/seed.cjs
```

Per-OS storage locations are in `DECISIONS.md` §6. The script is idempotent and
won't overwrite an already-set token with a blank. To package this into the
actual desktop installer, see `build/package-desktop.md`.

---

## Adding or converting more skills

The reference skill is one of several Jira operations. To port the rest (epic
writing, comments, transitions, JQL search, …), follow `CONVERSION.md` — it gives
the `SKILL.md → plugin.json + handler.js` mapping, the handler contract, the
shared conventions, and the Jira REST endpoints you'll need. Each new skill is a
new folder under `agent-skills/`; re-run the seed step to install it.

---

## Open items / what we still need from you

- **Portkey routing specifics:** virtual key vs config id/slug (so we seed the
  right `x-portkey-*` header), the gateway base URL if not the default, and the
  default model id.
- **The remaining `SKILL.md` files** to convert beyond the create-issue reference.
- **Confirm** your Jira is Server / Data Center (assumed) — not Cloud.
