#!/usr/bin/env python3
"""Baixa DXA público de tíbia e metadados do estudo NASA OSD-654."""

from __future__ import annotations

import hashlib
import json
import pathlib
import re
import urllib.request

BASE = "https://osdr.nasa.gov"
STUDY_ID = "654"
STUDY = f"OSD-{STUDY_ID}"
SELECTED = "LSDS-66_Bone_Biomechanical_DXA_tibia_TRANSFORMED.csv"


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
    selected = next((item for item in study_files if item.get("file_name") == SELECTED), None)
    if selected is None or selected.get("restricted"):
        raise RuntimeError(f"Arquivo público {SELECTED} não encontrado em {STUDY}")
    downloads = [save(files_url, out / "files.json"), save(metadata_url, out / "metadata.json")]
    downloads.append(save(BASE + selected["remote_url"], out / SELECTED))
    metadata = json.loads((out / "metadata.json").read_text(encoding="utf-8"))
    assay_map = metadata["study"][STUDY]["additionalInformation"]["assays"]
    assay = next((value for key, value in assay_map.items() if "dual-energy-x-ray-absorptiometry" in key), None)
    if assay is None:
        raise RuntimeError("Tabela de DXA com massa magra não encontrada nos metadados")
    paired = out / "LSDS-66_lean_mass_pre_post.csv"
    with paired.open("w", encoding="utf-8", newline="") as stream:
        stream.write("Sample Name,lean_mass_pre_g,lean_mass_post_g\n")
        for row in assay.get("raw", []):
            text = row.get("a100013parametervalueleantissuemassprecision", "")
            values = re.findall(r"([0-9]+(?:\.[0-9]+)?)\s*\((Pre|Post)-HLS\)", text)
            by_phase = {phase: value for value, phase in values}
            if "Pre" in by_phase and "Post" in by_phase:
                stream.write(f"{row['a100000samplename']},{by_phase['Pre']},{by_phase['Post']}\n")
    downloads.append({"path": str(paired), "bytes": paired.stat().st_size,
        "sha256": hashlib.sha256(paired.read_bytes()).hexdigest(), "derived_from": "metadata.json / lean tissue mass precision"})
    manifest = {
        "source": "NASA Open Science Data Repository (OSDR)", "study": STUDY,
        "selected_file": selected,
        "scope_note": "DXA de tíbia e composição corporal de camundongos. Massa magra não equivale a densidade muscular; HLS é um modelo terrestre.",
        "api": {"files": files_url, "metadata": metadata_url}, "downloads": downloads,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{STUDY}: {SELECTED} ({downloads[-1]['bytes']} bytes)")


if __name__ == "__main__":
    main()
