import chalk from "chalk";
import path from "path";
import fs from "fs/promises";
import { parseVexpConfig, formatProjectInfo, processAskSection, processRunSection } from "../utils/vexp-parser.js";
import { testAskSection, testRunSection } from "../utils/test-runner.js";

export async function execute(target, configFile, params) {
  // Handle validate command
  if (target === 'validate') {
    const { validateCommand } = await import('./validate.js');
    return validateCommand(configFile, params);
  }

  // If no config file provided for test commands, show error
  if ((target === 'atest' || target === 'rtest') && !configFile) {
    console.log(chalk.red('Error: Config file path is required for test commands'));
    console.log(chalk.gray('Usage: veb vexp atest <config-file> [--runtime/--r | --install/--i]'));
    console.log(chalk.gray('       veb vexp rtest <config-file> [--runtime/--r | --install/--i]'));
    return;
  }
  
  const configPath = configFile ? 
    path.resolve(process.cwd(), configFile) : 
    path.resolve(process.cwd(), "project.vexp.config");
  
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
  } else if (target === "atest") {
    // Test ask sections
    try {
      console.log(chalk.gray(`Reading config from: ${configPath}`));
      const config = await parseVexpConfig(configPath);
      if (!config) {
        console.log(chalk.red("Error: Could not parse project.vexp.config"));
        return;
      }
      console.log(chalk.gray('Config sections found:', Object.keys(config).join(', ')));

      const phase = params.r || params.runtime ? 'runtime' : 
                   params.i || params.install ? 'install' : null;
      
      console.log(chalk.cyan(`Testing ${phase || 'all'} ask sections...`));
      const processedQuestions = processAskSection(config);
      
      // Filter questions by phase if specified
      const questions = phase ? 
        processedQuestions.filter(q => q.phase === phase) :
        processedQuestions;
      
      console.log(chalk.gray(`Found ${questions.length} questions to test`));
      
      // Run the ask section test
      const answers = await testAskSection(processedQuestions, phase);
      
      // Save answers for potential run tests later
      if (answers && Object.keys(answers).length > 0) {
        const answersPath = path.join(process.cwd(), '.vexp-answers.json');
        await fs.writeFile(answersPath, JSON.stringify(answers, null, 2));
        console.log(chalk.green('Ask section test completed. Answers saved.'));
      }
    } catch (err) {
      console.error(chalk.red(`Error testing ask sections: ${err.message}`));
    }
  } else if (target === "rtest") {
    // Test run sections
    try {
      console.log(chalk.gray(`Reading config from: ${configPath}`));
      const config = await parseVexpConfig(configPath);
      if (!config) {
        console.log(chalk.red("Error: Could not parse project.vexp.config"));
        return;
      }
      
      console.log(chalk.gray('Config sections found:', Object.keys(config).join(', ')));

      const phase = params.r || params.runtime ? 'runtime' : 
                   params.i || params.install ? 'install' : null;
      
      console.log(chalk.cyan(`Testing ${phase || 'all'} run sections...`));
      console.log(chalk.gray('Processing run sections...'));
      const processedCommands = processRunSection(config);
      
      // Filter commands by phase if specified
      const commands = phase ? 
        processedCommands.filter(cmd => cmd.phase === phase) :
        processedCommands;
      
      console.log(chalk.gray(`Found ${processedCommands.length} total commands`));
      console.log(chalk.gray(`Found ${commands.length} commands for phase: ${phase || 'all'}`));
      
      // Try to load answers from previous ask test
      let answers = {};
      try {
        const answersPath = path.join(process.cwd(), '.vexp-answers.json');
        const answersJson = await fs.readFile(answersPath, 'utf8');
        answers = JSON.parse(answersJson);
      } catch (err) {
        console.log(chalk.yellow('No saved answers found. Commands will run with empty values.'));
      }
      
      // Run the commands
      await testRunSection(processedCommands, answers, phase);
      console.log(chalk.green('Run section test completed.'));
      
    } catch (err) {
      console.error(chalk.red(`Error testing run sections: ${err.message}`));
    }
  } else {
    console.log(chalk.yellow("VEXP commands: compile, config, atest, rtest, validate"));
    console.log(chalk.gray("Use 'vexp config' to view project information"));
    console.log(chalk.gray("Use 'vexp config --r' for raw YAML output"));
    console.log(chalk.gray("Use 'vexp atest [--runtime/--r | --install/--i]' to test ask sections"));
    console.log(chalk.gray("Use 'vexp rtest [--runtime/--r | --install/--i]' to test run sections"));
    console.log(chalk.gray("Use 'vexp validate [config-file]' to validate configuration"));
  }
}
