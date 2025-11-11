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
function removeComments(content) {
  // Remove single-line comments (//)
  content = content.replace(/\/\/[^\n]*/g, '');
  
  // Remove multi-line comments (/. ./)
  content = content.replace(/\/\.([\s\S]*?)\.\//g, '');
  
  return content;
}

export async function parseVexpConfig(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const cleaned = removeComments(content);
    const config = YAML.parse(cleaned);
    
    if (config.dependencies && !Array.isArray(config.dependencies)) {
      if (typeof config.dependencies === "string") {
        config.dependencies = config.dependencies.split(",").map(d => d.trim());
      } else {
        config.dependencies = [];
      }
    }
    
    return config;
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
    // Support both old comma format and new semicolon format
    const bindParts = question.bind.includes(";") ? 
      question.bind.split(";").map(part => part.trim()) :
      question.bind.split(",").map(part => part.trim());
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
export function processAskSection(config) {
  // Get install and runtime sections from the new format
  const installQuestions = (config?.['ask:install'] || []).map(q => ({
    ...parseQuestionType(q),
    phase: 'install'
  }));
  
  const runtimeQuestions = (config?.['ask:runtime'] || []).map(q => ({
    ...parseQuestionType(q),
    phase: 'runtime'
  }));
  
  const processedQuestions = [...installQuestions, ...runtimeQuestions];
  
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
        phase: q.phase
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
export function processRunSection(config, currentOS = null) {
  // Collect all run sections including OS-specific ones
  const runSections = Object.keys(config || {}).filter(key => key.startsWith('run:'));
  
  const allCommands = [];
  const osSpecificCommands = [];
  const genericCommands = [];
  
  runSections.forEach(sectionKey => {
    const commands = config[sectionKey] || [];
    const parts = sectionKey.split(':');
    const phase = parts[1] || 'install';
    const osTag = parts.length > 2 ? parts.slice(2).join(':') : null;
    
    commands.forEach(cmd => {
      const commandObj = typeof cmd === 'string' 
        ? { run: cmd, phase, osTag, sectionKey }
        : { ...cmd, phase, osTag, sectionKey };
      
      allCommands.push(commandObj);
      
      if (osTag) {
        osSpecificCommands.push(commandObj);
      } else {
        genericCommands.push(commandObj);
      }
    });
  });
  
  // Filter by OS if currentOS is provided
  let filteredCommands = allCommands;
  if (currentOS) {
    // Find OS-specific commands for current OS
    const matchingOSSpecific = osSpecificCommands.filter(cmd => {
      return cmd.osTag === currentOS || cmd.osTag.startsWith(currentOS);
    });
    
    if (matchingOSSpecific.length > 0) {
      // Use only OS-specific commands, exclude generic ones
      filteredCommands = matchingOSSpecific;
      console.log(chalk.gray(`Using OS-specific commands for ${currentOS} (${filteredCommands.length} commands)`));
    } else {
      // Check if any OS-specific commands exist at all
      if (osSpecificCommands.length > 0) {
        // OS-specific commands exist but none match current OS
        const availableOS = [...new Set(osSpecificCommands.map(c => c.osTag).filter(Boolean))];
        throw new Error(`OS not compatible. This project requires: ${availableOS.join(', ')}`);
      }
      // No OS-specific commands, use generic ones
      filteredCommands = genericCommands;
      console.log(chalk.gray(`Using generic commands (${filteredCommands.length} commands)`));
    }
  } else {
    // No OS detection, use all commands
    filteredCommands = allCommands;
  }
  
  console.log(chalk.gray(`Processing ${filteredCommands.length} commands${currentOS ? ` for ${currentOS}` : ''}...`));
  
  // Group commands by order blocks (marked with -run:)
  let currentGroup = [];
  const processed = [];
  
  filteredCommands.forEach(item => {
    // Handle both string commands and object commands with run property
    if (!item) return;
    
    // Process the command value
    let command = '';
    let isHead = false;
    let shellType = item.type || 'default';
    
    // Normalize shell type
    shellType = shellType.toLowerCase();
    if (['pw', 'power-shell'].includes(shellType)) {
      shellType = 'powershell';
    } else if (['cmd', 'command-prompt'].includes(shellType)) {
      shellType = 'cmd';
    }
    
    if (typeof item === 'string') {
      command = item;
      isHead = item.startsWith('-');
    } else if (typeof item === 'object') {
      if (item.run) {
        command = item.run;
        isHead = command.startsWith('-');
      } else if (item.see) {
        // Handle see command with chalk styling
        const parts = Array.isArray(item.see) ? item.see : [item.see];
        command = parts.map(part => {
          const [text, style] = part.split(';').map(p => p.trim());
          if (style && style.startsWith('chalk.')) {
            const funcName = style.substring(6, style.indexOf('('));
            if (chalk[funcName]) {
              return `echo "${chalk[funcName](text)}"`;
            }
          }
          return `echo "${text}"`;
        }).join(' && ');
      } else if (item.text) {
        // Handle text editing command
        const [content, filePath] = item.text.split(';').map(p => p.trim());
        let targetPath = filePath;
        if (filePath.includes('+')) {
          targetPath = filePath.split('+').map(p => p.trim()).join('/');
        }
        targetPath = targetPath.replace('${veb.app_path}', '.');

        let textCommand = '';
        if (item.search && item.replace) {
          // Replace mode
          textCommand = `sed -i 's/${item.search}/${item.replace}/g' "${targetPath}"`;
        } else {
          // Insert mode
          let linePos = '';
          if (item.line) {
            const lineSpec = item.line.toLowerCase();
            if (lineSpec.includes('same.after')) {
              linePos = ''; // Append after found line
            } else if (lineSpec.includes('same.before')) {
              linePos = 'i'; // Insert before found line
            } else {
              const match = lineSpec.match(/([+-]\d+)\.(before|after)/);
              if (match) {
                const [_, offset, pos] = match;
                linePos = pos === 'before' ? `${offset}i` : `${offset}a`;
              } else if (!isNaN(lineSpec)) {
                linePos = `${lineSpec}`;
              }
            }
          }

          if (item.search) {
            // Insert relative to search
            textCommand = `sed -i '/${item.search}/${linePos}${content}/' "${targetPath}"`;
          } else {
            // Insert at specific line or end of file
            if (linePos) {
              textCommand = `sed -i '${linePos}${content}' "${targetPath}"`;
            } else {
              textCommand = `echo "${content}" >> "${targetPath}"`;
            }
          }
        }
        command = textCommand;
      } else {
        return; // Skip invalid commands
      }
    } else {
      return; // Skip invalid commands
    }
    
    // Process in: parameter for command timing
    let timing = null;
    let linkName = null;
    
    if (item.in && typeof item.in === 'string') {
      const [link, time] = item.in.split(';').map(part => part.trim());
      linkName = link;
      // Support multiple timing syntaxes (before/b/<) and (after/a/>)
      timing = time.startsWith('<') || time === 'before' || time === 'b' ? 'before' : 'after';
    }
    
    const processedCommand = {
      command: command.replace(/^-/, ''), // Remove leading - if present
      phase: item.phase || (typeof item === 'object' ? item.phase : null),
      timing,
      linkName,
      shellType,
      variables: [],
      original: item, // Keep original for reference
      // Extract variables from the command
      variableRegex: /\${([^}]+)}/g,
      execute: (values, builtIns = {}) => {
        let result = command.replace(/^-/, '');
        
        // Handle git.get() commands
        if (result.trim().startsWith('git.get')) {
          const gitMatch = result.match(/git\.get\((.*?)\)/);
          if (gitMatch) {
            const filePath = gitMatch[1].replace(/['"]/g, '').trim();
            const repoUrl = builtIns.REPO_URL || process.env.REPO_URL || '';
            result = `git clone ${filePath ? '-n --depth 1 --filter=blob:none --sparse' : ''} ${repoUrl} && ` +
                    (filePath ? `cd $(basename ${repoUrl}) && git sparse-checkout set ${filePath}` : '');
          }
        }
        
        // Replace variables including built-in (bi.*) and veb.app_path
        let match;
        const regex = /\${([^}]+)}/g;
        while ((match = regex.exec(result)) !== null) {
          const variable = match[1];
          
          // Handle built-in variables (bi.*)
          if (variable.startsWith('bi.')) {
            const biVar = variable.substring(3);
            if (builtIns[biVar] !== undefined) {
              result = result.replace(`\${${variable}}`, builtIns[biVar]);
            } else if (process.env[biVar]) {
              result = result.replace(`\${${variable}}`, process.env[biVar]);
            }
          } else if (variable === 'veb.app_path') {
            result = result.replace('${veb.app_path}', process.env.VEB_APP_PATH || '.');
          } else if (values[variable] !== undefined) {
            const v = values[variable];
            const asText = Array.isArray(v) ? v.join(", ") : String(v);
            result = result.replace(`\${${variable}}`, asText);
          }
        }
        return result;
      }
    };
    
    if (isHead) {
      if (currentGroup.length > 0) {
        processed.push(...currentGroup);
      }
      currentGroup = [processedCommand];
    } else if (currentGroup.length > 0) {
      currentGroup.push(processedCommand);
    } else {
      processed.push(processedCommand);
    }
  });
  
  // Add any remaining grouped commands
  if (currentGroup.length > 0) {
    processed.push(...currentGroup);
  }
  
  return processed;
}