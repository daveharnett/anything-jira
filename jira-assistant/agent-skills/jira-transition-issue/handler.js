/**
 * Transition Jira Issue — reads available transitions, matches the target by
 * transition name OR destination status name, then POSTs the transition.
 * GET/POST /rest/api/2/issue/{key}/transitions.
 */
const J = require("./jira.js");

module.exports.runtime = {
  handler: async function (args = {}) {
    const cfg = J.getConfig(this.runtimeArgs);
    const cfgErr = J.requireConfig(cfg);
    if (cfgErr) return J.failure(cfgErr);

    const key = J.normalizeKey(args.issueKey);
    if (!key) return J.failure("An 'issueKey' is required, e.g. ENG-123.");
    const target = (args.status || "").toString().trim();
    if (!target)
      return J.failure("A target 'status' is required, e.g. 'In Progress'.");

    this.introspect(`Looking up transitions for ${key}…`);
    const list = await J.jiraRequest(cfg, {
      path: `/rest/api/2/issue/${encodeURIComponent(key)}/transitions`,
    });
    if (!list.ok)
      return J.failure(
        J.jiraErrorMessage(list.status, list.data, `Could not read transitions for ${key}.`)
      );

    const transitions = list.data?.transitions || [];
    const t = target.toLowerCase();
    const match = transitions.find(
      (x) => x.name?.toLowerCase() === t || x.to?.name?.toLowerCase() === t
    );
    if (!match) {
      const available = transitions.map((x) => x.name).filter(Boolean);
      return J.failure(
        `'${target}' is not an available transition for ${key} from its current status. ` +
          `Available: ${available.join(", ") || "none"}.`
      );
    }

    const payload = { transition: { id: match.id } };
    if (args.comment)
      payload.update = { comment: [{ add: { body: args.comment.toString() } }] };

    this.introspect(`Transitioning ${key} → ${match.name}…`);
    const { ok, status, data } = await J.jiraRequest(cfg, {
      method: "POST",
      path: `/rest/api/2/issue/${encodeURIComponent(key)}/transitions`,
      body: payload,
    });
    if (!ok) {
      this.logger(`[jira-transition-issue] ${status}`);
      return J.failure(J.jiraErrorMessage(status, data, `Could not transition ${key}.`));
    }

    return J.success({
      message: `Moved ${key} to '${match.to?.name || match.name}'.`,
      issueKey: key,
      status: match.to?.name || match.name,
      url: `${cfg.baseUrl}/browse/${key}`,
    });
  },
};
