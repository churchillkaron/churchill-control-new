#!/bin/sh
set -eu

node --loader ./scripts/next-alias-loader.mjs scripts/creative-command-preflight.mjs "$@"
node --loader ./scripts/next-alias-loader.mjs scripts/creative-direction-approval.mjs "$@"
exec node --loader ./scripts/next-alias-loader.mjs scripts/creative-command.mjs "$@"
