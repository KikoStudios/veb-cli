import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { existsSync, mkdirSync } from "node:fs";
import chalk from "chalk";

export async function fetchConfigFromGitHub(repoUrl) {
  const tempDir = path.join(process.cwd(), ".veb-temp");
  const configPath = path.join(tempDir, "project.vexp.config");

  try {
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }

    const normalizedUrl = repoUrl.endsWith(".git") ? repoUrl : `${repoUrl}.git`;
    let baseUrl = normalizedUrl.replace(/\.git$/, "");
    
    // Handle different GitHub URL formats
    if (baseUrl.includes("github.com/")) {
      baseUrl = baseUrl.replace(/^https?:\/\/github\.com\//, "").replace(/^git@github\.com:/, "");
    }
    
    console.log(chalk.blue(`📥 Fetching project.vexp.config from ${baseUrl}...`));
    
    // Use fetch API (Bun/Node 18+)
    if (typeof globalThis.fetch === "undefined") {
      throw new Error("Fetch API not available");
    }
    
    // Step 1: Get repository info to find default branch
    let defaultBranch = null;
    try {
      const repoApiUrl = `https://api.github.com/repos/${baseUrl}`;
      const repoResponse = await globalThis.fetch(repoApiUrl, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'veb-cli'
        }
      });
      
      if (repoResponse.ok) {
        const repoData = await repoResponse.json();
        defaultBranch = repoData.default_branch || "main";
      } else if (repoResponse.status === 404) {
        throw new Error(`Repository not found or is private: ${baseUrl}`);
      } else if (repoResponse.status === 403) {
        // Rate limit or forbidden
        console.log(chalk.yellow(`⚠️  GitHub API rate limit or access denied. Trying common branch names...`));
      }
    } catch (err) {
      // If API fails, fall back to common branch names
      if (!err.message.includes("Repository not found")) {
        console.log(chalk.yellow(`⚠️  Could not fetch repo info: ${err.message}`));
      } else {
        throw err;
      }
    }
    
    // Step 2: Try to fetch the config file
    // Try default branch first, then fallback to main/master
    const branches = defaultBranch ? [defaultBranch, "main", "master"] : ["main", "master"];
    
    for (const branch of branches) {
      try {
        const url = `https://raw.githubusercontent.com/${baseUrl}/${branch}/project.vexp.config`;
        const response = await globalThis.fetch(url, {
          headers: {
            'Accept': 'text/plain',
            'User-Agent': 'veb-cli'
          }
        });
        
        if (response.ok) {
          const content = await response.text();
          // Check if it's a valid config (not a 404 page or HTML error)
          if (content && 
              content.trim().length > 0 &&
              !content.includes("404: Not Found") && 
              !content.includes("<!DOCTYPE") &&
              !content.includes("<html") &&
              !content.startsWith("Not Found") &&
              (content.includes("name:") || content.includes("run:") || content.includes("ask:"))) {
            await fs.writeFile(configPath, content, "utf8");
            console.log(chalk.green(`✓ Config fetched from ${branch} branch`));
            return configPath;
          }
        } else if (response.status === 404) {
          // File not found in this branch, try next
          continue;
        } else {
          // Other error
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (err) {
        // Try next branch
        if (branch === branches[branches.length - 1]) {
          throw new Error(`Config file not found in any branch: ${err.message}`);
        }
        continue;
      }
    }
    
    throw new Error("Config file not found in repository");
  } catch (error) {
    throw new Error(`Failed to fetch config: ${error.message}`);
  }
}

export async function cleanupTempDir() {
  const tempDir = path.join(process.cwd(), ".veb-temp");
  if (existsSync(tempDir)) {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

