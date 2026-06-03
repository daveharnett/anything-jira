/** List Jira Boards — GET /rest/agile/1.0/board. */
const J = require("./jira.js");

module.exports.runtime = {
  handler: async function (args = {}) {
    const cfg = J.getConfig(this.runtimeArgs);
    const cfgErr = J.requireConfig(cfg);
    if (cfgErr) return J.failure(cfgErr);

    const query = { maxResults: 50 };
    if (args.projectKey) query.projectKeyOrId = J.normalizeKey(args.projectKey);
    if (args.name) query.name = args.name.toString().trim();

    this.introspect("Listing agile boards…");
    const { ok, status, data } = await J.jiraRequest(cfg, {
      path: "/rest/agile/1.0/board",
      query,
    });
    if (!ok) {
      this.logger(`[jira-list-boards] ${status}`);
      return J.failure(J.jiraErrorMessage(status, data));
    }

    const boards = (data?.values || []).map((b) => ({
      id: b.id,
      name: b.name,
      type: b.type,
    }));
    return J.success({ count: boards.length, boards });
  },
};
