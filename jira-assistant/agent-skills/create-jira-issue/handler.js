/**
 * AnythingLLM custom agent skill: Create Jira Issue
 *
 * Talks directly to the Jira Server / Data Center REST API (v2) using a
 * Personal Access Token. No external binary, no shell, no Jira Cloud assumptions.
 *
 * Handler contract (verified against AnythingLLM source,
 * server/utils/agents/imported.js):
 *   - module.exports.runtime.handler is invoked as `await fn.handler(args)`.
 *   - `args` is the object of LLM-supplied params declared in entrypoint.params.
 *   - `this` exposes:
 *       this.runtimeArgs  -> configured setup_args values (JIRA_BASE_URL, JIRA_PAT, ...)
 *       this.introspect() -> surface a "thought" in the chat UI
 *       this.logger()     -> server-side console log
 *   - The return value is coerced to a string and handed back to the agent.
 */

module.exports.runtime = {
  handler: async function (args = {}) {
    const callerId = `${this.config?.name || "Create Jira Issue"}-v${
      this.config?.version || "1.0.0"
    }`;
    try {
      this.introspect(`${callerId} called. Preparing to create a Jira issue.`);

      const baseUrl = normalizeBaseUrl(this.runtimeArgs?.JIRA_BASE_URL);
      const pat = (this.runtimeArgs?.JIRA_PAT || "").trim();
      const defaultProjectKey = (
        this.runtimeArgs?.JIRA_DEFAULT_PROJECT_KEY || ""
      ).trim();

      if (!baseUrl)
        return failure(
          "This skill is not configured: JIRA_BASE_URL is missing. Set it in the skill settings."
        );
      if (!pat)
        return failure(
          "This skill is not configured: JIRA_PAT is missing. Set it in the skill settings."
        );

      const summary = (args.summary || "").toString().trim();
      if (!summary)
        return failure("A 'summary' is required to create a Jira issue.");

      const projectKey = (args.projectKey || defaultProjectKey || "")
        .toString()
        .trim()
        .toUpperCase();
      if (!projectKey)
        return failure(
          "No project specified and no default project key is configured. Ask the user which Jira project to use."
        );

      const issueType = (args.issueType || "Task").toString().trim();
      const description = (args.description || "").toString();
      const labels = parseLabels(args.labels);

      const fields = {
        project: { key: projectKey },
        summary,
        issuetype: { name: issueType },
      };
      if (description) fields.description = description;
      if (labels.length) fields.labels = labels;

      this.introspect(
        `Creating a ${issueType} in project ${projectKey}: "${summary}"`
      );

      const endpoint = `${baseUrl}/rest/api/2/issue`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pat}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ fields }),
      });

      const raw = await res.text();
      const body = safeJson(raw);

      if (!res.ok) {
        this.logger(
          `[create-jira-issue] Jira API ${res.status}: ${raw?.slice(0, 500)}`
        );
        return failure(jiraErrorMessage(res.status, body));
      }

      const key = body?.key;
      const browseUrl = key ? `${baseUrl}/browse/${key}` : null;
      this.introspect(`Created ${key || "issue"}.`);
      return JSON.stringify({
        success: true,
        message: key
          ? `Created Jira issue ${key}.`
          : "Jira issue created.",
        issueKey: key || null,
        url: browseUrl,
      });
    } catch (error) {
      this.logger(`[create-jira-issue] Unhandled error: ${error.message}`);
      return failure(
        `Failed to reach Jira: ${error.message}. Check the JIRA_BASE_URL and that this machine can reach the Jira server.`
      );
    }
  },
};

/**
 * Normalizes and validates the configured Jira base URL.
 * Only http/https is accepted; the /rest path and trailing slashes are stripped.
 * Returns "" if the value is missing or not a valid http(s) URL.
 */
function normalizeBaseUrl(value) {
  if (!value || typeof value !== "string") return "";
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return "";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  // Drop any path the user accidentally appended (e.g. /rest/api/2) plus trailing slash.
  return `${url.protocol}//${url.host}`;
}

function parseLabels(value) {
  if (!value || typeof value !== "string") return [];
  return value
    .split(",")
    .map((l) => l.trim().replace(/\s+/g, "-"))
    .filter(Boolean);
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function jiraErrorMessage(status, body) {
  const details = []
    .concat(body?.errorMessages || [])
    .concat(body?.errors ? Object.values(body.errors) : [])
    .join("; ");
  if (status === 401)
    return "Jira rejected the credentials (401). Check that the Personal Access Token is valid and not expired.";
  if (status === 403)
    return "Jira denied the request (403). The token may lack permission to create issues in this project.";
  if (status === 404)
    return "Jira endpoint not found (404). Check that JIRA_BASE_URL points at the Jira Server/Data Center root.";
  return `Jira returned ${status}.${details ? ` ${details}` : ""}`;
}

function failure(message) {
  return JSON.stringify({ success: false, message });
}
