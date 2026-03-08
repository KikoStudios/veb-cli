# veb-cli Windows Installation Script
$ErrorActionPreference = "Stop"

$repo = "KikoStudios/veb-cli"
$binName = "veb-windows.exe"
$installDir = "$env:LOCALAPPDATA\Programs\veb"
$target = "$installDir\veb.exe"
$latestReleaseUrl = "https://github.com/$repo/releases/latest/download/$binName"

Write-Host "Installing veb..." -ForegroundColor Cyan

# Check Architecture
if ($env:PROCESSOR_ARCHITECTURE -ne "AMD64") {
    Write-Host "Error: Only x64 architecture is currently supported." -ForegroundColor Red
    exit 1
}

# Create installation directory if it doesn't exist
if (-not (Test-Path -Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir | Out-Null
}

Write-Host "Downloading $binName from $latestReleaseUrl..."
Write-Host "This is a large file (~120MB), preparing download..." -ForegroundColor Gray

# Download to the installation directory
try {
    # Use curl.exe which is much faster than Invoke-WebRequest and has a nice progress bar
    curl.exe -# -L $latestReleaseUrl -o $target
    if ($LASTEXITCODE -ne 0) { throw "Download failed" }
} catch {
    Write-Host "Error: Failed to download the binary. Please check if the releases exist on GitHub. ($LASTEXITCODE)" -ForegroundColor Red
    exit 1
}

# Add to PATH if it's not already there
$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($userPath -notmatch [regex]::Escape($installDir)) {
    Write-Host "Adding $installDir to your PATH..."
    $newPath = "$userPath;$installDir"
    [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
    
    # Try to update current session PATH (won't affect parent process but helps if running in same session)
    $env:PATH = "$env:PATH;$installDir"
    
    Write-Host "Note: You might need to restart your terminal for the PATH changes to take effect." -ForegroundColor Yellow
}

Write-Host "Success! 'veb' is now installed." -ForegroundColor Green
Write-Host "You can run it by typing: veb"
