"""Install script endpoint.

GET /install returns a shell script for bootstrapping GSD Cloud nodes.
Served as text/plain for direct piping: curl -fsSL <server>/install | sh
"""
from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

router = APIRouter(tags=["install"])

INSTALL_SCRIPT = """\
#!/bin/sh
set -e

# GSD Cloud Node Installer
# Usage: curl -fsSL <server>/install | sh

echo "GSD Cloud Node Installer"
echo "========================"
echo ""

# Detect OS and architecture
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
    x86_64) ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

echo "Detected: $OS/$ARCH"
echo ""

# Build from source (binary hosting not yet configured)
echo "Binary releases are not yet available."
echo "To install from source, ensure Go 1.25+ is installed, then run:"
echo ""
echo "  git clone https://github.com/gsd-build/gsd-cloud.git"
echo "  cd gsd-cloud/node/daemon"
echo "  go build -o gsd-cloud ./cmd"
echo "  sudo mv gsd-cloud /usr/local/bin/"
echo ""
echo "After building, run:"
echo "  gsd-cloud login <YOUR_PAIRING_CODE>"
echo "  gsd-cloud start"
"""


@router.get("/install", response_class=PlainTextResponse)
async def get_install_script() -> str:
    """Return shell script for node installation. T-15-05: static content, not user-influenced."""
    return INSTALL_SCRIPT
