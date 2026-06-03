/** Search Jira Issues — POST /rest/api/2/search (JQL). */
const J = require("./jira.js");

module.exports.runtime = {
  handler: async function (args = {}) {
    const cfg = J.getConfig(this.runtimeArgs);
    const cfgErr = J.requireConfig(cfg);
    if (cfgErr) return J.failure(cfgErr);

    const jql = (args.jql || "").toString().trim();
    if (!jql)
      return J.failure(
        "A 'jql' query is required, e.g. \"project = ENG AND status = 'In Progress' ORDER BY updated DESC\"."
      );
    const maxResults = Math.min(
      Math.max(parseInt(args.maxResults, 10) || 20, 1),
      100
    );

    this.introspect(`Searching Jira: ${jql}`);
    const { ok, status, data } = await J.jiraRequest(cfg, {
      method: "POST",
      path: "/rest/api/2/search",
      body: {
        jql,
        maxResults,
        fields: ["summary", "status", "assignee", "issuetype", "priority"],
      },
    });
    if (!ok) {
      this.logger(`[jira-search-issues] ${status}`);
      return J.failure(J.jiraErrorMessage(status, data, "Search failed."));
    }

    const issues = (data.issues || []).map((i) => J.issueRow(cfg.baseUrl, i));
    return J.success({ total: data.total, returned: issues.length, issues });
  },
};
