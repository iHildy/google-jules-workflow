#!/usr/bin/env tsx
import { copyFileSync, existsSync } from "fs";
import { join } from "path";

const logSuccess = (message: string) =>
  console.log("\x1b[32m%s\x1b[0m", message);
const logError = (message: string) =>
  console.error("\x1b[31m%s\x1b[0m", message);
const logInfo = (message: string) => console.log("\x1b[36m%s\x1b[0m", message);
const logWarning = (message: string) =>
  console.warn("\x1b[33m%s\x1b[0m", message);

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force") || args.includes("-f");

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
🔧 **Jules Config Initializer**

Creates a configuration file for customizing Jules workflow behavior.

USAGE:
  jules-config-init [options]

OPTIONS:
  --force, -f      Overwrite existing config file
  --help, -h       Show this help

CREATES:
  jules-workflow.config.js    Configuration file in your project root

After creating the config file, you can customize:
  • Output formatting and section order
  • Content filtering and bot handling  
  • Priority classification keywords
  • AI summary preferences
  • Jules mode behavior
  • Display options and colors
  • Clipboard and workflow settings
  • PR manager filtering criteria

💡 The config file contains extensive comments explaining each option.
    `);
    process.exit(0);
  }

  const configPath = join(process.cwd(), "jules-workflow.config.js");
  const examplePath = join(__dirname, "..", "jules-workflow.config.example.js");

  // Check if config already exists
  if (existsSync(configPath) && !force) {
    logWarning("⚠️  Configuration file already exists!");
    logInfo("Use --force to overwrite or edit the existing file:");
    logInfo(`  ${configPath}`);
    logInfo("");
    logInfo("To overwrite: jules-config-init --force");
    process.exit(1);
  }

  // Check if example file exists
  if (!existsSync(examplePath)) {
    logError("❌ Example configuration file not found!");
    logError(`Expected: ${examplePath}`);
    logError("Please reinstall the package or report this issue.");
    process.exit(1);
  }

  try {
    // Copy example to config
    copyFileSync(examplePath, configPath);

    logSuccess("✅ Configuration file created successfully!");
    logInfo(`📁 Location: ${configPath}`);
    logInfo("");
    logInfo("🎯 **NEXT STEPS:**");
    logInfo("  1. Edit the config file to customize your preferences");
    logInfo("  2. Uncomment and modify sections as needed");
    logInfo("  3. Run jules-pr commands to see your customizations");
    logInfo("");
    logInfo("📚 **KEY CUSTOMIZATIONS:**");
    logInfo("  • Output formatting: includeJulesRules, sectionOrder");
    logInfo("  • Bot filtering: botUsers, includeBotFeedback");
    logInfo("  • Priority keywords: customKeywords.HIGH/MEDIUM/LOW");
    logInfo("  • Jules mode: firstCopy, prompts");
    logInfo("  • Display: enableColors, separatorWidth");
    logInfo("  • Auto-detection: autoDetectPreference");
    logInfo("");
    logInfo("🔧 **EXAMPLE USAGE:**");
    logInfo("  jules-pr --jules     # Uses your Jules mode settings");
    logInfo("  jules-pr summary     # Uses your PR manager settings");
  } catch (error) {
    logError(`❌ Failed to create configuration file: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Configuration initialization failed: ${error.message}`);
    process.exit(1);
  });
}
