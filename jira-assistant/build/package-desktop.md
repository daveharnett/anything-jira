# Assembling the customized AnythingLLM Desktop installer

**Goal:** ship a single installer a non-technical user runs that yields a working
Jira assistant — model traffic routed through Portkey, the Jira skill
pre-installed, secrets captured once.

## Honest scope note

This repository is the AnythingLLM **application** monorepo (`server/`,
`frontend/`, `collector/`). The **Electron desktop wrapper and the OS installers
(`.dmg` / `.exe` / `.AppImage`) are built in a separate Mintplex-Labs repo**
(`anything-llm-desktop`) that is *not* present here. So the literal compiled
installer cannot be produced from this repo alone.

What this repo provides is the **customization payload** that the installer must
embed, plus the **seed step** that wires everything on first run:

- `../agent-skills/create-jira-issue/` — the skill to pre-install.
- `seed.cjs` — installs the skill + writes the Portkey provider env.
- `env.defaults` — provider defaults to bake into the build's `.env`.

The two integration models below tell you exactly where these slot into a
desktop build.

## Option A — bake into the Electron build (true "customized build")

In the `anything-llm-desktop` build, after the app's `userData/storage` dir is
known (the Electron main process creates it), run our seed step once on first
launch:

1. Bundle this `jira-assistant/` folder into the app resources (e.g. under
   `resources/jira-assistant/`).
2. In the Electron main process, on app `ready` (guard with a
   `first-run-complete` marker file so it runs once), spawn:

   ```js
   const { execFileSync } = require("node:child_process");
   execFileSync(process.execPath, [
     path.join(process.resourcesPath, "jira-assistant", "build", "seed.cjs"),
   ], {
     env: {
       ...process.env,
       STORAGE_DIR: path.join(app.getPath("userData"), "storage"),
       TARGET_ENV_FILE: /* the .env the bundled server reads */,
       PORTKEY_API_KEY,        // from the first-run prompt
       PORTKEY_BASE_URL,       // default https://api.portkey.ai/v1
       PORTKEY_VIRTUAL_KEY,    // or PORTKEY_CONFIG — your routing
       MODEL,                  // e.g. claude-sonnet-4-6
       JIRA_BASE_URL,          // from the first-run prompt
       JIRA_PAT,               // from the first-run prompt
       JIRA_DEFAULT_PROJECT_KEY,
     },
   });
   ```

   Use `execFile` (not a shell) and pass values via `env`, never string
   interpolation — keeps the seed step free of shell-injection surface.

3. Collect `PORTKEY_API_KEY`, `JIRA_BASE_URL`, `JIRA_PAT` with a tiny first-run
   window (two/three password fields). That is the only manual input.

To pre-bake the **provider defaults that don't depend on the secrets** (base URL,
model, header skeleton), copy `env.defaults` into the bundled server `.env` at
build time; `seed.cjs` then fills in the secret-dependent keys at first run.

## Option B — post-install seed against a stock Desktop install

If you ship the **stock** AnythingLLM Desktop plus a small first-run helper
(simplest to stand up; fewer moving parts than forking the Electron repo):

1. Install AnythingLLM Desktop normally.
2. Run the helper once. It prompts for the three values and invokes:

   ```bash
   STORAGE_DIR="<userData>/storage" \
   TARGET_ENV_FILE="<the server .env Desktop reads>" \
   PORTKEY_API_KEY=… JIRA_BASE_URL=… JIRA_PAT=… [PORTKEY_VIRTUAL_KEY=…] [MODEL=…] \
   node jira-assistant/build/seed.cjs
   ```

   Per-OS `<userData>/storage` defaults are in `../DECISIONS.md` §6.

3. Restart Desktop so the server reloads `.env`.

Option B is fully runnable from this repo today; Option A additionally requires
the `anything-llm-desktop` repo to embed the payload and the first-run window.

## Verifying a built installer

After install + seed, confirm:

- AnythingLLM Settings → LLM shows **Generic OpenAI**, base path = your Portkey
  URL, a model set. (Backed by `GENERIC_OPEN_AI_*` in the server `.env`.)
- Agent skills list shows **Create Jira Issue**, toggled **on**.
- In a chat, `@agent file a task in ENG: smoke test` creates a real issue and
  returns its key + URL.
- A trivial chat completion succeeds → confirms Portkey routing + headers.
