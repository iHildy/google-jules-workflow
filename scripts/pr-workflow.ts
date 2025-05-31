#!/usr/bin/env tsx
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";

const logInfo = (message: string) => console.log("\x1b[36m%s\x1b[0m", message);
const logSuccess = (message: string) =>
  console.log("\x1b[32m%s\x1b[0m", message);
const logError = (message: string) =>
  console.error("\x1b[31m%s\x1b[0m", message);
const logWarning = (message: string) =>
  console.warn("\x1b[33m%s\x1b[0m", message);

interface WorkflowOptions {
  auto?: boolean;
  save?: string;
  jules?: boolean;
  summary?: boolean;
}

// Handle both npm script usage and direct CLI usage
function normalizeArgs(args: string[]): string[] {
  // If called directly (e.g., jules-pr), process all args
  // If called via npm/tsx, skip the script path
  const scriptName = args.find((arg) => arg.endsWith("pr-workflow.ts"));
  if (scriptName) {
    const scriptIndex = args.indexOf(scriptName);
    return args.slice(scriptIndex + 1);
  }
  return args;
}

// Manager commands that should be delegated to pr-manager.ts
const MANAGER_COMMANDS = [
  "list-needing-review",
  "list-needing-update",
  "list-linear-issues",
  "assign-copilot",
  "manager",
  "summary",
];

// Check if this should be delegated to pr-manager
function shouldDelegateToManager(args: string[]): boolean {
  return args.some((arg) => MANAGER_COMMANDS.includes(arg));
}

// Delegate to pr-manager.ts
async function delegateToManager(args: string[]): Promise<void> {
  try {
    // Find the manager command and prepare arguments
    let managerArgs = [...args];

    // If 'manager' was used, remove it and use default (summary)
    if (managerArgs.includes("manager")) {
      managerArgs = managerArgs.filter((arg) => arg !== "manager");
      if (managerArgs.length === 0) {
        managerArgs = ["summary"];
      }
    }

    // Use relative path - when called as a bin script, the current working directory
    // should be where the user invoked the command, and we need to find pr-manager.ts
    // relative to this script's location in node_modules or the project structure
    const scriptDir = require("path").dirname(__filename);
    const prManagerPath = join(scriptDir, "pr-manager.ts");
    const command = `tsx "${prManagerPath}" ${managerArgs.join(" ")}`;

    // Execute pr-manager.ts with the same stdout/stderr
    execSync(command, {
      stdio: "inherit",
      cwd: process.cwd(),
    });
  } catch (error) {
    // Error handling is done by pr-manager.ts, just exit with same code
    process.exit(1);
  }
}

async function getCurrentBranchPR(): Promise<number | null> {
  try {
    const currentBranch = execSync("git branch --show-current", {
      encoding: "utf-8",
    }).trim();
    logInfo(`Current branch: ${currentBranch}`);

    const prListOutput = execSync(
      `gh pr list --head ${currentBranch} --json number`,
      { encoding: "utf-8" }
    );

    const prs = JSON.parse(prListOutput);
    return prs.length > 0 ? prs[0].number : null;
  } catch (error) {
    return null;
  }
}

async function getLinearIssueFromBranch(): Promise<string | null> {
  try {
    const currentBranch = execSync("git branch --show-current", {
      encoding: "utf-8",
    }).trim();

    // Look for Linear issue pattern in branch name (e.g., feature/GRE-123-description)
    const linearMatch = currentBranch.match(/([A-Z]{2,10}-\d+)/);
    return linearMatch ? linearMatch[1] : null;
  } catch (error) {
    return null;
  }
}

async function autoDetectInput(): Promise<string | null> {
  logInfo("🔍 Auto-detecting for current branch...");

  // Try Linear issue first (they usually contain more context)
  const linearIssue = await getLinearIssueFromBranch();
  if (linearIssue) {
    logSuccess(`✅ Found Linear issue in branch: ${linearIssue}`);
    return linearIssue;
  } else {
    // Try current branch PR
    const currentPR = await getCurrentBranchPR();
    if (currentPR) {
      logSuccess(`✅ Found GitHub PR for current branch: #${currentPR}`);
      return currentPR.toString();
    } else {
      logError("❌ No PR or Linear issue found for current branch");
      logInfo("💡 Create a PR first with: gh pr create");
      logInfo(
        "💡 Or ensure your branch name contains a Linear issue ID (e.g., feature/GRE-123-description)"
      );
      return null;
    }
  }
}

async function runExtractPR(input: string, options: WorkflowOptions = {}) {
  try {
    logInfo(`Extracting unified discussion for: ${input}`);

    let flags = "";
    if (options.jules) flags += " --jules";
    if (options.summary) flags += " --summary";

    const command = `tsx ./scripts/extract-pr-discussion.ts ${input}${flags}`;
    const output = execSync(command, { encoding: "utf-8" });

    if (options.save) {
      const filename = options.save.endsWith(".md")
        ? options.save
        : `${options.save}.md`;
      const filepath = join(process.cwd(), filename);
      writeFileSync(filepath, output);
      logSuccess(`💾 Saved to: ${filepath}`);
    }

    return output;
  } catch (error) {
    throw new Error(`Failed to extract discussion: ${error}`);
  }
}

async function main() {
  const args = normalizeArgs(process.argv.slice(2));

  // Check if this should be delegated to pr-manager
  if (shouldDelegateToManager(args)) {
    await delegateToManager(args);
    return;
  }

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
🚀 **Jules PR - Unified Workflow Tool**

USAGE:
  jules-pr [PR_NUMBER|LINEAR_ID] [options]       Extract PR/issue discussion
  jules-pr <manager_command> [options]           PR workflow management
  jules-pr --help                                Show this help

📋 **DISCUSSION EXTRACTION:**
  jules-pr                             Auto-detect current branch
  jules-pr 123                         Extract GitHub PR #123
  jules-pr GRE-456                     Extract Linear issue GRE-456
  jules-pr auto --jules                Auto-detect with Jules mode
  jules-pr 123 --summary --save        Extract with AI summary and save

🤖 **WORKFLOW MANAGEMENT:**
  jules-pr summary                     Show overview of PRs needing attention (default)
  jules-pr list-needing-review         PRs where Jules committed, need Copilot review
  jules-pr list-needing-update         PRs reviewed by Copilot, need Jules update
  jules-pr list-linear-issues          Linear issues ready for Jules to start
  jules-pr assign-copilot              Auto-assign Copilot to Jules PRs
  jules-pr manager                     Same as 'summary' (backwards compatibility)

📝 **OPTIONS:**
  --save <filename>     Save output to file (e.g., --save review.md)
  --jules, -j          Jules mode: Two-step clipboard copying
  --summary, -s        Generate AI summary using Gemini
  --help, -h           Show this help

🎯 **JULES MODE:**
  1. First copies branch name to clipboard
  2. Wait for Enter key press  
  3. Then copies full discussion

🤖 **AI SUMMARY:**
  - Uses Gemini AI to analyze discussion
  - Requires GEMINI_API_KEY environment variable
  - Provides actionable insights and next steps

🔧 **EXAMPLES:**
  jules-pr                             # Auto-detect current branch
  jules-pr --jules                     # Jules mode for current branch
  jules-pr summary                     # Show workflow overview
  jules-pr list-needing-update         # Interactive PR review mode
  jules-pr assign-copilot              # Assign Copilot to Jules PRs

💡 **BACKWARDS COMPATIBILITY:**
  All old commands still work:
  - jules-pr-manager → jules-pr manager
  - jules-pr-manager list-needing-review → jules-pr list-needing-review
    `);
    process.exit(0);
  }

  const options: WorkflowOptions = {
    auto:
      args.includes("auto") ||
      args.includes("current") ||
      args.length === 0 ||
      (args.length === 1 &&
        (args.includes("--jules") || args.includes("-j"))) ||
      (args.length === 1 &&
        (args.includes("--summary") || args.includes("-s"))) ||
      (args.length === 2 &&
        args.includes("--jules") &&
        args.includes("--summary")),
    save: args.find((arg, i) => args[i - 1] === "--save"),
    jules: args.includes("--jules") || args.includes("-j"),
    summary: args.includes("--summary") || args.includes("-s"),
  };

  let input: string | null = null;

  // Auto-detect mode or fallback for jules/summary
  if (options.auto) {
    input = await autoDetectInput();
    if (!input) {
      process.exit(1);
    }
  } else {
    // Use provided input
    input =
      args.find(
        (arg) => !arg.startsWith("--") && arg !== "auto" && arg !== "current"
      ) || null;
    if (!input) {
      logError("Please provide a PR number or Linear issue ID");
      process.exit(1);
    }
  }

  if (!input) {
    logError("Could not determine what to extract");
    process.exit(1);
  }

  // Extract discussion
  const output = await runExtractPR(input, options);

  // Output the content that should be copied to clipboard
  console.log("\n" + "=".repeat(80));
  console.log("📋 CONTENT COPIED TO CLIPBOARD:");
  console.log("=".repeat(80));
  console.log(output);
  console.log("=".repeat(80));

  logSuccess(
    `✨ Unified discussion extracted successfully! And copied to clipboard!`
  );

  // Suggest next actions (only if not in Jules mode)
  if (!options.jules) {
    console.log(`
💡 **NEXT STEPS:**
   1. Review the extracted feedback above
   2. Address high priority items first (🚨)
   3. Make your changes and commit
   4. Run: git push
   
🔧 **PRO TIPS:**
   • Use Jules mode: jules-pr ${input} --jules
   • Generate AI insights: jules-pr ${input} --summary
   • Save for later: jules-pr ${input} --save review
   • Check workflow: jules-pr summary
  `);
  }
}

if (require.main === module) {
  main().catch((error) => {
    logError(`Workflow failed: ${error.message}`);
    process.exit(1);
  });
}
