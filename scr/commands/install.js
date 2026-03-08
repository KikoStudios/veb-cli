import chalk from "chalk";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import os from "os";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { parseVexpConfig } from "../utils/vexp-parser.js";
import { ensureDependencies } from "../utils/dependency-manager.js";
import { fetchConfigFromGitHub, cleanupTempDir } from "../utils/github-fetcher.js";
import { detectOS } from "../utils/os-detector.js";
import { processRunSection } from "../utils/vexp-parser.js";
import { registerProcess, updateProcess } from "../utils/runtime-manager.js";
import { requireEnv } from "../utils/env.js";
const ROOT_DIR = fileURLToPath(new URL("../../", import.meta.url));

const convexUrl = requireEnv("CONVEX_URL");
const client = new ConvexHttpClient(convexUrl);

function parseGitHubUrl(input) {
  input = input.trim();
  
  if (input.includes("/") && !input.startsWith("http")) {
    return `https://github.com/${input}.git`;
  }
  
  if (input.startsWith("http://") || input.startsWith("https://")) {
    if (!input.endsWith(".git")) {
      input += ".git";
    }
    return input;
  }
  
  if (input.startsWith("git@")) {
    return input;
  }
  
  return null;
}

function extractAliasFromUrl(repoUrl) {
  const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (match) {
    return `${match[1]}/${match[2]}`.toLowerCase();
  }
  return null;
}

async function cloneRepo(repoUrl, targetDir) {
  return new Promise((resolve, reject) => {
    console.log(chalk.blue(`[↓] Cloning ${repoUrl}...`));
    const proc = spawn("git", ["clone", repoUrl, targetDir], {
      stdio: "inherit",
      shell: true,
    });
    
    proc.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Git clone failed with code ${code}`));
      }
    });
    
    proc.on("error", (err) => {
      reject(new Error(`Failed to execute git clone: ${err.message}`));
    });
  });
}

async function executeCommand(cmd, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    
    const proc = spawn(cmd, {
      stdio: ["inherit", "pipe", "pipe"],
      shell: true,
      cwd,
    });
    
    proc.stdout.on("data", (data) => {
      const output = data.toString();
      stdout += output;
      process.stdout.write(data);
    });
    
    proc.stderr.on("data", (data) => {
      const output = data.toString();
      stderr += output;
      process.stderr.write(data);
    });
    
    proc.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        // Check for common non-fatal errors
        const errorOutput = (stdout + stderr).toLowerCase();
        
        // Git clone: destination already exists - check if it's a valid repo
        if (cmd.trim().includes("git clone") && (errorOutput.includes("already exists") || errorOutput.includes("fatal: destination path"))) {
          // Extract the destination directory from the command
          // Handle various formats: git clone url dir, git clone url "dir", etc.
          const cloneMatch = cmd.match(/git clone\s+(?:[^\s]+|"[^"]+"|'[^']+')\s+(.+?)(?:\s|$)/);
          if (cloneMatch) {
            let destDir = cloneMatch[1].trim().replace(/^["']|["']$/g, "");
            // Remove any trailing commands (like && npm install)
            destDir = destDir.split(/\s+&&/)[0].trim();
            const fullPath = path.resolve(cwd, destDir);
            
            // Check if it's already a valid git repository
            if (existsSync(fullPath) && existsSync(path.join(fullPath, ".git"))) {
              console.log(chalk.yellow(`  [!] Directory '${destDir}' already exists and is a git repository. Skipping clone.`));
              resolve();
              return;
            } else if (existsSync(fullPath)) {
              // Directory exists but not a git repo - this is still okay, just skip
              console.log(chalk.yellow(`  [!] Directory '${destDir}' already exists. Skipping clone.`));
              resolve();
              return;
            }
          } else {
            // Can't parse command, but it's a git clone error about existing directory
            // Assume it's safe to continue
            console.log(chalk.yellow(`  [!] Git clone failed (directory may already exist). Continuing...`));
            resolve();
            return;
          }
        }
        
        // npm install: if node_modules exists, might be okay to continue
        if ((cmd.includes("npm install") || cmd.includes("npm i")) && errorOutput.includes("already")) {
          console.log(chalk.yellow(`  [!] Some packages may already be installed. Continuing...`));
          resolve();
          return;
        }
        
        reject(new Error(`Command failed with code ${code}`));
      }
    });
    
    proc.on("error", (err) => {
      reject(new Error(`Failed to execute command: ${err.message}`));
    });
  });
}

export async function execute(target, params) {
  if (!target) {
    console.log(chalk.yellow("Usage: veb install <repo-url-or-alias>"));
    console.log(chalk.gray("Examples:"));
    console.log(chalk.gray("  veb install username/repo"));
    console.log(chalk.gray("  veb install https://github.com/username/repo"));
    console.log(chalk.gray("  veb install my-app  (if published)"));
    return;
  }

  // Set verbose mode in environment for other modules
  if (params.verbose || params.v) {
    process.env.VEB_VERBOSE = "1";
  }

  try {
    let repoUrl = null;
    let alias = null;

    // Check if this is a simple name (no slash) - must be a published alias
    if (!target.includes("/") && !target.startsWith("http") && !target.startsWith("git@")) {
      alias = target.toLowerCase().trim();
      console.log(chalk.blue(`[?] Looking up published app: ${alias}`));
      
      const aliasRecord = await client.query(api.aliases.getAlias, { alias });
      if (aliasRecord) {
        repoUrl = aliasRecord.repoUrl;
        await client.mutation(api.aliases.updateLastUsed, { aliasId: aliasRecord._id });
        console.log(chalk.green(`[+] Found published app: ${repoUrl}`));
      } else {
        console.log(chalk.red(`[-] App "${alias}" not found`));
        console.log(chalk.yellow("This app hasn't been published yet. Use the full GitHub URL:"));
        console.log(chalk.gray("  veb install username/repo"));
        return;
      }
    } else if (target.includes("/") && !target.startsWith("http") && !target.startsWith("git@")) {
      // GitHub shorthand (username/repo)
      alias = target.toLowerCase().trim();
      console.log(chalk.blue(`[?] Looking up alias: ${alias}`));
      
      const aliasRecord = await client.query(api.aliases.getAlias, { alias });
      if (aliasRecord) {
        repoUrl = aliasRecord.repoUrl;
        await client.mutation(api.aliases.updateLastUsed, { aliasId: aliasRecord._id });
        console.log(chalk.green(`[+] Found alias: ${repoUrl}`));
      } else {
        repoUrl = parseGitHubUrl(target);
        if (!repoUrl) {
          console.log(chalk.red(`[-] Alias "${alias}" not found. Use full GitHub URL on first install.`));
          return;
        }
      }
    } else {
      repoUrl = parseGitHubUrl(target);
      if (!repoUrl) {
        console.log(chalk.red(`[-] Invalid repository URL or alias: ${target}`));
        return;
      }
    }

    if (!repoUrl) {
      console.log(chalk.red("[-] Could not determine repository URL"));
      return;
    }

    const extractedAlias = extractAliasFromUrl(repoUrl);
    if (extractedAlias && !alias) {
      alias = extractedAlias;
      const existing = await client.query(api.aliases.getAliasByUrl, { repoUrl: repoUrl.toLowerCase() });
      if (!existing) {
        await client.mutation(api.aliases.createAlias, { alias, repoUrl: repoUrl.toLowerCase() });
        console.log(chalk.green(`[+] Created alias: ${alias}`));
      }
    }

    const normalizedUrl = repoUrl.toLowerCase();
    if (extractedAlias && !alias) {
      alias = extractedAlias;
    }

    if (params.verbose || params.v) {
      console.log(chalk.blue(`[·] Fetching project.vexp.config...`));
    }
    
    let config = null;
    let configPath = null;
    let configFromTemp = false;
    
    const repoName = path.basename(repoUrl, ".git");
    const installDir = path.resolve(process.cwd(), repoName);
    
    // Step 1: Try to fetch config from GitHub raw URL first
    try {
      configPath = await fetchConfigFromGitHub(repoUrl);
      config = await parseVexpConfig(configPath);
      configFromTemp = true;
      
      if (!config) {
        throw new Error("Failed to parse config");
      }
      
      if (params.verbose || params.v) {
        console.log(chalk.green(`[+] Config loaded from GitHub: ${config.name || "unnamed project"}`));
      }
    } catch (error) {
      // Step 2: If fetch failed, first try a shallow git clone into a temp dir
      if (!config) {
        if (params.verbose || params.v) {
          console.log(chalk.yellow(`[!] Could not fetch config from GitHub: ${error.message}`));
          console.log(chalk.blue(`[·] Attempting a shallow git clone to inspect the repository before falling back to local search...`));
        }
        const tempCloneDir = path.join(process.cwd(), ".veb-temp-clone");
        try {
          // Ensure clean temp clone dir
          if (existsSync(tempCloneDir)) {
            await fs.rm(tempCloneDir, { recursive: true, force: true });
          }
          await cloneRepo(repoUrl, tempCloneDir);
          const candidateConfig = path.join(tempCloneDir, "project.vexp.config");
          if (existsSync(candidateConfig)) {
            if (params.verbose || params.v) {
              console.log(chalk.green(`[+] Found project.vexp.config in remote clone`));
            }
            configPath = candidateConfig;
            config = await parseVexpConfig(configPath);
            configFromTemp = true;
          } else {
            if (params.verbose || params.v) {
              console.log(chalk.yellow(`[!] project.vexp.config not found in remote clone`));
            }
          }
        } catch (cloneErr) {
          if (params.verbose || params.v) {
            console.log(chalk.yellow(`[!] Remote clone attempt failed: ${cloneErr.message}`));
          }
        } finally {
          // clean temp clone dir if it exists
          try { await fs.rm(tempCloneDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
        }

        // If still no config, fallback to search for local clones in common locations
        if (!config) {
          if (params.verbose || params.v) {
            console.log(chalk.blue(`[·] Searching for local clone...`));
          }
        }
        
        // Search in multiple possible locations
        const searchPaths = [
          installDir, // Expected location (repo name in current dir)
          path.resolve(process.cwd(), "app"), // Common clone location
          path.resolve(process.cwd(), repoName), // Current dir with repo name
          path.resolve(os.homedir(), repoName), // Home directory
          path.resolve(os.homedir(), "downloads", repoName), // Downloads folder
          path.resolve(os.homedir(), "Downloads", repoName), // Downloads (capitalized)
        ];
        
        // Also search for any directory containing project.vexp.config in common locations
        const commonParentDirs = [
          process.cwd(),
          os.homedir(),
          path.resolve(os.homedir(), "downloads"),
          path.resolve(os.homedir(), "Downloads"),
        ];
        
        for (const parentDir of commonParentDirs) {
          if (existsSync(parentDir)) {
            try {
              const entries = await fs.readdir(parentDir, { withFileTypes: true });
              for (const entry of entries) {
                if (entry.isDirectory()) {
                  const configPath = path.join(parentDir, entry.name, "project.vexp.config");
                  if (existsSync(configPath)) {
                    // Check if this might be the right repo by checking git remote
                    const gitConfigPath = path.join(parentDir, entry.name, ".git", "config");
                    if (existsSync(gitConfigPath)) {
                      try {
                        const gitConfig = await fs.readFile(gitConfigPath, "utf8");
                        // Extract base URL from repoUrl for comparison
                        const repoUrlForMatch = repoUrl.toLowerCase().replace(/\.git$/, "").replace(/^https?:\/\/github\.com\//, "").replace(/^git@github\.com:/, "");
                        if (gitConfig.includes(repoUrl) || gitConfig.includes(repoUrlForMatch)) {
                          searchPaths.push(path.join(parentDir, entry.name));
                        }
                      } catch (e) {
                        // Ignore git config read errors
                      }
                    }
                  }
                }
              }
            } catch (e) {
              // Ignore directory read errors
            }
          }
        }
        
        // Check all search paths
        for (const searchPath of searchPaths) {
          if (existsSync(searchPath)) {
            const localConfigPath = path.join(searchPath, "project.vexp.config");
            if (existsSync(localConfigPath)) {
              console.log(chalk.blue(`[·] Found local config at: ${searchPath}`));
              configPath = localConfigPath;
              config = await parseVexpConfig(configPath);
              if (config) {
                console.log(chalk.green(`[+] Config loaded from local: ${config.name || "unnamed project"}`));
                break;
              }
            }
          }
        }
        
        // If still no config, we cannot proceed - config is required
        if (!config) {
          console.log(chalk.red(`\n[-] Cannot proceed without project.vexp.config`));
          console.log(chalk.yellow(`  The repository must contain a project.vexp.config file.`));
          console.log(chalk.yellow(`  Searched in:`));
          for (const searchPath of searchPaths.slice(0, 5)) {
            console.log(chalk.gray(`    - ${searchPath}`));
          }
          console.log(chalk.yellow(`\n  Options:`));
          console.log(chalk.yellow(`  1. Ensure the repository has a project.vexp.config file`));
          console.log(chalk.yellow(`  2. Clone the repository manually and ensure the config file is present`));
          console.log(chalk.yellow(`  3. Check if the config file is on a different branch`));
          await cleanupTempDir();
          return;
        }
      }
    }

    const currentOS = detectOS();
    if (params.verbose || params.v) {
      console.log(chalk.gray(`Detected OS: ${currentOS}`));
    }

    process.env.REPO_URL = repoUrl;
    process.env.bi_REPO_URL = repoUrl;
    
    // Step 4: Execute install commands from config (config controls everything)
    let processId = null;
    try {
      const allCommands = processRunSection(config, currentOS);
      const installCommands = allCommands.filter(cmd => cmd.phase === 'install');
      
      if (installCommands.length > 0) {
        // Register install process
        processId = await registerProcess({
          type: "install",
          project: config.name || repoName,
          alias: alias || null,
          repoUrl: repoUrl,
          directory: installDir,
          command: installCommands.map(c => c.command).join(" && "),
          pid: process.pid,
          status: "running"
        });
        
        console.log(chalk.blue(`Installing ${config.name || repoName}...`));
        const builtIns = { REPO_URL: repoUrl };

        // Track a mutable working directory so `cd <dir>` commands affect subsequent commands
        let currentCwd = process.cwd();

        for (const cmd of installCommands) {
          try {
            const commandStr = cmd.execute({}, builtIns);
            if (params.verbose || params.v) {
              console.log(chalk.gray(`| ${commandStr}`));
            }

            // If the command is a standalone 'cd <dir>' (no &&, no other chaining), update cwd
            const cdMatch = commandStr.trim().match(/^cd\s+['"]?([^'"\s]+)['"]?\s*$/i);
            if (cdMatch) {
              const targetDir = cdMatch[1];
              // Resolve relative to currentCwd
              currentCwd = path.resolve(currentCwd, targetDir);
              // Don't spawn a shell for a simple directory change
              continue;
            }

            // Execute other commands in the current working directory
            await executeCommand(commandStr, currentCwd);
          } catch (error) {
            // Check if it's a git clone error for existing directory
            const errorMsg = error.message.toLowerCase();
            if (errorMsg.includes("already exists") || errorMsg.includes("code 128")) {
              // Check if the command is a git clone
              const cmdStr = cmd.execute({}, builtIns);
              if (cmdStr.includes("git clone")) {
                console.log(chalk.yellow(`  [!] Directory already exists. If it's a valid repository, continuing...`));
                // Don't throw - continue with next commands
                continue;
              }
            }
            
            console.log(chalk.yellow(`[!] Command failed: ${error.message}`));
            // For non-critical errors, log but continue
            // Only fail completely for critical errors
            const isCritical = !errorMsg.includes("already exists") && 
                              !errorMsg.includes("code 128") &&
                              !errorMsg.includes("up to date");
            
            if (isCritical) {
              if (processId) {
                await updateProcess(processId, { status: "failed", metadata: { error: error.message } });
              }
              throw error;
            }
          }
        }
        
        // Update process status
        if (processId) {
          await updateProcess(processId, { status: "completed" });
        }
      } else {
        // No install commands in config - this means config doesn't want to install anything
        console.log(chalk.gray(`No install commands in config - skipping installation`));
      }
    } catch (error) {
      if (processId) {
        await updateProcess(processId, { status: "failed", metadata: { error: error.message } });
      }
      if (error.message.includes("OS not compatible")) {
        console.log(chalk.red(`\n[-] ${error.message}`));
        await cleanupTempDir();
        return;
      }
      throw error;
    }

    if (config.dependencies) {
      if (params.verbose || params.v) {
        console.log(chalk.blue("[*] Checking dependencies..."));
      }
      // Try to find project directory - could be in installDir or somewhere else based on config commands
      const projectDir = existsSync(installDir) ? installDir : process.cwd();
      await ensureDependencies(config.dependencies, projectDir);
    }

    await cleanupTempDir();

    // Determine actual project directory after install commands ran
    // Check common locations where config might have cloned/extracted to
    let actualProjectDir = installDir;
    if (!existsSync(installDir)) {
      // Config commands might have created a different directory
      // Try to find directories that might contain project.vexp.config
      const possibleDirs = [
        path.resolve(process.cwd(), "app"),
        path.resolve(process.cwd(), repoName),
        process.cwd(),
      ];
      
      for (const dir of possibleDirs) {
        if (existsSync(dir) && existsSync(path.join(dir, "project.vexp.config"))) {
          actualProjectDir = dir;
          break;
        }
      }
    }

    console.log(chalk.green(`\n[+] Installed: ${config.name || repoName}`));
    if (params.verbose || params.v) {
      if (existsSync(actualProjectDir)) {
        console.log(chalk.gray(`  Project directory: ${actualProjectDir}`));
      }
      if (alias) {
        console.log(chalk.gray(`  Alias: ${alias}`));
      }
    }
    console.log(chalk.gray(`  Run with: veb run ${alias || repoName}`));

  } catch (error) {
    await cleanupTempDir();
    console.error(chalk.red(`\n[-] Error: ${error.message}`));
    process.exit(1);
  }
}
