/** List Jira Projects — GET /rest/api/2/project. */
const J = require("./jira.js");

module.exports.runtime = {
  handler: async function (args = {}) {
    const cfg = J.getConfig(this.runtimeArgs);
    const cfgErr = J.requireConfig(cfg);
    if (cfgErr) return J.failure(cfgErr);

    this.introspect("Listing Jira projects…");
    const { ok, status, data } = await J.jiraRequest(cfg, {
      path: "/rest/api/2/project",
    });
    if (!ok) {
      this.logger(`[jira-list-projects] ${status}`);
      return J.failure(J.jiraErrorMessage(status, data));
    }

    let projects = (Array.isArray(data) ? data : []).map((p) => ({
      key: p.key,
      name: p.name,
    }));
    const contains = (args.contains || "").toString().trim().toLowerCase();
    if (contains)
      projects = projects.filter((p) =>
        `${p.key} ${p.name}`.toLowerCase().includes(contains)
      );

    return J.success({ count: projects.length, projects });
  },
};
