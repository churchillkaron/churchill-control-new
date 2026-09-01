import hashlib
import os
from pathlib import Path

from PIL import Image, ImageFilter

SOURCE = Path(os.environ["AVANTIQO_VIDEO_SCENE1_OPENING_FRAME"])
TARGET = Path(os.environ["AVANTIQO_VIDEO_SCENE1_PREPARED_FRAME"])


def main() -> None:
    if not SOURCE.is_file() or SOURCE.stat().st_size < 20_000:
        raise SystemExit("AVANTIQO_VIDEO_SCENE1_SOURCE_FRAME_INVALID")
    with Image.open(SOURCE) as original:
        image = original.convert("RGB")
    x0 = int(image.width * 0.05)
    x1 = int(image.width * 0.58)
    y0 = int(image.height * 0.03)
    y1 = int(image.height * 0.24)
    region = image.crop((x0, y0, x1, y1)).filter(ImageFilter.GaussianBlur(max(14, image.width // 90)))
    image.paste(region, (x0, y0))
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    image.save(TARGET, format="PNG", optimize=True)
    raw = TARGET.read_bytes()
    if len(raw) < 20_000:
        raise SystemExit("AVANTIQO_VIDEO_SCENE1_PREPARED_FRAME_INVALID")
    print(f"AVANTIQO_VIDEO_SCENE1_PREPARED_WIDTH={image.width}")
    print(f"AVANTIQO_VIDEO_SCENE1_PREPARED_HEIGHT={image.height}")
    print(f"AVANTIQO_VIDEO_SCENE1_PREPARED_BYTES={len(raw)}")
    print(f"AVANTIQO_VIDEO_SCENE1_PREPARED_SHA256={hashlib.sha256(raw).hexdigest()}")
    print("AVANTIQO_VIDEO_SCENE1_PREPROCESSING_OUTSIDE_GPU=PASS")


if __name__ == "__main__":
    main()
