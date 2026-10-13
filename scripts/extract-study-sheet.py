"""Extract a diary XLSX to JSON for import-study.ts; does not modify the workbook."""
import json
import sys
from pathlib import Path
import openpyxl

source = Path(sys.argv[1])
workbook = openpyxl.load_workbook(source, read_only=True, data_only=True)
sheet = workbook["Отметки"]
payload = {"source": source.name, "rows": list(sheet.values)}
Path(sys.argv[2]).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
workbook.close()
