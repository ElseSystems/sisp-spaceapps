#!/usr/bin/env python3
"""Baixa um exemplo público de telemetria experimental do arquivo Kibo/DARTS."""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import urllib.request
import zipfile
from html import unescape

DATASET_PAGE = "https://dev.darts.isas.jaxa.jp/datasets/darts:kibo-pm-crystal-ice"
DATA_ROOT = "https://data.darts.isas.jaxa.jp/pub/kibo/ice"
ZIP_NAME = "001_ice-01_01.zip"
PDF_NAME = "ice_telemetry_list.pdf"


def get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "SpaceAppsGoiania2026-data-catalog/1.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def save(url: str, destination: pathlib.Path) -> dict[str, object]:
    content = get(url)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(content)
    return {"path": str(destination), "url": url, "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="dados/jaxa_kibo/ice", help="Pasta de saída")
    args = parser.parse_args()
    out = pathlib.Path(args.out)
    page = get(DATASET_PAGE)
    page_path = out / "dataset_page.html"
    page_path.parent.mkdir(parents=True, exist_ok=True)
    page_path.write_bytes(page)
    match = re.search(rb'data-src="([^"]+/_payload\.json\?[^"]+)"', page)
    downloads = [{"path": str(page_path), "url": DATASET_PAGE, "bytes": len(page), "sha256": hashlib.sha256(page).hexdigest()}]
    if match:
        payload_url = "https://dev.darts.isas.jaxa.jp" + unescape(match.group(1).decode("utf-8"))
        downloads.append(save(payload_url, out / "dataset_metadata_payload.json"))

    zip_url = f"{DATA_ROOT}/telemetry/{ZIP_NAME}"
    zip_path = out / ZIP_NAME
    downloads.append(save(zip_url, zip_path))
    pdf_url = f"{DATA_ROOT}/documents/{PDF_NAME}"
    downloads.append(save(pdf_url, out / PDF_NAME))
    # Extração limitada ao membro esperado do arquivo oficial.
    with zipfile.ZipFile(zip_path) as archive:
        member = "1215A.tsv"
        if member not in archive.namelist():
            raise RuntimeError(f"O arquivo {ZIP_NAME} não contém {member}")
        data = archive.read(member)
    tsv_path = out / member
    tsv_path.write_bytes(data)
    downloads.append({"path": str(tsv_path), "derived_from": str(zip_path), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    manifest = {
        "source": "JAXA/ISAS DARTS — Kibo Experiment Data Archive",
        "dataset": "ISS Kibo PM Experiment — Ice Crystal (Ice)",
        "dataset_page": DATASET_PAGE,
        "data_root": DATA_ROOT,
        "selected_archive": ZIP_NAME,
        "extracted_file": member,
        "downloads": downloads,
        "scope_note": "Telemetria de experimento físico no Kibo (temperatura, posição e tempos do experimento); não são sinais vitais ou dados clínicos da tripulação.",
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
