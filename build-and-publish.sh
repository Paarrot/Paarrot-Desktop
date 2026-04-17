#!/bin/bash

# Set GitHub token for publishing
export GH_TOKEN="ghtoken"

# Run the build and publish
npm run build

# Exit with the build's exit code
exit $?
