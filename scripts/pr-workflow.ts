#!/usr/bin/env tsx
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { findTsx, executeTsFile } from "./tsx-utils";
import clipboardy from "clipboardy";
import { createInterface } from "readline";

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
  "check-env",
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

    // Use the shared tsx utility
    const tsxPath = findTsx();
    const scriptDir = require("path").dirname(__filename);
    const prManagerPath = join(scriptDir, "pr-manager.ts");
    const command = `"${tsxPath}" "${prManagerPath}" ${managerArgs.join(" ")}`;

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

    let args = [input];
    // Don't pass --jules to the extract script, we'll handle it here
    if (options.summary) args.push("--summary");
    // Add flag to suppress clipboard output since we'll handle it here
    args.push("--no-clipboard-output");

    const extractScriptPath = join(__dirname, "extract-pr-discussion.ts");
    const output = executeTsFile(extractScriptPath, args);

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

async function julesMode(input: string, output: string): Promise<void> {
  try {
    // Check if this is a Linear issue with an existing branch/PR
    const branchMatch = output.match(/^([^\n]+)/);
    const hasExistingBranch =
      branchMatch &&
      branchMatch[1] &&
      !branchMatch[1].startsWith("#") &&
      !branchMatch[1].startsWith("**");

    if (hasExistingBranch) {
      // Step 1: Copy the branch name for existing PRs
      const branchName = branchMatch[1].trim();
      clipboardy.writeSync(branchName);
      logSuccess(`📋 Step 1: Branch name copied to clipboard: ${branchName}`);

      // Step 2: Wait for user and then copy full discussion
      const readline = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      await new Promise<void>((resolve) => {
        readline.question(
          "✨ Press Enter to continue and copy the full discussion...",
          () => {
            readline.close();
            resolve();
          }
        );
      });

      clipboardy.writeSync(output.trim());

      // Show clipboard content with same format as other parts of codebase
      console.log("\n" + "=".repeat(80));
      console.log("📋 CONTENT COPIED TO CLIPBOARD:");
      console.log("=".repeat(80));
      console.log(output.trim());
      console.log("=".repeat(80));
      logSuccess("✅ Output copied to clipboard!");
    } else {
      // For Linear issues without branches, skip two-step process and copy metadata directly
      const linearMatch = input.match(/([A-Z]{2,10}-\d+)/);
      if (linearMatch) {
        logInfo(`📋 No existing branch found for ${linearMatch[1]}`);
        logInfo("🚀 Copying Linear issue metadata directly...");
        clipboardy.writeSync(output.trim());

        // Show clipboard content with same format as other parts of codebase
        console.log("\n" + "=".repeat(80));
        console.log("📋 CONTENT COPIED TO CLIPBOARD:");
        console.log("=".repeat(80));
        console.log(output.trim());
        console.log("=".repeat(80));
        logSuccess("✅ Output copied to clipboard!");
      } else {
        // Fallback for PR numbers without branches
        clipboardy.writeSync(output.trim());

        // Show clipboard content with same format as other parts of codebase
        console.log("\n" + "=".repeat(80));
        console.log("📋 CONTENT COPIED TO CLIPBOARD:");
        console.log("=".repeat(80));
        console.log(output.trim());
        console.log("=".repeat(80));
        logSuccess("✅ Output copied to clipboard!");
      }
    }
  } catch (error) {
    logWarning("Could not access clipboard");
    console.log("📄 Discussion content available above");
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

  // Jules mode
  if (options.jules) {
    await julesMode(input, output);
  } else {
    // Copy to clipboard and show content
    try {
      clipboardy.writeSync(output.trim());
      console.log("\n" + "=".repeat(80));
      console.log("📋 CONTENT COPIED TO CLIPBOARD:");
      console.log("=".repeat(80));
      console.log(output.trim());
      console.log("=".repeat(80));
      logSuccess(`✅ Output copied to clipboard!`);
    } catch (error) {
      console.log("\n" + "=".repeat(80));
      console.log("📋 CONTENT (clipboard not available):");
      console.log("=".repeat(80));
      console.log(output.trim());
      console.log("=".repeat(80));
      logSuccess(`✨ Content extracted successfully!`);
    }

    // Suggest next actions (only if not in Jules mode)
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
