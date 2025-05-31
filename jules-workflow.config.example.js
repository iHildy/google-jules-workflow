// Jules Workflow Configuration File
// Copy this file to your project root as one of:
// - jules-workflow.config.js
// - .jules-workflow.config.js  
// - Add to package.json under "jules-workflow" key

module.exports = {
  // ===== OUTPUT FORMATTING =====
  output: {
    // Include PR/Linear issue identifier at the top of output
    includeBranchNameHeader: true,
    includeLinearIdHeader: true,

    // Include Jules rules at the bottom
    includeJulesRules: true,

    // Custom Jules rules (overrides defaults if provided)
    customJulesRules: [
      "You don't have access to project environmental variables.",
      "When publishing the github branch the name MUST BE THE FULL EXACT the FROM branch mentioned at the top of the output."
    ],

    // Additional project-specific rules
    additionalJulesRules: [
      "Always use TypeScript strict mode",
      "Follow the company coding standards in docs/CODING_STANDARDS.md",
      "Run tests before pushing: npm test"
    ],

    // Include various sections
    includeUnifiedSummaryHeader: true,
    includeMetadata: true,
    includeLinearDiscussion: true,

    // Customize section order (reorder to change output structure)
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
      "julesRules"
    ]
  },

  // ===== CONTENT FILTERING =====
  filtering: {
    // Bot users to filter out (add your custom bots)
    botUsers: [
      "copilot-pull-request-reviewer[bot]",
      "github-actions[bot]",
      "dependabot[bot]",
      "vercel[bot]",
      "linear[bot]",
      "codecov[bot]",        // Example: Add Codecov bot
      "sonarcloud[bot]"      // Example: Add SonarCloud bot
    ],

    // Enable comment deduplication
    enableDeduplication: true,

    // Include bot feedback section 
    includeBotFeedback: true,

    // Max bot items to show per priority level
    maxBotItemsPerPriority: 3,

    // Show empty sections (if false, hides sections with no content)
    includeEmptySections: false
  },

  // ===== PRIORITY CLASSIFICATION =====
  priority: {
    // Add project-specific priority keywords
    customKeywords: {
      HIGH: [
        "deployment",
        "production",
        "database",
        "migration"
      ],
      MEDIUM: [
        "documentation",
        "testing",
        "logging"
      ],
      LOW: [
        "cleanup",
        "whitespace",
        "comment"
      ]
    },

    // Customize priority emojis
    priorityEmojis: {
      HIGH: "🚨",
      MEDIUM: "⚠️",
      LOW: "ℹ️"
    },

    // Default priority for unclassified comments
    defaultPriority: "MEDIUM"
  },

  // ===== CODE CONTEXT =====
  codeContext: {
    // Max lines to show in code diffs
    maxCodeLines: 15,

    // Enable truncation of long code blocks
    enableTruncation: true,

    // Show line numbers and file paths
    showLineNumbers: true,
    showFilePaths: true,

    // Group code comments by file
    groupCommentsByFile: true
  },

  // ===== AI SUMMARY =====
  aiSummary: {
    // AI model to use
    model: "gemini-2.5-flash-preview-05-20",

    // Custom prompt template (use {context} placeholder)
    customPrompt: `Analyze this PR discussion for our React/TypeScript project:

{context}

Focus on:
1. 🎯 Security and performance issues
2. 🚨 Breaking changes or deployment risks  
3. 📋 Code quality improvements needed
4. ⏱️ Implementation complexity (Low/Medium/High)

Keep it actionable for our team.`,

    // Limits for AI context (to manage token usage)
    maxReviewsForAI: 5,
    maxCommentsForAI: 8,

    // Which sections to include in AI summary
    includeSections: {
      mainConcerns: true,
      criticalItems: true,
      nextSteps: true,
      complexity: true
    }
  },

  // ===== JULES MODE =====
  julesMode: {
    // What to copy first in Jules mode for PRs
    firstCopy: "branch_name", // Options: "branch_name", "linear_id", "title"

    // What to copy first for Linear-only issues
    linearOnlyFirstCopy: "linear_id", // Options: "linear_id", "title", "branch_name"

    // Custom prompt messages
    prompts: {
      firstCopyComplete: "✨ Press Enter to copy the full discussion...",
      secondCopyComplete: "📋 Full discussion copied! Ready for Jules."
    }
  },

  // ===== DISPLAY OPTIONS =====
  display: {
    // Enable colored console output
    enableColors: true,

    // Show processing time
    showProcessingTime: true,

    // Show debug information
    showDebugInfo: false,

    // Console separator width
    separatorWidth: 100,

    // Custom section headers
    customHeaders: {
      humanReviews: "**🔥 HUMAN REVIEWS**",
      humanCodeComments: "**💻 CODE FEEDBACK**",
      humanGeneralComments: "**💬 DISCUSSION**",
      botFeedback: "**🤖 BOT SUGGESTIONS**",
      actionItems: "**📋 ACTION ITEMS**",
      julesRules: "**🎯 Jules Guidelines**"
    }
  },

  // ===== WORKFLOW OPTIONS =====
  workflow: {
    // Enable interactive prompting when data is missing
    enableInteractivePrompts: true,

    // Auto-detect preference when multiple options available
    autoDetectPreference: "linear", // Options: "linear", "pr"

    // Auto-assign reviewers behavior  
    autoAssignReviewers: {
      enabled: false,
      defaultReviewer: "copilot", // Options: "copilot", custom username
    },

    // Default save file format
    defaultSaveFormat: "md", // Options: "md", "txt"

    // Auto-save extractions
    autoSave: {
      enabled: false,
      directory: "./jules-extractions",
      fileNamePattern: "{type}-{id}-{timestamp}" // {type} = pr|linear, {id} = number/id
    }
  },

  // ===== CLIPBOARD OPTIONS =====
  clipboard: {
    // Enable clipboard operations
    enabled: true,

    // Fallback to console if clipboard fails
    fallbackToConsole: true,

    // Show what's being copied (useful for debugging)
    showClipboardContent: false
  },

  // ===== INTEGRATION SETTINGS =====
  integrations: {
    // Linear settings
    linear: {
      // Custom branch naming (null = use Linear's default)
      branchNamePattern: null,

      // Include Linear attachments and comments
      includeAttachments: true,
      includeComments: true
    },

    // GitHub settings
    github: {
      // What to include from GitHub
      includePRDescription: true,
      includeIssueComments: true,
      includeReviewComments: true,
      includeReviews: true
    }
  },

  // ===== PR MANAGER SETTINGS =====
  prManager: {
    // Auto-assignment of reviewers
    autoAssignment: {
      // Enable auto-assignment when running assign-copilot command
      enabled: true,

      // Default reviewer to assign (usually Copilot)
      defaultReviewer: "copilot-pull-request-reviewer[bot]",

      // Skip assignment if PR already has human reviewers
      skipIfHasReviewers: true
    },

    // PR filtering criteria
    filtering: {
      // Hide draft PRs from main lists
      excludeDrafts: false,

      // Only show PRs with commits in last N days (null = no limit)
      maxDaysOld: 30,

      // Minimum Linear priority level (1=Urgent, 2=High, 3=Medium, 4=Low)
      minPriorityLevel: 3,

      // Skip PRs with these GitHub labels
      excludeLabels: ["on-hold", "blocked", "wip"]
    },

    // Linear issue filtering
    linearFiltering: {
      // Exclude issues tagged with "human" label
      excludeHumanLabeled: true,

      // Only include issues from these teams (empty = all teams)
      includeTeams: ["Engineering", "Frontend"],

      // Exclude issues from these teams
      excludeTeams: ["Design", "Marketing"],

      // Minimum priority for Linear issues (1=Urgent, 4=Low)
      minPriority: 2,

      // Exclude issues in these states
      excludeStates: ["completed", "canceled", "archived", "duplicate"]
    },

    // Output formatting for PR/issue lists
    listFormatting: {
      // Show detailed information for each item
      showDetailedInfo: true,

      // Include commit author and timing information
      showCommitInfo: true,

      // Show Linear issue connections
      showLinearLinks: true,

      // Display Copilot review status
      showCopilotStatus: true,

      // Include date information
      showDates: true,

      // Limit number of items per list (0 = no limit)
      maxItemsPerList: 20
    },

    // Interactive mode behavior
    interactive: {
      // Default action for interactive prompts (j=jules, s=skip, q=quit)
      defaultAction: "j",

      // Automatically continue after Jules extraction completes
      autoContinue: false,

      // Show progress indicators during processing
      showProgress: true
    }
  }
}; 