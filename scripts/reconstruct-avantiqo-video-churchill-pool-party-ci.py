from __future__ import annotations

import base64
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "scripts" / "fixtures" / "churchill-pool-party"
OUTPUT = ROOT / "assets" / "video" / "proofs" / "churchill-pool-party-reference.jpg"
EXPECTED_BYTES = 31806
EXPECTED_SHA256 = "06cc6b2b2b1799e650d574e18ffbc03a58f9ca3ee2d53b4cf4da8fec81408387"

parts = [
    FIXTURE / "ref-part-00.b64",
    FIXTURE / "ref-part-01.b64",
    FIXTURE / "ref-part-02.b64",
    FIXTURE / "ref-tail.b64",
]
encoded = "".join(path.read_text(encoding="utf-8").strip() for path in parts)
raw = base64.b64decode(encoded, validate=True)
digest = hashlib.sha256(raw).hexdigest()
if len(raw) != EXPECTED_BYTES:
    raise SystemExit(f"CHURCHILL_VIDEO_REFERENCE_SIZE_INVALID:{len(raw)}")
if digest != EXPECTED_SHA256:
    raise SystemExit(f"CHURCHILL_VIDEO_REFERENCE_SHA256_INVALID:{digest}")
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_bytes(raw)
print(f"CHURCHILL_VIDEO_REFERENCE={OUTPUT}")
print(f"CHURCHILL_VIDEO_REFERENCE_BYTES={len(raw)}")
print(f"CHURCHILL_VIDEO_REFERENCE_SHA256={digest}")
print("CHURCHILL_VIDEO_REFERENCE_RECONSTRUCTION=PASS")
