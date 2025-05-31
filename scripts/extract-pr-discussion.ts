#!/usr/bin/env tsx
import { execSync } from "child_process";
import { LinearClient } from "@linear/sdk";
import clipboardy from "clipboardy";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createInterface } from "readline";

// Load environment variables from .env file
dotenv.config();

// Global flag to control logging output
let suppressLogs = false;

const logInfo = (message: string) => {
  if (!suppressLogs) console.log("\x1b[36m%s\x1b[0m", message);
}; // Cyan
const logSuccess = (message: string) => {
  if (!suppressLogs) console.log("\x1b[32m%s\x1b[0m", message);
}; // Green
const logError = (message: string) => {
  if (!suppressLogs) console.error("\x1b[31m%s\x1b[0m", message);
}; // Red
const logWarning = (message: string) => {
  if (!suppressLogs) console.warn("\x1b[33m%s\x1b[0m", message);
}; // Yellow

// Handle both npm script usage and direct CLI usage
function normalizeArgs(args: string[]): string[] {
  // If called directly (e.g., jules-extract-pr), process all args
  // If called via npm/tsx, skip the script path
  const scriptName = args.find((arg) =>
    arg.endsWith("extract-pr-discussion.ts")
  );
  if (scriptName) {
    const scriptIndex = args.indexOf(scriptName);
    return args.slice(scriptIndex + 1);
  }
  return args;
}

interface PRInfo {
  number: number;
  owner: string;
  repo: string;
  branch?: string;
}

interface LinearIssueInfo {
  id: string;
  title: string;
  description?: string;
  comments: Array<{
    body: string;
    user: {
      name: string;
    };
    createdAt: Date;
  }>;
  attachments: Array<{
    url: string;
    title?: string;
  }>;
  branchName?: string;
  url: string;
  state: string;
  priority: number;
  priorityLabel: string;
  assignee: {
    name: string;
    email: string;
  } | null;
  team: string;
  labels: string[];
}

interface Comment {
  author: string;
  body: string;
  path?: string;
  line?: number;
  diff_hunk?: string;
  created_at?: string;
  state?: string;
  isBot?: boolean;
  priority?: "HIGH" | "MEDIUM" | "LOW";
}

interface ExtractedData {
  prInfo: PRInfo | null;
  linearInfo: LinearIssueInfo | null;
  prDetails?: any;
  reviews: any[];
  reviewComments: any[];
  issueComments: any[];
}

const BOT_USERS = [
  "copilot-pull-request-reviewer[bot]",
  "github-actions[bot]",
  "dependabot[bot]",
  "vercel[bot]",
  "linear[bot]",
];
const PRIORITY_KEYWORDS = {
  HIGH: [
    "security",
    "breaking",
    "critical",
    "urgent",
    "error",
    "fail",
    "bug",
    "broken",
  ],
  MEDIUM: [
    "performance",
    "optimization",
    "refactor",
    "improvement",
    "consider",
    "should",
  ],
  LOW: ["nitpick", "style", "formatting", "typo", "minor", "suggestion"],
};

// Create readline interface for user input - moved outside functions for proper lifecycle
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

function detectPriority(body: string): "HIGH" | "MEDIUM" | "LOW" {
  const lowerBody = body.toLowerCase();

  for (const [priority, keywords] of Object.entries(PRIORITY_KEYWORDS)) {
    if (keywords.some((keyword) => lowerBody.includes(keyword))) {
      return priority as "HIGH" | "MEDIUM" | "LOW";
    }
  }

  return "MEDIUM";
}

function truncateCodeContext(diffHunk: string, maxLines: number = 10): string {
  const lines = diffHunk.split("\n");
  if (lines.length <= maxLines) return diffHunk;

  return lines.slice(0, maxLines).join("\n") + "\n... (truncated)";
}

function deduplicateComments(comments: Comment[]): Comment[] {
  const seen = new Set<string>();
  return comments.filter((comment) => {
    const key = `${comment.author}:${comment.body.substring(0, 100)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

async function promptUser(question: string): Promise<string> {
  const readline = createReadlineInterface();

  return new Promise((resolve) => {
    readline.question(question, (answer: string) => {
      resolve(answer.trim());
    });
  });
}

async function fetchLinearIssue(
  issueId: string
): Promise<LinearIssueInfo | null> {
  const linearApiKey = process.env.LINEAR_API_KEY;
  if (!linearApiKey) {
    logWarning("LINEAR_API_KEY not found in environment variables");
    return null;
  }

  const linear = new LinearClient({
    apiKey: linearApiKey,
  });

  try {
    const issue = await linear.issue(issueId);

    if (!issue) {
      return null;
    }

    logInfo(`✅ Found Linear issue: ${issue.title}`);

    // Get issue comments
    const comments = await issue.comments();
    const commentsList = await comments.nodes;

    // Get additional metadata
    const state = await issue.state;
    const assignee = await issue.assignee;
    const team = await issue.team;
    const labels = await issue.labels();

    const linearInfo: LinearIssueInfo = {
      id: issueId,
      title: issue.title,
      description: issue.description,
      branchName: issue.branchName,
      url: issue.url,
      state: state?.name || "Unknown",
      priority: issue.priority || 0,
      priorityLabel: issue.priorityLabel || "None",
      assignee: assignee
        ? {
            name: assignee.displayName || assignee.name || "Unknown User",
            email: assignee.email,
          }
        : null,
      team: team?.name || "Unknown",
      labels: labels.nodes.map((label) => label.name),
      comments: commentsList.map((comment) => ({
        body: comment.body,
        user: {
          name:
            (comment.user as any)?.displayName ||
            (comment.user as any)?.name ||
            "Unknown User",
        },
        createdAt: comment.createdAt,
      })),
      attachments: [],
    };

    // Get attachments if available
    try {
      const attachments = await issue.attachments();
      const attachmentsList = await attachments.nodes;
      linearInfo.attachments = attachmentsList.map((attachment) => ({
        url: attachment.url,
        title: attachment.title,
      }));
    } catch (error) {
      // Ignore attachment errors
    }

    return linearInfo;
  } catch (error) {
    logWarning(`Could not fetch Linear issue ${issueId}: ${error}`);
    return null;
  }
}

async function findPRFromLinearAttachments(
  linearInfo: LinearIssueInfo
): Promise<PRInfo | null> {
  // Check attachments for GitHub PR links
  for (const attachment of linearInfo.attachments) {
    const prMatch = attachment.url?.match(
      /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/
    );
    if (prMatch) {
      const prInfo = {
        owner: prMatch[1],
        repo: prMatch[2],
        number: parseInt(prMatch[3]),
      };
      logInfo(
        `✅ Found GitHub PR from Linear attachment: ${prInfo.owner}/${prInfo.repo}#${prInfo.number}`
      );
      return prInfo;
    }
  }
  return null;
}

async function findPRFromBranch(branchName: string): Promise<PRInfo | null> {
  try {
    const { owner, repo } = await getCurrentRepoInfo();

    const prListOutput = execSync(
      `gh pr list --head ${branchName} --repo ${owner}/${repo} --json number`,
      { encoding: "utf-8" }
    );
    const prs = JSON.parse(prListOutput);
    if (prs.length > 0) {
      const prInfo = {
        owner,
        repo,
        number: prs[0].number,
        branch: branchName,
      };
      logInfo(`✅ Found GitHub PR for branch ${branchName}: #${prInfo.number}`);
      return prInfo;
    }
  } catch (error) {
    // Ignore errors
  }
  return null;
}

async function fetchPRData(prInfo: PRInfo): Promise<{
  prDetails: any;
  reviews: any[];
  reviewComments: any[];
  issueComments: any[];
} | null> {
  const { owner, repo, number } = prInfo;

  try {
    // Check if PR exists
    const prCheck = execSync(
      `gh api repos/${owner}/${repo}/pulls/${number} --jq '.title'`,
      { encoding: "utf-8" }
    ).trim();

    if (!prCheck) {
      return null;
    }

    logInfo(`✅ Found GitHub PR: ${prCheck}`);

    // Fetch all data in parallel for better performance
    const [reviewsOutput, commentsOutput, issueCommentsOutput, prDetails] =
      await Promise.all([
        // Get PR reviews
        new Promise<string>((resolve) => {
          const output = execSync(
            `gh api repos/${owner}/${repo}/pulls/${number}/reviews --jq '.[] | select(.body != "") | {author: .user.login, body: .body, state: .state}' | cat`,
            { encoding: "utf-8" }
          );
          resolve(output);
        }),

        // Get PR review comments (inline comments)
        new Promise<string>((resolve) => {
          const output = execSync(
            `gh api repos/${owner}/${repo}/pulls/${number}/comments --jq '.[] | {author: .user.login, body: .body, path: .path, line: .line, diff_hunk: .diff_hunk}' | cat`,
            { encoding: "utf-8" }
          );
          resolve(output);
        }),

        // Get general PR comments
        new Promise<string>((resolve) => {
          const output = execSync(
            `gh api repos/${owner}/${repo}/issues/${number}/comments --jq '.[] | {author: .user.login, body: .body, created_at: .created_at}' | cat`,
            { encoding: "utf-8" }
          );
          resolve(output);
        }),

        // Get PR details
        new Promise<string>((resolve) => {
          const output = execSync(
            `gh api repos/${owner}/${repo}/pulls/${number} --jq '{title: .title, body: .body, head_ref: .head.ref, base_ref: .base.ref, state: .state, draft: .draft}'`,
            { encoding: "utf-8" }
          );
          resolve(output);
        }),
      ]);

    return {
      prDetails: JSON.parse(prDetails),
      reviews: reviewsOutput.trim()
        ? reviewsOutput
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line))
        : [],
      reviewComments: commentsOutput.trim()
        ? commentsOutput
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line))
        : [],
      issueComments: issueCommentsOutput.trim()
        ? issueCommentsOutput
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line))
        : [],
    };
  } catch (error) {
    logWarning(`Could not fetch GitHub PR ${number}: ${error}`);
    return null;
  }
}

async function generateAISummary(
  extractedData: ExtractedData
): Promise<string> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    logWarning("GEMINI_API_KEY not found - skipping AI summary");
    return "⚠️ AI Summary unavailable (GEMINI_API_KEY not configured)";
  }

  try {
    const genai = new GoogleGenAI({ apiKey: geminiApiKey });

    // Create context for AI
    const context = {
      prTitle: extractedData.prDetails?.title || "Unknown",
      linearTitle: extractedData.linearInfo?.title || "None",
      totalReviews: extractedData.reviews.length,
      totalComments:
        extractedData.reviewComments.length +
        extractedData.issueComments.length,
      reviews: extractedData.reviews.slice(0, 3), // Limit for token usage
      comments: [
        ...extractedData.reviewComments,
        ...extractedData.issueComments,
      ].slice(0, 5),
    };

    const prompt = `Analyze this PR/issue discussion and provide a concise summary:

PR: ${context.prTitle}
Linear Issue: ${context.linearTitle}
Total Reviews: ${context.totalReviews}
Total Comments: ${context.totalComments}

Key Feedback:
${JSON.stringify(context.reviews, null, 2)}
${JSON.stringify(context.comments, null, 2)}

Please provide:
1. 🎯 Main concerns or issues raised
2. 🚨 Critical items that need immediate attention
3. 📋 Recommended next steps
4. ⏱️ Estimated complexity (Low/Medium/High)

Keep it concise and actionable for a developer.`;

    const result = await genai.models.generateContent({
      model: "gemini-2.0-flash-001",
      contents: prompt,
    });
    return result.text || "⚠️ AI Summary generated but text was empty";
  } catch (error) {
    logWarning(`AI summary failed: ${error}`);
    return "⚠️ AI Summary failed - check GEMINI_API_KEY and rate limits";
  }
}

function formatOutput(extractedData: ExtractedData): string {
  const {
    prInfo,
    linearInfo,
    prDetails,
    reviews,
    reviewComments,
    issueComments,
  } = extractedData;

  let output = "";

  // For Linear-only issues (no PR found), use simplified format
  if (linearInfo && !prInfo) {
    // Use the Linear issue title as the main title
    output += `# ${linearInfo.title}\n\n`;

    // Add description if available
    if (linearInfo.description) {
      output += `${linearInfo.description}\n\n`;
    }

    // Add metadata section
    output += `## Metadata\n`;
    output += `- URL: [${linearInfo.url}](${linearInfo.url})\n`;
    output += `- Identifier: ${linearInfo.id}\n`;
    output += `- Status: ${linearInfo.state}\n`;
    if (linearInfo.assignee) {
      output += `- Assignee: ${linearInfo.assignee.name}\n`;
    }
    if (linearInfo.labels && linearInfo.labels.length > 0) {
      output += `- Labels: ${linearInfo.labels.join(", ")}\n`;
    }
    output += `- Priority: ${linearInfo.priorityLabel}\n`;
    output += `- Team: ${linearInfo.team}\n\n`;

    // Add comments section if there are any
    if (linearInfo.comments && linearInfo.comments.length > 0) {
      output += `## Comments\n\n`;
      linearInfo.comments.forEach((comment) => {
        output += `- ${comment.user.name}:\n\n  ${comment.body}\n\n`;
      });
    }

    return output;
  }

  // For PR + Linear combined format (existing logic)
  const fullBranchName =
    prDetails?.head_ref || linearInfo?.branchName || "unknown";

  // Extract just the issue portion for the title (remove prefixes)
  const titleMatch = fullBranchName.match(
    /^(?:feature\/|improvement\/|chore\/|bugfix\/|hotfix\/)?(.+)$/
  );
  const title = titleMatch ? titleMatch[1] : fullBranchName;

  output += `${fullBranchName}\n\n`;
  output += `**UNIFIED PR/ISSUE DISCUSSION SUMMARY**\n\n`;

  // PR Overview
  if (prInfo && prDetails) {
    output += `**GitHub PR Overview**\n`;
    output += `Title: ${prDetails.title}\n`;
    output += `Branch: ${prDetails.head_ref} → ${prDetails.base_ref}\n`;
    output += `State: ${prDetails.state}${prDetails.draft ? " (Draft)" : ""}\n`;
    output += `URL: https://github.com/${prInfo.owner}/${prInfo.repo}/pull/${prInfo.number}\n`;
    if (prDetails.body) {
      output += `Description: ${prDetails.body}\n`;
    }
    output += `\n`;
  }

  // Linear Overview
  if (linearInfo) {
    output += `**Linear Issue Context**\n`;
    output += `ID: ${linearInfo.id}\n`;
    output += `Title: ${linearInfo.title}\n`;
    if (linearInfo.description) {
      output += `Description: ${linearInfo.description}\n`;
    }
    if (linearInfo.branchName) {
      output += `Branch: ${linearInfo.branchName}\n`;
    }
    if (linearInfo.comments.length > 0) {
      output += `\nLinear Discussion:\n`;
      linearInfo.comments.forEach((comment) => {
        output += `**${comment.user.name}:** ${comment.body}\n`;
      });
    }
    output += `\n`;
  }

  // Process and enhance all comments (same logic as before)
  const allReviews: Comment[] = reviews.map((review) => ({
    ...review,
    isBot: BOT_USERS.includes(review.author),
    priority: detectPriority(review.body),
  }));

  const allReviewComments: Comment[] = reviewComments.map((comment) => ({
    ...comment,
    isBot: BOT_USERS.includes(comment.author),
    priority: detectPriority(comment.body),
  }));

  const allIssueComments: Comment[] = issueComments.map((comment) => ({
    ...comment,
    isBot: BOT_USERS.includes(comment.author),
    priority: detectPriority(comment.body),
  }));

  // Deduplicate and separate human vs bot comments
  const humanReviews = deduplicateComments(allReviews.filter((r) => !r.isBot));
  const botReviews = deduplicateComments(allReviews.filter((r) => r.isBot));
  const humanReviewComments = deduplicateComments(
    allReviewComments.filter((c) => !c.isBot)
  );
  const botReviewComments = deduplicateComments(
    allReviewComments.filter((c) => c.isBot)
  );
  const humanIssueComments = deduplicateComments(
    allIssueComments.filter((c) => !c.isBot)
  );
  const botIssueComments = deduplicateComments(
    allIssueComments.filter((c) => c.isBot)
  );

  // Human reviews section (prioritized first)
  if (humanReviews.length > 0) {
    output += `**HUMAN REVIEWS** 🔥\n\n`;
    const sortedReviews = humanReviews.sort((a, b) => {
      const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return priorityOrder[a.priority!] - priorityOrder[b.priority!];
    });

    sortedReviews.forEach((review, index) => {
      const priorityEmoji =
        review.priority === "HIGH"
          ? "🚨"
          : review.priority === "MEDIUM"
          ? "⚠️"
          : "ℹ️";
      output += `**Review ${index + 1}** ${priorityEmoji} ${review.priority}\n`;
      output += `**Reviewer:** ${review.author}\n`;
      output += `**State:** ${review.state}\n`;
      output += `**Comment:** ${review.body}\n`;
      output += `\n`;
    });
  }

  // Human inline code comments (prioritized)
  if (humanReviewComments.length > 0) {
    output += `**HUMAN INLINE CODE COMMENTS** 💻\n\n`;

    // Group by file for better organization
    const commentsByFile = humanReviewComments.reduce((acc, comment) => {
      const file = comment.path || "General";
      if (!acc[file]) acc[file] = [];
      acc[file].push(comment);
      return acc;
    }, {} as Record<string, Comment[]>);

    Object.entries(commentsByFile).forEach(([file, comments]) => {
      output += `**File: ${file}**\n`;
      comments
        .sort((a, b) => {
          const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
          return priorityOrder[a.priority!] - priorityOrder[b.priority!];
        })
        .forEach((comment, index) => {
          const priorityEmoji =
            comment.priority === "HIGH"
              ? "🚨"
              : comment.priority === "MEDIUM"
              ? "⚠️"
              : "ℹ️";
          output += `**Comment ${index + 1}** ${priorityEmoji} ${
            comment.priority
          }\n`;
          if (comment.line) {
            output += `**Line:** ${comment.line}\n`;
          }
          output += `**Reviewer:** ${comment.author}\n`;
          output += `**Comment:** ${comment.body}\n`;
          if (comment.diff_hunk) {
            output += `**Code Context:**\n\`\`\`\n${truncateCodeContext(
              comment.diff_hunk
            )}\n\`\`\`\n`;
          }
          output += `\n`;
        });
    });
  }

  // Human general comments
  if (humanIssueComments.length > 0) {
    output += `**HUMAN DISCUSSION COMMENTS** 💬\n\n`;
    const sortedComments = humanIssueComments.sort((a, b) => {
      const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return priorityOrder[a.priority!] - priorityOrder[b.priority!];
    });

    sortedComments.forEach((comment, index) => {
      const priorityEmoji =
        comment.priority === "HIGH"
          ? "🚨"
          : comment.priority === "MEDIUM"
          ? "⚠️"
          : "ℹ️";
      output += `**Comment ${index + 1}** ${priorityEmoji} ${
        comment.priority
      }\n`;
      output += `**Author:** ${comment.author}\n`;
      output += `**Comment:** ${comment.body}\n`;
      output += `**Posted:** ${comment.created_at}\n`;
      output += `\n`;
    });
  }

  // Bot comments section (collapsed/summarized)
  const totalBotComments =
    botReviews.length + botReviewComments.length + botIssueComments.length;
  if (totalBotComments > 0) {
    output += `**BOT FEEDBACK SUMMARY** 🤖 (${totalBotComments} items)\n\n`;

    // Summarize bot feedback by type and priority
    const botSummary = {
      HIGH: [] as string[],
      MEDIUM: [] as string[],
      LOW: [] as string[],
    };

    [...botReviews, ...botReviewComments, ...botIssueComments].forEach(
      (comment) => {
        const summary = `${comment.author}: ${comment.body.substring(
          0,
          100
        )}...`;
        botSummary[comment.priority!].push(summary);
      }
    );

    Object.entries(botSummary).forEach(([priority, items]) => {
      if (items.length > 0) {
        const emoji =
          priority === "HIGH" ? "🚨" : priority === "MEDIUM" ? "⚠️" : "ℹ️";
        output += `**${priority} Priority ${emoji}** (${items.length} items)\n`;
        items.slice(0, 3).forEach((item) => (output += `• ${item}\n`));
        if (items.length > 3) output += `• ... and ${items.length - 3} more\n`;
        output += `\n`;
      }
    });
  }

  // Enhanced action items summary
  const totalHumanComments =
    humanReviews.length +
    humanReviewComments.length +
    humanIssueComments.length;
  const highPriorityCount = [
    ...humanReviews,
    ...humanReviewComments,
    ...humanIssueComments,
  ].filter((c) => c.priority === "HIGH").length;
  const mediumPriorityCount = [
    ...humanReviews,
    ...humanReviewComments,
    ...humanIssueComments,
  ].filter((c) => c.priority === "MEDIUM").length;

  if (totalHumanComments > 0) {
    output += `**PRIORITIZED ACTION ITEMS** 📋\n`;
    if (highPriorityCount > 0)
      output += `🚨 **URGENT**: ${highPriorityCount} high priority items requiring immediate attention\n`;
    if (mediumPriorityCount > 0)
      output += `⚠️ **IMPORTANT**: ${mediumPriorityCount} medium priority improvements\n`;
    output += `📊 **TOTAL**: ${totalHumanComments} human feedback items + ${totalBotComments} bot suggestions\n`;
    output += `\n`;
  }

  // Jules Rules
  output += `**Jules Rules**\n`;
  output += `- You don't have access to project environmental variables. If you must make an edit / migration of the database please instead edit prisma schema file and leave it as is, assuming a human will migrate it later.\n`;
  output += `- When publishing the github branch the name MUST BE THE FULL EXACT the FROM branch mentioned at the top of the output (but not the shortened version at the top of the output). For example it will be the full: "${fullBranchName}"\n`;

  return output;
}

async function processInput(input: string): Promise<ExtractedData> {
  const extractedData: ExtractedData = {
    prInfo: null,
    linearInfo: null,
    reviews: [],
    reviewComments: [],
    issueComments: [],
  };

  let foundSomething = false;

  // Determine if input looks like Linear ID or PR number
  const isLinearId = /[A-Z]/.test(input);

  if (isLinearId) {
    logInfo(`🔍 Processing as Linear issue: ${input}`);

    // Try to fetch Linear issue
    const linearInfo = await fetchLinearIssue(input);
    if (linearInfo) {
      extractedData.linearInfo = linearInfo;
      foundSomething = true;

      // Try to find associated PR
      let prInfo = await findPRFromLinearAttachments(linearInfo);
      if (!prInfo && linearInfo.branchName) {
        prInfo = await findPRFromBranch(linearInfo.branchName);
      }

      if (prInfo) {
        extractedData.prInfo = prInfo;
        const prData = await fetchPRData(prInfo);
        if (prData) {
          extractedData.prDetails = prData.prDetails;
          extractedData.reviews = prData.reviews;
          extractedData.reviewComments = prData.reviewComments;
          extractedData.issueComments = prData.issueComments;
        }
      } else {
        // Only prompt for GitHub PR number if not running in no-clipboard-output mode
        if (!suppressLogs) {
          logInfo("\n📎 No GitHub PR found attached to this Linear issue.");
          const prNumber = await promptUser(
            "🤔 Enter GitHub PR number (or press Enter to skip): "
          );
          if (prNumber) {
            try {
              const { owner, repo } = await getCurrentRepoInfo();
              const prInfo = { owner, repo, number: parseInt(prNumber) };
              const prData = await fetchPRData(prInfo);
              if (prData) {
                extractedData.prInfo = prInfo;
                extractedData.prDetails = prData.prDetails;
                extractedData.reviews = prData.reviews;
                extractedData.reviewComments = prData.reviewComments;
                extractedData.issueComments = prData.issueComments;
              }
            } catch (error) {
              logWarning(`Could not fetch PR ${prNumber}`);
            }
          }
        }
        // When suppressLogs is true (--no-clipboard-output), just continue with Linear-only data
      }
    }
  } else {
    logInfo(`🔍 Processing as GitHub PR: ${input}`);

    // Try to fetch GitHub PR
    try {
      const { owner, repo } = await getCurrentRepoInfo();
      const prInfo = { owner, repo, number: parseInt(input) };
      const prData = await fetchPRData(prInfo);
      if (prData) {
        extractedData.prInfo = prInfo;
        extractedData.prDetails = prData.prDetails;
        extractedData.reviews = prData.reviews;
        extractedData.reviewComments = prData.reviewComments;
        extractedData.issueComments = prData.issueComments;
        foundSomething = true;

        // Try to find Linear issue from branch name
        const branchName = prData.prDetails?.head_ref;
        if (branchName) {
          const linearMatch = branchName.match(/([A-Z]{2,10}-\d+)/);
          if (linearMatch) {
            const linearId = linearMatch[1];
            const linearInfo = await fetchLinearIssue(linearId);
            if (linearInfo) {
              extractedData.linearInfo = linearInfo;
            }
          }
        }

        if (!extractedData.linearInfo && !suppressLogs) {
          // Only prompt for Linear issue ID if not running in no-clipboard-output mode
          logInfo("\n📎 No Linear issue found for this PR branch.");
          const linearId = await promptUser(
            "🤔 Enter Linear issue ID (or press Enter to skip): "
          );
          if (linearId) {
            const linearInfo = await fetchLinearIssue(linearId);
            if (linearInfo) {
              extractedData.linearInfo = linearInfo;
            }
          }
        }
      }
    } catch (error) {
      logWarning(`Could not fetch GitHub PR ${input}`);
    }
  }

  if (!foundSomething) {
    throw new Error(
      `Could not find data for ${input}. Make sure the ID/number is correct and you have access.`
    );
  }

  return extractedData;
}

async function julesMode(extractedData: ExtractedData): Promise<void> {
  // First copy the branch name
  const branchName =
    extractedData.prDetails?.head_ref ||
    extractedData.linearInfo?.branchName ||
    "unknown-branch";

  try {
    clipboardy.writeSync(branchName);
    logSuccess(`📋 Step 1: Branch name copied to clipboard: ${branchName}`);

    // Wait for user to press any key
    await promptUser(
      "✨ Press Enter to continue and copy the full PR discussion..."
    );

    // Now copy the full discussion
    const fullOutput = formatOutput(extractedData);
    clipboardy.writeSync(fullOutput);
    logSuccess("📋 Step 2: Full PR discussion copied to clipboard!");
  } catch (error) {
    logWarning("Could not access clipboard");
    console.log(`\n🔖 Branch name: ${branchName}\n`);
    await promptUser("Press Enter to continue...");
  }
}

async function main() {
  try {
    const args = normalizeArgs(process.argv.slice(2));

    if (args.includes("--help") || args.includes("-h")) {
      console.log(`
🔧 **Unified PR/Issue Discussion Extractor**

USAGE:
  npm run extract-pr <PR_NUMBER|LINEAR_ID> [options]

EXAMPLES:
  npm run extract-pr 123        Extract GitHub PR #123 (+ find Linear issue)
  npm run extract-pr GRE-456    Extract Linear issue GRE-456 (+ find GitHub PR)

OPTIONS:
  -j, --jules               Jules mode: Copy branch name first, then full discussion
  -s, --summary             Generate AI summary using Gemini
  --no-clipboard-output     Suppress clipboard operations and debug output (for script usage)
  --help                    Show this help

FEATURES:
  🔗 **Unified Extraction**: Automatically finds connected Linear issues and GitHub PRs
  🤝 **Interactive Prompting**: If missing data, prompts for the other platform's ID
  🤖 **AI Summaries**: Uses Gemini AI to generate actionable summaries
  👑 **Jules Mode**: Two-step clipboard copying for streamlined workflow
  📊 **Smart Prioritization**: HIGH/MEDIUM/LOW priority classification
  🔄 **Bot Filtering**: Separates human feedback from bot suggestions

ENVIRONMENT:
  LINEAR_API_KEY   - Required for Linear integration
  GEMINI_API_KEY   - Required for AI summaries

RATE LIMITS (Gemini):
  RPM: 10 | TPM: 250,000 | RDP: 500
      `);
      closeReadlineInterface();
      process.exit(0);
    }

    if (args.length === 0) {
      logError("Usage: npm run extract-pr <PR_NUMBER|LINEAR_ISSUE_ID>");
      logError("Examples:");
      logError("  npm run extract-pr 123           # GitHub PR number");
      logError("  npm run extract-pr GRE-456       # Linear issue ID");
      logError("  npm run extract-pr --help        # Show this help");
      closeReadlineInterface();
      process.exit(1);
    }

    const input = args.find((arg) => !arg.startsWith("-")) || args[0];
    const julesFlag = args.includes("-j") || args.includes("--jules");
    const summaryFlag = args.includes("-s") || args.includes("--summary");
    const noClipboardOutput = args.includes("--no-clipboard-output");

    // Set global flag to suppress logs when called by another script
    suppressLogs = noClipboardOutput;

    const startTime = Date.now();

    logInfo(`🚀 Starting unified extraction for: ${input}`);

    // Process the input and extract all data
    const extractedData = await processInput(input);

    // Handle Jules mode
    if (julesFlag) {
      await julesMode(extractedData);
      closeReadlineInterface();
      return;
    }

    // Generate the formatted output
    const output = formatOutput(extractedData);

    // Generate AI summary if requested
    let summary = "";
    if (summaryFlag) {
      logInfo("🤖 Generating AI summary with Gemini...");
      summary = await generateAISummary(extractedData);
    }

    const processingTime = Date.now() - startTime;

    // Only show full output and clipboard operations if not suppressed
    if (!noClipboardOutput) {
      // Output the result
      console.log("\n" + "=".repeat(80));
      console.log(output);

      if (summary) {
        console.log("=".repeat(30) + " AI SUMMARY " + "=".repeat(30));
        console.log(summary);
      }

      console.log("=".repeat(80));

      // Copy to clipboard (full output + summary if available)
      try {
        const clipboardContent = summary
          ? output +
            "\n\n" +
            "=".repeat(30) +
            " AI SUMMARY " +
            "=".repeat(30) +
            "\n" +
            summary
          : output;

        // Output what we're trying to copy to help debug clipboard issues
        console.log("\n" + "=".repeat(80));
        console.log("📋 CONTENT BEING COPIED TO CLIPBOARD:");
        console.log("=".repeat(80));
        console.log(clipboardContent);
        console.log("=".repeat(80));

        clipboardy.writeSync(clipboardContent);
        logSuccess(
          `✅ Output copied to clipboard! (Processed in ${processingTime}ms)`
        );
      } catch (error) {
        logWarning("Could not copy to clipboard, but output is shown above");
      }
    } else {
      // When called by another script, just output the content for capture
      const finalOutput = summary
        ? output +
          "\n\n" +
          "=".repeat(30) +
          " AI SUMMARY " +
          "=".repeat(30) +
          "\n" +
          summary
        : output;
      console.log(finalOutput);
    }

    closeReadlineInterface();
  } catch (error) {
    logError(`Script failed: ${error}`);
    closeReadlineInterface();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
