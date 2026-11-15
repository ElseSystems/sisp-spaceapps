# SISP · Preventive Health System

[Português brasileiro](README.md) · [Documentation](docs/en/GUIDE.md)

A team prototype for NASA Space Apps: four crew profiles, simulated vital telemetry, interactive 3D anatomy and historical human lab results from NASA OSDR.

## Run
Requirements: a C/C++ compiler with C++17 support, Make and SQLite3 development headers. Python 3 is only needed to refresh source data.

```sh
make dashboard
make run
```

Open http://127.0.0.1:8080/. Run commands from the project root. Alternative port: `./build/monitoramento-dashboard 8081`.

## Features
- Four profiles, local photos and PT/EN language switching (long medical text is partially translated).
- Muscular and skeletal models.
- Simulated telemetry and cardiac event, support video and response guidance.
- Human preflight/postflight blood count and metabolic panels with individual comparisons.

## Data and limitations
Crew members 1–4 map to Inspiration4 C001–C004 for demonstration only. OSD-569/575 lab results are historical. Vital signs and the 30-second cardiac recovery are simulated. The application does not establish diagnoses or calculate individual exercise prescriptions.

Animal studies OSD-654/662 and cellular experiments OSD-13/323 are not crew medical histories. RadLab provides ISS environmental radiation, without personal dose. See the [data and architecture guide](docs/en/GUIDE.md).

## Structure
- `src/`, `include/`: C/C++ backend and SQLite.
- `web/`: interface, translations, models and media.
- `dados/`: original CSV, metadata, manifests and narration.
- `extracao de dados/`: Python scripts for public data updates.
- `docs/pt-BR/`, `docs/en/`: equivalent documentation.
- `build/`, `runtime/`: generated files ignored by Git.

The dashboard uses disk SQLite at `runtime/monitoramento.db`; `make run-demo` runs the earlier RAM/SQLite demonstration.

## Before publishing
SISP original code and documentation are available under the [MIT license](LICENSE). Third-party data, dependencies, GLB models, avatars, audio and video remain subject to their respective licenses and attribution requirements; the project MIT license does not change those rights.
