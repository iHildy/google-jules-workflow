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
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
🚀 **Enhanced Unified PR/Issue Workflow Tool**

COMMANDS:
  pr-workflow [PR_NUMBER|LINEAR_ID] [options]    Extract specific PR/issue
  pr-workflow auto                               Auto-detect current branch
  pr-workflow current                            Same as auto
  pr-workflow --help                             Show this help

OPTIONS:
  --save <filename>     Save output to file (e.g., --save review.md)
  --jules, -j          Jules mode: Two-step clipboard copying
  --summary, -s        Generate AI summary using Gemini

SHORTCUTS:
  pr-workflow           Auto-detect current branch (same as 'auto')
  pr-workflow .         Auto-detect current branch  

EXAMPLES:
  pr-workflow                          # Auto-detect current branch
  pr-workflow 123                      # Extract PR 123 + find Linear issue
  pr-workflow GRE-456                  # Extract Linear issue + find GitHub PR
  pr-workflow auto --jules             # Auto-detect with Jules mode
  pr-workflow 123 --summary --save     # Extract with AI summary and save

JULES MODE:
  1. First copies branch name to clipboard
  2. Wait for Enter key press
  3. Then copies full discussion

AI SUMMARY:
  - Uses Gemini AI to analyze discussion
  - Requires GEMINI_API_KEY environment variable
  - Provides actionable insights and next steps

AUTOMATION IDEAS:
  # Add to your git hooks
  echo "npm run pr-workflow auto" >> .git/hooks/post-checkout
  
  # Quick aliases for your shell
  alias pr="npm run pr-workflow"
  alias prj="npm run pr-workflow --jules"
  alias prs="npm run pr-workflow --summary"
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
   • Use --jules mode for streamlined workflow: npm run pr ${input} --jules
   • Generate AI insights: npm run pr ${input} --summary
   • Save for later: npm run pr ${input} --save review
  `);
  }
}

if (require.main === module) {
  main().catch((error) => {
    logError(`Workflow failed: ${error.message}`);
    process.exit(1);
  });
}
