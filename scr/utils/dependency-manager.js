import chalk from "chalk";
import { spawn, execSync } from "child_process";
import { existsSync } from "node:fs";
import path from "path";

function checkCommand(command) {
  try {
    execSync(`which ${command}`, { stdio: "ignore" });
    return true;
  } catch {
    try {
      execSync(`where ${command}`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
}

function installDocker() {
  return new Promise((resolve, reject) => {
    console.log(chalk.yellow("⚠️  Docker not found. Please install Docker manually:"));
    console.log(chalk.gray("  https://docs.docker.com/get-docker/"));
    reject(new Error("Docker installation required"));
  });
}

function installNode() {
  return new Promise((resolve, reject) => {
    console.log(chalk.yellow("⚠️  Node.js not found. Please install Node.js manually:"));
    console.log(chalk.gray("  https://nodejs.org/"));
    reject(new Error("Node.js installation required"));
  });
}

function installBun() {
  return new Promise((resolve, reject) => {
    console.log(chalk.blue("📦 Installing Bun..."));
    const proc = spawn("curl", ["-fsSL", "https://bun.sh/install", "|", "bash"], {
      stdio: "inherit",
      shell: true,
    });
    
    proc.on("exit", (code) => {
      if (code === 0) {
        console.log(chalk.green("✓ Bun installed"));
        resolve();
      } else {
        console.log(chalk.yellow("⚠️  Bun installation failed. Please install manually:"));
        console.log(chalk.gray("  https://bun.sh/"));
        reject(new Error("Bun installation failed"));
      }
    });
  });
}

async function ensureDocker(projectDir) {
  if (checkCommand("docker")) {
    console.log(chalk.green("✓ Docker found"));
    return true;
  }
  return installDocker();
}

async function ensureNode(projectDir) {
  if (checkCommand("node")) {
    console.log(chalk.green("✓ Node.js found"));
    return true;
  }
  return installNode();
}

async function ensureBun(projectDir) {
  if (checkCommand("bun")) {
    console.log(chalk.green("✓ Bun found"));
    return true;
  }
  return installBun();
}

const dependencyHandlers = {
  docker: ensureDocker,
  node: ensureNode,
  bun: ensureBun,
  nodejs: ensureNode,
  "node.js": ensureNode,
};

export async function ensureDependencies(dependencies, projectDir) {
  if (!dependencies || !Array.isArray(dependencies)) {
    return;
  }

  for (const dep of dependencies) {
    const depName = typeof dep === "string" ? dep.toLowerCase().trim() : dep.name?.toLowerCase().trim();
    if (!depName) continue;

    const handler = dependencyHandlers[depName];
    if (handler) {
      try {
        await handler(projectDir);
      } catch (error) {
        console.log(chalk.yellow(`⚠️  ${depName}: ${error.message}`));
      }
    } else {
      console.log(chalk.yellow(`⚠️  Unknown dependency: ${depName}`));
    }
  }
}

