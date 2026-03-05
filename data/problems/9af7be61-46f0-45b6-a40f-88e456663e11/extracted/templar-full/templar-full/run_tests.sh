#!/usr/bin/env bash
set -euo pipefail
python3 -m pip install --upgrade pip >/dev/null
python3 -m pip install -r requirements.txt >/dev/null
pytest
