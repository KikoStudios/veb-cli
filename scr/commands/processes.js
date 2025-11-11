import chalk from "chalk";
import { loadProcesses, getSessionInfo, displayProcesses, cleanupOldProcesses } from "../utils/runtime-manager.js";

export async function execute(target, params) {
  // Clean up old processes first
  const cleaned = await cleanupOldProcesses();
  if (cleaned > 0) {
    console.log(chalk.gray(`Cleaned up ${cleaned} old process(es)`));
  }
  
  // Get session info
  const session = await getSessionInfo();
  
  // Load all processes
  const processes = await loadProcesses();
  
  // Display processes
  displayProcesses(processes, {
    verbose: params.verbose || params.v,
    all: params.all || params.a
  });
  
  // Show session summary
  if (!params.verbose && !params.v) {
    console.log(chalk.cyan(`\nSession: ${session.running} running, ${session.completed} completed, ${session.failed} failed`));
  }
}

