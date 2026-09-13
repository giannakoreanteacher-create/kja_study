# data-prep/parse_source.py
import json
import xlrd

SRC = "한국어 학습용 어휘 목록.xls"
OUT = "data-prep/words_raw.json"

wb = xlrd.open_workbook(SRC)
sheet = wb.sheet_by_index(0)

rows = []
for r in range(1, sheet.nrows):  # skip header row
    word = sheet.cell_value(r, 1)
    pos = sheet.cell_value(r, 2)
    level = sheet.cell_value(r, 4)
    rows.append({"word": word, "pos": pos, "level": level})

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(rows, f, ensure_ascii=False, indent=2)

counts = {"A": 0, "B": 0, "C": 0}
for row in rows:
    counts[row["level"]] += 1

assert len(rows) == 5965, f"expected 5965 rows, got {len(rows)}"
assert counts == {"A": 982, "B": 2111, "C": 2872}, f"level counts mismatch: {counts}"
print("OK:", len(rows), counts)
