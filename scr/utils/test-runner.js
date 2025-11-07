import chalk from 'chalk';
import prompts from 'prompts';
import { spawn } from 'child_process';

export async function testAskSection(questions, phase = null) {
  // Store answers and track visible questions
  const answers = {};
  const visibleQuestions = new Set();

  // Filter questions by phase if specified
  const phaseQuestions = phase ? questions.filter(q => q.phase === phase) : questions;

  // First pass: determine which questions should be visible based on linking
  phaseQuestions.forEach(q => {
    if (!q.bindToLink) {
      visibleQuestions.add(q.variableName);
    }
  });

  // Ask questions
  for (const question of phaseQuestions) {
    if (!visibleQuestions.has(question.variableName) && question.bindToLink) {
      continue;
    }

    let promptType = "text";
    let choices = null;

    switch (question.processedType) {
      case "yesno":
        promptType = "confirm";
        break;
      case "defined":
        if (question.options?.length > 0) {
          promptType = "autocomplete";
          choices = question.options.map(opt => ({ title: opt, value: opt }));
        }
        break;
    }

    const icon = question.iconFormatter ? question.iconFormatter() + " " : "";
    const message = icon + question.question;

    let promptOptions = {
      type: promptType,
      name: "value",
      message,
      instructions: false,
      choices,
      initial: question.default
    };

    let answer;
    if (question.processedType === "select" && Array.isArray(question.options)) {
      const defaultSet = new Set(
        (Array.isArray(question.default) ? question.default : 
         question.default?.split(";").map(s => s.trim()).filter(Boolean)) || []
      );

      const multiChoices = question.options.map(opt => ({
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

      answer = (res?.value) || [];
    } else {
      const res = await prompts(promptOptions);
      answer = res.value;
    }

    answers[question.variableName] = answer;

    if (question.hasLink && question.affectsQuestions) {
      question.affectsQuestions.forEach(affected => {
        let shouldShow = false;
        if (affected.bindValueIndex !== undefined && Array.isArray(question.options)) {
          const idxForSingle = typeof answer === "string" ? question.options.indexOf(answer) : -1;
          const idxList = Array.isArray(answer) ? answer.map(v => question.options.indexOf(v)).filter(i => i >= 0) : [];
          if (idxForSingle >= 0 && idxForSingle === affected.bindValueIndex) shouldShow = true;
          if (idxList.length && idxList.includes(affected.bindValueIndex)) shouldShow = true;
        } else if (affected.bindValue !== undefined) {
          shouldShow = (answer === affected.bindValue);
        }
        if (shouldShow) visibleQuestions.add(affected.variableName);
      });
    }
  }

  return answers;
}

export async function testRunSection(commands, answers, phase = null) {
  const executeCommands = async (cmds, timing) => {
    for (const command of cmds) {
      if (phase && command.phase !== phase) continue;
      if (timing && (!command.timing || command.timing !== timing)) continue;

      const cmd = command.execute(answers);
      console.log(chalk.gray(`→ ${cmd}`));

      const proc = spawn(cmd, { shell: true, stdio: ['inherit', 'pipe', 'pipe'] });
      
      proc.stdout.on('data', (data) => process.stdout.write(data));
      proc.stderr.on('data', (data) => process.stderr.write(data));
      
      await new Promise((res) => proc.on("exit", res));
    }
  };

  const phaseCommands = phase ? commands.filter(c => c.phase === phase) : commands;

  // Execute commands in proper order with timing
  for (const command of phaseCommands) {
    if (command.timing === 'before') {
      await executeCommands([command], 'before');
    }
  }

  for (const command of phaseCommands) {
    if (!command.timing) {
      await executeCommands([command]);
    }
  }

  for (const command of phaseCommands) {
    if (command.timing === 'after') {
      await executeCommands([command], 'after');
    }
  }
}