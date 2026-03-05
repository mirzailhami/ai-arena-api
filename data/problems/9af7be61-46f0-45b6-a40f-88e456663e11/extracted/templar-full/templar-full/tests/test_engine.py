import pytest
from templar import render

def test_basic_and_trim_title():
    tpl = "Hello {{ user.name | trim | title }}!"
    ctx = {"user": {"name": "  devi lal  "}}
    assert render(tpl, ctx) == "Hello Devi Lal!"

def test_join_and_upper():
    tpl = "Tags: {{ tags | join(', ') | upper }}"
    ctx = {"tags": ["a","b","c"]}
    assert render(tpl, ctx) == "Tags: A, B, C"

def test_default_and_missing():
    tpl = "User: {{ user.name | default('Guest') }}"
    ctx = {"user": {}}
    assert render(tpl, ctx) == "User: Guest"

def test_date_filter():
    tpl = "On {{ dt | date('%d %b %Y') }}"
    ctx = {"dt": "2024-01-05T00:00:00Z"}
    out = render(tpl, ctx)
    assert "05" in out and "2024" in out

def test_chained_filters_and_indexing():
    tpl = "{{ items[0].name | upper }} - {{ items[1] | default('none') }}"
    ctx = {"items":[{"name":"foo"}, None]}
    assert render(tpl, ctx) == "FOO - none"

def test_unknown_filter_message():
    assert "<UnknownFilter: xyz>" in render("{{ 'a' | xyz }}", {})
