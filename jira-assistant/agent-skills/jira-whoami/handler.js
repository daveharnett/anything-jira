/** Jira Whoami — GET /rest/api/2/myself. */
const J = require("./jira.js");

module.exports.runtime = {
  handler: async function () {
    const cfg = J.getConfig(this.runtimeArgs);
    const cfgErr = J.requireConfig(cfg);
    if (cfgErr) return J.failure(cfgErr);

    this.introspect("Checking the current Jira user…");
    const { ok, status, data } = await J.jiraRequest(cfg, {
      path: "/rest/api/2/myself",
    });
    if (!ok) {
      this.logger(`[jira-whoami] ${status}`);
      return J.failure(J.jiraErrorMessage(status, data));
    }

    return J.success({
      user: {
        username: data?.name,
        displayName: data?.displayName,
        email: data?.emailAddress,
      },
    });
  },
};
