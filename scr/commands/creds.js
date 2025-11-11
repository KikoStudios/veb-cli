import inquirer from "inquirer";
import chalk from "chalk";
import qrcodeTerminal from "qrcode-terminal";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { ensureEnvLoaded, requireEnv } from "../utils/env.js";

function normalizeOptions(params = {}) {
  return Object.entries(params).reduce((acc, [key, value]) => {
    if (!key) return acc;
    acc[key.toLowerCase()] = value;
    return acc;
  }, {});
}

function toBoolean(value) {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  const str = String(value).trim().toLowerCase();
  if (str === "" || str === "true" || str === "1" || str === "yes" || str === "y") {
    return true;
  }
  return false;
}

function createAutomatedAccount(options) {
  const seed = typeof options.seed === "string" && options.seed.trim()
    ? options.seed.trim()
    : Date.now().toString(36);

  const prefixRaw = typeof options.prefix === "string" && options.prefix.trim()
    ? options.prefix.trim()
    : "test";

  const sanitizedPrefix = prefixRaw.replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "test";
  let generatedTag = `${sanitizedPrefix}${seed}`.replace(/[^a-z0-9_-]/gi, "");
  if (generatedTag.length > 30) {
    generatedTag = generatedTag.slice(0, 30);
  }
  if (generatedTag.length < 3) {
    generatedTag = `${sanitizedPrefix}user${seed}`.slice(0, 30);
  }

  const domain = typeof options.emaildomain === "string" && options.emaildomain.trim()
    ? options.emaildomain.trim()
    : "example.com";

  const displayName = (typeof options.displayname === "string" && options.displayname.trim())
    ? options.displayname.trim()
    : `Test ${sanitizedPrefix} ${seed}`;

  const tagName = (typeof options.tagname === "string" && options.tagname.trim())
    ? options.tagname.trim()
    : generatedTag;

  const email = (typeof options.email === "string" && options.email.trim())
    ? options.email.trim()
    : `${tagName.replace(/[^a-z0-9]/gi, "") || generatedTag}@${domain}`;

  const password = (typeof options.password === "string" && options.password.trim())
    ? options.password.trim()
    : `Aa${seed}${Math.floor(Math.random() * 9)}0`;

  return {
    displayName,
    tagName,
    email,
    password,
    confirmPassword: (typeof options.confirmpassword === "string" && options.confirmpassword.trim())
      ? options.confirmpassword.trim()
      : password,
  };
}

ensureEnvLoaded();
const convexUrl = requireEnv("CONVEX_URL");
const client = new ConvexHttpClient(convexUrl);

function getConfigPath() {
  const configPath = resolve(homedir(), ".veb/config.json");
  const configDir = dirname(configPath);
  return { configPath, configDir };
}

function readSessionConfig() {
  const { configPath } = getConfigPath();
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    console.error(chalk.red(`Failed to read config at ${configPath}: ${error.message}`));
    return null;
  }
}

function writeSessionConfig(session) {
  const { configPath, configDir } = getConfigPath();

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const existing = readSessionConfig() ?? {};
  const updated = {
    ...existing,
    session,
  };

  writeFileSync(configPath, JSON.stringify(updated, null, 2));
}

const REGISTER_QUESTIONS = [
  {
    type: 'input',
    name: 'displayName',
    message: 'Display name:',
    validate: (input) => input.length >= 2 || 'Display name must be at least 2 characters',
  },
  {
    type: 'input',
    name: 'tagName',
    message: 'Tag name (for login):',
    validate: (input) => /^[a-zA-Z0-9_-]{3,30}$/.test(input) || 'Invalid tag name format',
  },
  {
    type: 'input',
    name: 'email',
    message: 'Email:',
    validate: (input) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input) || 'Invalid email format',
  },
  {
    type: 'password',
    name: 'password',
    message: 'Password:',
    validate: (input) => {
      if (input.length < 8) return 'Password must be at least 8 characters';
      if (!/[A-Z]/.test(input)) return 'Password must contain an uppercase letter';
      if (!/[a-z]/.test(input)) return 'Password must contain a lowercase letter';
      if (!/[0-9]/.test(input)) return 'Password must contain a number';
      return true;
    },
  },
  {
    type: 'password',
    name: 'confirmPassword',
    message: 'Confirm password:',
    validate: (input, answers) => input === answers.password || 'Passwords do not match',
  },
];

async function register(rawOptions = {}) {
  console.log(chalk.blue('📝 Register a new VEB account\n'));

  const options = normalizeOptions(rawOptions);
  const auto = toBoolean(options.auto) || toBoolean(options.test);

  let prefilled = auto ? createAutomatedAccount(options) : {};

  prefilled = {
    ...prefilled,
    displayName: typeof options.displayname === "string" && options.displayname.trim() ? options.displayname.trim() : prefilled.displayName,
    tagName: typeof options.tagname === "string" && options.tagname.trim() ? options.tagname.trim() : prefilled.tagName,
    email: typeof options.email === "string" && options.email.trim() ? options.email.trim() : prefilled.email,
    password: typeof options.password === "string" && options.password.trim() ? options.password.trim() : prefilled.password,
    confirmPassword: typeof options.confirmpassword === "string" && options.confirmpassword.trim() ? options.confirmpassword.trim() : prefilled.confirmPassword,
  };

  if (prefilled.password && !prefilled.confirmPassword) {
    prefilled.confirmPassword = prefilled.password;
  }

  if (auto) {
    console.log(chalk.gray('Using automated test credentials:'));
    console.log(chalk.gray(`  Display name: ${prefilled.displayName}`));
    console.log(chalk.gray(`  Tag name:     ${prefilled.tagName}`));
    console.log(chalk.gray(`  Email:        ${prefilled.email}`));
    console.log(chalk.gray(`  Password:     ${prefilled.password}`));
  }

  const remainingQuestions = REGISTER_QUESTIONS
    .filter((question) => prefilled[question.name] === undefined)
    .map((question) => {
      if (prefilled.password && question.name === 'confirmPassword') {
        return {
          ...question,
          default: prefilled.password,
        };
      }
      return question;
    });

  const promptedAnswers = remainingQuestions.length > 0
    ? await inquirer.prompt(remainingQuestions)
    : {};

  const answers = {
    ...prefilled,
    ...promptedAnswers,
  };

  for (const question of REGISTER_QUESTIONS) {
    if (typeof question.validate === 'function') {
      const result = question.validate(answers[question.name], answers);
      if (result !== true) {
        throw new Error(`Invalid ${question.name}: ${result}`);
      }
    }
  }

  try {
    // Register user
    const accountId = await client.action(api.auth.register, {
      displayName: answers.displayName,
      tagName: answers.tagName,
      email: answers.email,
      password: answers.password,
    });

    console.log(chalk.green('\n✓ Account created'));
    if (auto) {
      console.log(chalk.gray(`  ↳ Request ID: ${accountId}`));
    }

    if (toBoolean(options.skipemail)) {
      console.log(chalk.yellow('\n⚠️  Skipping verification email dispatch (--skipEmail).'));
      return;
    }

    console.log(chalk.blue('\n📧 Sending verification email...'));

    // Send verification email
    await client.action(api.emailVerification.sendVerificationEmail, {
      accountId,
      email: answers.email,
      displayName: answers.displayName,
    });

    console.log(chalk.green('✓ Verification email sent'));

    if (toBoolean(options.skipverification)) {
      console.log(chalk.yellow('\n⚠️  Skipping email verification step (--skipVerification).'));
      return;
    }

    // Get verification code
    let verificationCode = typeof options.code === "string" && options.code.trim()
      ? options.code.trim()
      : typeof options.verificationcode === "string" && options.verificationcode.trim()
        ? options.verificationcode.trim()
        : undefined;

    if (!verificationCode) {
      const promptResult = await inquirer.prompt({
        type: 'input',
        name: 'code',
        message: 'Enter the verification code from your email:',
        validate: (input) => /^\d{6}$/.test(input) || 'Invalid verification code',
      });
      verificationCode = promptResult.code;
    }

    if (!/^\d{6}$/.test(verificationCode)) {
      throw new Error('Invalid verification code supplied');
    }

    // Verify email and get TOTP setup
    const totpSetup = await client.action(api.auth.verifyEmail, {
      accountId,
      code: verificationCode,
    });

    console.log(chalk.green('\n✓ Email verified'));
    console.log(chalk.blue('\n🔐 2FA Setup'));
    console.log('Scan this QR code with your authenticator app:');

    qrcodeTerminal.generate(totpSetup.uri, { small: true });
    
    console.log(chalk.yellow('\nBackup key (save this somewhere safe):'));
    console.log(totpSetup.secret);
    
    console.log(chalk.green('\n✓ Registration complete! You can now log in.'));

  } catch (error) {
    console.error(chalk.red(`\n✗ Error: ${error.message}`));
    process.exit(1);
  }
}

async function login(rawOptions = {}) {
  console.log(chalk.blue('🔑 Log in to VEB\n'));

  const options = normalizeOptions(rawOptions);

  const prompts = [
    {
      type: 'input',
      name: 'identifier',
      message: 'Username or email:',
    },
    {
      type: 'password',
      name: 'password',
      message: 'Password:',
    },
    {
      type: 'input',
      name: 'totpCode',
      message: '2FA code from your authenticator app:',
      validate: (input) => /^\d{6}$/.test(input) || 'Invalid 2FA code',
    },
  ];

  const prefilled = {
    identifier: typeof options.identifier === "string" && options.identifier.trim() ? options.identifier.trim() : undefined,
    password: typeof options.password === "string" && options.password.trim() ? options.password.trim() : undefined,
    totpCode: typeof options.totpcode === "string" && options.totpcode.trim()
      ? options.totpcode.trim()
      : typeof options.totp === "string" && options.totp.trim()
        ? options.totp.trim()
        : undefined,
  };

  const remaining = prompts.filter((question) => prefilled[question.name] === undefined);

  const prompted = remaining.length > 0 ? await inquirer.prompt(remaining) : {};

  const answers = {
    ...prefilled,
    ...prompted,
  };

  if (!answers.identifier || !answers.password) {
    throw new Error('Identifier and password are required');
  }

  if (!answers.totpCode || !/^\d{6}$/.test(answers.totpCode)) {
    throw new Error('Invalid 2FA code');
  }

  try {
    const result = await client.action(api.auth.login, {
      identifier: answers.identifier,
      password: answers.password,
      totpCode: answers.totpCode,
    });

    // Save session to config
    writeSessionConfig({
      token: result.sessionToken,
      user: result.user,
    });
    
    console.log(chalk.green('\n✓ Logged in successfully'));

  } catch (error) {
    console.error(chalk.red(`\n✗ Error: ${error.message}`));
    process.exit(1);
  }
}

function maskToken(token) {
  if (!token || token.length <= 8) {
    return token ?? "";
  }
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

async function status() {
  console.log(chalk.blue("👤 Current VEB session\n"));

  const config = readSessionConfig();
  if (!config || !config.session || !config.session.user) {
    console.log(chalk.yellow("No session found. Run `veb cred login` first."));
    return;
  }

  const { user, token } = config.session;

  console.log(chalk.green("Logged in as"));
  console.log(`  Display name: ${user.displayName ?? "-"}`);
  console.log(`  Tag name:     ${user.tagName ?? "-"}`);
  console.log(`  Email:        ${user.email ?? "-"}`);
  console.log(`  User ID:      ${user.id ?? "-"}`);

  if (token) {
    console.log(chalk.gray(`  Session token: ${maskToken(token)}`));
  }
}

export async function execute(target, params = {}) {
  const options = params ?? {};
  switch (target) {
    case 'register':
      await register(options);
      return;
    case 'login':
      await login(options);
      return;
    case 'status':
      await status();
      return;
    default:
      console.log(chalk.yellow('Please use one of these subcommands:'));
      console.log('  veb cred register - Register a new account');
      console.log('  veb cred login    - Log in to your account');
      console.log('  veb cred status   - Show current session');
  }
}

export { register, login, status };
