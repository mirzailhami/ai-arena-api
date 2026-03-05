from datetime import datetime
from dateutil import parser as dateparser

def upper(x): return '' if x is None else str(x).upper()
def lower(x): return '' if x is None else str(x).lower()
def title(x): return '' if x is None else str(x).title()
def trim(x): return '' if x is None else str(x).strip()

def join(value, sep=', '):
    if value is None:
        return ''
    try:
        return sep.join(str(v) for v in value)
    except TypeError:
        return str(value)

def default(value, fallback=''):
    if value:
        return value
    return fallback

def date(value, fmt='%Y-%m-%d'):
    if value is None:
        return ''
    try:
        dt = dateparser.parse(str(value))
        return dt.strftime(fmt)
    except Exception:
        return str(value)
