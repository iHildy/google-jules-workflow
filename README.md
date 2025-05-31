# 🤖 Google Jules Workflow Optimizer

**Google Jules is a free\* AI coding agent but it has some quirks that make development very slow. These are the scripts I use to speed up my workflow.**

A comprehensive suite of TypeScript scripts designed to streamline AI-powered development workflows, specifically optimized for **Google Jules** (AI coding agent) integration with **GitHub Copilot**, **Linear** project management, and modern development practices.

## 📋 Table of Contents

- [Why These Scripts?](#-why-these-scripts)
- [Quick Installation](#-quick-installation)
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

## ⚡ Quick Installation

### **Option 1: Global Installation (Recommended)**

Install globally for system-wide access:

```bash
npm install -g @ihildy/google-jules-workflow
```

Then use commands directly:

```bash
jules-pr --help
jules-pr-manager
jules-extract-pr
```

### **Option 2: One-time Usage**

Run commands without installing:

```bash
npx @ihildy/google-jules-workflow jules-pr
npx @ihildy/google-jules-workflow jules-pr-manager
```

### **Option 3: Project Installation**

Install in your project:

```bash
npm install @ihildy/google-jules-workflow
# or
pnpm add @ihildy/google-jules-workflow
# or
yarn add @ihildy/google-jules-workflow
```

Then use via npm scripts or npx:

```bash
npx jules-pr --help
# or add to your package.json scripts
```

<details>
<summary><strong>📦 Manual Installation (Development)</strong></summary>

For development or customization:

1. **Clone the repository**

   ```bash
   git clone https://github.com/iHildy/google-jules-workflow.git
   cd google-jules-workflow
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   # or npm install / yarn install
   ```

3. **Authenticate GitHub CLI** (if not done)

   ```bash
   gh auth login
   ```

4. **Test the setup**

   ```bash
   pnpm run pr-manager --help
   ```

5. **Optional: Link globally for development**
   ```bash
   npm link
   # Now you can use jules-pr anywhere
   ```

</details>

## 📚 Quick Command Reference

### **🔧 Unified Commands (jules-pr)**

**Discussion Extraction:**

- **`jules-pr`** - Auto-detect current branch and extract unified PR/issue discussion for providing changes to jules
- **`jules-pr --jules`** - Jules mode: copy branch name first, then full discussion
- **`jules-pr --summary`** - Extract with AI-powered summary and insights
- **`jules-pr --jules --summary`** - Combined Jules mode + AI summary
- **`jules-pr <number|ID>`** - Extract specific GitHub PR or Linear issue

**Workflow Management:**

- **`jules-pr summary`** - Overview of PRs needing attention (default)
- **`jules-pr list-needing-review`** - PRs where Jules committed but Copilot hasn't reviewed
- **`jules-pr list-needing-update`** - PRs where Copilot reviewed but Jules hasn't addressed feedback
- **`jules-pr list-linear-issues`** - Linear issues without PRs ready for development
- **`jules-pr assign-copilot`** - Auto-assign GitHub Copilot to PRs where Jules made commits


### **🛠️ Alternative Usage (npm scripts)**

If you installed the package in your project, you can also use these scripts:

- **`npm run pr`** - Same as `jules-pr`
- **`npm run pr-jules`** - Same as `jules-pr --jules`
- **`npm run pr-summary`** - Same as `jules-pr --summary`
- **`npm run pr-js`** - Same as `jules-pr --jules --summary`
- **`npm run pr-manager`** - Same as `jules-pr summary`

## 🚀 Optimal Workflow Guide

### **Complete Task Flow (Start to Finish)**

**Step 1: Find Work**

Find issues ready for development

```bash
jules-pr list-linear-issues
```

Select issue → Provide context to Jules

**Step 2: Development** (once Jules is done and branch is published)

Request Copilot review for Jules to act on later.

```bash
jules-pr assign-copilot
```

**Step 3: Address Review**

Get PRs that have been reviewed by Copilot but not updated by Jules, provide the output to Jules to update the branch

```bash
jules-pr list-needing-update
```

**Step 4: Status Check**

```bash
jules-pr summary # Check overall workflow status
```

**Step 5: Continue or Complete**

If more feedback: Repeat Step 3

If approved: Task complete, return to Step 1

### **🎭 Jules Mode Workflow**

**Jules Mode** is specifically designed for AI coding agents:

```bash
jules-pr --jules
```

**Step 1:** Copies branch name (e.g., `feature/GRE-213-disable-donations-toggle`) for the task input in Jules

**Step 2:** After Enter press, copies full discussion with context to provide to Jules

**Perfect for Jules because:**

1. Branch name sets proper context (updates branch if it is the exact same when you press "Publish Branch")
2. Full discussion provides comprehensive feedback
3. Automatic priority classification helps focus on critical items

### **⚡ Quick Context Switching**

```bash
# Currently working on PR, need context
jules-pr # Auto-detect current branch

# Need to review specific issue
jules-pr GRE-456 # Extract Linear issue + find GitHub PR

# Need to review specific PR
jules-pr 123 # Extract GitHub PR + find Linear issue
```

### **📊 Batch Processing**

```bash
# Process all PRs needing attention
jules-pr list-needing-update
# Choose 'j' for each PR to run Jules mode automatically

# Start multiple new features
jules-pr list-linear-issues
# Choose 'j' for each issue to extract context
```

## ⚙️ Setup Guide

### **Prerequisites**

- **Node.js 18+** (with npm, pnpm, or yarn)
- **GitHub CLI** (`gh`) installed and authenticated
- **Linear account** with API access (optional but highly recommended)
- **Google Jules** or similar AI coding agent

### **Quick Setup**

1. **Install the package globally**

   ```bash
   npm install -g @ihildy/google-jules-workflow
   ```

2. **Authenticate GitHub CLI** (if not done)

   ```bash
   gh auth login
   ```

3. **Test the installation**

   ```bash
   jules-pr --help
   ```

4. **Recommended: Configure environment variables** (see below)

### **Environment Configuration**

Create a `.env` file in your project root or set environment variables:

```bash
# Required for Linear integration (highly recommended)
LINEAR_API_KEY=your_linear_api_key_here

# Required for AI summaries (optional but useful)
GEMINI_API_KEY=your_gemini_api_key_here
```

**Getting API Keys:**

- **Linear API Key**: Linear Settings → API → Personal API Keys
- **Gemini API Key**: [Google AI Studio](https://aistudio.google.com/) → Get API Key

### **Package.json Integration (Optional)**

If you want to add these to your project's package.json scripts:

```json
{
  "scripts": {
    "pr": "jules-pr",
    "pr-jules": "jules-pr --jules",
    "pr-summary": "jules-pr --summary",
    "pr-js": "jules-pr --jules --summary",
    "pr-manager": "jules-pr summary",
    "pr-assign-copilot": "jules-pr assign-copilot",
    "pr-list-needing-review": "jules-pr list-needing-review",
    "pr-list-needing-update": "jules-pr list-needing-update",
    "pr-list-linear-issues": "jules-pr list-linear-issues"
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
# Unified jules-pr commands (recommended)
alias pr="jules-pr"
alias prj="jules-pr --jules"  # Jules mode
alias prs="jules-pr --summary"  # AI summary
alias prjs="jules-pr --jules --summary"  # Jules + Summary
alias prm="jules-pr summary"  # Workflow status
alias pru="jules-pr list-needing-update"  # PRs needing Jules update
alias prl="jules-pr list-linear-issues"  # Linear issues ready for Jules

# Alternative using npx (if not globally installed)
alias pr="npx @ihildy/google-jules-workflow jules-pr"
alias prm="npx @ihildy/google-jules-workflow jules-pr summary"
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
      "command": "jules-pr",
      "args": ["--jules"],
      "group": "build"
    },
    {
      "label": "PR Workflow Status",
      "type": "shell",
      "command": "jules-pr",
      "args": ["summary"],
      "group": "build"
    },
    {
      "label": "PRs Needing Update",
      "type": "shell",
      "command": "jules-pr",
      "args": ["list-needing-update"],
      "group": "build"
    }
  ]
}
```

**Git Hooks** (`.git/hooks/post-checkout`):

```bash
#!/bin/sh
jules-pr 2>/dev/null || true
```

**GitHub Actions** (`.github/workflows/pr-automation.yml`):

```yaml
name: PR Automation
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  assign-copilot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "18"
      - run: npx @ihildy/google-jules-workflow jules-pr assign-copilot
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
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

**Command not found: `jules-pr`**

- Ensure you installed globally: `npm install -g @ihildy/google-jules-workflow`
- Or use npx: `npx @ihildy/google-jules-workflow jules-pr`
- Check your PATH includes npm global binaries: `npm bin -g`

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

**Permission errors on execution:**

- The scripts should be executable by default, but if you encounter issues:
  ```bash
  chmod +x ./node_modules/@ihildy/google-jules-workflow/scripts/*.ts
  ```

### **Debug Mode**

```bash
# Enable detailed logging
jules-pr 123 --debug

# Save output for inspection
jules-pr 123 --save debug-output.md

# Test specific workflow components
jules-pr summary --verbose
jules-pr list-needing-review
```

## 🎯 Best Practices

1. **Install Globally**: `npm install -g @ihildy/google-jules-workflow` for best experience
2. **Start with Auto-Detection**: `jules-pr` works for most cases
3. **Use Jules Mode for AI Sessions**: `jules-pr --jules` for streamlined workflows
4. **Daily Workflow Checks**: `jules-pr summary` for status overview
5. **Address Reviews Promptly**: `jules-pr list-needing-update` before new work
6. **Save Important Extractions**: Use `--save` flag for complex discussions
7. **Set Up Environment Variables**: Configure `LINEAR_API_KEY` and `GEMINI_API_KEY` for full functionality
8. **Use Aliases**: Set up shell aliases for faster access to commands
9. **Leverage Interactive Modes**: Use `jules-pr list-needing-update` and `jules-pr list-linear-issues` for guided workflows
10. **Backwards Compatibility**: Existing `jules-pr-manager` workflows continue to work with `jules-pr manager`

## 📄 License

MIT License - feel free to adapt for your own Jules workflows!

## 🤝 Contributing

Found a bug or have a feature request? Please open an issue or submit a PR.

---

**Made with ❤️ to make Google Jules development enjoyable.**
