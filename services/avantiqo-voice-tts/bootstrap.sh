#!/bin/sh
set -eu

printf '%s\n' '{"event":"AVANTIQO_VOICE_TTS_BOOTSTRAP","phase":"process_started","secrets_printed":false}'
python --version

python - <<'PY'
import handler

print('{"event":"AVANTIQO_VOICE_TTS_BOOTSTRAP","phase":"model_preload_started","secrets_printed":false}')
model = handler._model()
if model is None:
    raise RuntimeError("AVANTIQO_VOICE_TTS_MODEL_PRELOAD_REQUIRED")
print('{"event":"AVANTIQO_VOICE_TTS_BOOTSTRAP","phase":"model_preload_completed","secrets_printed":false}')
PY

exec python -u handler.py
