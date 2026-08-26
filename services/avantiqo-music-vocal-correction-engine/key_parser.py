import re

KEY_PARSER_CONTRACT = "AVANTIQO_MUSIC_VOCAL_KEY_PARSER_V1"

NOTE_TO_PC = {
    "c": 0,
    "c#": 1,
    "db": 1,
    "d": 2,
    "d#": 3,
    "eb": 3,
    "e": 4,
    "f": 5,
    "f#": 6,
    "gb": 6,
    "g": 7,
    "g#": 8,
    "ab": 8,
    "a": 9,
    "a#": 10,
    "bb": 10,
    "b": 11,
}

_KEY_PATTERN = re.compile(
    r"^\s*([a-gA-G])\s*([#♯b♭]?)\s*(major|maj|minor|min|m)?\s*$",
    re.IGNORECASE,
)


def parse_music_key(value: object) -> tuple[int, str] | None:
    """Parse common compact and spaced musical key names without guessing."""
    source = str(value or "").strip()
    if not source:
        return None
    match = _KEY_PATTERN.fullmatch(source)
    if match is None:
        return None

    letter = match.group(1).lower()
    accidental = (match.group(2) or "").replace("♯", "#").replace("♭", "b").lower()
    root_name = f"{letter}{accidental}"
    root_pc = NOTE_TO_PC.get(root_name)
    if root_pc is None:
        return None

    mode_token = (match.group(3) or "major").lower()
    mode = "minor" if mode_token in {"minor", "min", "m"} else "major"
    return root_pc, mode


def key_parser_self_test() -> dict[str, object]:
    cases = {
        "C": (0, "major"),
        "C major": (0, "major"),
        "Cmaj": (0, "major"),
        "Am": (9, "minor"),
        "A minor": (9, "minor"),
        "F#m": (6, "minor"),
        "F# minor": (6, "minor"),
        "Bb": (10, "major"),
        "B♭ major": (10, "major"),
        "Dbm": (1, "minor"),
        "D♭ min": (1, "minor"),
    }
    failures = {
        key: {"expected": expected, "actual": parse_music_key(key)}
        for key, expected in cases.items()
        if parse_music_key(key) != expected
    }
    rejected = ["H", "C dorian", "A##", "", "minor"]
    rejection_failures = [value for value in rejected if parse_music_key(value) is not None]
    return {
        "success": not failures and not rejection_failures,
        "contract": KEY_PARSER_CONTRACT,
        "case_count": len(cases),
        "failures": failures,
        "rejection_failures": rejection_failures,
    }
