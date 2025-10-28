import chalk from "chalk";
import path from "path";
import fs from "fs/promises";
import { parseVexpConfig, formatProjectInfo, processAskSection, processRunSection } from "../utils/vexp-parser.js";

export async function execute(target, params) {
  const configPath = path.resolve(process.cwd(), "project.vexp.config");
  
  if (target === "compile") {
    console.log(chalk.magenta("Compiling project.vexp.config..."));
    
    try {
      const config = await parseVexpConfig(configPath);
      if (!config) {
        console.log(chalk.red("Error: Could not parse project.vexp.config"));
        return;
      }
      
      // Process the config sections
      const processedAsk = processAskSection(config.ask);
      const processedRun = processRunSection(config.run);
      
      console.log(chalk.green("Successfully compiled project.vexp.config"));
      console.log(chalk.gray(`Found ${processedAsk.length} questions and ${processedRun.length} run commands`));
    } catch (err) {
      console.error(chalk.red(`Error compiling config: ${err.message}`));
    }
  } else if (target === "config") {
    try {
      const config = await parseVexpConfig(configPath);
      if (!config) {
        console.log(chalk.red("Error: Could not parse project.vexp.config"));
        return;
      }
      
      // Check if raw output is requested
      const raw = params && (params.r || params.raw);
      const output = formatProjectInfo(config, raw);
      console.log(output);
    } catch (err) {
      console.error(chalk.red(`Error reading config: ${err.message}`));
    }
  } else {
    console.log(chalk.yellow("VEXP commands: compile, config"));
    console.log(chalk.gray("Use 'vexp config' to view project information"));
    console.log(chalk.gray("Use 'vexp config --r' for raw YAML output"));
  }
}
