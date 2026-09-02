# Registered launch marker only; approved frame bytes and digest remain authoritative.
import base64
import hashlib
import os
import pathlib
import re

ROOT = pathlib.Path("assets/video/proofs")
TARGET = pathlib.Path(os.environ["AVANTIQO_VIDEO_SCENE1_OPENING_FRAME"])
IMAGE_SHA256 = "cbf4437d77f74b2fd0193f9039ef64c511b597712fe08c466c30d4c231aeb0c5"
IMAGE_BYTES = 31376
PARTS = [
    ("scene1_frame.part-00.b64", 7000, "73bb7cab581f70499229b94d0ec6365353fb4f47758572a4b287237e40ecf6a6"),
    ("scene1_frame.part-01.b64", 7000, "168d8aea89c4249d05db937fc382550f1cb92ec1eb230b87a8f96ed28e0b7197"),
    ("scene1_frame.part-02.b64", 7000, "e8a1eae196bc044cb421f6603aa2d73bbae4b90f5522eabd064d511366464283"),
    ("scene1_frame.part-03.b64", 7000, "05caf15496ed7763b27d15dbba7bea0fe7f23e9e85dbfde9bd21303a8240ad7f"),
    ("scene1_frame.part-04.b64", 7000, "fa1e88c11220a40217ef1a599992922347e5722d6358f45967b499de85bc0c14"),
    ("scene1_frame.part-05.b64", 6836, "ecbc8c49e32e59ba90d9a2188dd22eed9bfed8fda5cba8918e4caeff85164abc"),
]


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("ascii")).hexdigest()


def compact(path: pathlib.Path) -> str:
    return re.sub(r"[^A-Za-z0-9+/=]", "", path.read_text(encoding="utf-8"))


def repair_contiguous(value: str, expected_len: int, expected_sha: str, name: str) -> str:
    if len(value) == expected_len and digest(value) == expected_sha:
        print(f"AVANTIQO_VIDEO_SCENE1_PART_EXACT={name}")
        return value
    surplus = len(value) - expected_len
    if surplus < 0 or surplus > 256:
        raise SystemExit(f"AVANTIQO_VIDEO_SCENE1_PART_LENGTH_INVALID:{name}:{len(value)}:{expected_len}")
    if surplus == 0:
        raise SystemExit(f"AVANTIQO_VIDEO_SCENE1_PART_DIGEST_INVALID:{name}")
    for start in range(0, len(value) - surplus + 1):
        candidate = value[:start] + value[start + surplus :]
        if digest(candidate) == expected_sha:
            print(f"AVANTIQO_VIDEO_SCENE1_PART_REPAIRED={name}:start={start}:removed={surplus}")
            return candidate
    raise SystemExit(f"AVANTIQO_VIDEO_SCENE1_PART_CONTIGUOUS_REPAIR_FAILED:{name}:{surplus}")


def main() -> None:
    repaired = []
    for name, expected_len, expected_sha in PARTS:
        value = compact(ROOT / name)
        print(f"AVANTIQO_VIDEO_SCENE1_PART_INPUT={name}:{len(value)}")
        repaired.append(repair_contiguous(value, expected_len, expected_sha, name))
    encoded = "".join(repaired)
    if len(encoded) != 41836:
        raise SystemExit(f"AVANTIQO_VIDEO_SCENE1_B64_LENGTH_INVALID:{len(encoded)}")
    raw = base64.b64decode(encoded, validate=True)
    image_sha = hashlib.sha256(raw).hexdigest()
    if len(raw) != IMAGE_BYTES:
        raise SystemExit(f"AVANTIQO_VIDEO_SCENE1_FRAME_SIZE_INVALID:{len(raw)}")
    if image_sha != IMAGE_SHA256:
        raise SystemExit(f"AVANTIQO_VIDEO_SCENE1_FRAME_DIGEST_INVALID:{image_sha}")
    if raw[:2] != b"\xff\xd8" or raw[-2:] != b"\xff\xd9":
        raise SystemExit("AVANTIQO_VIDEO_SCENE1_FRAME_JPEG_BOUNDARY_INVALID")
    TARGET.write_bytes(raw)
    print(f"AVANTIQO_VIDEO_SCENE1_FRAME_BYTES={len(raw)}")
    print(f"AVANTIQO_VIDEO_SCENE1_FRAME_SHA256={image_sha}")
    print("AVANTIQO_VIDEO_SCENE1_APPROVED_FRAME=PASS")


if __name__ == "__main__":
    main()
