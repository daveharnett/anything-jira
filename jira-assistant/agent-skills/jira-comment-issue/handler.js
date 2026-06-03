/** Comment on Jira Issue — POST /rest/api/2/issue/{key}/comment. */
const J = require("./jira.js");

module.exports.runtime = {
  handler: async function (args = {}) {
    const cfg = J.getConfig(this.runtimeArgs);
    const cfgErr = J.requireConfig(cfg);
    if (cfgErr) return J.failure(cfgErr);

    const key = J.normalizeKey(args.issueKey);
    if (!key) return J.failure("An 'issueKey' is required, e.g. ENG-123.");
    const body = (args.body || "").toString().trim();
    if (!body) return J.failure("A comment 'body' is required.");

    this.introspect(`Commenting on ${key}…`);
    const { ok, status, data } = await J.jiraRequest(cfg, {
      method: "POST",
      path: `/rest/api/2/issue/${encodeURIComponent(key)}/comment`,
      body: { body },
    });
    if (!ok) {
      this.logger(`[jira-comment-issue] ${status}`);
      return J.failure(J.jiraErrorMessage(status, data, `Could not comment on ${key}.`));
    }

    return J.success({
      message: `Added a comment to ${key}.`,
      issueKey: key,
      commentId: data?.id || null,
      url: `${cfg.baseUrl}/browse/${key}`,
    });
  },
};
