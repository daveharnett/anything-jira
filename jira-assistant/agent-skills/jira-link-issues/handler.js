/** Link Jira Issues — POST /rest/api/2/issueLink. */
const J = require("./jira.js");

module.exports.runtime = {
  handler: async function (args = {}) {
    const cfg = J.getConfig(this.runtimeArgs);
    const cfgErr = J.requireConfig(cfg);
    if (cfgErr) return J.failure(cfgErr);

    const inward = J.normalizeKey(args.inwardIssue);
    const outward = J.normalizeKey(args.outwardIssue);
    if (!inward || !outward)
      return J.failure("Both 'inwardIssue' and 'outwardIssue' keys are required.");
    const linkType = (args.linkType || "Relates").toString().trim();

    this.introspect(`Linking ${inward} (${linkType}) ${outward}…`);
    const { ok, status, data } = await J.jiraRequest(cfg, {
      method: "POST",
      path: "/rest/api/2/issueLink",
      body: {
        type: { name: linkType },
        inwardIssue: { key: inward },
        outwardIssue: { key: outward },
      },
    });
    if (!ok) {
      this.logger(`[jira-link-issues] ${status}`);
      return J.failure(
        J.jiraErrorMessage(
          status,
          data,
          "Could not create the link. The link type name must match one defined in your Jira."
        )
      );
    }

    return J.success({
      message: `Linked ${inward} (${linkType}) ${outward}.`,
      inwardIssue: inward,
      outwardIssue: outward,
      linkType,
    });
  },
};
