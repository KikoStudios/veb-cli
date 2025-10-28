#!/usr/bin/env node

import chalk from "chalk";
import fs from "fs/promises";

import * as install from "./commands/install.js";
import * as run from "./commands/run.js";
import * as vexp from "./commands/vexp.js";
import * as veb from "./commands/veb_help.js";

const commands = { install, run, vexp, veb };

function parseArgs() {
  // Keep argv tokens so we can detect standalone global tokens like `hl` or `help`
  const tokens = process.argv.slice(2);
  const raw = tokens.join(" ").trim();

  // Default empty result
  let command = null;
  let target = null;
  const params = {};

  // Helper: process global flags like `;hl`
  function processGlobalFlags(input) {
    const parts = input.split(/[;,]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return {};

    const out = { params: {} };

    parts.forEach((p) => {
      if (!p) return;
      const lower = p.toLowerCase();
      // explicit help tokens: hl, help -> treat as help request
      if (lower === "hl" || lower === "help") {
        out.params.help = true;
        return;
      }
      // option with equals like key=val
      if (p.includes("=")) {
        const [k, v] = p.split("=").map((s) => s.trim());
        out.params[k] = v;
        return;
      }

      // fallback: try to parse as key=value
      if (p.includes(":")) {
        const [k, v] = p.split(":");
        out.params[k] = v;
        return;
      }
      // unknown token: set as unnamed param
      out.params[p] = true;
    });

    return out;
  }

  // Support tokens passed as separate args, and accept global help tokens
  const args = tokens || [];
  command = args[0] || null;

  // Walk remaining args and detect help tokens, key=val pairs, or the first non-help token as target
  let seenTarget = false;
  const helpTokens = new Set(["hl", "help"]);
  
  for (let i = 1; i < args.length; i++) {
    const t = args[i];
    if (!t) continue;
    
    // Check if this is a global flag with -- prefix (works in PowerShell)
    if (t.startsWith('--')) {
      const flagName = t.substring(2).toLowerCase();
      if (helpTokens.has(flagName)) {
        params.help = true;
        continue;
      }
      
      // Process other global flags
      params[flagName] = true;
      continue;
    }

    // key=value
    if (t.includes("=")) {
      const [k, v] = t.split("=");
      if (k && v) params[k] = v;
      continue;
    }

    // first non-flag token becomes target
    if (!seenTarget) {
      target = t;
      seenTarget = true;
      continue;
    }

    // otherwise treat as flag
    params[t] = true;
  }

  return { command, target, params };
}

async function main() {
  const { command, target, params } = parseArgs();

  if (!command) {
    console.log(chalk.yellow("Veb CLI"));
    console.log("Usage: veb <command> [target] [--global_flag]");
    console.log("Commands: install, run, vexp");
    console.log("Global flags: --hl (help)");
    return;
  }

  const cmd = commands[command];
  if (!cmd) {
    console.log(chalk.red(`Unknown command: ${command}`));
    return;
  }

  // If user requested help via global flag (e.g. ;hl) show help for the resolved command
  if (params && params.help) {
    try {
      const raw = await fs.readFile(new URL("./commands/help.json", import.meta.url), "utf8");
      const help = JSON.parse(raw);
      const info = help[command] || help.commands?.[command];
      if (info) {
        console.log(chalk.blueBright(`\n${command}`));
        if (info.usage) console.log(`  Usage: ${info.usage}`);
        if (info.description) console.log(`  ${info.description}`);
        if (info.options && Object.keys(info.options).length > 0) {
          console.log(chalk.green("  Options:"));
          for (const [opt, desc] of Object.entries(info.options)) {
            console.log(`    ${opt} — ${desc}`);
          }
        }
        console.log(chalk.gray("\nTip: You can use global flags like --hl after any command to get help."));
      } else {
        console.log(chalk.red(`No help found for command: ${command}`));
        console.log(chalk.blue("Try: veb veb all to list all help topics."));
      }
    } catch (err) {
      console.log(chalk.yellow("Help data not available."));
    }

    return;
  }

  await cmd.execute(target, params);
}

main();
