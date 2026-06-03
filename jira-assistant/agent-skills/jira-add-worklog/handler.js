/** Log Work on Jira Issue — POST /rest/api/2/issue/{key}/worklog. */
const J = require("./jira.js");

module.exports.runtime = {
  handler: async function (args = {}) {
    const cfg = J.getConfig(this.runtimeArgs);
    const cfgErr = J.requireConfig(cfg);
    if (cfgErr) return J.failure(cfgErr);

    const key = J.normalizeKey(args.issueKey);
    if (!key) return J.failure("An 'issueKey' is required, e.g. ENG-123.");
    const timeSpent = (args.timeSpent || "").toString().trim();
    if (!timeSpent)
      return J.failure("A 'timeSpent' is required, e.g. '1h 30m', '2d', '45m'.");

    const body = { timeSpent };
    if (args.comment) body.comment = args.comment.toString();

    this.introspect(`Logging ${timeSpent} on ${key}…`);
    const { ok, status, data } = await J.jiraRequest(cfg, {
      method: "POST",
      path: `/rest/api/2/issue/${encodeURIComponent(key)}/worklog`,
      body,
    });
    if (!ok) {
      this.logger(`[jira-add-worklog] ${status}`);
      return J.failure(J.jiraErrorMessage(status, data, `Could not log work on ${key}.`));
    }

    return J.success({
      message: `Logged ${timeSpent} on ${key}.`,
      issueKey: key,
      worklogId: data?.id || null,
      url: `${cfg.baseUrl}/browse/${key}`,
    });
  },
};
