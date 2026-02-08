#!/bin/bash
set -e

echo "🛡️ CodeSentinel sandbox started"

WORKDIR="/home/user"
cd "$WORKDIR" || exit 0

# During template build, repo does NOT exist
# So we must NOT fail here
if [ ! -f "package.json" ]; then
  echo "ℹ️ No package.json found (template startup). Waiting for execution phase."
  exit 0
fi

# Execution phase (when agent runs sandbox)
if [ -z "$EXEC_COMMAND" ]; then
  echo "ℹ️ No EXEC_COMMAND provided."
  exit 0
fi

echo "🚀 Running command:"
echo "$EXEC_COMMAND"
echo "-----------------------------"

bash -c "$EXEC_COMMAND"
