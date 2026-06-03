#!/usr/bin/env node
/**
 * Generates the plugin.json manifest for every anything-jira skill from one
 * compact spec, so the shared setup_args block and schema boilerplate stay
 * consistent across skills. Run from anywhere:  node build/gen-manifests.cjs
 *
 * Hand-written handler.js files are NOT touched.
 */
const fs = require("fs");
const path = require("path");

const SKILLS_DIR = path.resolve(__dirname, "../agent-skills");

const BASE_URL_ARG = {
  type: "string",
  required: true,
  input: {
    type: "text",
    default: "",
    placeholder: "https://jira.your-company.com",
    hint: "Base URL of your Jira Server / Data Center instance.",
  },
  value: "",
};
const PAT_ARG = {
  type: "string",
  required: true,
  input: {
    type: "password",
    default: "",
    placeholder: "Your Jira personal access token",
    hint: "Jira Data Center Personal Access Token. Sent as a Bearer token. Stored locally in this skill's plugin.json.",
  },
  value: "",
};
const DEFAULT_PROJECT_ARG = {
  type: "string",
  required: false,
  input: {
    type: "text",
    default: "",
    placeholder: "ENG",
    hint: "Optional. Project key used when the user does not name a project.",
  },
  value: "",
};

const s = (description) => ({ description, type: "string" });
const n = (description) => ({ description, type: "number" });

// hubId -> spec. `project: true` adds the optional default-project setup arg.
const SKILLS = {
  "create-jira-issue": {
    name: "Create Jira Issue",
    description:
      "Creates a new issue (Task, Story, Bug, Epic, etc.) in a Jira project. Use when the user asks to file, open, raise, or create an issue/ticket.",
    project: true,
    params: {
      summary: s("The one-line title of the issue. Required."),
      projectKey: s("Project key to create the issue in, e.g. 'ENG'. If omitted, the configured default project key is used."),
      issueType: s("Issue type name, e.g. 'Task', 'Story', 'Bug', 'Epic'. Defaults to 'Task'."),
      description: s("Full body/description of the issue in plain text. Optional."),
      labels: s("Optional comma-separated labels, e.g. 'backend,urgent'."),
      priority: s("Optional priority name, e.g. 'High'."),
    },
    examples: [
      { prompt: "Open a bug in ENG: login page 500s on Safari", call: '{"projectKey":"ENG","issueType":"Bug","summary":"Login page 500s on Safari"}' },
      { prompt: "File a task to update the onboarding docs", call: '{"issueType":"Task","summary":"Update the onboarding docs"}' },
    ],
  },
  "jira-get-issue": {
    name: "Get Jira Issue",
    description:
      "Fetches one Jira issue by key (e.g. ENG-123): summary, status, assignee, type, priority, reporter, description. Use to view/show/read/look up a specific issue.",
    params: { issueKey: s("The Jira issue key to fetch, e.g. 'ENG-123'. Required.") },
    examples: [
      { prompt: "show me ENG-42", call: '{"issueKey":"ENG-42"}' },
      { prompt: "what's the status of OPS-9", call: '{"issueKey":"OPS-9"}' },
    ],
  },
  "jira-search-issues": {
    name: "Search Jira Issues",
    description:
      "Searches Jira issues using a JQL query and returns a compact list (key, summary, status, assignee). Use to list, find, or search issues, e.g. 'my open bugs' or 'issues in ENG updated this week'.",
    project: true,
    params: {
      jql: s("A Jira JQL query, e.g. \"project = ENG AND status = 'In Progress' ORDER BY updated DESC\". Required."),
      maxResults: n("Max number of issues to return. Defaults to 20."),
    },
    examples: [
      { prompt: "list my open issues", call: '{"jql":"assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC"}' },
      { prompt: "show bugs in ENG from this week", call: '{"jql":"project = ENG AND issuetype = Bug AND created >= -7d","maxResults":50}' },
    ],
  },
  "jira-edit-issue": {
    name: "Edit Jira Issue",
    description:
      "Updates fields on an existing Jira issue (summary, description, priority, labels). Use to edit, update, or change an issue's fields. For status changes use the transition skill; for assignment use the assign skill.",
    params: {
      issueKey: s("The Jira issue key to edit, e.g. 'ENG-123'. Required."),
      summary: s("New summary/title. Optional."),
      description: s("New description (replaces the existing one). Optional."),
      priority: s("New priority name, e.g. 'High'. Optional."),
      labels: s("Comma-separated labels to SET on the issue (replaces existing labels). Optional."),
    },
    examples: [
      { prompt: "rename ENG-42 to 'Login 500 on Safari'", call: '{"issueKey":"ENG-42","summary":"Login 500 on Safari"}' },
      { prompt: "set OPS-9 priority to High", call: '{"issueKey":"OPS-9","priority":"High"}' },
    ],
  },
  "jira-assign-issue": {
    name: "Assign Jira Issue",
    description:
      "Assigns a Jira issue to a user, or to the current user when the assignee is 'me' or 'currentUser'. Use to assign, reassign, or take an issue.",
    params: {
      issueKey: s("The Jira issue key, e.g. 'ENG-123'. Required."),
      assignee: s("The username to assign to. Use 'me' or 'currentUser' to assign to yourself. Use 'unassign' to clear the assignee. Required."),
    },
    examples: [
      { prompt: "assign ENG-42 to me", call: '{"issueKey":"ENG-42","assignee":"me"}' },
      { prompt: "assign OPS-9 to jsmith", call: '{"issueKey":"OPS-9","assignee":"jsmith"}' },
    ],
  },
  "jira-transition-issue": {
    name: "Transition Jira Issue",
    description:
      "Moves a Jira issue to a new workflow status (e.g. 'In Progress', 'Done'). Use to transition, move, start, resolve, or close an issue. If the target status isn't valid from the current state, the available transitions are returned.",
    params: {
      issueKey: s("The Jira issue key, e.g. 'ENG-123'. Required."),
      status: s("The target status or transition name, e.g. 'In Progress', 'Done'. Required."),
      comment: s("Optional comment to add as part of the transition."),
    },
    examples: [
      { prompt: "move ENG-42 to In Progress", call: '{"issueKey":"ENG-42","status":"In Progress"}' },
      { prompt: "close OPS-9 as done", call: '{"issueKey":"OPS-9","status":"Done"}' },
    ],
  },
  "jira-comment-issue": {
    name: "Comment on Jira Issue",
    description:
      "Adds a comment to a Jira issue. Use to comment on, reply to, or add a note to an issue.",
    params: {
      issueKey: s("The Jira issue key, e.g. 'ENG-123'. Required."),
      body: s("The comment text (plain text / Jira wiki markup). Required."),
    },
    examples: [
      { prompt: "comment on ENG-42 that the fix is deployed", call: '{"issueKey":"ENG-42","body":"The fix is deployed to staging."}' },
    ],
  },
  "jira-link-issues": {
    name: "Link Jira Issues",
    description:
      "Creates a link between two Jira issues (e.g. 'Blocks', 'Relates', 'Duplicate'). Use to link, block, or relate two issues.",
    params: {
      inwardIssue: s("The first issue key (the 'from' side), e.g. 'ENG-1'. Required."),
      outwardIssue: s("The second issue key (the 'to' side), e.g. 'ENG-2'. Required."),
      linkType: s("The link type name as defined in your Jira, e.g. 'Blocks', 'Relates', 'Duplicate'. Defaults to 'Relates'."),
    },
    examples: [
      { prompt: "ENG-1 blocks ENG-2", call: '{"inwardIssue":"ENG-1","outwardIssue":"ENG-2","linkType":"Blocks"}' },
    ],
  },
  "jira-add-worklog": {
    name: "Log Work on Jira Issue",
    description:
      "Logs time spent (a worklog) on a Jira issue. Use to log work, add a worklog, or record time spent.",
    params: {
      issueKey: s("The Jira issue key, e.g. 'ENG-123'. Required."),
      timeSpent: s("Time spent in Jira format, e.g. '1h 30m', '2d', '45m'. Required."),
      comment: s("Optional worklog comment describing the work."),
    },
    examples: [
      { prompt: "log 2h on ENG-42 for debugging", call: '{"issueKey":"ENG-42","timeSpent":"2h","comment":"Debugging the Safari 500"}' },
    ],
  },
  "jira-add-to-epic": {
    name: "Add Issues to Epic",
    description:
      "Adds one or more existing issues to an epic. Use to put issues under an epic or attach issues to an epic.",
    params: {
      epicKey: s("The epic's issue key, e.g. 'ENG-100'. Required."),
      issueKeys: s("Comma-separated issue keys to add to the epic, e.g. 'ENG-1,ENG-2'. Required."),
    },
    examples: [
      { prompt: "add ENG-1 and ENG-2 to epic ENG-100", call: '{"epicKey":"ENG-100","issueKeys":"ENG-1,ENG-2"}' },
    ],
  },
  "jira-list-projects": {
    name: "List Jira Projects",
    description:
      "Lists Jira projects the user can access (key and name). Use to list projects or find a project key.",
    params: {
      contains: s("Optional case-insensitive filter on project name or key."),
    },
    examples: [
      { prompt: "what projects can I see", call: "{}" },
      { prompt: "find the platform project", call: '{"contains":"platform"}' },
    ],
  },
  "jira-list-boards": {
    name: "List Jira Boards",
    description:
      "Lists agile boards (id, name, type), optionally filtered by project or name. Use to find a board id before listing sprints.",
    params: {
      projectKey: s("Optional project key to filter boards, e.g. 'ENG'."),
      name: s("Optional case-insensitive board name filter."),
    },
    examples: [
      { prompt: "list ENG boards", call: '{"projectKey":"ENG"}' },
    ],
  },
  "jira-list-sprints": {
    name: "List Jira Sprints",
    description:
      "Lists sprints for an agile board (id, name, state). Use to find a sprint id, or to see active/future sprints. Requires a board id (see the List Jira Boards skill).",
    params: {
      boardId: n("The agile board id. Required."),
      state: s("Optional comma-separated sprint states to filter: 'active', 'future', 'closed'."),
    },
    examples: [
      { prompt: "show active sprints on board 12", call: '{"boardId":12,"state":"active"}' },
    ],
  },
  "jira-add-to-sprint": {
    name: "Add Issues to Sprint",
    description:
      "Moves one or more issues into a sprint. Use to add issues to a sprint. Requires a sprint id (see the List Jira Sprints skill).",
    params: {
      sprintId: n("The target sprint id. Required."),
      issueKeys: s("Comma-separated issue keys to move into the sprint, e.g. 'ENG-1,ENG-2'. Required."),
    },
    examples: [
      { prompt: "add ENG-1 to sprint 34", call: '{"sprintId":34,"issueKeys":"ENG-1"}' },
    ],
  },
  "jira-whoami": {
    name: "Jira Whoami",
    description:
      "Returns the current Jira user (username, display name, email) for the configured token. Use to check who you are authenticated as.",
    params: {},
    examples: [{ prompt: "who am I in Jira", call: "{}" }],
  },
};

function buildSetupArgs(spec) {
  const setup = { JIRA_BASE_URL: BASE_URL_ARG, JIRA_PAT: PAT_ARG };
  if (spec.project) setup.JIRA_DEFAULT_PROJECT_KEY = DEFAULT_PROJECT_ARG;
  return setup;
}

let count = 0;
for (const [hubId, spec] of Object.entries(SKILLS)) {
  const manifest = {
    active: false,
    hubId,
    name: spec.name,
    schema: "skill-1.0.0",
    version: "1.0.0",
    description: spec.description,
    author: "anything-jira",
    license: "MIT",
    setup_args: buildSetupArgs(spec),
    entrypoint: { file: "handler.js", params: spec.params },
    examples: spec.examples || [],
    imported: true,
  };
  const dir = path.join(SKILLS_DIR, hubId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "plugin.json"), JSON.stringify(manifest, null, 2) + "\n");
  count++;
}
console.log(`[gen-manifests] wrote ${count} plugin.json manifests.`);
