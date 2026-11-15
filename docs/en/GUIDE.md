# Project guide
[Português brasileiro](../pt-BR/GUIA.md) · [Home](../../README.en.md)

## Architecture and use
The C++ server serves web files and local APIs. JavaScript manages profiles, telemetry, simulation, labs and languages. SQLite stores imported data; startup imports OSD-569, OSD-13 and OSD-323. The medical panel reads CSV over HTTP. Photos and language preferences remain in browser storage on the current device.

Flow: choose crew member → view telemetry/model → compare preflight/postflight samples. The event button selects a random profile and opens the simulation. Video starts muted; use its controls to enable sound.

## Catalog and provenance
| Source | Content | Application |
|---|---|---|
| [OSD-569](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569) | Inspiration4 human blood count | Individual historical labs |
| [OSD-575](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575) | Inspiration4 human metabolic panel | Individual historical labs |
| OSD-654/662 | Mouse DXA, lean mass, strength and histology | Research, excluded from human histories |
| OSD-13/323 | Experiments with human cells | Research without individual medical histories |
| NASA RadLab | 15,473 ISS DosTel records, April 9–17, 2022 | Environmental radiation, µGy/h |
| JAXA Kibo ICE | Experiment temperature/position/time | Equipment telemetry |

Extraction directories include metadata/manifests; check URLs, units, coverage and SHA-256. Do not merge unrelated studies as records of the same person. The local RadLab CSV has no equivalent dose values.

C001 → Crew member 1, C002 → Crew member 2, C003 → Crew member 3, C004 → Crew member 4. This mapping is fictional. The interface offers sample selection, changes and assay reference intervals. Test names/units preserve original fields. Insights describe observed changes and request review; they do not establish disease or a causal effect of spaceflight.

## Additional human research
[Astronaut SPRINT study](https://www.nature.com/articles/s41526-020-00111-x) evaluates muscle, bone, strength and exercise. [Bed-rest SPRINT study](https://pubmed.ncbi.nlm.nih.gov/38328821/) examines humans in a ground analog. These are supporting evidence; individual data were not imported or assigned to crew profiles. Individual muscle measurements are missing for percentage exercise prescriptions.

## Refresh data
```sh
python3 "extracao de dados/extrair_tudo.py"
```
Scripts use the Python standard library; extraction requires internet access and may overwrite downloaded files. Keep a copy to reproduce the current snapshot. Individual scripts cover NASA OSDR, metabolic labs, immune scenarios, musculoskeletal data, muscle, Ax-1 radiation and JAXA Kibo. See the extraction directory README.

## Local APIs
- `/api/human-cbc`: OSD-569 human CSV.
- `/api/metabolic-data`: OSD-575 human CSV.
- `/api/ax1-radiation-data`: RadLab CSV.
- `/api/musculoskeletal-data`, `/api/lean-mass-data`, `/api/muscle-force-data`: animal data.
- `/locales/pt-BR.json`, `/locales/en.json`: translations.

## Audio and media
`dados/roteiro-evento.txt` contains the Portuguese script; `dados/evento-simulado.wav` is a synthesized reference recording. Current speech uses browser synthesis. The video at `web/assets/emergency-response.mp4` was supplied by the team and has not been validated as an official NASA procedure.

## Verification and maintenance
Run `make dashboard`, `node --check web/medical.js` and `node --check web/i18n.js`. Manually check all four profiles, sample selectors, languages, video and event. Do not publish local databases or caches. Production authentication is absent. Full translation and clinical review remain pending.
