/** List Jira Sprints — GET /rest/agile/1.0/board/{boardId}/sprint. */
const J = require("./jira.js");

module.exports.runtime = {
  handler: async function (args = {}) {
    const cfg = J.getConfig(this.runtimeArgs);
    const cfgErr = J.requireConfig(cfg);
    if (cfgErr) return J.failure(cfgErr);

    const boardId = parseInt(args.boardId, 10);
    if (!Number.isInteger(boardId))
      return J.failure(
        "A numeric 'boardId' is required (see the List Jira Boards skill)."
      );
    const query = { maxResults: 50 };
    if (args.state) query.state = J.splitList(args.state).join(",");

    this.introspect(`Listing sprints on board ${boardId}…`);
    const { ok, status, data } = await J.jiraRequest(cfg, {
      path: `/rest/agile/1.0/board/${boardId}/sprint`,
      query,
    });
    if (!ok) {
      this.logger(`[jira-list-sprints] ${status}`);
      return J.failure(
        J.jiraErrorMessage(status, data, "Could not list sprints. The board may not be a scrum board.")
      );
    }

    const sprints = (data?.values || []).map((s) => ({
      id: s.id,
      name: s.name,
      state: s.state,
    }));
    return J.success({ count: sprints.length, sprints });
  },
};
