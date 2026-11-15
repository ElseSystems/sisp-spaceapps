#!/usr/bin/env python3
"""Baixa matrizes públicas OSDR para cenários de imunidade e infecção (in vitro)."""

from __future__ import annotations

import hashlib
import json
import pathlib
import urllib.request

BASE = "https://osdr.nasa.gov"
STUDIES = {
    "13": ["GLDS-13_array_normalized_expression_probeset_GLmicroarray.csv", "GLDS-13_array_SampleTable_GLmicroarray.csv"],
    "323": [
        "GLDS-323_rna_seq_Normalized_Counts_GLbulkRNAseq.csv",
        "GLDS-323_rna_seq_SampleTable_GLbulkRNAseq.csv",
        "GLDS-323_rna_seq_differential_expression_GLbulkRNAseq.csv",
    ],
}


def get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "SpaceAppsGoiania2026-data-catalog/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def save(url: str, path: pathlib.Path) -> dict[str, object]:
    body = get(url)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    return {"path": str(path), "url": url, "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()}


def main() -> None:
    for study_id, selected_names in STUDIES.items():
        study = f"OSD-{study_id}"
        out = pathlib.Path("dados/nasa_osdr") / study
        files_url = f"{BASE}/osdr/data/osd/files/{study_id}"
        metadata_url = f"{BASE}/osdr/data/osd/meta/{study_id}"
        files = json.loads(get(files_url))
        study_files = files.get("studies", {}).get(study, {}).get("study_files", [])
        if not study_files:
            raise RuntimeError(f"A API não retornou arquivos para {study}")
        downloads = [save(files_url, out / "files.json"), save(metadata_url, out / "metadata.json")]
        for name in selected_names:
            item = next((f for f in study_files if f.get("file_name") == name), None)
            if item is None:
                raise RuntimeError(f"Arquivo {name} não encontrado na API de {study}")
            if item.get("restricted"):
                raise RuntimeError(f"Arquivo {name} é restrito; não será baixado")
            downloads.append(save(BASE + item["remote_url"], out / name))
        manifest = {
            "source": "NASA Open Science Data Repository (OSDR)",
            "study": study,
            "api": {"files": files_url, "metadata": metadata_url},
            "scope_note": "Dados de resposta celular in vitro; não são diagnóstico, evento clínico ou sinais vitais de astronautas.",
            "downloads": downloads,
        }
        (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"{study}: " + ", ".join(f"{d['path']} ({d['bytes']} bytes)" for d in downloads[2:]))


if __name__ == "__main__":
    main()
