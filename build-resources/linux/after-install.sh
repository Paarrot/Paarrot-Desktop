#!/bin/bash
# Post-installation script for .deb and .rpm packages

# Update desktop database for the .desktop file 
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database -q /usr/share/applications || true
fi

# Update icon cache
if command -v gtk-update-icon-cache &> /dev/null; then
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi

# Set appropriate permissions for chrome-sandbox (required for Electron)
SANDBOX_PATH="/opt/Paarrot/chrome-sandbox"
if [ -f "$SANDBOX_PATH" ]; then
    chmod 4755 "$SANDBOX_PATH" || true
fi

exit 0
