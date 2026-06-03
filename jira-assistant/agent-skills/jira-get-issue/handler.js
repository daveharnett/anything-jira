/** Get Jira Issue — GET /rest/api/2/issue/{key}. */
const J = require("./jira.js");

module.exports.runtime = {
  handler: async function (args = {}) {
    const cfg = J.getConfig(this.runtimeArgs);
    const cfgErr = J.requireConfig(cfg);
    if (cfgErr) return J.failure(cfgErr);

    const key = J.normalizeKey(args.issueKey);
    if (!key) return J.failure("An 'issueKey' is required, e.g. ENG-123.");

    this.introspect(`Fetching ${key}…`);
    const { ok, status, data } = await J.jiraRequest(cfg, {
      path: `/rest/api/2/issue/${encodeURIComponent(key)}`,
      query: {
        fields:
          "summary,status,assignee,issuetype,priority,reporter,description,created,updated,labels",
      },
    });
    if (!ok) {
      this.logger(`[jira-get-issue] ${status}`);
      return J.failure(J.jiraErrorMessage(status, data));
    }

    const f = data.fields || {};
    return J.success({
      issue: {
        key: data.key,
        summary: f.summary,
        status: f.status?.name,
        type: f.issuetype?.name,
        priority: f.priority?.name,
        assignee: f.assignee?.displayName || "Unassigned",
        reporter: f.reporter?.displayName,
        labels: f.labels || [],
        created: f.created,
        updated: f.updated,
        description: f.description || "",
        url: `${cfg.baseUrl}/browse/${data.key}`,
      },
    });
  },
};
