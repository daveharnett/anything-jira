/** Add Issues to Epic — POST /rest/agile/1.0/epic/{epicKey}/issue. */
const J = require("./jira.js");

module.exports.runtime = {
  handler: async function (args = {}) {
    const cfg = J.getConfig(this.runtimeArgs);
    const cfgErr = J.requireConfig(cfg);
    if (cfgErr) return J.failure(cfgErr);

    const epicKey = J.normalizeKey(args.epicKey);
    if (!epicKey) return J.failure("An 'epicKey' is required, e.g. ENG-100.");
    const issues = J.splitList(args.issueKeys).map(J.normalizeKey);
    if (!issues.length)
      return J.failure("At least one issue key is required in 'issueKeys'.");

    this.introspect(`Adding ${issues.length} issue(s) to epic ${epicKey}…`);
    const { ok, status, data } = await J.jiraRequest(cfg, {
      method: "POST",
      path: `/rest/agile/1.0/epic/${encodeURIComponent(epicKey)}/issue`,
      body: { issues },
    });
    if (!ok) {
      this.logger(`[jira-add-to-epic] ${status}`);
      return J.failure(
        J.jiraErrorMessage(status, data, `Could not add issues to epic ${epicKey}.`)
      );
    }

    return J.success({
      message: `Added ${issues.join(", ")} to epic ${epicKey}.`,
      epicKey,
      issues,
    });
  },
};
