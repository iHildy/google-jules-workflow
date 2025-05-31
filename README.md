# 🤖 Google Jules Workflow Optimizer

**Google Jules is a free\* AI coding agent but it has some quirks that make development very slow. These are the scripts I use to speed up my workflow.**

A comprehensive suite of TypeScript scripts designed to streamline AI-powered development workflows, specifically optimized for **Google Jules** (AI coding agent) integration with **GitHub Copilot**, **Linear** project management, and modern development practices.

## 📋 Table of Contents

- [Why These Scripts?](#-why-these-scripts)
- [Quick Command Reference](#-quick-command-reference)
- [Optimal Workflow Guide](#-optimal-workflow-guide)
- [Setup Guide](#️-setup-guide)
- [Key Features](#-key-features)
- [Advanced Usage](#-advanced-usage)
- [Priority Classification System](#-priority-classification-system)
- [Supported Integrations](#-supported-integrations)
- [Auto-Detection Logic](#-auto-detection-logic)
- [Performance Features](#-performance-features)
- [Troubleshooting](#-troubleshooting)
- [Best Practices](#-best-practices)

## 🎯 Why These Scripts?

Google Jules is powerful but has workflow friction points:

- **Context Switching**: Constantly switching between Linear issues, GitHub PRs, and code reviews
- **Manual Copy-Paste**: Repeatedly copying branch names, PR discussions, and issue context
- **Review Overhead**: Managing the Jules → Copilot → Jules feedback loop manually

## 📚 Quick Command Reference

### **PR Discussion Extraction**

- **`pnpm run pr`** - Auto-detect current branch and extract unified PR/issue discussion
- **`pnpm run pr-jules`** - Jules mode: copy branch name first, then full discussion
- **`pnpm run pr-summary`** - Extract with AI-powered summary and insights
- **`pnpm run pr-js`** - Combined Jules mode + AI summary
- **`pnpm run pr <number|ID>`** - Extract specific GitHub PR or Linear issue

### **PR Workflow Management**

- **`pnpm run pr-manager`** - Overview of PRs needing attention in Jules/Copilot workflow
- **`pnpm run pr-assign-copilot`** - Auto-assign GitHub Copilot to PRs where Jules made commits
- **`pnpm run pr-list-needing-review`** - PRs where Jules committed but Copilot hasn't reviewed latest changes
- **`pnpm run pr-list-needing-update`** - PRs where Copilot reviewed but Jules hasn't addressed feedback (interactive mode)
- **`pnpm run pr-list-linear-issues`** - Linear issues without PRs ready for development (interactive mode)

### **Advanced Options**

- **`pnpm run extract-pr <ID> --save filename`** - Save extraction output to file instead of clipboard

## 🚀 Optimal Workflow Guide

### **Complete Task Flow (Start to Finish)**

**Step 1: Find Work**

Find issues ready for development
```bash
pnpm run pr-list-linear-issues
```

Select issue → Provide context to Jules

**Step 2: Development** (once Jules is done and branch is published)

Request Copilot review for Jules to act on later.
```bash
pnpm run pr-assign-copilot
```

**Step 3: Address Review**

Get PRs that have been reviewed by Copilot but not updated by Jules, provide the output to Jules to update the branch
```bash
pnpm run pr-list-needing-update
```

**Step 4: Status Check**

```bash
pnpm run pr-manager # Check overall workflow status
```

**Step 5: Continue or Complete**

If more feedback: Repeat Step 3

If approved: Task complete, return to Step 1

### **🎭 Jules Mode Workflow**

**Jules Mode** is specifically designed for AI coding agents:

```bash
pnpm run pr-jules
```

**Step 1:** Copies branch name (e.g., `feature/GRE-213-disable-donations-toggle`) for the task input in Jules

**Step 2:** After Enter press, copies full discussion with context to provide to Jules

**Perfect for Jules because:**

1. Branch name sets proper context (updates branch if it is the exact same when you press "Publish Branch")
2. Full discussion provides comprehensive feedback
3. No need to manually navigate between platforms
4. Automatic priority classification helps focus on critical items

### **⚡ Quick Context Switching**

```bash
# Currently working on PR, need context
pnpm run pr # Auto-detect current branch

# Need to review specific issue
pnpm run pr GRE-456 # Extract Linear issue + find GitHub PR

# Need to review specific PR
pnpm run pr 123 # Extract GitHub PR + find Linear issue
```

### **📊 Batch Processing**

```bash
# Process all PRs needing attention
pnpm run pr-list-needing-update
# Choose 'j' for each PR to run Jules mode automatically

# Start multiple new features
pnpm run pr-list-linear-issues
# Choose 'j' for each issue to extract context
```

## ⚙️ Setup Guide

### **Prerequisites**

- **Node.js 18+** with pnpm
- **GitHub CLI** (`gh`) installed and authenticated
- **Linear account** with API access (optional but highly recommended)
- **Google Jules** or similar AI coding agent

### **Installation**
Clone this repository
```
git clone https://github.com/iHildy/google-jules-workflow.git
```
```
cd google-jules-workflow
```

Install dependencies
```
pnpm install child_process @linear/sdk clipboardy dotenv @google/genai readline
```

Authenticate GitHub CLI (if not done)
```
gh auth login
```

Test the setup
```
pnpm run pr-manager --help
```

### **Environment Configuration**

Create a `.env` file in the project root:

```bash
# Required for Linear integration (highly recommended)
LINEAR_API_KEY=your_linear_api_key_here
# Required for AI summaries (optional but useful)
GEMINI_API_KEY=your_gemini_api_key_here
```

**Getting API Keys:**

- **Linear API Key**: Linear Settings → API → Personal API Keys
- **Gemini API Key**: [Google AI Studio](https://aistudio.google.com/) → Get API Key

### **Package.json Integration**

Add these scripts to your project's `package.json`:
```json
{
  "scripts": {
    "pr": "tsx ./scripts/pr-workflow.ts",
    "pr-jules": "tsx ./scripts/pr-workflow.ts --jules",
    "pr-summary": "tsx ./scripts/pr-workflow.ts --summary",
    "pr-js": "tsx ./scripts/pr-workflow.ts --jules --summary",
    "pr-manager": "tsx ./scripts/pr-manager.ts",
    "pr-assign-copilot": "tsx ./scripts/pr-manager.ts assign-copilot",
    "pr-list-needing-review": "tsx ./scripts/pr-manager.ts list-needing-review",
    "pr-list-needing-update": "tsx ./scripts/pr-manager.ts list-needing-update",
    "pr-list-linear-issues": "tsx ./scripts/pr-manager.ts list-linear-issues",
    "extract-pr": "tsx ./scripts/extract-pr-discussion.ts"
  }
}
```

## ✨ Key Features

### **🔗 Unified Context Extraction**
- **Smart Linking**: Automatically connects Linear issues with GitHub PRs
- **Branch Intelligence**: Parses branch names to find related items
- **Interactive Fallback**: Prompts when auto-detection fails

### **🤖 AI-Optimized Workflows**

- **Jules Mode**: Two-step clipboard copying optimized for AI agents (like Jules's UI)
- **Gemini Summaries**: AI-powered analysis with actionable insights
- **Smart Prioritization**: Automatic classification of feedback importance
- **Debug Output**: Shows exactly what's being copied to clipboard

### **📊 Workflow Automation**

- **Review Assignment**: Automatic Copilot reviewer assignment
- **Status Tracking**: Monitor Jules → Copilot → Jules feedback loops
- **Priority Sorting**: Linear urgency-based ordering
- **Interactive Processing**: Batch operations with user control

### **🎯 Developer Experience**

- **Auto-Detection**: Context-aware branch and repository analysis
- **Parallel Processing**: Fast data fetching from multiple APIs
- **Error Handling**: Comprehensive logging and fallback behavior
- **Clean Output**: Reduced noise, focused on actionable information

## 🔧 Advanced Usage

### **Custom Aliases**

Add these to your shell profile (`.zshrc`, `.bashrc`):

```bash
alias pr="pnpm run pr"
alias prj="pnpm run pr-jules"  # Jules mode
alias prs="pnpm run pr-summary"  # AI summary
alias prjs="pnpm run pr-js"  # Jules + Summary
alias prm="pnpm run pr-manager"  # Workflow status
```

### **Integration with Other Tools**

**VSCode Tasks** (`.vscode/tasks.json`):

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "PR Context",
      "type": "shell",
      "command": "pnpm run pr-jules",
      "group": "build"
    }
  ]
}
```

**Git Hooks** (`.git/hooks/post-checkout`):

```bash
#!/bin/sh
pnpm run pr 2>/dev/null || true
```

## 📊 Priority Classification System

Comments are automatically classified using intelligent keyword detection:

- **🚨 HIGH**: `security`, `breaking`, `critical`, `urgent`, `error`, `fail`, `bug`, `broken`
- **⚠️ MEDIUM**: `performance`, `optimization`, `refactor`, `improvement`, `consider`, `should`
- **ℹ️ LOW**: `nitpick`, `style`, `formatting`, `typo`, `minor`, `suggestion`

## 🤖 Supported Integrations

### **GitHub**

- Pull requests, reviews, comments, commits
- Automatic Copilot reviewer assignment
- Bot detection and filtering

### **Linear**

- Issues, priorities, labels, attachments
- Branch name parsing for issue linking
- Priority-based sorting

### **AI Models**

- Google Gemini for summaries and analysis
- Extensible for other AI providers

## 🔍 Auto-Detection Logic

1. **Branch Analysis**: Extracts Linear IDs (e.g., `GRE-123`) from branch names like `feature/GRE-123-description`
2. **PR Linking**: Finds PRs associated with Linear issue branches
3. **Attachment Scanning**: Discovers GitHub links in Linear issue attachments
4. **Fallback Prompting**: Interactive input when auto-detection fails

## 🚀 Performance Features

- **Parallel API Calls**: Reviews, comments, and PR details fetched simultaneously
- **Smart Caching**: Avoids redundant API calls within sessions
- **Processing Time Tracking**: Shows execution time for optimization
- **Optimized Output**: Truncates verbose code contexts for readability
- **Clean Logging**: Reduced verbose output, focused on actionable information

## 🐛 Troubleshooting

### **Common Issues**

**Clipboard not working:**

- Check terminal output for "📋 CONTENT BEING COPIED TO CLIPBOARD" section
- Verify clipboard permissions on macOS
- Try manual copy from debug output

**GitHub API errors:**

- Ensure `gh auth login` is completed
- Check repository permissions
- Verify GitHub CLI version (`gh --version`)

**Linear API issues:**

- Verify `LINEAR_API_KEY` in `.env` file
- Check Linear API key permissions
- Ensure team/workspace access

### **Debug Mode**

```bash
# Enable detailed logging
pnpm run pr 123 --debug

# Save output for inspection
pnpm run pr 123 --save debug-output.md
```

## 🎯 Best Practices

1. **Start with Auto-Detection**: `pnpm run pr` works for most cases
2. **Use Jules Mode for AI Sessions**: `pnpm run pr-jules` for streamlined workflows
3. **Daily Workflow Checks**: `pnpm run pr-manager` for status overview
4. **Address Reviews Promptly**: `pnpm run pr-list-needing-update` before new work
5. **Save Important Extractions**: Use `--save` flag for complex discussions

## 📄 License

MIT License - feel free to adapt for your own Jules workflows!

## 🤝 Contributing

Found a bug or have a feature request? Please open an issue or submit a PR.

---

**Made with ❤️ to make Google Jules development enjoyable.**
```