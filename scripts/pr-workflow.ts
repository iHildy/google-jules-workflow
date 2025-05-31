#!/usr/bin/env tsx
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { findTsx, executeTsFile } from "./tsx-utils";
import clipboardy from "clipboardy";
import { createInterface } from "readline";
import { loadConfig, isConfigFound, showConfigWarning } from "./config-loader";

// Load configuration
const config = loadConfig();

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

    if (config.display.showDebugInfo) {
      logInfo(`Current branch: ${currentBranch}`);
    }

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

  // Check config preference for what to try first
  const preferLinear = config.workflow.autoDetectPreference === "linear";

  if (preferLinear) {
    // Try Linear issue first (they usually contain more context)
    const linearIssue = await getLinearIssueFromBranch();
    if (linearIssue) {
      logSuccess(`✅ Found Linear issue in branch: ${linearIssue}`);
      return linearIssue;
    }

    // Fallback to PR
    const currentPR = await getCurrentBranchPR();
    if (currentPR) {
      logSuccess(`✅ Found GitHub PR for current branch: #${currentPR}`);
      return currentPR.toString();
    }
  } else {
    // Try PR first
    const currentPR = await getCurrentBranchPR();
    if (currentPR) {
      logSuccess(`✅ Found GitHub PR for current branch: #${currentPR}`);
      return currentPR.toString();
    }

    // Fallback to Linear issue
    const linearIssue = await getLinearIssueFromBranch();
    if (linearIssue) {
      logSuccess(`✅ Found Linear issue in branch: ${linearIssue}`);
      return linearIssue;
    }
  }

  logError("❌ No PR or Linear issue found for current branch");
  logInfo("💡 Create a PR first with: gh pr create");
  logInfo(
    "💡 Or ensure your branch name contains a Linear issue ID (e.g., feature/GRE-123-description)"
  );
  return null;
}

async function runExtractPR(input: string, options: WorkflowOptions = {}) {
  try {
    if (config.display.showProcessingTime) {
      const startTime = Date.now();
      logInfo(`Extracting unified discussion for: ${input}`);

      let args = [input];
      // Don't pass --jules to the extract script, we'll handle it here
      if (options.summary) args.push("--summary");
      // Add flag to suppress clipboard output since we'll handle it here
      args.push("--no-clipboard-output");

      const extractScriptPath = join(__dirname, "extract-pr-discussion.ts");
      const output = executeTsFile(extractScriptPath, args);

      if (options.save) {
        const format = config.workflow.defaultSaveFormat || "md";
        const filename = options.save.endsWith(`.${format}`)
          ? options.save
          : `${options.save}.${format}`;
        const filepath = join(process.cwd(), filename);
        writeFileSync(filepath, output);
        logSuccess(`💾 Saved to: ${filepath}`);
      }

      const endTime = Date.now();
      if (config.display.showProcessingTime) {
        logInfo(`⏱️  Processing took ${endTime - startTime}ms`);
      }

      return output;
    } else {
      logInfo(`Extracting unified discussion for: ${input}`);

      let args = [input];
      if (options.summary) args.push("--summary");
      args.push("--no-clipboard-output");

      const extractScriptPath = join(__dirname, "extract-pr-discussion.ts");
      const output = executeTsFile(extractScriptPath, args);

      if (options.save) {
        const format = config.workflow.defaultSaveFormat || "md";
        const filename = options.save.endsWith(`.${format}`)
          ? options.save
          : `${options.save}.${format}`;
        const filepath = join(process.cwd(), filename);
        writeFileSync(filepath, output);
        logSuccess(`💾 Saved to: ${filepath}`);
      }

      return output;
    }
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
      // Step 1: Copy based on configuration
      const firstCopy = config.julesMode.firstCopy;
      let clipboardContent = "";

      if (firstCopy === "branch_name") {
        const branchName = branchMatch[1].trim();
        clipboardContent = branchName;
        clipboardy.writeSync(branchName);
        logSuccess(`📋 Step 1: Branch name copied to clipboard: ${branchName}`);
      } else if (firstCopy === "title") {
        // Extract title from PR (would need additional logic)
        const branchName = branchMatch[1].trim();
        clipboardContent = branchName;
        clipboardy.writeSync(branchName);
        logSuccess(`📋 Step 1: Content copied to clipboard: ${branchName}`);
      }

      // Step 2: Wait for user and then copy full discussion
      const readline = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const promptMessage =
        config.julesMode.prompts.firstCopyComplete ||
        "✨ Press Enter to continue and copy the full discussion...";

      await new Promise<void>((resolve) => {
        readline.question(promptMessage, () => {
          readline.close();
          resolve();
        });
      });

      if (config.clipboard.enabled) {
        clipboardy.writeSync(output.trim());
      }

      // Show clipboard content based on config
      if (config.clipboard.showClipboardContent) {
        console.log("\n" + "=".repeat(config.display.separatorWidth));
        console.log("📋 CONTENT COPIED TO CLIPBOARD:");
        console.log("=".repeat(config.display.separatorWidth));
        console.log(output.trim());
        console.log("=".repeat(config.display.separatorWidth));
      }

      const successMessage =
        config.julesMode.prompts.secondCopyComplete ||
        "✅ Output copied to clipboard!";
      logSuccess(successMessage);
    } else {
      // For Linear issues without branches, use configuration for Linear-only
      const linearMatch = input.match(/([A-Z]{2,10}-\d+)/);
      if (linearMatch) {
        const linearId = linearMatch[1];
        const firstCopy = config.julesMode.linearOnlyFirstCopy;

        // Step 1: Copy based on configuration
        let clipboardContent = "";
        if (firstCopy === "linear_id") {
          clipboardContent = linearId;
          logSuccess(
            `📋 Step 1: Linear issue ID copied to clipboard: ${linearId}`
          );
        } else if (firstCopy === "title") {
          // Would need additional logic to extract title
          clipboardContent = linearId;
          logSuccess(`📋 Step 1: Content copied to clipboard: ${linearId}`);
        }

        if (config.clipboard.enabled) {
          clipboardy.writeSync(clipboardContent);
        }

        // Step 2: Wait for user and then copy full discussion
        const readline = createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const promptMessage =
          config.julesMode.prompts.firstCopyComplete ||
          "✨ Press Enter to continue and copy the full Linear discussion...";

        await new Promise<void>((resolve) => {
          readline.question(promptMessage, () => {
            readline.close();
            resolve();
          });
        });

        if (config.clipboard.enabled) {
          clipboardy.writeSync(output.trim());
        }

        // Show clipboard content based on config
        if (config.clipboard.showClipboardContent) {
          console.log("\n" + "=".repeat(config.display.separatorWidth));
          console.log("📋 CONTENT COPIED TO CLIPBOARD:");
          console.log("=".repeat(config.display.separatorWidth));
          console.log(output.trim());
          console.log("=".repeat(config.display.separatorWidth));
        }

        const successMessage =
          config.julesMode.prompts.secondCopyComplete ||
          "✅ Output copied to clipboard!";
        logSuccess(successMessage);
      } else {
        // Fallback for PR numbers without branches
        if (config.clipboard.enabled) {
          clipboardy.writeSync(output.trim());
        }

        // Show clipboard content based on config
        if (config.clipboard.showClipboardContent) {
          console.log("\n" + "=".repeat(config.display.separatorWidth));
          console.log("📋 CONTENT COPIED TO CLIPBOARD:");
          console.log("=".repeat(config.display.separatorWidth));
          console.log(output.trim());
          console.log("=".repeat(config.display.separatorWidth));
        }
        logSuccess("✅ Output copied to clipboard!");
      }
    }
  } catch (error) {
    if (config.clipboard.fallbackToConsole) {
      logWarning("Could not access clipboard");
      console.log("📄 Discussion content available above");
    } else {
      throw error;
    }
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
  1. First copies branch name to clipboard (or Linear issue ID if no PR)
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

  // Auto-save if configured
  if (config.workflow.autoSave.enabled) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const type = input.match(/^\d+$/) ? "pr" : "linear";
    const id = input;
    const pattern = config.workflow.autoSave.fileNamePattern
      .replace("{type}", type)
      .replace("{id}", id)
      .replace("{timestamp}", timestamp);

    const autoSaveDir = config.workflow.autoSave.directory;
    const autoSavePath = join(process.cwd(), autoSaveDir, `${pattern}.md`);

    // Ensure directory exists
    const fs = require("fs");
    if (!fs.existsSync(join(process.cwd(), autoSaveDir))) {
      fs.mkdirSync(join(process.cwd(), autoSaveDir), { recursive: true });
    }

    writeFileSync(autoSavePath, output);
    if (config.display.showDebugInfo) {
      logInfo(`📁 Auto-saved to: ${autoSavePath}`);
    }
  }

  // Jules mode
  if (options.jules) {
    await julesMode(input, output);
  } else {
    // Copy to clipboard and show content
    try {
      if (config.clipboard.enabled) {
        clipboardy.writeSync(output.trim());
      }

      console.log("\n" + "=".repeat(config.display.separatorWidth));
      console.log("📋 CONTENT COPIED TO CLIPBOARD:");
      console.log("=".repeat(config.display.separatorWidth));
      console.log(output.trim());
      console.log("=".repeat(config.display.separatorWidth));
      logSuccess(`✅ Output copied to clipboard!`);
    } catch (error) {
      if (config.clipboard.fallbackToConsole) {
        console.log("\n" + "=".repeat(config.display.separatorWidth));
        console.log("📋 CONTENT (clipboard not available):");
        console.log("=".repeat(config.display.separatorWidth));
        console.log(output.trim());
        console.log("=".repeat(config.display.separatorWidth));
        logSuccess(`✨ Content extracted successfully!`);
      } else {
        throw error;
      }
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
