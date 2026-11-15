#!/usr/bin/env python3
"""Baixa registros públicos NASA RadLab/ISS que coincidem com a missão Axiom-1."""
from __future__ import annotations
import csv, hashlib, io, json, pathlib, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEST = ROOT / "dados" / "nasa_radlab" / "Ax-1"
DEST.mkdir(parents=True, exist_ok=True)
params = [
    ("spacecraft", "ISS"), ("instrument", "DosTel"),
    ("timestamp>", "2022-04-09T00:00"), ("timestamp<", "2022-04-25T00:00"),
    ("absorbed_dose_rate", ""), ("dose_equivalent_rate", ""), ("format", "csv"),
]
query = urllib.parse.urlencode(params)
url = "https://visualization.osdr.nasa.gov/radlab/api/?" + query
request = urllib.request.Request(url, headers={"User-Agent": "Orbita-SpaceApps/1.0"})
with urllib.request.urlopen(request, timeout=40) as response:
    content = response.read()
text = content.decode("utf-8-sig")
rows = list(csv.DictReader(io.StringIO(text)))
if not rows:
    raise SystemExit("A NASA RadLab não retornou registros para esse período.")
path = DEST / "iss_dostel_2022-04-09_2022-04-17.csv"
path.write_bytes(content)
manifest = {
    "mission": "Axiom Mission 1 (Ax-1)",
    "note": "Dosímetros ambientais da ISS no período da missão; não são dosímetros pessoais de um tripulante. A consulta solicitou 09–25 abr 2022; o arquivo contém registros até 17 abr 2022, último registro disponível na resposta.",
    "source": "NASA OSDR RadLab API",
    "api_url": url,
    "query": {"spacecraft": "ISS", "instrument": "DosTel", "from_inclusive": "2022-04-09T00:00", "to_exclusive": "2022-04-25T00:00"},
    "columns": list(rows[0].keys()),
    "records": len(rows),
    "first_timestamp": rows[0]["timestamp"],
    "last_timestamp": rows[-1]["timestamp"],
    "file": path.name,
    "sha256": hashlib.sha256(content).hexdigest(),
    "units": {"absorbed_dose_rate": "µGy/h", "dose_equivalent_rate": "µSv/h (indisponível nas linhas retornadas)"},
}
(DEST / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Salvo {len(rows)} registros em {path}")
print(f"Cobertura observada: {manifest['first_timestamp']} a {manifest['last_timestamp']}")
