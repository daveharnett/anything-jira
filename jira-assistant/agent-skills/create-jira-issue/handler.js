/**
 * Create Jira Issue — POST /rest/api/2/issue (Jira Server / Data Center).
 * See ../_shared/jira.js (installed alongside as ./jira.js) for the handler
 * contract and the shared REST helpers.
 */
const J = require("./jira.js");

module.exports.runtime = {
  handler: async function (args = {}) {
    const cfg = J.getConfig(this.runtimeArgs);
    const cfgErr = J.requireConfig(cfg);
    if (cfgErr) return J.failure(cfgErr);

    const summary = (args.summary || "").toString().trim();
    if (!summary) return J.failure("A 'summary' is required to create a Jira issue.");

    const projectKey = (args.projectKey || cfg.defaultProjectKey || "")
      .toString()
      .trim()
      .toUpperCase();
    if (!projectKey)
      return J.failure(
        "No project specified and no default project key is configured. Ask the user which Jira project to use."
      );

    const issueType = (args.issueType || "Task").toString().trim();
    const fields = {
      project: { key: projectKey },
      summary,
      issuetype: { name: issueType },
    };
    if (args.description) fields.description = args.description.toString();
    const labels = J.splitList(args.labels).map((l) => l.replace(/\s+/g, "-"));
    if (labels.length) fields.labels = labels;
    if (args.priority) fields.priority = { name: args.priority.toString().trim() };

    this.introspect(`Creating a ${issueType} in ${projectKey}: "${summary}"`);
    const { ok, status, data } = await J.jiraRequest(cfg, {
      method: "POST",
      path: "/rest/api/2/issue",
      body: { fields },
    });

    if (!ok) {
      this.logger(`[create-jira-issue] ${status}: ${data ? JSON.stringify(data) : ""}`);
      return J.failure(J.jiraErrorMessage(status, data, "Could not create the issue."));
    }

    const key = data?.key;
    this.introspect(`Created ${key || "issue"}.`);
    return J.success({
      message: key ? `Created Jira issue ${key}.` : "Jira issue created.",
      issueKey: key || null,
      url: key ? `${cfg.baseUrl}/browse/${key}` : null,
    });
  },
};
