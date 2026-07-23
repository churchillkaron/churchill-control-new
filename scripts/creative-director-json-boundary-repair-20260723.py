from pathlib import Path


path = Path("lib/creative/intent/CreativeMissionComposerRuntime.js")
text = path.read_text()

old = '''function directorText(execution = {}) {
  return (
    execution?.output?.output?.text ||
    execution?.output?.text ||
    execution?.output?.content ||
    execution?.output?.result?.text ||
    execution?.result?.output?.text ||
    ""
  );
}
'''

new = '''function directorJson(execution = {}) {
  const candidates = [
    execution?.output?.output?.json,
    execution?.output?.json,
    execution?.output?.result?.json,
    execution?.result?.output?.json,
    execution?.result?.json,
  ];

  return candidates.find((candidate) =>
    candidate &&
    typeof candidate === "object" &&
    !Array.isArray(candidate),
  ) || null;
}

function directorText(execution = {}) {
  const candidates = [
    execution?.output?.output?.text,
    execution?.output?.text,
    execution?.output?.content,
    execution?.output?.result?.text,
    execution?.result?.output?.text,
  ];

  return candidates.find((candidate) =>
    typeof candidate === "string" && candidate.trim(),
  ) || "";
}
'''

if text.count(old) != 1:
    raise SystemExit(
        f"director helper block: expected one match, found {text.count(old)}"
    )

text = text.replace(old, new, 1)

old = '''    const parsed = parseJson(directorText(execution));
    if (!parsed) {
'''

new = '''    const parsed =
      directorJson(execution) ||
      parseJson(directorText(execution));
    if (!parsed) {
'''

if text.count(old) != 1:
    raise SystemExit(
        f"director parse block: expected one match, found {text.count(old)}"
    )

path.write_text(text.replace(old, new, 1))
