import { promises as fs } from "fs";
import path from "path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get VEB data directory (similar to .veb directory)
const VEB_DATA_DIR = path.join(os.homedir(), ".veb");
const PROCESSES_FILE = path.join(VEB_DATA_DIR, "processes.json");

/**
 * Ensure VEB data directory exists
 */
async function ensureDataDir() {
  if (!existsSync(VEB_DATA_DIR)) {
    await fs.mkdir(VEB_DATA_DIR, { recursive: true });
  }
}

/**
 * Load running processes from disk
 */
export async function loadProcesses() {
  await ensureDataDir();
  
  if (!existsSync(PROCESSES_FILE)) {
    return [];
  }
  
  try {
    const content = await fs.readFile(PROCESSES_FILE, "utf8");
    return JSON.parse(content);
  } catch (error) {
    return [];
  }
}

/**
 * Save processes to disk
 */
export async function saveProcesses(processes) {
  await ensureDataDir();
  await fs.writeFile(PROCESSES_FILE, JSON.stringify(processes, null, 2), "utf8");
}

/**
 * Register a new running process
 */
export async function registerProcess(processInfo) {
  const processes = await loadProcesses();
  
  const processData = {
    id: processInfo.id || `veb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: processInfo.type || "unknown", // "install", "run", "dev", etc.
    project: processInfo.project || null,
    alias: processInfo.alias || null,
    repoUrl: processInfo.repoUrl || null,
    directory: processInfo.directory || null,
    command: processInfo.command || null,
    pid: processInfo.pid || (typeof process !== 'undefined' ? process.pid : null),
    startedAt: processInfo.startedAt || new Date().toISOString(),
    status: processInfo.status || "running", // "running", "completed", "failed", "stopped"
    metadata: processInfo.metadata || {}
  };
  
  processes.push(processData);
  await saveProcesses(processes);
  
  return processData.id;
}

/**
 * Update process status
 */
export async function updateProcess(processId, updates) {
  const processes = await loadProcesses();
  const index = processes.findIndex(p => p.id === processId);
  
  if (index === -1) {
    return false;
  }
  
  processes[index] = {
    ...processes[index],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  
  await saveProcesses(processes);
  return true;
}

/**
 * Remove a process
 */
export async function removeProcess(processId) {
  const processes = await loadProcesses();
  const filtered = processes.filter(p => p.id !== processId);
  await saveProcesses(filtered);
  return processes.length !== filtered.length;
}

/**
 * Clean up completed/failed processes older than 24 hours
 */
export async function cleanupOldProcesses() {
  const processes = await loadProcesses();
  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;
  
  const filtered = processes.filter(process => {
    // Keep running processes
    if (process.status === "running") {
      return true;
    }
    
    // Remove completed/failed processes older than 24 hours
    const startedAt = new Date(process.startedAt).getTime();
    return (now - startedAt) < dayInMs;
  });
  
  if (filtered.length !== processes.length) {
    await saveProcesses(filtered);
  }
  
  return processes.length - filtered.length;
}

/**
 * Get session information
 */
export async function getSessionInfo() {
  const processes = await loadProcesses();
  const running = processes.filter(p => p.status === "running");
  const completed = processes.filter(p => p.status === "completed").length;
  const failed = processes.filter(p => p.status === "failed").length;
  
  return {
    total: processes.length,
    running: running.length,
    completed,
    failed,
    processes: running
  };
}

/**
 * Display processes in a formatted way
 */
export function displayProcesses(processes, options = {}) {
  const { verbose = false, all = false } = options;
  
  if (processes.length === 0) {
    console.log(chalk.gray("No processes found."));
    return;
  }
  
  // Filter processes based on options
  let filtered = processes;
  if (!all) {
    filtered = processes.filter(p => p.status === "running");
  }
  
  if (filtered.length === 0) {
    console.log(chalk.gray("No running processes."));
    return;
  }
  
  console.log(chalk.cyan(`\n📊 VEB Processes (${filtered.length}/${processes.length})\n`));
  
  // Group by type
  const byType = {};
  filtered.forEach(process => {
    const type = process.type || "unknown";
    if (!byType[type]) {
      byType[type] = [];
    }
    byType[type].push(process);
  });
  
  // Display by type
  Object.entries(byType).forEach(([type, typeProcesses]) => {
    console.log(chalk.bold(`${type.toUpperCase()} (${typeProcesses.length})`));
    
    typeProcesses.forEach(process => {
      const statusColor = 
        process.status === "running" ? chalk.green :
        process.status === "completed" ? chalk.blue :
        process.status === "failed" ? chalk.red :
        chalk.yellow;
      
      const statusIcon = 
        process.status === "running" ? "●" :
        process.status === "completed" ? "✓" :
        process.status === "failed" ? "✗" :
        "○";
      
      console.log(`  ${statusColor(statusIcon)} ${chalk.bold(process.project || process.alias || "Unknown")}`);
      
      if (verbose || process.directory) {
        console.log(chalk.gray(`     Directory: ${process.directory || "N/A"}`));
      }
      
      if (verbose || process.command) {
        console.log(chalk.gray(`     Command: ${process.command || "N/A"}`));
      }
      
      if (verbose) {
        console.log(chalk.gray(`     PID: ${process.pid || "N/A"}`));
        console.log(chalk.gray(`     Started: ${new Date(process.startedAt).toLocaleString()}`));
        if (process.repoUrl) {
          console.log(chalk.gray(`     Repo: ${process.repoUrl}`));
        }
      }
      
      console.log();
    });
  });
  
  // Show summary
  if (!verbose) {
    console.log(chalk.gray(`Use --verbose for detailed information`));
  }
}

