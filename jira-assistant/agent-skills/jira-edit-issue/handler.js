/** Edit Jira Issue — PUT /rest/api/2/issue/{key}. */
const J = require("./jira.js");

module.exports.runtime = {
  handler: async function (args = {}) {
    const cfg = J.getConfig(this.runtimeArgs);
    const cfgErr = J.requireConfig(cfg);
    if (cfgErr) return J.failure(cfgErr);

    const key = J.normalizeKey(args.issueKey);
    if (!key) return J.failure("An 'issueKey' is required, e.g. ENG-123.");

    const fields = {};
    if (args.summary) fields.summary = args.summary.toString();
    if (args.description) fields.description = args.description.toString();
    if (args.priority) fields.priority = { name: args.priority.toString().trim() };
    if (args.labels !== undefined && args.labels !== "")
      fields.labels = J.splitList(args.labels).map((l) => l.replace(/\s+/g, "-"));

    if (Object.keys(fields).length === 0)
      return J.failure(
        "Nothing to update. Provide at least one of: summary, description, priority, labels."
      );

    this.introspect(`Updating ${key}…`);
    const { ok, status, data } = await J.jiraRequest(cfg, {
      method: "PUT",
      path: `/rest/api/2/issue/${encodeURIComponent(key)}`,
      body: { fields },
    });
    if (!ok) {
      this.logger(`[jira-edit-issue] ${status}`);
      return J.failure(J.jiraErrorMessage(status, data, `Could not update ${key}.`));
    }

    return J.success({
      message: `Updated ${key}.`,
      issueKey: key,
      updatedFields: Object.keys(fields),
      url: `${cfg.baseUrl}/browse/${key}`,
    });
  },
};
