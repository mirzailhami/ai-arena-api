# Templar — A Tiny, Chainable Template Engine

Implement the file `src/templar/engine.py` to render `{{ ... }}` placeholders with context variables and filters.

Run tests:
```bash
pytest -q
```

Expected behavior:
```python
from templar.engine import render
render("Hello {{ user.name | title }}", {"user": {"name": "Devi lal"}})
# "Hello Devi lal"
```
