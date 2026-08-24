#!/bin/sh
set -eu

printf '%s\n' '{"event":"AVANTIQO_VOICE_TTS_BOOTSTRAP","phase":"process_started","secrets_printed":false}'
python --version
exec python -u handler.py
