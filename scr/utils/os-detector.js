import { platform, release } from "os";

export function detectOS() {
  const plat = platform();
  const rel = release();

  if (plat === "darwin") {
    return "macos";
  }

  if (plat === "win32") {
    try {
      const { execSync } = require("child_process");
      const winVersion = execSync('powershell -Command "(Get-CimInstance Win32_OperatingSystem).Version"', { encoding: "utf8" }).trim();
      const majorVersion = parseFloat(winVersion.split('.')[0]);
      if (majorVersion >= 10) {
        return "win11";
      }
    } catch (error) {
      // Fallback
    }
    return "windows";
  }

  if (plat === "linux") {
    try {
      const { execSync } = require("child_process");
      const osRelease = execSync("cat /etc/os-release 2>/dev/null || echo", { encoding: "utf8" });
      
      if (osRelease.includes("Arch")) {
        return "arch";
      }
      if (osRelease.includes("Fedora")) {
        const fedoraMatch = osRelease.match(/VERSION_ID="?(\d+)"?/);
        if (fedoraMatch) {
          return `fedora${fedoraMatch[1]}`;
        }
        return "fedora";
      }
      if (osRelease.includes("Ubuntu")) {
        return "ubuntu";
      }
      if (osRelease.includes("Debian")) {
        return "debian";
      }
    } catch (error) {
      // Fallback to generic linux
    }
    return "linux";
  }

  return "unknown";
}

export function matchOSCommand(osTag, currentOS) {
  if (!osTag || !osTag.includes(":")) {
    return true;
  }

  const parts = osTag.split(":");
  if (parts.length < 3) {
    return true;
  }

  const commandOS = parts.slice(2).join(":");
  return commandOS === currentOS || commandOS.startsWith(currentOS);
}

export function filterCommandsByOS(commands, currentOS) {
  return commands.filter((cmd) => {
    if (!cmd.phase) return true;
    
    const phase = cmd.phase.toLowerCase();
    if (phase.includes(`:${currentOS}`)) {
      return true;
    }
    
    if (phase.includes(":") && !phase.includes(`:${currentOS}`)) {
      return false;
    }
    
    return !phase.includes(":");
  });
}

