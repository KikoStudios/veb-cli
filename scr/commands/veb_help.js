import chalk from "chalk";
import fs from "fs/promises";

const HELP_FILE = new URL("./help.json", import.meta.url);

async function loadHelp() {
  try {
    const raw = await fs.readFile(HELP_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

function printCommandHelp(name, info) {
  console.log(chalk.blueBright(`\n${name}`));
  if (info.usage) console.log(`  Usage: ${info.usage}`);
  if (info.description) console.log(`  ${info.description}`);
  if (info.options && Object.keys(info.options).length > 0) {
    console.log(chalk.green("  Options:"));
    for (const [opt, desc] of Object.entries(info.options)) {
      console.log(`    ${opt} — ${desc}`);
    }
  }
}

export async function execute(target, params) {
  const help = await loadHelp();

  const wantsHelp = Boolean(params && (params.help || params.h || params.headless));

  if (!target) {
    console.log(chalk.red("HEY THIS IS A HELP CENTER"));
    console.log(chalk.green("If you need help, call any command without parameters, or add --hl after the command for shorthand help."));
    console.log(chalk.blue("EXAMPLE: veb install --hl"));
    console.log(" ");
    console.log(chalk.green("OR USE"));
    console.log(chalk.blue("veb veb [command]"));
    console.log("OR");
    console.log(chalk.blue("veb veb all"));
    console.log(chalk.blackBright("TO SEE ALL THE COMMANDS AND THEIR USAGE"));

    const entries = Object.entries(help);
    if (entries.length > 0) {
      console.log("\nAvailable commands:");
      for (const [name, info] of entries) {
        console.log(`  ${name} - ${info.description || "(no description)"}`);
      }
    } else {
      console.log(chalk.yellow("No help entries available."));
    }

    return;
  }

  if (target === "all") {
    const entries = Object.entries(help);
    if (entries.length === 0) {
      console.log(chalk.yellow("No help entries available."));
      return;
    }
    console.log(chalk.yellow("All commands:"));
    for (const [name, info] of entries) {
      printCommandHelp(name, info);
    }
    return;
  }

  if (wantsHelp || (params && Object.keys(params).length === 0)) {
    const info = help[target] || help.commands?.[target];
    if (info) {
      printCommandHelp(target, info);
    } else {
      console.log(chalk.red(`No help found for command: ${target}`));
      console.log(chalk.blue("Try: veb veb all to list all help topics."));
    }
    return;
  }

  console.log(chalk.yellow("Help: you can get usage info with `veb veb <command>` or `veb veb <command> ;h`."));
}
