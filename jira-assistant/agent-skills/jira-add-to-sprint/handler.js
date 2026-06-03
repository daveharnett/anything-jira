/** Add Issues to Sprint — POST /rest/agile/1.0/sprint/{sprintId}/issue. */
const J = require("./jira.js");

module.exports.runtime = {
  handler: async function (args = {}) {
    const cfg = J.getConfig(this.runtimeArgs);
    const cfgErr = J.requireConfig(cfg);
    if (cfgErr) return J.failure(cfgErr);

    const sprintId = parseInt(args.sprintId, 10);
    if (!Number.isInteger(sprintId))
      return J.failure(
        "A numeric 'sprintId' is required (see the List Jira Sprints skill)."
      );
    const issues = J.splitList(args.issueKeys).map(J.normalizeKey);
    if (!issues.length)
      return J.failure("At least one issue key is required in 'issueKeys'.");

    this.introspect(`Adding ${issues.length} issue(s) to sprint ${sprintId}…`);
    const { ok, status, data } = await J.jiraRequest(cfg, {
      method: "POST",
      path: `/rest/agile/1.0/sprint/${sprintId}/issue`,
      body: { issues },
    });
    if (!ok) {
      this.logger(`[jira-add-to-sprint] ${status}`);
      return J.failure(
        J.jiraErrorMessage(status, data, `Could not add issues to sprint ${sprintId}.`)
      );
    }

    return J.success({
      message: `Added ${issues.join(", ")} to sprint ${sprintId}.`,
      sprintId,
      issues,
    });
  },
};
