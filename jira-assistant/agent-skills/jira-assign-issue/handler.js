/** Assign Jira Issue — PUT /rest/api/2/issue/{key}/assignee. */
const J = require("./jira.js");

module.exports.runtime = {
  handler: async function (args = {}) {
    const cfg = J.getConfig(this.runtimeArgs);
    const cfgErr = J.requireConfig(cfg);
    if (cfgErr) return J.failure(cfgErr);

    const key = J.normalizeKey(args.issueKey);
    if (!key) return J.failure("An 'issueKey' is required, e.g. ENG-123.");
    const assignee = (args.assignee || "").toString().trim();
    if (!assignee)
      return J.failure("An 'assignee' is required (a username, or 'me').");

    let name;
    if (/^(me|currentuser|myself)$/i.test(assignee)) {
      this.introspect("Resolving the current user…");
      const who = await J.jiraRequest(cfg, { path: "/rest/api/2/myself" });
      if (!who.ok)
        return J.failure(
          J.jiraErrorMessage(who.status, who.data, "Could not resolve the current user.")
        );
      name = who.data?.name;
    } else if (/^(unassign|none|nobody|clear)$/i.test(assignee)) {
      name = null; // Jira DC: null clears the assignee.
    } else {
      name = assignee;
    }

    this.introspect(`Assigning ${key} to ${name || "nobody"}…`);
    const { ok, status, data } = await J.jiraRequest(cfg, {
      method: "PUT",
      path: `/rest/api/2/issue/${encodeURIComponent(key)}/assignee`,
      body: { name },
    });
    if (!ok) {
      this.logger(`[jira-assign-issue] ${status}`);
      return J.failure(J.jiraErrorMessage(status, data, `Could not assign ${key}.`));
    }

    return J.success({
      message: name ? `Assigned ${key} to ${name}.` : `Unassigned ${key}.`,
      issueKey: key,
      assignee: name,
      url: `${cfg.baseUrl}/browse/${key}`,
    });
  },
};
