#!/usr/bin/env python3
"""Baixa dados públicos de histologia e força do músculo sóleo (NASA OSD-662)."""

from __future__ import annotations

import hashlib
import json
import pathlib
import urllib.request

BASE = "https://osdr.nasa.gov"
STUDY_ID = "662"
STUDY = f"OSD-{STUDY_ID}"
SELECTED = [
    "LSDS-75_Muscle Contractility_soleus_contractility_TRANSFORMED.csv",
    "LSDS-75_Histology_soleus_histology_TRANSFORMED.csv",
]


def get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "SpaceAppsGoiania2026-data-catalog/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def save(url: str, path: pathlib.Path) -> dict[str, object]:
    content = get(url)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return {"path": str(path), "url": url, "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()}


def main() -> None:
    out = pathlib.Path("dados/nasa_osdr") / STUDY
    files_url = f"{BASE}/osdr/data/osd/files/{STUDY_ID}"
    metadata_url = f"{BASE}/osdr/data/osd/meta/{STUDY_ID}"
    files = json.loads(get(files_url))
    study_files = files.get("studies", {}).get(STUDY, {}).get("study_files", [])
    downloads = [save(files_url, out / "files.json"), save(metadata_url, out / "metadata.json")]
    for name in SELECTED:
        item = next((value for value in study_files if value.get("file_name") == name), None)
        if item is None or item.get("restricted"):
            raise RuntimeError(f"Arquivo público {name} não encontrado em {STUDY}")
        downloads.append(save(BASE + item["remote_url"], out / name))
    manifest = {
        "source": "NASA Open Science Data Repository (OSDR)", "study": STUDY,
        "title": "Toward countering muscle and bone loss with spaceflight: GSK3 as a potential target (Soleus, RR1, RR9, RR18, Bion-M1, HLU/HLS)",
        "organism": "camundongo (modelo animal)",
        "scope_note": "O CSV de contractilidade mede resposta do sóleo a frequências de estimulação; o CSV de histologia contém distribuições de área transversal das fibras apenas nos grupos HLS. Não são dados de astronautas nem uma faixa clínica humana.",
        "api": {"files": files_url, "metadata": metadata_url}, "downloads": downloads,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{STUDY}: " + ", ".join(f"{pathlib.Path(d['path']).name} ({d['bytes']} bytes)" for d in downloads[2:]))


if __name__ == "__main__":
    main()
