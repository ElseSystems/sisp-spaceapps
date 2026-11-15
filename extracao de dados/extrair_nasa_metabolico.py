#!/usr/bin/env python3
"""Baixa o painel metabólico humano da missão Inspiration4 (NASA OSDR OSD-575)."""
from __future__ import annotations
import hashlib, json, pathlib, urllib.request

BASE = "https://osdr.nasa.gov"
STUDY = "575"
FILE = "LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv"
OUT = pathlib.Path("dados/nasa_osdr/OSD-575")

def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "SpaceAppsGoiania2026/1.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()

def save(url: str, path: pathlib.Path) -> dict[str, object]:
    content = fetch(url)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return {"path": str(path), "url": url, "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()}

def main() -> None:
    files_url = f"{BASE}/osdr/data/osd/files/{STUDY}"
    meta_url = f"{BASE}/osdr/data/osd/meta/{STUDY}"
    files = json.loads(fetch(files_url))
    study_files = files.get("studies", {}).get("OSD-575", {}).get("study_files", [])
    selected = next((f for f in study_files if f.get("file_name") == FILE), None)
    if selected is None:
        raise RuntimeError(f"A API OSDR não listou {FILE} no OSD-575")
    downloads = [save(files_url, OUT / "files.json"), save(meta_url, OUT / "metadata.json"),
                 save(BASE + selected["remote_url"], OUT / FILE)]
    manifest = {"source": "NASA Open Science Data Repository (OSDR)", "study": "OSD-575",
                "title": "SpaceX Inspiration4 Blood Serum Comprehensive Metabolic Panel",
                "organism": "Homo sapiens", "scope_note": "Amostras de soro pré e pós voo; glicose é ensaio laboratorial, não sensor contínuo nem medida em órbita.",
                "api": {"files": files_url, "metadata": meta_url}, "selected_file": selected, "downloads": downloads}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
