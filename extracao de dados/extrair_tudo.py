#!/usr/bin/env python3
"""Executa os extratores públicos NASA OSDR e JAXA DARTS."""

from __future__ import annotations

import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent

for script in ("extrair_nasa_osdr.py", "extrair_cenarios_imunes.py", "extrair_nasa_metabolico.py", "extrair_dados_musculoesqueleticos.py", "extrair_dados_musculares.py", "extrair_radiacao_ax1.py", "extrair_jaxa_kibo.py"):
    subprocess.run([sys.executable, str(HERE / script)], check=True)
