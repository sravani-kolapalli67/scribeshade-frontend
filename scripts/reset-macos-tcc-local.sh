#!/usr/bin/env bash
set -euo pipefail

tccutil reset Microphone com.hiddenmindsolutions.scribeshade-frontend
tccutil reset ScreenCapture com.hiddenmindsolutions.scribeshade-frontend

echo "Reset complete for:"
echo "- Microphone"
echo "- ScreenCapture"
echo "Bundle: com.hiddenmindsolutions.scribeshade-frontend"
