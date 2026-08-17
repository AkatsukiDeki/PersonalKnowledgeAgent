import pytest
import os
import zipfile
import tempfile
import uuid
from app.connectors.obsidian.parser import extract_zip_safe, parse_markdown_file, is_safe_path
from app.connectors.obsidian.schemas import ImportJobState

def test_safe_path():
    base = "/tmp/extract"
    assert is_safe_path(base, "file.md") == True
    assert is_safe_path(base, "folder/file.md") == True
    assert is_safe_path(base, "../evil.md") == False
    assert is_safe_path(base, "folder/../../evil.md") == False

def test_parse_markdown_file():
    with tempfile.NamedTemporaryFile(suffix=".md", delete=False, mode="w", encoding="utf-8") as f:
        f.write("""---
title: My Test Note
aliases: [Test, Note]
tags: [test, '#obsidian']
---
# Header
This is a test note with #fastapi and a [[WikiLink]].
Also another [[Target|Alias]].
""")
        temp_path = f.name
        
    try:
        content, fm, tags, aliases, wikilinks = parse_markdown_file(temp_path)
        
        assert fm["title"] == "My Test Note"
        assert aliases == ["Test", "Note"]
        assert set(tags) == {"#test", "#obsidian", "#fastapi"}
        assert set(wikilinks) == {"WikiLink", "Target"}
    finally:
        os.remove(temp_path)
