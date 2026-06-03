/**
 * Shared Jira Server / Data Center REST helpers for anything-jira agent skills.
 *
 * Single source of truth. At install time, build/seed.cjs copies this file into
 * every skill folder as `jira.js`, and each handler does `require("./jira.js")`.
 * (Skills run from the storage dir and cannot import across sibling folders, so
 * the copy keeps every installed skill self-contained.)
 *
 * All requests use a Personal Access Token as `Authorization: Bearer <PAT>` and
 * target only the configured Jira host. No shell, ever.
 */

/** Validate + normalize the configured Jira base URL to `scheme://host`. */
function normalizeBaseUrl(value) {
  if (!value || typeof value !== "string") return "";
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return "";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  return `${url.protocol}//${url.host}`;
}

/** Pull the shared connection config out of the skill's runtimeArgs. */
function getConfig(runtimeArgs = {}) {
  return {
    baseUrl: normalizeBaseUrl(runtimeArgs.JIRA_BASE_URL),
    pat: (runtimeArgs.JIRA_PAT || "").trim(),
    defaultProjectKey: (runtimeArgs.JIRA_DEFAULT_PROJECT_KEY || "").trim(),
  };
}

/** Returns an error string if required config is missing, else null. */
function requireConfig(cfg) {
  if (!cfg.baseUrl)
    return "This skill is not configured: JIRA_BASE_URL is missing or invalid. Set it in the skill settings.";
  if (!cfg.pat)
    return "This skill is not configured: JIRA_PAT is missing. Set it in the skill settings.";
  return null;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Perform a Jira REST request.
 * @returns {Promise<{ok:boolean,status:number,data:any,raw:string}>}
 */
async function jiraRequest(cfg, { method = "GET", path, query, body } = {}) {
  const url = new URL(`${cfg.baseUrl}${path}`);
  if (query)
    for (const [k, v] of Object.entries(query))
      if (v !== undefined && v !== null && v !== "")
        url.searchParams.set(k, String(v));

  const headers = { Authorization: `Bearer ${cfg.pat}`, Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  return { ok: res.ok, status: res.status, data: safeJson(raw), raw };
}

/** Map a Jira HTTP status + error body to a human-readable message. */
function jiraErrorMessage(status, data, context = "") {
  const details = []
    .concat(data?.errorMessages || [])
    .concat(data?.errors ? Object.values(data.errors) : [])
    .filter(Boolean)
    .join("; ");
  const base =
    {
      400: "Jira rejected the request (400). Check the field values.",
      401: "Jira rejected the credentials (401). Check that the Personal Access Token is valid and not expired.",
      403: "Jira denied the request (403). The token may lack permission for this action.",
      404: "Not found (404). Check the issue key / project / board / URL.",
      409: "Conflict (409). The issue may be in a state that does not allow this.",
    }[status] || `Jira returned ${status}.`;
  return [context, base, details].filter(Boolean).join(" ");
}

function failure(message) {
  return JSON.stringify({ success: false, message });
}

function success(obj = {}) {
  return JSON.stringify({ success: true, ...obj });
}

/** Compact issue row for list/search output. */
function issueRow(baseUrl, issue) {
  const f = issue.fields || {};
  return {
    key: issue.key,
    summary: f.summary,
    status: f.status?.name,
    type: f.issuetype?.name,
    assignee: f.assignee?.displayName || "Unassigned",
    priority: f.priority?.name,
    url: `${baseUrl}/browse/${issue.key}`,
  };
}

/** Split a comma-separated string param into a trimmed, non-empty array. */
function splitList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (!value || typeof value !== "string") return [];
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

/** Normalize an issue key argument, e.g. " eng-12 " -> "ENG-12". */
function normalizeKey(value) {
  return (value || "").toString().trim().toUpperCase();
}

module.exports = {
  normalizeBaseUrl,
  getConfig,
  requireConfig,
  jiraRequest,
  jiraErrorMessage,
  failure,
  success,
  safeJson,
  issueRow,
  splitList,
  normalizeKey,
};
