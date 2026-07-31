#!/bin/sh
set -eu

node --loader ./scripts/next-alias-loader.mjs scripts/creative-command-preflight.mjs "$@"
exec node --loader ./scripts/next-alias-loader.mjs scripts/creative-command.mjs "$@"
