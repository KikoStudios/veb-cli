# VEB - The Universal Runtime

**Install and run any app from the internet with one command.**

VEB is a cross-platform runtime manager that makes any application installable and runnable without the hassle. While Python has `pip` and Node has `npm` for packages, **VEB is designed for complete applications**—not just modules.

## The Problem VEB Solves

Ever tried to run an open-source project and faced:
- Complex setup instructions scattered across READMEs
- Platform-specific installation steps
- Missing dependencies you have to hunt down
- Scripts that only work on Linux or only on Windows
- Hours of troubleshooting just to get "Hello World"

**VEB fixes this.**

## How It Works

1. Drop a **VEXP configuration file** into any repository (even giant open-source projects)
2. Run `veb install username/repo`
3. That's it. The app is installed and ready to run.

No crazy technical knowledge required. No platform-specific scripts. No hassle.

```bash
# Install any app from GitHub
veb install facebook/react-native

# Run it
veb run react-native

# Done. ✓
```

## What Makes VEB Different

| Tool | Purpose | VEB Difference |
|------|---------|----------------|
| **npm** | Node.js packages/modules | VEB installs complete **applications** |
| **pip** | Python packages | VEB is **cross-platform** for any tech stack |
| **Docker** | Containerization | VEB is **lightweight** and runtime-focused |
| **Manual setup** | Follow README instructions | VEB **automates everything** |

VEB handles:
- ✅ Cross-platform compatibility (Windows, Linux, macOS)
- ✅ Dependency management
- ✅ Interactive setup (asks you questions, remembers answers)
- ✅ Process monitoring and management
- ✅ Runtime configuration
- ✅ One-command installation

## Quick Start

### Install VEB

**Windows (PowerShell)**:
```powershell
irm https://raw.githubusercontent.com/KikoStudios/veb-cli/main/install.ps1 | iex
```

**Linux (Bash)**:
```bash
curl -fsSL https://raw.githubusercontent.com/KikoStudios/veb-cli/main/install.sh | bash
```

*(Alternatively, to build from source)*
```bash
# Clone and link globally
git clone <veb-repo>
cd veb
bun install
bun link
```

### Use VEB

```bash
# Install any app from GitHub
veb install username/project

# Run it
veb run project

# Check running processes
veb processes
```

### For Developers: Make Your App VEB-Ready

Add a `project.vexp.config` file to your repo:

```yaml
name: My Awesome App
version: 1.0.0

ask:
  install:
    - name: port
      prompt: "What port should the app run on?"
      type: text
      default: "3000"

run:
  install:
    - command: "npm install"
    - command: "npm run build"
  runtime:
    - command: "npm start -- --port=${port}"
```

Now anyone can install your app with one command:
```bash
veb install yourusername/awesome-app
```

## Documentation

- **[Complete Command Reference](COMMANDS.md)** - All commands with examples
- **[VEXP Configuration Guide](#)** - How to create VEXP files

## Tech Stack

Built with:
- [Bun](https://bun.sh) - Fast JavaScript runtime
- [Convex](https://convex.dev) - Backend authentication & storage
- Cross-platform from the ground up

## Development

```bash
# Install dependencies
bun install

# Run locally
bun run scr/cli.js

# Link globally
bun link
```

## Philosophy

**VEB makes software accessible.**

No more "works on my machine." No more copy-pasting terminal commands from StackOverflow. Just `veb install` and go.

---

Made for developers who want their apps to *just work* everywhere.
