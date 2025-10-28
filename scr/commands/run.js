import fs from "fs";
import path from "path";
import chalk from "chalk";
import prompts from "prompts";
import { spawn } from "child_process";
import { parseVexpConfig, processAskSection, processRunSection } from "../utils/vexp-parser.js";

export async function execute(target, params) {
  // Use the provided project name or default to the config file in current directory
  const projectName = params[0] || "";
  const filePath = path.resolve(process.cwd(), "project.vexp.config");
  if (!fs.existsSync(filePath)) {
    console.log(chalk.red("No project.vexp.config found in this directory."));
    return;
  }

  // Parse the config using our vexp-parser
  const config = await parseVexpConfig(filePath);
  if (!config) {
    console.log(chalk.red("Error parsing project.vexp.config"));
    return;
  }

  console.log(chalk.cyan(`Running ${config.name || target}...`));

  // Process the ask section
  const processedQuestions = processAskSection(config.ask);
  
  // Process the run section
  const processedCommands = processRunSection(config.run);

  // Store answers
  const answers = {};
  const visibleQuestions = new Set();

  // First pass: determine which questions should be visible based on linking
  processedQuestions.forEach(q => {
    // By default, all questions without binding are visible
    if (!q.bindToLink) {
      visibleQuestions.add(q.variableName);
    }
  });

  // Ask questions
  for (const question of processedQuestions) {
    // Skip questions that should be hidden based on binding
    if (!visibleQuestions.has(question.variableName) && question.bindToLink) {
      continue;
    }

    // Determine prompt type based on question type
    let promptType = "text";
    let choices = null;

    switch (question.processedType) {
      case "yesno":
        promptType = "confirm";  // confirm returns boolean
        break;
      case "defined":
        if (question.options && question.options.length > 0) {
          promptType = "autocomplete"; // single choice
          choices = question.options.map(opt => ({ title: opt, value: opt }));
        }
        break;
      case "select":
        // Custom multi-select flow handled below (ENTER toggles, double ENTER confirms)
        break;
    }

    // Format the question with icon if available
    const icon = question.iconFormatter ? question.iconFormatter() + " " : "";
    const message = icon + question.question;

    // Ask the question
    let promptOptions = {
      type: promptType,
      name: "value",
      message,
      instructions: false
    };
    
    // Add choices for select/autocomplete types
    if (choices) {
      promptOptions.choices = choices;
    }
    
    // Handle initial value
    if (question.default !== undefined) {
      if ((promptType === "autocomplete" || promptType === "select") && question.options) {
        const defaultIndex = question.options.indexOf(question.default);
        if (defaultIndex >= 0) promptOptions.initial = defaultIndex;
      } else if (promptType === "autocompleteMultiselect") {
        // choices already have 'selected' flags above
      } else {
        promptOptions.initial = question.default;
      }
    }
    
    let answer;
    if (question.processedType === "select" && Array.isArray(question.options) && question.options.length > 0) {
      // Use built-in multiselect so the prompt only prints the final selection once on submit.
      const opts = question.options;
      // Prepare choices with initial selection flags
      const defaultSet = new Set();
      if (Array.isArray(question.default)) {
        question.default.forEach(v => defaultSet.add(v));
      } else if (typeof question.default === "string") {
        const parts = question.default.split(";").map(s => s.trim()).filter(Boolean);
        parts.forEach(v => defaultSet.add(v));
      }

      const multiChoices = opts.map(opt => ({
        title: opt,
        value: opt,
        selected: defaultSet.has(opt)
      }));

      const res = await prompts({
        type: "multiselect",
        name: "value",
        message,
        choices: multiChoices,
        instructions: false
      });

      // If user cancelled, res may be undefined — treat as empty selection
      answer = (res && res.value) ? res.value : [];
      answers[question.variableName] = answer;
    } else {
      const res = await prompts(promptOptions);
      answer = res.value;
      answers[question.variableName] = answer;
    }

    // If this question has links, update visibility of other questions
    if (question.hasLink && question.affectsQuestions) {
      question.affectsQuestions.forEach(affected => {
        let shouldShow = false;
        if (affected.bindValueIndex !== undefined && Array.isArray(question.options)) {
          const idxForSingle = typeof answer === "string" ? question.options.indexOf(answer) : -1;
          const idxList = Array.isArray(answer) ? answer.map(v => question.options.indexOf(v)).filter(i => i >= 0) : [];
          if (idxForSingle >= 0 && idxForSingle === affected.bindValueIndex) shouldShow = true;
          if (idxList.length && idxList.includes(affected.bindValueIndex)) shouldShow = true;
        } else if (affected.bindValue !== undefined) {
          if (typeof answer === "boolean") {
            shouldShow = (answer === affected.bindValue);
          } else {
            shouldShow = (answer === affected.bindValue);
          }
        }
        if (shouldShow) visibleQuestions.add(affected.variableName);
      });
    }
  }

  // Execute commands
  for (const command of processedCommands) {
    const cmd = command.execute(answers);
    console.log(chalk.gray(`→ ${cmd}`));
    // Use stdio: 'pipe' to prevent duplicate output
    const proc = spawn(cmd, { shell: true, stdio: ['inherit', 'pipe', 'pipe'] });
    
    // Manually handle stdout to avoid duplication
    proc.stdout.on('data', (data) => {
      process.stdout.write(data);
    });
    
    // Handle stderr
    proc.stderr.on('data', (data) => {
      process.stderr.write(data);
    });
    
    await new Promise((res) => proc.on("exit", res));
  }

  console.log(chalk.green("Run completed."));
}
