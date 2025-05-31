import { execSync } from "child_process";
import { join } from "path";
import { existsSync } from "fs";

/**
 * Find tsx binary in various locations
 * This utility ensures scripts can run regardless of installation method
 */
export function findTsx(): string {
  const possiblePaths = [
    // When installed as a global package
    join(__dirname, "..", "node_modules", ".bin", "tsx"),
    // When running from local development
    join(__dirname, "..", "node_modules", ".bin", "tsx"),
    // Check current working directory's node_modules (when used in a project)
    join(process.cwd(), "node_modules", ".bin", "tsx"),
    // Fallback to global tsx
    "tsx",
  ];

  for (const tsxPath of possiblePaths) {
    try {
      if (tsxPath === "tsx") {
        // Try global tsx
        execSync("which tsx", { stdio: "ignore" });
        return "tsx";
      } else {
        // Check if file exists
        if (existsSync(tsxPath)) {
          return tsxPath;
        }
      }
    } catch (error) {
      // Continue to next option
    }
  }

  throw new Error(
    "tsx not found. Please install tsx globally: npm install -g tsx"
  );
}

/**
 * Execute a TypeScript file with proper tsx resolution
 */
export function executeTsFile(tsFile: string, args: string[] = []): string {
  const tsxPath = findTsx();
  const command = `"${tsxPath}" "${tsFile}" ${args.join(" ")}`;

  return execSync(command, {
    encoding: "utf-8",
    cwd: process.cwd(),
  });
}
