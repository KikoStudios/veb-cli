import fs from "fs";
import path from "path";
import chalk from "chalk";
import prompts from "prompts";
import { spawn } from "child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { parseVexpConfig, processAskSection, processRunSection } from "../utils/vexp-parser.js";
import { detectOS } from "../utils/os-detector.js";
import { registerProcess, updateProcess } from "../utils/runtime-manager.js";

const ROOT_DIR = fileURLToPath(new URL("../../", import.meta.url));

function loadEnvFile(filename) {
  const filePath = path.resolve(ROOT_DIR, filename);
  if (!existsSync(filePath)) {
    return;
  }
  const contents = fs.readFileSync(filePath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (!key || key.startsWith("#")) continue;
    if (process.env[key] !== undefined) continue;
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    process.env[key] = value;
  }
}

[".env", ".env_local"].forEach(loadEnvFile);

const convexUrl = process.env.CONVEX_URL;
const client = convexUrl ? new ConvexHttpClient(convexUrl) : null;

export async function findProjectDir(aliasOrName) {
  let repoUrl = null;
  
  if (!aliasOrName) {
    const currentDir = process.cwd();
    if (fs.existsSync(path.join(currentDir, "project.vexp.config"))) {
      return { dir: currentDir, repoUrl: null };
    }
    return { dir: null, repoUrl: null };
  }

  if (aliasOrName.includes("/") && !aliasOrName.startsWith("http") && !aliasOrName.startsWith("git@")) {
    const alias = aliasOrName.toLowerCase().trim();
    if (client) {
      try {
        const record = await client.query(api.aliases.getAlias, { alias });
        if (record) {
          repoUrl = record.repoUrl;
        }
      } catch (error) {
        console.log(chalk.yellow(`Could not lookup alias: ${error.message}`));
      }
    }
  } else if (aliasOrName.startsWith("http") || aliasOrName.startsWith("git@")) {
    repoUrl = aliasOrName;
  }

  // Search for project.vexp.config in multiple possible locations
  // Config commands might have cloned/extracted to different directories
  const repoName = repoUrl ? path.basename(repoUrl, ".git") : aliasOrName;
  const possibleDirs = [
    path.resolve(process.cwd(), "app"), // Common name from configs
    path.resolve(process.cwd(), repoName), // Repo name
    path.resolve(process.cwd(), aliasOrName), // Alias/name as-is
    path.resolve(process.cwd(), aliasOrName.replace(/\.git$/, "")), // Without .git
    process.cwd(), // Current directory
  ];

  for (const dir of possibleDirs) {
    if (existsSync(dir) && existsSync(path.join(dir, "project.vexp.config"))) {
      return { dir, repoUrl: repoUrl || aliasOrName };
    }
  }

  return { dir: null, repoUrl: repoUrl || aliasOrName };
}

export async function execute(target, params) {
  let projectDir = null;
  let filePath = null;
  let repoUrl = null;

  if (target) {
    const result = await findProjectDir(target);
    projectDir = result.dir;
    repoUrl = result.repoUrl || target;
    
    if (projectDir) {
      filePath = path.join(projectDir, "project.vexp.config");
    }
  }

  if (!filePath) {
    filePath = path.resolve(process.cwd(), "project.vexp.config");
  }

  if (!fs.existsSync(filePath)) {
    console.log(chalk.red("No project.vexp.config found in this directory."));
    if (target) {
      console.log(chalk.yellow(`Try: veb install ${target}`));
    }
    return;
  }

  if (projectDir) {
    process.chdir(projectDir);
  }

  // Parse the config using our vexp-parser
  const config = await parseVexpConfig(filePath);
  if (!config) {
    console.log(chalk.red("Error parsing project.vexp.config"));
    return;
  }

  const currentOS = detectOS();
  console.log(chalk.cyan(`Running ${config.name || target}...`));
  console.log(chalk.gray(`OS: ${currentOS}`));

  // Set built-in variables
  const builtIns = {
    REPO_URL: repoUrl || process.env.REPO_URL || target || "",
  };
  process.env.REPO_URL = builtIns.REPO_URL;
  process.env.bi_REPO_URL = builtIns.REPO_URL;

  // Determine phase early so we can register the process correctly
  const phase = params && params.install ? 'install' : 'runtime';

  // Register run process
  let processId = null;
  try {
    processId = await registerProcess({
      type: "run",
      project: config.name || target || "unknown",
      alias: target && target.includes("/") ? target : null,
      repoUrl: repoUrl || null,
      directory: projectDir || process.cwd(),
      command: phase === "runtime" ? "runtime commands" : "install commands",
      pid: process.pid,
      status: "running",
      metadata: { phase, os: currentOS }
    });
  } catch (error) {
    // Ignore process registration errors
    console.log(chalk.yellow(`⚠️  Could not register process: ${error.message}`));
  }

  // Process the ask sections for both phases
  const processedQuestions = processAskSection(config);
  
  // Process the run sections for both phases with OS filtering
  let processedCommands;
  try {
    processedCommands = processRunSection(config, currentOS);
  } catch (error) {
    if (error.message.includes("OS not compatible")) {
      console.log(chalk.red(`\n✗ ${error.message}`));
      return;
    }
    throw error;
  }

  // Store answers and track visible questions per phase
  const answers = {};
  const visibleQuestions = new Set();
  
  // Determine if we're running a specific phase
  // Default to runtime phase for 'run' command, install phase only if explicitly requested
  // (phase is declared earlier to allow process registration)

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

  // Execute commands by phase, supporting term (session) and type (shell)
  const terminalSessions = {};
  const executeCommands = async (commands, timing) => {
    for (const command of commands) {
      if (phase && command.phase !== phase) continue;
      if (timing && (!command.timing || command.timing !== timing)) continue;

      // Support term and type options
      const term = command.original?.term || params?.term || null;
      const shellType = command.original?.type || params?.type || 'powershell';
      let shell;
      if (shellType === 'cmd') shell = 'cmd.exe';
      else if (shellType === 'pw' || shellType === 'powershell') shell = 'powershell.exe';
      else shell = true;

      // Prepare session
      let proc;
      if (term) {
        if (!terminalSessions[term]) {
          // Start new session
          const cmd = command.execute(answers, builtIns);
          console.log(chalk.gray(`[${term}] → ${cmd}`));
          proc = spawn(cmd, { shell, stdio: ['inherit', 'pipe', 'pipe'] });
          terminalSessions[term] = proc;
        } else {
          // Wait for previous command in session to finish, then run next
          await new Promise((res) => terminalSessions[term].on('exit', res));
          const cmd = command.execute(answers, builtIns);
          console.log(chalk.gray(`[${term}] → ${cmd}`));
          proc = spawn(cmd, { shell, stdio: ['inherit', 'pipe', 'pipe'] });
          terminalSessions[term] = proc;
        }
      } else {
        const cmd = command.execute(answers, builtIns);
        console.log(chalk.gray(`→ ${cmd}`));
        proc = spawn(cmd, { shell, stdio: ['inherit', 'pipe', 'pipe'] });
      }

      // Interact logic: auto-answer prompts
      const interact = command.original?.interact || params?.interact || null;
      let interactQueue = Array.isArray(interact) ? interact : (interact ? [interact] : []);
      let interactIndex = 0;

      proc.stdout.on('data', (data) => {
        process.stdout.write(data);
        if (interactQueue.length > 0) {
          const str = data.toString();
          // interact: [{ lookFor: "question", respond: "answer" }]
          let current = interactQueue[interactIndex];
          if (typeof current === 'string') {
            // Format: "lookFor;respond"
            const [lookFor, respond] = current.split(';');
            if (str.includes(lookFor)) {
              proc.stdin.write(respond + '\n');
              interactIndex++;
            }
          } else if (current && str.includes(current.lookFor)) {
            proc.stdin.write(current.respond + '\n');
            interactIndex++;
          }
        }
      });
      proc.stderr.on('data', (data) => {
        process.stderr.write(data);
      });

      const exitCode = await new Promise((res) => proc.on("exit", res));
      if (exitCode !== 0 && processId) {
        await updateProcess(processId, {
          status: "failed",
          metadata: {
            error: `Command failed with exit code ${exitCode}`,
            failedCommand: command.execute(answers, builtIns)
          }
        });
      }
    }
  };
  
  // Execute commands in proper order with timing
  for (const question of processedQuestions) {
    // Run 'before' commands linked to this question
    const beforeCommands = processedCommands.filter(cmd => 
      cmd.linkName === question.linkId && cmd.timing === 'before'
    );
    await executeCommands(beforeCommands, 'before');
    
    // After the question is answered, run 'after' commands
    const afterCommands = processedCommands.filter(cmd => 
      cmd.linkName === question.linkId && cmd.timing === 'after'
    );
    await executeCommands(afterCommands, 'after');
  }
  
  // Run any remaining commands (no timing specified)
  const untimed = processedCommands.filter(cmd => !cmd.timing);
  await executeCommands(untimed);

  // Update process status
  if (processId) {
    await updateProcess(processId, { status: "completed" });
  }

  console.log(chalk.green("Run completed."));
}
