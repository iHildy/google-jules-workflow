import { existsSync } from "fs";
import { join } from "path";

export interface JulesWorkflowConfig {
  output: {
    includeBranchNameHeader: boolean;
    includeLinearIdHeader: boolean;
    includeJulesRules: boolean;
    customJulesRules: string[];
    additionalJulesRules: string[];
    includeUnifiedSummaryHeader: boolean;
    includeMetadata: boolean;
    includeLinearDiscussion: boolean;
    sectionOrder: string[];
  };
  filtering: {
    botUsers: string[];
    enableDeduplication: boolean;
    includeBotFeedback: boolean;
    maxBotItemsPerPriority: number;
    includeEmptySections: boolean;
  };
  priority: {
    customKeywords: {
      HIGH: string[];
      MEDIUM: string[];
      LOW: string[];
    };
    priorityEmojis: {
      HIGH: string;
      MEDIUM: string;
      LOW: string;
    };
    defaultPriority: "HIGH" | "MEDIUM" | "LOW";
  };
  codeContext: {
    maxCodeLines: number;
    enableTruncation: boolean;
    showLineNumbers: boolean;
    showFilePaths: boolean;
    groupCommentsByFile: boolean;
  };
  aiSummary: {
    model: string;
    customPrompt: string | null;
    maxReviewsForAI: number;
    maxCommentsForAI: number;
    includeSections: {
      mainConcerns: boolean;
      criticalItems: boolean;
      nextSteps: boolean;
      complexity: boolean;
    };
  };
  julesMode: {
    firstCopy: "branch_name" | "linear_id" | "title";
    prompts: {
      firstCopyComplete: string;
      secondCopyComplete: string;
    };
    linearOnlyFirstCopy: "linear_id" | "title" | "branch_name";
  };
  display: {
    enableColors: boolean;
    showProcessingTime: boolean;
    showDebugInfo: boolean;
    separatorWidth: number;
    customHeaders: {
      humanReviews: string;
      humanCodeComments: string;
      humanGeneralComments: string;
      botFeedback: string;
      actionItems: string;
      julesRules: string;
    };
  };
  workflow: {
    enableInteractivePrompts: boolean;
    autoDetectPreference: "linear" | "pr";
    autoAssignReviewers: {
      enabled: boolean;
      defaultReviewer: string;
    };
    defaultSaveFormat: "md" | "txt";
    autoSave: {
      enabled: boolean;
      directory: string;
      fileNamePattern: string;
    };
  };
  clipboard: {
    enabled: boolean;
    fallbackToConsole: boolean;
    showClipboardContent: boolean;
  };
  integrations: {
    linear: {
      branchNamePattern: string | null;
      includeAttachments: boolean;
      includeComments: boolean;
    };
    github: {
      includePRDescription: boolean;
      includeIssueComments: boolean;
      includeReviewComments: boolean;
      includeReviews: boolean;
    };
  };
  prManager: {
    autoAssignment: {
      enabled: boolean;
      defaultReviewer: string;
      skipIfHasReviewers: boolean;
    };
    filtering: {
      excludeDrafts: boolean;
      maxDaysOld: number | null;
      minPriorityLevel: number;
      excludeLabels: string[];
    };
    linearFiltering: {
      excludeHumanLabeled: boolean;
      includeTeams: string[];
      excludeTeams: string[];
      minPriority: number;
      excludeStates: string[];
    };
    listFormatting: {
      showDetailedInfo: boolean;
      showCommitInfo: boolean;
      showLinearLinks: boolean;
      showCopilotStatus: boolean;
      showDates: boolean;
      maxItemsPerList: number;
    };
    interactive: {
      defaultAction: string;
      autoContinue: boolean;
      showProgress: boolean;
    };
  };
}

// Default configuration
const DEFAULT_CONFIG: JulesWorkflowConfig = {
  output: {
    includeBranchNameHeader: true,
    includeLinearIdHeader: true,
    includeJulesRules: true,
    customJulesRules: [
      "You don't have access to project environmental variables. If you must make an edit / migration of the database please instead edit prisma schema file and leave it as is, assuming a human will migrate it later.",
      "When publishing the github branch the name MUST BE THE FULL EXACT the FROM branch mentioned at the top of the output (but not the shortened version at the top of the output).",
    ],
    additionalJulesRules: [],
    includeUnifiedSummaryHeader: true,
    includeMetadata: true,
    includeLinearDiscussion: true,
    sectionOrder: [
      "header",
      "summaryHeader",
      "prOverview",
      "linearOverview",
      "humanReviews",
      "humanCodeComments",
      "humanGeneralComments",
      "botFeedback",
      "actionItems",
      "julesRules",
    ],
  },
  filtering: {
    botUsers: [
      "copilot-pull-request-reviewer[bot]",
      "github-actions[bot]",
      "dependabot[bot]",
      "vercel[bot]",
      "linear[bot]",
    ],
    enableDeduplication: true,
    includeBotFeedback: true,
    maxBotItemsPerPriority: 3,
    includeEmptySections: false,
  },
  priority: {
    customKeywords: {
      HIGH: [],
      MEDIUM: [],
      LOW: [],
    },
    priorityEmojis: {
      HIGH: "🚨",
      MEDIUM: "⚠️",
      LOW: "ℹ️",
    },
    defaultPriority: "MEDIUM",
  },
  codeContext: {
    maxCodeLines: 10,
    enableTruncation: true,
    showLineNumbers: true,
    showFilePaths: true,
    groupCommentsByFile: true,
  },
  aiSummary: {
    model: "gemini-2.0-flash-001",
    customPrompt: null,
    maxReviewsForAI: 3,
    maxCommentsForAI: 5,
    includeSections: {
      mainConcerns: true,
      criticalItems: true,
      nextSteps: true,
      complexity: true,
    },
  },
  julesMode: {
    firstCopy: "branch_name",
    prompts: {
      firstCopyComplete:
        "✨ Press Enter to continue and copy the full discussion...",
      secondCopyComplete: "📋 Step 2: Full discussion copied to clipboard!",
    },
    linearOnlyFirstCopy: "linear_id",
  },
  display: {
    enableColors: true,
    showProcessingTime: true,
    showDebugInfo: false,
    separatorWidth: 80,
    customHeaders: {
      humanReviews: "**HUMAN REVIEWS** 🔥",
      humanCodeComments: "**HUMAN INLINE CODE COMMENTS** 💻",
      humanGeneralComments: "**HUMAN DISCUSSION COMMENTS** 💬",
      botFeedback: "**BOT FEEDBACK SUMMARY** 🤖",
      actionItems: "**PRIORITIZED ACTION ITEMS** 📋",
      julesRules: "**Jules Rules**",
    },
  },
  workflow: {
    enableInteractivePrompts: true,
    autoDetectPreference: "linear",
    autoAssignReviewers: {
      enabled: false,
      defaultReviewer: "copilot",
    },
    defaultSaveFormat: "md",
    autoSave: {
      enabled: false,
      directory: "./jules-extractions",
      fileNamePattern: "{type}-{id}-{timestamp}",
    },
  },
  clipboard: {
    enabled: true,
    fallbackToConsole: true,
    showClipboardContent: true,
  },
  integrations: {
    linear: {
      branchNamePattern: null,
      includeAttachments: true,
      includeComments: true,
    },
    github: {
      includePRDescription: true,
      includeIssueComments: true,
      includeReviewComments: true,
      includeReviews: true,
    },
  },
  prManager: {
    autoAssignment: {
      enabled: false,
      defaultReviewer: "copilot-pull-request-reviewer[bot]",
      skipIfHasReviewers: true,
    },
    filtering: {
      excludeDrafts: false,
      maxDaysOld: null,
      minPriorityLevel: 4,
      excludeLabels: ["on-hold", "blocked"],
    },
    linearFiltering: {
      excludeHumanLabeled: true,
      includeTeams: [],
      excludeTeams: [],
      minPriority: 1,
      excludeStates: ["completed", "canceled", "archived"],
    },
    listFormatting: {
      showDetailedInfo: true,
      showCommitInfo: true,
      showLinearLinks: true,
      showCopilotStatus: true,
      showDates: true,
      maxItemsPerList: 0,
    },
    interactive: {
      defaultAction: "j",
      autoContinue: false,
      showProgress: true,
    },
  },
};

// Deep merge two objects
function deepMerge(target: any, source: any): any {
  const result = { ...target };

  for (const key in source) {
    if (
      source[key] !== null &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else if (Array.isArray(source[key])) {
      // For arrays, merge by concatenating unique values
      if (Array.isArray(target[key])) {
        result[key] = [...new Set([...target[key], ...source[key]])];
      } else {
        result[key] = source[key];
      }
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

// Load configuration from various possible locations
let configFound = false;

export function loadConfig(): JulesWorkflowConfig {
  const possibleConfigPaths = [
    // Project root configs
    join(process.cwd(), "jules-workflow.config.js"),
    join(process.cwd(), "jules-workflow.config.ts"),
    join(process.cwd(), ".jules-workflow.config.js"),
    join(process.cwd(), ".jules-workflow.config.ts"),
    // Package.json section
    join(process.cwd(), "package.json"),
  ];

  let userConfig = {};
  configFound = false;

  // Try to load config from various locations
  for (const configPath of possibleConfigPaths) {
    if (existsSync(configPath)) {
      try {
        if (configPath.endsWith("package.json")) {
          // Load from package.json jules-workflow section
          const packageJson = require(configPath);
          if (packageJson["jules-workflow"]) {
            userConfig = packageJson["jules-workflow"];
            configFound = true;
            break;
          }
        } else {
          // Delete from require cache to allow hot reload
          delete require.cache[require.resolve(configPath)];
          userConfig = require(configPath);
          configFound = true;
          break;
        }
      } catch (error) {
        console.warn(
          `Warning: Could not load config from ${configPath}: ${error.message}`
        );
      }
    }
  }

  // Merge user config with defaults
  const mergedConfig = deepMerge(DEFAULT_CONFIG, userConfig);

  // Special handling for priority keywords - merge with defaults
  const defaultPriorityKeywords = {
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

  mergedConfig.priority.customKeywords = {
    HIGH: [
      ...defaultPriorityKeywords.HIGH,
      ...mergedConfig.priority.customKeywords.HIGH,
    ],
    MEDIUM: [
      ...defaultPriorityKeywords.MEDIUM,
      ...mergedConfig.priority.customKeywords.MEDIUM,
    ],
    LOW: [
      ...defaultPriorityKeywords.LOW,
      ...mergedConfig.priority.customKeywords.LOW,
    ],
  };

  return mergedConfig;
}

// Export a singleton instance
let configInstance: JulesWorkflowConfig | null = null;

export function getConfig(): JulesWorkflowConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

// Force reload config (useful for testing or hot reload)
export function reloadConfig(): JulesWorkflowConfig {
  configInstance = null;
  return getConfig();
}

// Helper function to get combined priority keywords
export function getAllPriorityKeywords(config: JulesWorkflowConfig) {
  return {
    HIGH: config.priority.customKeywords.HIGH,
    MEDIUM: config.priority.customKeywords.MEDIUM,
    LOW: config.priority.customKeywords.LOW,
  };
}

// Check if config file was found
export function isConfigFound(): boolean {
  return configFound;
}

// Display warning about missing config file
export function showConfigWarning(): void {
  console.warn("\x1b[33m⚠️  No configuration file found!\x1b[0m");
  console.warn(
    "\x1b[33mUsing default settings. Create a config file for customization:\x1b[0m"
  );
  console.warn("\x1b[36m  jules-config-init\x1b[0m");
  console.warn("");
}
