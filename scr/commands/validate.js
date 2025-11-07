import { validateVexpConfig } from '../utils/validator.js';
import chalk from 'chalk';
import path from 'path';
import { fileURLToPath } from 'url';

// Handle both ESM and CommonJS environments
const __filename = typeof import.meta !== 'undefined' ? fileURLToPath(import.meta.url) : __filename;
const __dirname = typeof import.meta !== 'undefined' ? path.dirname(__filename) : __dirname;

export async function validateCommand(configFile, params) {
  // Get the config file path
  const configPath = configFile || 'project.vexp.config';
  const absolutePath = path.resolve(process.cwd(), configPath);
  
  console.log(chalk.blue(`Validating config file: ${configPath}`));
  
  console.log(chalk.blue(`Validating config file: ${configPath}`));
  
  try {
    const report = await validateVexpConfig(absolutePath);
    console.log(report.formatReport());
    
    // Return exit code based on score
    const score = report.getTotalScore();
    if (score < 70) {
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red(`Validation failed: ${error.message}`));
    process.exit(1);
  }
}