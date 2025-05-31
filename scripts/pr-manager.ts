#!/usr/bin/env tsx
import { execSync } from "child_process";
import { LinearClient } from "@linear/sdk";
import { createInterface } from "readline";
import dotenv from "dotenv";
import clipboardy from "clipboardy";
import { join } from "path";
import { executeTsFile } from "./tsx-utils";
import {
  getConfig,
  JulesWorkflowConfig,
  isConfigFound,
  showConfigWarning,
} from "./config-loader";

// Load environment variables from .env file
dotenv.config();

// Load configuration
const config: JulesWorkflowConfig = getConfig();

// Show warning if no config file found
if (!isConfigFound()) {
  showConfigWarning();
}

const logInfo = (message: string) => {
  if (config.display.enableColors) {
    console.log("\x1b[36m%s\x1b[0m", message);
  } else {
    console.log(message);
  }
};

const logSuccess = (message: string) => {
  if (config.display.enableColors) {
    console.log("\x1b[32m%s\x1b[0m", message);
  } else {
    console.log(message);
  }
};

const logError = (message: string) => {
  if (config.display.enableColors) {
    console.error("\x1b[31m%s\x1b[0m", message);
  } else {
    console.error(message);
  }
};

const logWarning = (message: string) => {
  if (config.display.enableColors) {
    console.warn("\x1b[33m%s\x1b[0m", message);
  } else {
    console.warn(message);
  }
};

// Handle both npm script usage and direct CLI usage
function normalizeArgs(args: string[]): string[] {
  // If called directly (e.g., jules-pr-manager), process all args
  // If called via npm/tsx, skip the script path
  const scriptName = args.find((arg) => arg.endsWith("pr-manager.ts"));
  if (scriptName) {
    const scriptIndex = args.indexOf(scriptName);
    return args.slice(scriptIndex + 1);
  }
  return args;
}

// Create readline interface for user input
let rl: any = null;

function createReadlineInterface() {
  if (!rl) {
    rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }
  return rl;
}

function closeReadlineInterface() {
  if (rl) {
    rl.close();
    rl = null;
  }
}

async function promptUser(
  question: string,
  defaultValue?: string
): Promise<string> {
  const readline = createReadlineInterface();
  const promptText = defaultValue
    ? `${question} [${defaultValue}]: `
    : `${question}: `;

  return new Promise((resolve) => {
    readline.question(promptText, (answer: string) => {
      const response = answer.trim() || defaultValue || "";
      resolve(response);
    });
  });
}

interface PRInfo {
  number: number;
  title: string;
  branch: string;
  lastCommitAuthor: string;
  lastCommitDate: string;
  url: string;
  linearIssueId?: string;
  linearUrgency?: number;
  copilotReviewed: boolean;
  commitsAfterCopilotReview: number;
  isDraft?: boolean;
}

interface LinearIssue {
  id: string;
  priority: number;
  priorityLabel: string;
  title: string;
}

interface LinearIssueInfo {
  id: string;
  title: string;
  priority: number;
  priorityLabel: string;
  team: string;
  state: string;
  hasHumanLabel: boolean;
  url: string;
}

async function getCurrentRepoInfo(): Promise<{ owner: string; repo: string }> {
  try {
    const remoteUrl = execSync("git config --get remote.origin.url", {
      encoding: "utf-8",
    }).trim();
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
    if (!match) {
      throw new Error("Could not parse GitHub repository from remote URL");
    }
    return { owner: match[1], repo: match[2] };
  } catch (error) {
    logError("Failed to get repository information from git remote");
    throw error;
  }
}

async function getAllOpenPRs(): Promise<PRInfo[]> {
  try {
    const { owner, repo } = await getCurrentRepoInfo();

    // Get all open PRs with detailed information (including drafts)
    const prsOutput = execSync(
      `gh api "repos/${owner}/${repo}/pulls?state=open&per_page=100" --jq '.[] | {number, title, head_ref: .head.ref, updated_at, html_url, draft}'`,
      { encoding: "utf-8" }
    );

    const prs = prsOutput
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const prInfos: PRInfo[] = [];

    for (const pr of prs) {
      try {
        // Apply draft filtering if configured
        if (config.prManager.filtering.excludeDrafts && pr.draft) {
          continue;
        }

        // Get the last commit for this PR
        const lastCommitOutput = execSync(
          `gh api repos/${owner}/${repo}/pulls/${pr.number}/commits --jq '.[-1] | {author: .commit.author.name, date: .commit.author.date}'`,
          { encoding: "utf-8" }
        );
        const lastCommit = JSON.parse(lastCommitOutput);

        // Apply date filtering if configured
        if (config.prManager.filtering.maxDaysOld) {
          const lastCommitDate = new Date(lastCommit.date);
          const daysSinceCommit =
            (Date.now() - lastCommitDate.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceCommit > config.prManager.filtering.maxDaysOld) {
            continue;
          }
        }

        // Check if copilot has reviewed this PR
        const reviewsOutput = execSync(
          `gh api repos/${owner}/${repo}/pulls/${pr.number}/reviews --jq '.[] | select(.user.login == "copilot-pull-request-reviewer[bot]") | {submitted_at: .submitted_at}'`,
          { encoding: "utf-8" }
        );

        const copilotReviews = reviewsOutput.trim()
          ? reviewsOutput
              .trim()
              .split("\n")
              .map((line) => JSON.parse(line))
          : [];
        const copilotReviewed = copilotReviews.length > 0;

        // Count commits after the latest copilot review
        let commitsAfterCopilotReview = 0;
        if (copilotReviewed) {
          const latestCopilotReview = copilotReviews[copilotReviews.length - 1];
          const commitsAfterOutput = execSync(
            `gh api repos/${owner}/${repo}/pulls/${pr.number}/commits --jq '.[] | select(.commit.author.date > "${latestCopilotReview.submitted_at}") | .sha'`,
            { encoding: "utf-8" }
          );
          commitsAfterCopilotReview = commitsAfterOutput.trim()
            ? commitsAfterOutput.trim().split("\n").length
            : 0;
        }

        // Extract Linear issue ID from branch name
        const branchName = pr.head_ref || "unknown";
        const linearMatch = branchName.match(/([A-Z]{2,10}-\d+)/);
        const linearIssueId = linearMatch ? linearMatch[1] : undefined;

        prInfos.push({
          number: pr.number,
          title: pr.title,
          branch: branchName,
          lastCommitAuthor: lastCommit.author,
          lastCommitDate: lastCommit.date,
          url: pr.html_url,
          linearIssueId,
          linearUrgency: 0, // Will be populated later
          copilotReviewed,
          commitsAfterCopilotReview,
          isDraft: pr.draft,
        });
      } catch (error) {
        logWarning(`Failed to process PR #${pr.number}: ${error}`);
        continue;
      }
    }

    return prInfos;
  } catch (error) {
    logError(`Failed to fetch PRs: ${error}`);
    throw error;
  }
}

async function enrichWithLinearData(prs: PRInfo[]): Promise<PRInfo[]> {
  const linearApiKey = process.env.LINEAR_API_KEY;
  if (!linearApiKey) {
    logWarning("LINEAR_API_KEY not found - skipping Linear urgency data");
    return prs;
  }

  const linear = new LinearClient({ apiKey: linearApiKey });
  const prsWithLinear = prs.filter((pr) => pr.linearIssueId);

  if (prsWithLinear.length > 0) {
    logInfo(
      `🔗 Enriching ${prsWithLinear.length} PRs with Linear urgency data...`
    );
  }

  for (const pr of prs) {
    if (pr.linearIssueId) {
      try {
        const issue = await linear.issue(pr.linearIssueId);
        if (issue) {
          pr.linearUrgency = issue.priority || 0;
        }
      } catch (error) {
        logWarning(
          `Could not fetch Linear issue ${pr.linearIssueId}: ${error}`
        );
      }
    }
  }

  return prs;
}

async function assignCopilotReviewer(prNumber: number): Promise<boolean> {
  try {
    const { owner, repo } = await getCurrentRepoInfo();

    // Use proper JSON payload format for GitHub API
    execSync(
      `gh api repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers --method POST --input -`,
      {
        encoding: "utf-8",
        input: JSON.stringify({
          reviewers: ["copilot-pull-request-reviewer[bot]"],
        }),
      }
    );

    return true;
  } catch (error) {
    logWarning(`Failed to assign copilot to PR #${prNumber}: ${error}`);
    return false;
  }
}

function sortPRsByUrgencyAndDate(prs: PRInfo[]): PRInfo[] {
  return prs.sort((a, b) => {
    // Sort by Linear urgency first (lower number = higher urgency in Linear: 1=Urgent, 2=High, 3=Medium, 4=Low)
    const aUrgency = a.linearUrgency || 999; // No priority goes to end
    const bUrgency = b.linearUrgency || 999; // No priority goes to end
    const urgencyDiff = aUrgency - bUrgency;
    if (urgencyDiff !== 0) return urgencyDiff;

    // Then by last commit date (more recent first)
    return (
      new Date(b.lastCommitDate).getTime() -
      new Date(a.lastCommitDate).getTime()
    );
  });
}

function getPriorityEmoji(urgency: number): string {
  if (urgency === 1) return config.priority.priorityEmojis.HIGH; // Urgent
  if (urgency === 2) return config.priority.priorityEmojis.HIGH; // High
  if (urgency === 3) return config.priority.priorityEmojis.MEDIUM; // Medium
  if (urgency === 4) return config.priority.priorityEmojis.LOW; // Low
  return config.priority.priorityEmojis.LOW; // No priority or unknown
}

function formatPRList(prs: PRInfo[], title: string): string {
  // Apply max items limit if configured
  const limitedPRs =
    config.prManager.listFormatting.maxItemsPerList > 0
      ? prs.slice(0, config.prManager.listFormatting.maxItemsPerList)
      : prs;

  if (limitedPRs.length === 0) {
    if (shouldShowEmptySections()) {
      return `## ${title}\n\n✅ No PRs found matching criteria.\n\n`;
    }
    return "";
  }

  let output = `## ${title}\n\n`;

  limitedPRs.forEach((pr, index) => {
    const priorityEmoji = getPriorityEmoji(pr.linearUrgency || 0);

    // Basic PR info
    output += `${index + 1}. ${priorityEmoji} **PR #${pr.number}**: ${
      pr.title
    }`;

    // Linear issue link (if configured and available)
    if (config.prManager.listFormatting.showLinearLinks && pr.linearIssueId) {
      output += ` (${pr.linearIssueId} - Priority: ${pr.linearUrgency || 0})`;
    } else if (!pr.linearIssueId) {
      output += " (No Linear Issue)";
    }

    // Draft status
    const draftStatus = pr.isDraft ? " 📝 DRAFT" : "";
    output += `${draftStatus}\n`;

    // Show detailed info if configured
    if (config.prManager.listFormatting.showDetailedInfo) {
      output += `   - **Branch**: \`${pr.branch}\`\n`;

      // Commit info (if configured)
      if (config.prManager.listFormatting.showCommitInfo) {
        const timeAgo = config.prManager.listFormatting.showDates
          ? new Date(pr.lastCommitDate).toLocaleDateString()
          : "recently";
        output += `   - **Last Commit**: ${pr.lastCommitAuthor} ${
          config.prManager.listFormatting.showDates ? `on ${timeAgo}` : ""
        }\n`;
      }

      // Copilot status (if configured)
      if (config.prManager.listFormatting.showCopilotStatus) {
        output += `   - **Copilot Reviewed**: ${
          pr.copilotReviewed ? "✅ Yes" : "❌ No"
        }\n`;
        output += `   - **Commits After Review**: ${pr.commitsAfterCopilotReview}\n`;
      }

      output += `   - **URL**: ${pr.url}\n`;
    }

    output += `\n`;
  });

  // Show truncation notice if items were limited
  if (
    config.prManager.listFormatting.maxItemsPerList > 0 &&
    prs.length > limitedPRs.length
  ) {
    output += `_Showing ${limitedPRs.length} of ${prs.length} PRs (limited by configuration)_\n\n`;
  }

  return output;
}

async function findPRsNeedingCopilotReview(): Promise<PRInfo[]> {
  logInfo(
    "🔍 Finding PRs where Jules committed but copilot hasn't reviewed the latest changes..."
  );
  logInfo("⏳ This may take a while...");

  const allPRs = await getAllOpenPRs();
  const enrichedPRs = await enrichWithLinearData(allPRs);

  // Filter PRs where:
  // 1. Last commit is by Jules AND
  // 2. Either copilot has never reviewed OR there are commits after copilot's last review
  const needingReview = enrichedPRs.filter(
    (pr) =>
      pr.lastCommitAuthor.includes("google-labs-jules") &&
      (!pr.copilotReviewed || pr.commitsAfterCopilotReview > 0)
  );

  return sortPRsByUrgencyAndDate(needingReview);
}

async function findPRsNeedingJulesUpdate(): Promise<PRInfo[]> {
  logInfo("🔍 Finding PRs where copilot reviewed but no commits since...");

  const allPRs = await getAllOpenPRs();
  const enrichedPRs = await enrichWithLinearData(allPRs);

  // Filter PRs where copilot has reviewed but no commits since
  const needingUpdate = enrichedPRs.filter(
    (pr) => pr.copilotReviewed && pr.commitsAfterCopilotReview === 0
  );

  return sortPRsByUrgencyAndDate(needingUpdate);
}

async function assignCopilotToJulesPRs(): Promise<void> {
  const prsNeedingReview = await findPRsNeedingCopilotReview();

  if (prsNeedingReview.length === 0) {
    logSuccess("✅ No PRs found that need copilot review assignment");
    return;
  }

  logInfo(
    `📋 Found ${prsNeedingReview.length} PRs that need copilot review assignment`
  );

  let assigned = 0;
  for (const pr of prsNeedingReview) {
    logInfo(`🤖 Assigning copilot to PR #${pr.number}: ${pr.title}`);
    const success = await assignCopilotReviewer(pr.number);
    if (success) {
      assigned++;
      logSuccess(`✅ Assigned copilot to PR #${pr.number}`);
    }
  }

  logSuccess(
    `🎉 Successfully assigned copilot to ${assigned}/${prsNeedingReview.length} PRs`
  );
}

async function runJulesForPR(prNumber: number): Promise<void> {
  try {
    logInfo(`🤖 Running Jules extraction for PR #${prNumber}...`);

    // Use the shared utility to execute pr-workflow.ts
    const prWorkflowPath = join(__dirname, "pr-workflow.ts");
    const args = [prNumber.toString(), "--jules"];

    try {
      // Execute and capture output
      const output = executeTsFile(prWorkflowPath, args);

      // If we get here without error, the extraction succeeded
      // The pr-workflow.ts script handles its own success messaging and clipboard operations
    } catch (extractError) {
      logError(`Extraction failed for PR #${prNumber}:`);
      console.error(extractError);

      // Try to provide helpful guidance
      logInfo("💡 This might be due to:");
      logInfo("   • Missing GitHub PR or Linear issue");
      logInfo("   • Network connectivity issues");
      logInfo("   • Missing environment variables (LINEAR_API_KEY)");
      logInfo("   • Invalid PR number or permissions");
    }
  } catch (error) {
    logError(`Failed to run extraction for PR #${prNumber}: ${error}`);
  }
}

async function interactivePRReview(prs: PRInfo[]): Promise<void> {
  if (prs.length === 0) return;

  // Skip interactive mode if disabled in config
  if (!config.workflow.enableInteractivePrompts) {
    logInfo(
      "Interactive prompts disabled in configuration. Skipping interactive review."
    );
    return;
  }

  logInfo(`\n🔄 Interactive PR Review Mode`);
  logInfo(`Found ${prs.length} PR(s) that need Jules' attention.`);

  const response = await promptUser(
    "\nWould you like to go through each PR with Jules mode? (y/n)",
    "y"
  );

  if (response.toLowerCase() !== "y" && response.toLowerCase() !== "yes") {
    logInfo("Skipping interactive review.");
    return;
  }

  for (let i = 0; i < prs.length; i++) {
    const pr = prs[i];
    const priorityEmoji = getPriorityEmoji(pr.linearUrgency || 0);

    console.log(`\n${getCustomSeparator()}`);
    logInfo(`📋 PR ${i + 1}/${prs.length}: ${priorityEmoji} #${pr.number}`);
    logInfo(`Title: ${pr.title}`);
    logInfo(`Branch: ${pr.branch}`);
    logInfo(`Linear: ${pr.linearIssueId || "None"}`);
    logInfo(`URL: ${pr.url}`);
    console.log(`${getCustomSeparator()}`);

    const action = await promptUser(
      "\nActions: (j)ules mode, (s)kip, (q)uit",
      config.prManager.interactive.defaultAction
    );

    switch (action.toLowerCase()) {
      case "j":
      case "jules":
        await runJulesForPR(pr.number);
        if (!config.prManager.interactive.autoContinue) {
          await promptUser("\nPress Enter to continue to next PR", "");
        }
        break;
      case "s":
      case "skip":
        logInfo("Skipping this PR.");
        break;
      case "q":
      case "quit":
        logInfo("Exiting interactive review.");
        return;
      default:
        logWarning("Invalid action. Skipping this PR.");
        break;
    }
  }

  logSuccess("🎉 Completed interactive PR review!");
}

async function copyToClipboardWithDebug(content: string): Promise<void> {
  try {
    // Only show clipboard content if enabled in config
    if (config.clipboard.showClipboardContent) {
      console.log("\n" + getCustomSeparator());
      console.log("📋 CONTENT BEING COPIED TO CLIPBOARD:");
      console.log(getCustomSeparator());
      console.log(content);
      console.log(getCustomSeparator());
    }

    if (config.clipboard.enabled) {
      clipboardy.writeSync(content);
      logSuccess("✅ Content copied to clipboard!");
    } else {
      logInfo("📋 Clipboard operations disabled. Content shown above.");
    }
  } catch (error) {
    if (config.clipboard.fallbackToConsole) {
      logWarning("Could not copy to clipboard, but content is shown above");
    } else {
      throw error;
    }
  }
}

async function runJulesForLinearIssue(issueId: string): Promise<void> {
  try {
    // Check for required environment variables first
    if (!process.env.LINEAR_API_KEY) {
      logError(`❌ Missing LINEAR_API_KEY environment variable`);
      logInfo("💡 To fix this:");
      logInfo(
        "   1. Get your Linear API key from: https://linear.app/settings/api"
      );
      logInfo("   2. Add it to your environment:");
      logInfo("      export LINEAR_API_KEY='your_api_key_here'");
      logInfo("   3. Or create a .env file in your project with:");
      logInfo("      LINEAR_API_KEY=your_api_key_here");
      return;
    }

    logInfo(`🤖 Running Jules extraction for Linear issue ${issueId}...`);

    // Use the shared utility to execute pr-workflow.ts
    const prWorkflowPath = join(__dirname, "pr-workflow.ts");
    const args = [issueId, "--jules"];

    try {
      // Execute and capture output
      const output = executeTsFile(prWorkflowPath, args);

      // If we get here without error, the extraction succeeded
      // The pr-workflow.ts script handles its own success messaging and clipboard operations
    } catch (extractError) {
      logError(`Extraction failed for Linear issue ${issueId}:`);

      // Parse common error messages and provide helpful guidance
      const errorMessage = extractError.toString();

      if (errorMessage.includes("LINEAR_API_KEY not found")) {
        logInfo("💡 LINEAR_API_KEY is missing or invalid");
        logInfo("   • Check your environment variables");
        logInfo("   • Verify the API key is correct");
        logInfo("   • Get a new key from: https://linear.app/settings/api");
      } else if (errorMessage.includes("Could not find data")) {
        logInfo(`💡 Linear issue ${issueId} not found or inaccessible`);
        logInfo("   • Verify the Linear issue ID is correct");
        logInfo("   • Check you have access to this Linear workspace");
        logInfo("   • Ensure the issue exists and isn't archived");
      } else if (
        errorMessage.includes("Network") ||
        errorMessage.includes("timeout")
      ) {
        logInfo("💡 Network connectivity issue");
        logInfo("   • Check your internet connection");
        logInfo("   • Linear API might be temporarily unavailable");
      } else {
        // Show the actual error for debugging
        console.error("Raw error:", extractError);
        logInfo("💡 Unexpected error occurred");
        logInfo("   • Try running the command again");
        logInfo("   • Check the error details above");
      }
    }
  } catch (error) {
    logError(`Failed to run extraction for Linear issue ${issueId}: ${error}`);
  }
}

async function findLinearIssuesWithoutPRs(): Promise<LinearIssueInfo[]> {
  const linearApiKey = process.env.LINEAR_API_KEY;
  if (!linearApiKey) {
    logError("LINEAR_API_KEY not found - cannot fetch Linear issues");
    return [];
  }

  const linear = new LinearClient({ apiKey: linearApiKey });

  try {
    logInfo(
      "🔍 Finding Linear issues without PRs (excluding Human tagged issues)..."
    );

    if (config.display.showProcessingTime) {
      logInfo("⏳ This may take a while...");
    }

    // Get all issues that are not done and don't have human label
    const issues = await linear.issues({
      filter: {
        state: { type: { nin: ["completed", "canceled"] } },
      },
      includeArchived: false,
      first: 100,
    });

    const issuesWithoutPRs: LinearIssueInfo[] = [];
    const botUsers = getBotUsers();

    for (const issue of issues.nodes) {
      try {
        // Check if issue has labels
        const labels = await issue.labels();
        const hasHumanLabel = labels.nodes.some((label) =>
          label.name.toLowerCase().includes("human")
        );

        // Skip if has human label
        if (hasHumanLabel) continue;

        // Check if assignee is a bot (if configured to filter bots)
        if (config.filtering.enableDeduplication) {
          const assignee = await issue.assignee;
          if (
            assignee &&
            botUsers.some(
              (bot) =>
                assignee.name.toLowerCase().includes(bot.toLowerCase()) ||
                assignee.email?.toLowerCase().includes(bot.toLowerCase())
            )
          ) {
            continue;
          }
        }

        // Check if there's a branch or PR attachment
        const attachments = await issue.attachments();
        const hasPRAttachment = attachments.nodes.some(
          (attachment) =>
            attachment.url?.includes("github.com") &&
            attachment.url?.includes("/pull/")
        );

        // Check if there's a branch name that might have a PR
        let hasPR = hasPRAttachment;
        if (issue.branchName && !hasPR) {
          try {
            const { owner, repo } = await getCurrentRepoInfo();
            const prCheck = execSync(
              `gh pr list --head ${issue.branchName} --repo ${owner}/${repo} --json number`,
              { encoding: "utf-8" }
            );
            const prs = JSON.parse(prCheck);
            hasPR = prs.length > 0;
          } catch {
            // No PR found, which is what we want
          }
        }

        if (!hasPR) {
          const team = await issue.team;
          issuesWithoutPRs.push({
            id: issue.identifier,
            title: issue.title,
            priority: issue.priority || 0,
            priorityLabel: issue.priorityLabel || "None",
            team: team?.name || "Unknown",
            state: (await issue.state)?.name || "Unknown",
            hasHumanLabel,
            url: issue.url,
          });
        }
      } catch (error) {
        logWarning(
          `Could not process Linear issue ${issue.identifier}: ${error}`
        );
      }
    }

    return issuesWithoutPRs.sort((a, b) => {
      // Sort by priority first (lower number = higher priority in Linear: 1=Urgent, 2=High, 3=Medium, 4=Low)
      const aPriority = a.priority || 999; // No priority goes to end
      const bPriority = b.priority || 999; // No priority goes to end
      const priorityDiff = aPriority - bPriority;
      if (priorityDiff !== 0) return priorityDiff;

      // Then alphabetically by title
      return a.title.localeCompare(b.title);
    });
  } catch (error) {
    logError(`Failed to fetch Linear issues: ${error}`);
    return [];
  }
}

function formatLinearIssueList(
  issues: LinearIssueInfo[],
  title: string
): string {
  // Apply max items limit if configured
  const limitedIssues =
    config.prManager.listFormatting.maxItemsPerList > 0
      ? issues.slice(0, config.prManager.listFormatting.maxItemsPerList)
      : issues;

  if (limitedIssues.length === 0) {
    if (shouldShowEmptySections()) {
      return `## ${title}\n\n✅ No Linear issues found matching criteria.\n\n`;
    }
    return "";
  }

  let output = `## ${title}\n\n`;

  limitedIssues.forEach((issue, index) => {
    const priorityEmoji = getPriorityEmoji(issue.priority || 0);

    output += `${index + 1}. ${priorityEmoji} **${issue.id}**: ${
      issue.title
    }\n`;

    // Show detailed info if configured
    if (config.prManager.listFormatting.showDetailedInfo) {
      output += `   - **Team**: ${issue.team}\n`;
      output += `   - **State**: ${issue.state}\n`;
      output += `   - **Priority**: ${issue.priorityLabel}\n`;
      output += `   - **URL**: ${issue.url}\n`;
    }

    output += `\n`;
  });

  // Show truncation notice if items were limited
  if (
    config.prManager.listFormatting.maxItemsPerList > 0 &&
    issues.length > limitedIssues.length
  ) {
    output += `_Showing ${limitedIssues.length} of ${issues.length} Linear issues (limited by configuration)_\n\n`;
  }

  return output;
}

async function interactiveLinearReview(
  issues: LinearIssueInfo[]
): Promise<void> {
  if (issues.length === 0) return;

  // Skip interactive mode if disabled in config
  if (!config.workflow.enableInteractivePrompts) {
    logInfo(
      "Interactive prompts disabled in configuration. Skipping interactive review."
    );
    return;
  }

  logInfo(`\n🔄 Interactive Linear Issue Review Mode`);
  logInfo(
    `Found ${issues.length} Linear issue(s) ready for Jules to start working on.`
  );

  const response = await promptUser(
    "\nWould you like to go through each Linear issue with Jules mode? (y/n)",
    "y"
  );

  if (response.toLowerCase() !== "y" && response.toLowerCase() !== "yes") {
    logInfo("Skipping interactive review.");
    return;
  }

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    const priorityEmoji = getPriorityEmoji(issue.priority || 0);

    console.log(`\n${getCustomSeparator()}`);
    logInfo(`📋 Issue ${i + 1}/${issues.length}: ${priorityEmoji} ${issue.id}`);
    logInfo(`Title: ${issue.title}`);
    logInfo(`Team: ${issue.team}`);
    logInfo(`State: ${issue.state}`);
    logInfo(`Priority: ${issue.priorityLabel}`);
    logInfo(`URL: ${issue.url}`);
    console.log(`${getCustomSeparator()}`);

    const action = await promptUser(
      "\nActions: (j)ules mode, (s)kip, (q)uit",
      config.prManager.interactive.defaultAction
    );

    switch (action.toLowerCase()) {
      case "j":
      case "jules":
        await runJulesForLinearIssue(issue.id);
        if (!config.prManager.interactive.autoContinue) {
          await promptUser("\nPress Enter to continue to next issue", "");
        }
        break;
      case "s":
      case "skip":
        logInfo("Skipping this issue.");
        break;
      case "q":
      case "quit":
        logInfo("Exiting interactive review.");
        return;
      default:
        logWarning("Invalid action. Skipping this issue.");
        break;
    }
  }

  logSuccess("🎉 Completed interactive Linear issue review!");
}

async function checkEnvironmentSetup(): Promise<void> {
  console.log("🔍 **Environment Setup Check**\n");

  // Check GitHub CLI
  try {
    execSync("gh --version", { stdio: "ignore" });
    logSuccess("✅ GitHub CLI (gh) is installed and available");
  } catch {
    logError("❌ GitHub CLI (gh) is not installed or not in PATH");
    logInfo("   Install from: https://cli.github.com/");
  }

  // Check GitHub authentication
  try {
    execSync("gh auth status", { stdio: "ignore" });
    logSuccess("✅ GitHub CLI is authenticated");
  } catch {
    logError("❌ GitHub CLI is not authenticated");
    logInfo("   Run: gh auth login");
  }

  // Check Linear API key
  if (process.env.LINEAR_API_KEY) {
    logSuccess("✅ LINEAR_API_KEY environment variable is set");

    // Test Linear API access
    try {
      const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });
      await linear.viewer;
      logSuccess("✅ Linear API key is valid and accessible");
    } catch (error) {
      logError("❌ Linear API key is invalid or inaccessible");
      logInfo("   • Check your API key is correct");
      logInfo("   • Get a new key from: https://linear.app/settings/api");
    }
  } else {
    logError("❌ LINEAR_API_KEY environment variable is not set");
    logInfo("   1. Get your API key from: https://linear.app/settings/api");
    logInfo("   2. Add to environment: export LINEAR_API_KEY='your_key'");
    logInfo("   3. Or create .env file with: LINEAR_API_KEY=your_key");
  }

  // Check Gemini API key (optional)
  if (process.env.GEMINI_API_KEY) {
    logSuccess(
      "✅ GEMINI_API_KEY environment variable is set (for AI summaries)"
    );
  } else {
    logWarning("⚠️  GEMINI_API_KEY not set (AI summaries won't work)");
    logInfo("   This is optional - only needed for --summary flag");
  }

  // Check git repository
  try {
    await getCurrentRepoInfo();
    logSuccess(
      "✅ Current directory is a valid git repository with GitHub remote"
    );
  } catch (error) {
    logError(
      "❌ Current directory is not a valid git repository or missing GitHub remote"
    );
    logInfo("   • Make sure you're in a git repository");
    logInfo("   • Ensure the repository has a GitHub remote origin");
  }

  console.log("\n💡 **Usage**: If all checks pass, you can run commands like:");
  console.log("   • jules-pr summary");
  console.log("   • jules-pr list-linear-issues");
  console.log("   • jules-pr GRE-123 --jules");
}

// Helper functions using configuration
function getBotUsers() {
  return config.filtering.botUsers;
}

function shouldShowEmptySections() {
  return config.filtering.includeEmptySections;
}

function getCustomSeparator() {
  return "=".repeat(config.display.separatorWidth);
}

async function main() {
  try {
    const args = normalizeArgs(process.argv.slice(2));

    if (args.includes("--help") || args.includes("-h")) {
      console.log(`
🤖 **PR Manager for Jules & Copilot Workflow**

USAGE:
  npm run pr-manager <command> [options]

COMMANDS:
  list-needing-review     List PRs where Jules committed but copilot hasn't reviewed the latest changes
  list-needing-update     List PRs where copilot reviewed but no commits since (with interactive mode)
  list-linear-issues      List Linear issues without PRs that are ready for Jules to start (with interactive mode)
  assign-copilot         Assign copilot to review PRs where Jules committed
  check-env              Check environment setup (GitHub CLI, Linear API, etc.)
  summary                Show summary of both categories

OPTIONS:
  --help, -h             Show this help

EXAMPLES:
  npm run pr-manager list-needing-review
  npm run pr-manager list-needing-update
  npm run pr-manager list-linear-issues
  npm run pr-manager assign-copilot
  npm run pr-manager check-env
  npm run pr-manager summary

INTERACTIVE MODE:
  The 'list-needing-update' and 'list-linear-issues' commands offer interactive modes 
  to go through each item and run Jules mode for easy copying.

SORTING:
  Results are sorted by:
  1. Linear issue urgency (highest first)
  2. Last updated date (most recent first) for PRs
  3. Alphabetically by title for Linear issues

REQUIREMENTS:
  • GitHub CLI (gh) installed and authenticated
  • LINEAR_API_KEY environment variable (required for Linear features)
      `);
      closeReadlineInterface();
      process.exit(0);
    }

    const command = args[0] || "summary";

    switch (command) {
      case "list-needing-review": {
        const prs = await findPRsNeedingCopilotReview();
        const output = formatPRList(
          prs,
          "PRs Needing Copilot Review (Jules Committed Latest Changes)"
        );
        console.log(output);
        closeReadlineInterface();
        break;
      }

      case "list-needing-update": {
        const prs = await findPRsNeedingJulesUpdate();
        const output = formatPRList(
          prs,
          "PRs Needing Jules Update (Copilot Reviewed)"
        );
        console.log(output);

        // Offer interactive mode
        await interactivePRReview(prs);
        closeReadlineInterface();
        break;
      }

      case "list-linear-issues": {
        const issues = await findLinearIssuesWithoutPRs();
        const output = formatLinearIssueList(
          issues,
          "Linear Issues Ready for Jules to Start"
        );
        console.log(output);

        // Offer interactive mode
        await interactiveLinearReview(issues);
        closeReadlineInterface();
        break;
      }

      case "assign-copilot": {
        await assignCopilotToJulesPRs();
        closeReadlineInterface();
        break;
      }

      case "check-env": {
        await checkEnvironmentSetup();
        closeReadlineInterface();
        break;
      }

      case "summary":
      default: {
        const [needingReview, needingUpdate, linearIssues] = await Promise.all([
          findPRsNeedingCopilotReview(),
          findPRsNeedingJulesUpdate(),
          findLinearIssuesWithoutPRs(),
        ]);

        console.log("# 🤖 Jules & Copilot Workflow Summary\n");
        console.log(
          formatPRList(
            needingReview,
            "🔍 PRs Needing Copilot Review (Jules Committed Latest Changes)"
          )
        );
        console.log(
          formatPRList(
            needingUpdate,
            "🔄 PRs Needing Jules Update (Copilot Reviewed)"
          )
        );
        console.log(
          formatLinearIssueList(
            linearIssues,
            "🆕 Linear Issues Ready for Jules to Start"
          )
        );

        if (needingReview.length > 0) {
          console.log(
            `💡 **Next Step**: Run \`npm run pr-manager assign-copilot\` to assign copilot to ${needingReview.length} PR(s)\n`
          );
        }

        if (needingUpdate.length > 0) {
          console.log(
            `💡 **Next Step**: Run \`npm run pr-manager list-needing-update\` for interactive review of ${needingUpdate.length} PR(s)\n`
          );
        }

        if (linearIssues.length > 0) {
          console.log(
            `💡 **Next Step**: Run \`npm run pr-manager list-linear-issues\` for interactive review of ${linearIssues.length} Linear issue(s)\n`
          );
        }

        if (
          needingReview.length === 0 &&
          needingUpdate.length === 0 &&
          linearIssues.length === 0
        ) {
          console.log(
            "🎉 **All items are up to date!** Jules and Copilot workflow is in sync.\n"
          );
        }
        closeReadlineInterface();
        break;
      }
    }
  } catch (error) {
    logError(`PR Manager failed: ${error}`);
    closeReadlineInterface();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
