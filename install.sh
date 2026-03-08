#!/bin/bash
# veb-cli Linux Installation Script

set -e

REPO="KikoStudios/veb-cli"
BIN_NAME="veb-linux"
INSTALL_DIR="/usr/local/bin"
TARGET="$INSTALL_DIR/veb"

echo "Installing veb..."

# Check OS and Architecture
if [ "$(uname -s)" != "Linux" ]; then
    echo "Error: This script is only for Linux."
    exit 1
fi

if [ "$(uname -m)" != "x86_64" ]; then
    echo "Error: Only x86_64 architecture is currently supported."
    exit 1
fi

# Fetch the latest release URL
LATEST_RELEASE_URL="https://github.com/$REPO/releases/latest/download/$BIN_NAME"

echo "Downloading $BIN_NAME from $LATEST_RELEASE_URL..."

# Download to a temporary location
TMP_FILE="/tmp/$BIN_NAME"
curl -sL "$LATEST_RELEASE_URL" -o "$TMP_FILE"

if [ $? -ne 0 ]; then
    echo "Error: Failed to download the binary. Please check if the releases exist on GitHub."
    rm -f "$TMP_FILE"
    exit 1
fi

echo "Installing to $TARGET (may require sudo)..."
# Move to install directory and make executable
sudo mv "$TMP_FILE" "$TARGET"
sudo chmod +x "$TARGET"

echo "Success! 'veb' is now installed."
echo "You can run it by typing: veb"
