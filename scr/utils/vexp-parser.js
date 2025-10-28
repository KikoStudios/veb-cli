import fs from "fs/promises";
import path from "path";
import YAML from "yaml";
import chalk from "chalk";

/**
 * Parse a VEXP config file
 * 
 * @param {string} filePath - Path to the VEXP config file
 * @returns {Object} Parsed config
 */
export async function parseVexpConfig(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return YAML.parse(content);
  } catch (err) {
    console.error(chalk.red(`Error parsing VEXP config: ${err.message}`));
    return null;
  }
}

/**
 * Format project info for display
 * @param {Object} config - Parsed VEXP config
 * @param {boolean} raw - Whether to return raw YAML
 * @returns {string} Formatted project info
 */
export function formatProjectInfo(config, raw = false) {
  if (raw) {
    return YAML.stringify({
      name: config.name,
      version: config.version,
      type: config.type,
      author: config.author,
      contact: config.contact
    });
  }

  let output = "";
  output += chalk.green("Project Information:\n");
  if (config.name) output += chalk.blue("Name: ") + config.name + "\n";
  if (config.version) {
    const isBeta = config.version.toString().startsWith("b");
    const versionText = isBeta ? chalk.yellow(config.version) : config.version;
    output += chalk.blue("Version: ") + versionText + "\n";
  }
  if (config.type) output += chalk.blue("Type: ") + config.type + "\n";
  if (config.author) output += chalk.blue("Author: ") + config.author + "\n";
  if (config.contact) output += chalk.blue("Contact: ") + config.contact + "\n";
  
  return output;
}

/**
 * Process icon configuration with chalk formatting
 * @param {string} iconConfig - Icon configuration string (e.g., "☺, chalk.magenta()")
 * @returns {Function} Function that returns formatted icon
 */
export function processIcon(iconConfig) {
  if (!iconConfig) return () => "";
  
  try {
    const [icon, chalkFunc] = iconConfig.split(",").map(part => part.trim());
    
    // Extract chalk function name and create a dynamic function
    if (chalkFunc && chalkFunc.startsWith("chalk.")) {
      const funcName = chalkFunc.substring(6, chalkFunc.indexOf("("));
      if (chalk[funcName]) {
        return () => chalk[funcName](icon);
      }
    }
    
    // Default case - just return the icon
    return () => icon;
  } catch (err) {
    console.error(`Error processing icon: ${err.message}`);
    return () => "";
  }
}

/**
 * Parse question types and their options
 * @param {Object} question - Question configuration
 * @returns {Object} Processed question
 */
export function parseQuestionType(question) {
  const result = { ...question };
  
  // Get variable name from var property
  result.variableName = question.var || "";
  
  // Process question type
  if (question.type) {
    const typeStr = String(question.type).trim().toLowerCase();
    // Support composite type for select: e.g., "s; m" or "s; o"
    if (typeStr.startsWith("s")) {
      // Always treat select as multi-select; no mode optioning
      result.processedType = "select";
      result.allowMultiple = true;
    } else {
      switch (typeStr) {
        case "w":
        case "write":
          result.processedType = "write";
          break;
        case "yon":
        case "yesno":
          result.processedType = "yesno";
          result.options = ["Yes", "No"];
          break;
        case "di":
        case "defined":
          result.processedType = "defined";
          break;
        case "select":
          result.processedType = "select";
          // Always multi-select by default
          result.allowMultiple = true;
          break;
        default:
          result.processedType = "write"; // Default to write
      }
    }
  } else {
    result.processedType = "write"; // Default to write
  }
  
  // Process options for defined/select types
  if ((result.processedType === "defined" || result.processedType === "select") && question.op) {
    result.options = question.op.split(";").map(opt => opt.trim());
  }
  
  // Process icon
  if (question.icon) {
    result.iconFormatter = processIcon(question.icon);
  }
  
  // Process linking
  if (question.link) {
    result.hasLink = true;
    result.linkId = question.link;
  }
  
  // Process binding
  if (question.bind) {
    const bindParts = question.bind.split(",").map(part => part.trim());
    if (bindParts.length >= 2) {
      result.bindToLink = bindParts[0];
      const rhs = bindParts[1];
      // Handle boolean values properly
      if (rhs === "True") {
        result.bindValue = true;
      } else if (rhs === "False") {
        result.bindValue = false;
      } else if (!isNaN(Number(rhs))) {
        // Numeric index for defined/select linking
        result.bindValueIndex = Number(rhs);
      } else {
        result.bindValue = rhs;
      }
    }
  }
  
  return result;
}

/**
 * Process the ask section of the config
 * @param {Array} askSection - The ask section from the config
 * @returns {Array} Processed questions
 */
export function processAskSection(askSection) {
  if (!askSection || !Array.isArray(askSection)) return [];
  
  const processedQuestions = askSection.map(question => parseQuestionType(question));
  
  // Process linking relationships
  processedQuestions.forEach(question => {
    if (question.hasLink) {
      // Mark this question as a source for linking
      question.isLinkSource = true;
      
      // Find questions that bind to this link
      const linkedQuestions = processedQuestions.filter(q => q.bindToLink === question.linkId);
      
      question.affectsQuestions = linkedQuestions.map(q => ({
        variableName: q.variableName,
        bindValue: q.bindValue,
        bindValueIndex: q.bindValueIndex,
        // When binding by index, we compare against the index of selected option(s)
      }));
    }
  });
  
  return processedQuestions;
}

/**
 * Process the run section of the config
 * @param {Array} runSection - The run section from the config
 * @returns {Array} Processed run commands
 */
export function processRunSection(runSection) {
  if (!runSection || !Array.isArray(runSection)) return [];
  
  return runSection.map(item => {
    const command = typeof item === 'string' ? item : item.run;
    
    // Extract variables from the command
    const variableRegex = /\${([^}]+)}/g;
    const variables = [];
    let match;
    
    while ((match = variableRegex.exec(command)) !== null) {
      variables.push(match[1]);
    }
    
    return {
      command,
      variables,
      // Function to substitute variables with values
      execute: (values) => {
        let result = command;
        variables.forEach(variable => {
          if (values[variable] !== undefined) {
            const v = values[variable];
            const asText = Array.isArray(v) ? v.join(", ") : String(v);
            result = result.replace(`\${${variable}}`, asText);
          }
        });
        return result;
      }
    };
  });
}