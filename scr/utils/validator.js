import chalk from 'chalk';
import { parseVexpConfig } from './vexp-parser.js';
import { promises as fs } from 'fs';

// Score weights for different aspects
const SCORE_WEIGHTS = {
  syntax: 30,           // Basic YAML syntax and structure
  linking: 20,          // Link and bind relationships
  commands: 20,         // Command validity and structure
  paths: 15,           // File paths and references
  dependencies: 15      // Dependencies and requirements
};

class ValidationReport {
  constructor() {
    this.scores = {
      syntax: 0,
      linking: 0,
      commands: 0,
      paths: 0,
      dependencies: 0
    };
    this.issues = [];
    this.improvements = [];
    this.highlights = [];
  }

  addIssue(category, message, severity = 'error') {
    this.issues.push({ category, message, severity });
  }

  addImprovement(category, message) {
    this.improvements.push({ category, message });
  }

  addHighlight(category, message) {
    this.highlights.push({ category, message });
  }

  setScore(category, score) {
    this.scores[category] = Math.min(Math.max(0, score), SCORE_WEIGHTS[category]);
  }

  getTotalScore() {
    return Object.entries(this.scores).reduce((total, [key, score]) => total + score, 0);
  }

  formatReport() {
    const totalScore = this.getTotalScore();
    let report = '\n' + chalk.bold('🔍 VEB Script Validation Report\n');
    report += '════════════════════════════════\n\n';

    // Overall Score
    report += chalk.bold('📊 Overall Score: ') + 
      (totalScore >= 90 ? chalk.green : totalScore >= 70 ? chalk.yellow : chalk.red)
      (`${totalScore}/100`) + '\n\n';

    // Category Scores
    report += chalk.bold('📈 Category Scores:\n');
    Object.entries(this.scores).forEach(([category, score]) => {
      const maxScore = SCORE_WEIGHTS[category];
      const percentage = (score / maxScore) * 100;
      const bar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
      report += `${category.padEnd(12)}: ${score}/${maxScore} ${
        percentage >= 80 ? chalk.green(bar) :
        percentage >= 60 ? chalk.yellow(bar) :
        chalk.red(bar)
      }\n`;
    });

    // Highlights (Good practices)
    if (this.highlights.length > 0) {
      report += '\n' + chalk.bold.green('✨ Highlights:\n');
      this.highlights.forEach(h => {
        report += `  ${chalk.green('✓')} ${h.category}: ${h.message}\n`;
      });
    }

    // Issues
    if (this.issues.length > 0) {
      report += '\n' + chalk.bold.red('❌ Issues Found:\n');
      this.issues.forEach(issue => {
        const icon = issue.severity === 'error' ? '✖' : '⚠';
        const color = issue.severity === 'error' ? chalk.red : chalk.yellow;
        report += `  ${color(icon)} ${chalk.bold(issue.category)}: ${issue.message}\n`;
      });
    }

    // Improvements
    if (this.improvements.length > 0) {
      report += '\n' + chalk.bold.blue('💡 Suggested Improvements:\n');
      this.improvements.forEach(imp => {
        report += `  ${chalk.blue('•')} ${chalk.bold(imp.category)}: ${imp.message}\n`;
      });
    }

    // Perfect Score Banner
    if (totalScore === 100) {
      report += '\n' + chalk.green.bold('🏆 Perfect Score! Your script is flawless! 🎉\n');
    }

    return report;
  }
}

async function validateSyntax(config, report, error) {
  let score = SCORE_WEIGHTS.syntax;
  
  // Check for YAML syntax errors
  if (error) {
    const errorLines = error.message.split('\n');
    const errorLocation = errorLines.length > 1 ? errorLines[errorLines.length - 2] : '';
    report.addIssue('syntax', `YAML Syntax Error: ${errorLocation}`);
    
    // Reduce score based on error type but don't set to 0
    if (error.message.includes('mapping items')) {
      score -= 15; // Indentation issues
    } else if (error.message.includes('duplicate key')) {
      score -= 20; // Duplicate keys
    } else {
      score -= 10; // Other syntax issues
    }
  }
  
  // Check if we have a valid config
  if (!config) {
    report.addIssue('syntax', 'Configuration could not be parsed');
    if (score > 5) score = 5; // Leave minimal score if only parsing failed
    return;
  }

  // Check required sections
  const requiredSections = ['name', 'version', 'type'];
  requiredSections.forEach(section => {
    if (!config[section]) {
      report.addIssue('syntax', `Missing required field: ${section}`, 'error');
      score -= 10;
    }
  });

  // Check phase sections
  ['ask:install', 'ask:runtime', 'run:install', 'run:runtime'].forEach(section => {
    if (config[section] && !Array.isArray(config[section])) {
      report.addIssue('syntax', `${section} must be an array`, 'error');
      score -= 5;
    }
  });

  if (score === SCORE_WEIGHTS.syntax) {
    report.addHighlight('syntax', 'All required sections present and properly formatted');
  }

  report.setScore('syntax', score);
}

async function validateLinking(config, report) {
  let score = SCORE_WEIGHTS.linking;
  
  // Skip if no valid config
  if (!config || Object.keys(config).length === 0) {
    report.setScore('linking', 0);
    return;
  }

  const links = new Set();
  const bindings = new Set();

  // Collect all links and bindings
  ['ask:install', 'ask:runtime'].forEach(section => {
    (config[section] || []).forEach(item => {
      if (item.link) links.add(item.link);
      if (item.bind) {
        const [linkName] = item.bind.split(';');
        bindings.add(linkName.trim());
      }
    });
  });

  // Validate bindings have corresponding links
  bindings.forEach(binding => {
    if (!links.has(binding)) {
      report.addIssue('linking', `Binding "${binding}" has no corresponding link`, 'error');
      score -= 5;
    }
  });

  // Validate timing in run sections
  ['run:install', 'run:runtime'].forEach(section => {
    (config[section] || []).forEach(item => {
      if (item.in) {
        const [linkName] = item.in.split(';');
        if (!links.has(linkName.trim())) {
          report.addIssue('linking', `Run command references undefined link "${linkName}"`, 'error');
          score -= 5;
        }
      }
    });
  });

  if (score === SCORE_WEIGHTS.linking) {
    report.addHighlight('linking', 'All links and bindings are properly connected');
  }

  report.setScore('linking', score);
}

async function validateCommands(config, report) {
  let score = SCORE_WEIGHTS.commands;
  
  // Skip if no valid config
  if (!config || Object.keys(config).length === 0) {
    report.setScore('commands', 0);
    return;
  }

  const validTypes = ['pw', 'power-shell', 'cmd', 'command-prompt'];

  ['run:install', 'run:runtime'].forEach(section => {
    (config[section] || []).forEach(item => {
      // Validate command structure
      if (item.run || item.see || item.text) {
        // Check shell type if specified
        if (item.type && !validTypes.includes(item.type)) {
          report.addIssue('commands', `Invalid shell type: ${item.type}`, 'warning');
          score -= 2;
        }

        // Check text command format
        if (item.text && item.search && !item.line && !item.replace) {
          report.addIssue('commands', 'Text search without line or replace specified', 'warning');
          score -= 2;
        }
      } else {
        report.addIssue('commands', 'Command missing run/see/text property', 'error');
        score -= 5;
      }
    });
  });

  if (score === SCORE_WEIGHTS.commands) {
    report.addHighlight('commands', 'All commands are properly structured');
  }

  report.setScore('commands', score);
}

async function validatePaths(config, report) {
  let score = SCORE_WEIGHTS.paths;
  
  // Skip if no valid config
  if (!config || Object.keys(config).length === 0) {
    report.setScore('paths', 0);
    return;
  }

  const seenPaths = new Set();

  // Helper to check path format
  const checkPath = (path) => {
    if (path.includes('${veb.app_path}')) {
      if (!path.includes('+')) {
        report.addIssue('paths', `Path with veb.app_path should use + for concatenation: ${path}`, 'warning');
        score -= 2;
      }
    }
    return true;
  };

  // Check paths in text commands
  ['run:install', 'run:runtime'].forEach(section => {
    (config[section] || []).forEach(item => {
      if (item.text) {
        const [_, path] = item.text.split(';').map(p => p.trim());
        if (path) {
          checkPath(path);
          seenPaths.add(path);
        }
      }
    });
  });

  if (score === SCORE_WEIGHTS.paths) {
    report.addHighlight('paths', 'All paths are properly formatted');
  }

  report.setScore('paths', score);
}

async function validateDependencies(config, report) {
  let score = SCORE_WEIGHTS.dependencies;
  
  // Skip if no valid config
  if (!config || Object.keys(config).length === 0) {
    report.setScore('dependencies', 0);
    return;
  }
  
  // Check version format
  if (config.version) {
    const validVersion = /^(b?\d+\.\d+\.\d+)$/.test(config.version);
    if (!validVersion) {
      report.addIssue('dependencies', 'Invalid version format', 'warning');
      score -= 5;
    }
  }

  if (score === SCORE_WEIGHTS.dependencies) {
    report.addHighlight('dependencies', 'All dependencies and versions are properly specified');
  }

  report.setScore('dependencies', score);
}

export async function validateVexpConfig(filePath) {
  const report = new ValidationReport();
  
  let config = null;
  let parseError = null;
  
  try {
    config = await parseVexpConfig(filePath);
  } catch (error) {
    parseError = error;
  }

  try {
    // First run syntax validation with any parse error
    await validateSyntax(config, report, parseError);
    
    // Run other validations even if there were syntax issues
    await Promise.all([
      validateLinking(config || {}, report),
      validateCommands(config || {}, report),
      validatePaths(config || {}, report),
      validateDependencies(config || {}, report)
    ]);
    
    // Add improvement suggestions based on score
    if (report.getTotalScore() < 80) {
      if (report.scores.syntax < SCORE_WEIGHTS.syntax) {
        report.addImprovement('syntax', 'Add missing required fields and ensure proper YAML structure');
      }
      if (report.scores.linking < SCORE_WEIGHTS.linking) {
        report.addImprovement('linking', 'Verify all bindings have corresponding links');
      }
      if (report.scores.commands < SCORE_WEIGHTS.commands) {
        report.addImprovement('commands', 'Review command structure and shell type specifications');
      }
    }
    
    return report;
    
  } catch (error) {
    report.addIssue('syntax', `Failed to parse config: ${error.message}`, 'error');
    report.setScore('syntax', 0);
    return report;
  }
}