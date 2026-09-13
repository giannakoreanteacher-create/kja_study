# data-prep/validate_meanings.py
import json

with open("data-prep/words_raw.json", encoding="utf-8") as f:
    raw = json.load(f)
with open("data-prep/words_with_meanings.json", encoding="utf-8") as f:
    withm = json.load(f)

assert len(raw) == len(withm) == 5965, f"length mismatch: raw={len(raw)} withm={len(withm)}"

for i, (r, w) in enumerate(zip(raw, withm)):
    assert r["word"] == w["word"], f"word mismatch at {i}: {r['word']} != {w['word']}"
    assert r["pos"] == w["pos"], f"pos mismatch at {i}"
    assert r["level"] == w["level"], f"level mismatch at {i}"
    meaning = w.get("meaning", "").strip()
    assert meaning, f"empty meaning at index {i} for word {w['word']}"

print("OK: all", len(withm), "entries have a non-empty, order-aligned meaning")
