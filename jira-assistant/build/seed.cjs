#!/usr/bin/env node
/**
 * anything-jira :: one-time seeding step for a customized AnythingLLM Desktop build.
 *
 * The installer runs this once (post-install / first-run). It:
 *   1. Installs the reference Jira agent skill into the Desktop storage dir
 *      ($STORAGE_DIR/plugins/agent-skills/<hubId>/), marks it active, and injects
 *      the Jira base URL + PAT into the skill's setup_args.
 *   2. Pre-seeds the Generic OpenAI (Portkey) LLM provider config into the
 *      server .env so AnythingLLM is configured on first launch with no UI clicks.
 *
 * Zero npm dependencies (only Node stdlib) so it can run inside a packaged build.
 *
 * Configuration is read from environment variables (the installer collects the
 * two secrets from the user and exports them before invoking this script):
 *
 *   Required for a working setup:
 *     STORAGE_DIR            Desktop storage dir. Defaults to the dev path if unset.
 *     PORTKEY_API_KEY        Portkey API key -> GENERIC_OPEN_AI_API_KEY
 *     JIRA_BASE_URL          e.g. https://jira.your-company.com
 *     JIRA_PAT               Jira Data Center Personal Access Token
 *
 *   Optional:
 *     TARGET_ENV_FILE        Path to the server .env to write. Defaults to
 *                            <repo>/server/.env (dev) — set explicitly for Desktop.
 *     PORTKEY_BASE_URL       Defaults to https://api.portkey.ai/v1
 *     PORTKEY_VIRTUAL_KEY    -> x-portkey-virtual-key header
 *     PORTKEY_CONFIG         -> x-portkey-config header (Portkey config id/slug)
 *     PORTKEY_PROVIDER       -> x-portkey-provider header
 *     MODEL                  -> GENERIC_OPEN_AI_MODEL_PREF (default: gpt-4o)
 *     MODEL_TOKEN_LIMIT      -> GENERIC_OPEN_AI_MODEL_TOKEN_LIMIT (default: 8192)
 *     MAX_TOKENS             -> GENERIC_OPEN_AI_MAX_TOKENS (default: 1024)
 *     JIRA_DEFAULT_PROJECT_KEY
 */

const fs = require("fs");
const path = require("path");

const HUB_ID = "create-jira-issue";

function log(msg) {
  console.log(`[anything-jira seed] ${msg}`);
}

function resolveStorageDir() {
  if (process.env.STORAGE_DIR) return path.resolve(process.env.STORAGE_DIR);
  // Dev fallback mirrors server/utils/agents/imported.js
  return path.resolve(__dirname, "../../server/storage");
}

function resolveTargetEnvFile() {
  if (process.env.TARGET_ENV_FILE) return path.resolve(process.env.TARGET_ENV_FILE);
  return path.resolve(__dirname, "../../server/.env");
}

/** Copy the skill folder into storage, set active + secrets, idempotently. */
function installSkill(storageDir) {
  const srcDir = path.resolve(__dirname, "../agent-skills", HUB_ID);
  if (!fs.existsSync(srcDir))
    throw new Error(`Skill source not found at ${srcDir}`);

  const destSkillsDir = path.join(storageDir, "plugins", "agent-skills");
  const destDir = path.join(destSkillsDir, HUB_ID);
  fs.mkdirSync(destDir, { recursive: true });

  // Copy handler.js verbatim.
  fs.copyFileSync(
    path.join(srcDir, "handler.js"),
    path.join(destDir, "handler.js")
  );

  // Merge plugin.json: start from source, then preserve/overlay configured values.
  const sourceManifest = JSON.parse(
    fs.readFileSync(path.join(srcDir, "plugin.json"), "utf8")
  );
  const destManifestPath = path.join(destDir, "plugin.json");
  const existing = fs.existsSync(destManifestPath)
    ? JSON.parse(fs.readFileSync(destManifestPath, "utf8"))
    : null;

  const manifest = sourceManifest;
  manifest.active = true;

  // Inject configured secrets without clobbering an already-set value with a blank.
  const setupValues = {
    JIRA_BASE_URL: process.env.JIRA_BASE_URL,
    JIRA_PAT: process.env.JIRA_PAT,
    JIRA_DEFAULT_PROJECT_KEY: process.env.JIRA_DEFAULT_PROJECT_KEY,
  };
  for (const [key, value] of Object.entries(setupValues)) {
    if (!manifest.setup_args?.[key]) continue;
    const incoming = (value ?? "").trim();
    const prior = existing?.setup_args?.[key]?.value ?? "";
    manifest.setup_args[key].value = incoming || prior || "";
  }

  fs.writeFileSync(destManifestPath, JSON.stringify(manifest, null, 2));
  log(`Installed skill '${HUB_ID}' -> ${destDir} (active: true)`);

  const missing = ["JIRA_BASE_URL", "JIRA_PAT"].filter(
    (k) => !manifest.setup_args[k].value
  );
  if (missing.length)
    log(
      `WARNING: skill setup value(s) still empty: ${missing.join(", ")}. ` +
        `The user must fill these in the skill settings before use.`
    );
}

/** Build the Portkey custom-headers CSV consumed by GENERIC_OPEN_AI_CUSTOM_HEADERS. */
function buildPortkeyHeaders() {
  const pairs = [];
  if (process.env.PORTKEY_VIRTUAL_KEY)
    pairs.push(`x-portkey-virtual-key:${process.env.PORTKEY_VIRTUAL_KEY}`);
  if (process.env.PORTKEY_CONFIG)
    pairs.push(`x-portkey-config:${process.env.PORTKEY_CONFIG}`);
  if (process.env.PORTKEY_PROVIDER)
    pairs.push(`x-portkey-provider:${process.env.PORTKEY_PROVIDER}`);
  return pairs.join(",");
}

/** Upsert KEY=VALUE pairs into an env file without disturbing unrelated lines. */
function writeEnv(targetEnvFile, kv) {
  fs.mkdirSync(path.dirname(targetEnvFile), { recursive: true });
  let lines = fs.existsSync(targetEnvFile)
    ? fs.readFileSync(targetEnvFile, "utf8").split(/\r?\n/)
    : [];

  for (const [key, rawValue] of Object.entries(kv)) {
    if (rawValue === undefined || rawValue === null || rawValue === "") continue;
    const value = String(rawValue);
    // Quote values containing characters that would break dotenv parsing.
    const needsQuote = /[\s:,#'"]/.test(value);
    const line = `${key}=${needsQuote ? `"${value.replace(/"/g, '\\"')}"` : value}`;
    const idx = lines.findIndex((l) => l.match(new RegExp(`^\\s*${key}\\s*=`)));
    if (idx >= 0) lines[idx] = line;
    else lines.push(line);
  }

  fs.writeFileSync(targetEnvFile, lines.join("\n").replace(/\n{3,}/g, "\n\n"));
}

function seedProvider(targetEnvFile) {
  const headers = buildPortkeyHeaders();
  const env = {
    LLM_PROVIDER: "generic-openai",
    GENERIC_OPEN_AI_BASE_PATH:
      process.env.PORTKEY_BASE_URL || "https://api.portkey.ai/v1",
    GENERIC_OPEN_AI_API_KEY: process.env.PORTKEY_API_KEY,
    GENERIC_OPEN_AI_MODEL_PREF: process.env.MODEL || "gpt-4o",
    GENERIC_OPEN_AI_MODEL_TOKEN_LIMIT: process.env.MODEL_TOKEN_LIMIT || "8192",
    GENERIC_OPEN_AI_MAX_TOKENS: process.env.MAX_TOKENS || "1024",
  };
  if (headers) env.GENERIC_OPEN_AI_CUSTOM_HEADERS = headers;

  writeEnv(targetEnvFile, env);
  log(`Wrote Generic OpenAI/Portkey provider config -> ${targetEnvFile}`);
  if (!process.env.PORTKEY_API_KEY)
    log("WARNING: PORTKEY_API_KEY was not provided; GENERIC_OPEN_AI_API_KEY left unset.");
  if (headers) log(`Portkey headers: ${headers.replace(/:[^,]+/g, ":***")}`);
}

function main() {
  const storageDir = resolveStorageDir();
  const targetEnvFile = resolveTargetEnvFile();
  log(`STORAGE_DIR = ${storageDir}`);

  installSkill(storageDir);
  seedProvider(targetEnvFile);

  log("Done. Launch AnythingLLM Desktop; the Jira skill and Portkey routing are pre-configured.");
}

main();
