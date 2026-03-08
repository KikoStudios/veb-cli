import chalk from 'chalk';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api.js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'path';
import { parseVexpConfig } from '../utils/vexp-parser.js';
import { fetchConfigFromGitHub } from '../utils/github-fetcher.js';
import { parseGitHubRepoUrl, validateAliasName } from '../utils/publish-utils.js';
import { requireEnv } from '../utils/env.js';
const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

const convexUrl = requireEnv("CONVEX_URL");
const client = new ConvexHttpClient(convexUrl);

function getConfigPath() {
  const configPath = resolve(homedir(), '.veb/config.json');
  const configDir = dirname(configPath);
  return { configPath, configDir };
}

function readSessionConfig() {
  const { configPath } = getConfigPath();
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    console.error(chalk.red(`Failed to read config: ${error.message}`));
    return null;
  }
}

async function verifyVexpConfig(repoUrl) {
  try {
    const { configPath, cleanup } = await fetchConfigFromGitHub(repoUrl);

    if (!configPath || !existsSync(configPath)) {
      await cleanup();
      return { valid: false, error: 'No project.vexp.config found in repository' };
    }

    const config = await parseVexpConfig(configPath);
    await cleanup();

    if (!config) return { valid: false, error: 'Invalid VEXP configuration format' };
    if (!config.name) return { valid: false, error: "VEXP config missing required 'name' field" };
    return { valid: true, config };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

export async function execute(target, repoUrl) {
  const config = readSessionConfig();
  if (!config || !config.session || !config.session.token) {
    console.log(chalk.red('Authentication required'));
    console.log(chalk.yellow('Please login first: veb creds login'));
    return;
  }

  if (!target) {
    console.log(chalk.red('Alias name is required'));
    console.log(chalk.gray('Usage: veb publish <alias> <repo-url>'));
    return;
  }

  if (!repoUrl) {
    console.log(chalk.red('Repository URL is required'));
    console.log(chalk.gray('Usage: veb publish <alias> <repo-url>'));
    return;
  }

  const aliasValidation = validateAliasName(target);
  if (!aliasValidation.valid) {
    console.log(chalk.red(aliasValidation.reason));
    return;
  }

  const fullRepoUrl = parseGitHubRepoUrl(repoUrl);
  if (!fullRepoUrl) {
    console.log(chalk.red('Invalid repository URL'));
    return;
  }

  const verification = await verifyVexpConfig(fullRepoUrl);
  if (!verification.valid) {
    console.log(chalk.red(verification.error));
    console.log(chalk.yellow('Repository must contain a valid project.vexp.config file'));
    return;
  }

  try {
    await client.mutation(api.aliases.publishAlias, {
      alias: target,
      repoUrl: fullRepoUrl,
      sessionToken: config.session.token,
    });

    console.log(chalk.green(`[+] Published '${target}' -> ${fullRepoUrl}`));
  } catch (error) {
    console.error(chalk.red(`Failed to publish: ${error.message}`));
  }
}

export async function unpublish(alias) {
  const config = readSessionConfig();
  if (!config || !config.session || !config.session.token) {
    console.log(chalk.red('Authentication required'));
    console.log(chalk.yellow('Please login first: veb creds login'));
    return;
  }

  if (!alias) {
    console.log(chalk.red('Alias name is required'));
    return;
  }

  try {
    await client.mutation(api.aliases.unpublishAlias, {
      alias,
      sessionToken: config.session.token,
    });
    console.log(chalk.green(`[+] Unpublished '${alias}'`));
  } catch (error) {
    console.error(chalk.red(`Failed to unpublish: ${error.message}`));
  }
}

export async function listPublished() {
  const config = readSessionConfig();
  if (!config || !config.session || !config.session.user) {
    console.log(chalk.red('Authentication required'));
    console.log(chalk.yellow('Please login first: veb creds login'));
    return;
  }

  try {
    const aliases = await client.query(api.aliases.getUserAliases, {
      userId: config.session.user.id,
    });

    if (aliases.length === 0) {
      console.log(chalk.yellow('No published apps yet'));
      return;
    }

    console.log(chalk.bold(`\nYour Published Apps (${aliases.length})\n`));
    aliases.forEach((alias) => {
      console.log(chalk.cyan(alias.alias));
      console.log(chalk.gray(`  -> ${alias.repoUrl}`));
      console.log(chalk.gray(`  Created: ${new Date(alias.createdAt).toLocaleDateString()}`));
      console.log();
    });
  } catch (error) {
    console.error(chalk.red(`Failed to list published apps: ${error.message}`));
  }
}
