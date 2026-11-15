#!/usr/bin/env python3
"""Baixa metadados e um CSV de hemograma do NASA OSDR (estudo OSD-569)."""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import urllib.parse
import urllib.request

BASE = "https://osdr.nasa.gov"
DEFAULT_STUDY = "569"
DEFAULT_CSV = "LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv"


def get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "SpaceAppsGoiania2026-data-catalog/1.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def save(url: str, destination: pathlib.Path) -> dict[str, object]:
    content = get(url)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(content)
    return {
        "path": str(destination),
        "url": url,
        "bytes": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--study", default=DEFAULT_STUDY, help="ID OSD numérico (padrão: 569)")
    parser.add_argument("--out", default="dados/nasa_osdr", help="Pasta de saída")
    args = parser.parse_args()

    study_id = str(args.study).removeprefix("OSD-")
    study_dir = pathlib.Path(args.out) / f"OSD-{study_id}"
    files_url = f"{BASE}/osdr/data/osd/files/{urllib.parse.quote(study_id)}"
    metadata_url = f"{BASE}/osdr/data/osd/meta/{urllib.parse.quote(study_id)}"
    files = json.loads(get(files_url))
    study_key = f"OSD-{study_id}"
    study_files = files.get("studies", {}).get(study_key, {}).get("study_files", [])
    if not study_files:
        raise RuntimeError(f"A API não retornou arquivos para {study_key}")

    inventory = save(files_url, study_dir / "files.json")
    metadata = save(metadata_url, study_dir / "metadata.json")
    selected = next((item for item in study_files if item.get("file_name") == DEFAULT_CSV), None)
    if selected is None:
        # Em outros estudos, baixe o primeiro CSV transformado, se existir.
        selected = next(
            (item for item in study_files if item.get("file_name", "").lower().endswith(".csv")
             and "transformed" in item.get("file_name", "").lower()),
            None,
        )
    if selected is None:
        raise RuntimeError(f"Não há CSV transformado público na listagem de {study_key}")
    dataset = save(BASE + selected["remote_url"], study_dir / selected["file_name"])

    manifest = {
        "source": "NASA Open Science Data Repository (OSDR)",
        "study": study_key,
        "api": {"files": files_url, "metadata": metadata_url},
        "selected_file": selected,
        "downloads": [inventory, metadata, dataset],
    }
    (study_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
