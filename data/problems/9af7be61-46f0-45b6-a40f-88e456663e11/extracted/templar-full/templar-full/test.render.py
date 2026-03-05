import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from templar import render

# Define some sample templates and contexts
tests = [
    {
        "template": "Hello {{ user.name | trim | title }}!",
        "context": {"user": {"name": "  devi lal  "}},
    },
    {
        "template": "Tags: {{ tags | join(', ') | upper }}",
        "context": {"tags": ["python", "pytest", "templar"]},
    },
    {
        "template": "User: {{ user.name | default('Guest') }}",
        "context": {"user": {}},
    },
    {
        "template": "On {{ dt | date('%d %b %Y') }}",
        "context": {"dt": "2024-01-05T00:00:00Z"},
    },
    {
        "template": "{{ items[0].name | upper }} - {{ items[1] | default('none') }}",
        "context": {"items":[{"name":"foo"}, None]},
    },
    {
        "template": "{{ 'a' | xyz }}",
        "context": {},
    }
]

# Run each template
for i, test in enumerate(tests, 1):
    output = render(test["template"], test["context"])
    print(f"Test {i} Output: {output}")
