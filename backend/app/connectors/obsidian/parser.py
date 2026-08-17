import os
import zipfile
import tempfile
import yaml
import re
from pathlib import Path
from typing import Dict, Any, List, Tuple
from ...core.config import settings
import logging

logger = logging.getLogger(__name__)

def is_safe_path(base_dir: str, path: str, is_symlink: bool = False) -> bool:
    """Guard against Zip Slip vulnerability."""
    base_dir_resolved = os.path.realpath(base_dir)
    return_path = os.path.realpath(os.path.join(base_dir, path))
    return os.path.commonprefix([base_dir_resolved, return_path]) == base_dir_resolved


def extract_zip_safe(zip_path: str, extract_to: str) -> List[str]:
    """Extract zip file safely, returning list of extracted .md files."""
    extracted_files = []
    
    # Check archive size
    file_size_mb = os.path.getsize(zip_path) / (1024 * 1024)
    if file_size_mb > settings.OBSIDIAN_MAX_ZIP_SIZE_MB:
        raise ValueError(f"ZIP file size ({file_size_mb:.2f} MB) exceeds the maximum allowed ({settings.OBSIDIAN_MAX_ZIP_SIZE_MB} MB).")

    with zipfile.ZipFile(zip_path, 'r') as zf:
        # Check number of files
        all_infos = zf.infolist()
        if len(all_infos) > settings.OBSIDIAN_MAX_FILES * 3: # Allow some overhead for non-md files
            raise ValueError(f"Too many files in ZIP archive.")

        md_count = sum(1 for info in all_infos if info.filename.endswith('.md'))
        if md_count > settings.OBSIDIAN_MAX_FILES:
            raise ValueError(f"Number of Markdown files ({md_count}) exceeds the maximum allowed ({settings.OBSIDIAN_MAX_FILES}).")

        for info in all_infos:
            # Skip directories
            if info.is_dir():
                continue
                
            # Only process Markdown files
            if not info.filename.endswith('.md'):
                continue
                
            # Guard against Zip Slip
            if not is_safe_path(extract_to, info.filename):
                logger.warning(f"Skipping potentially malicious path: {info.filename}")
                continue

            extracted_path = zf.extract(info, extract_to)
            extracted_files.append(extracted_path)
            
    return extracted_files


def parse_markdown_file(file_path: str) -> Tuple[str, Dict[str, Any], List[str], List[str]]:
    """Parse Markdown file, extracting Frontmatter, wikilinks, tags, and aliases."""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    frontmatter = {}
    cleaned_content = content
    
    # Parse YAML Frontmatter
    frontmatter_match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
    if frontmatter_match:
        yaml_content = frontmatter_match.group(1)
        try:
            frontmatter = yaml.safe_load(yaml_content) or {}
            if not isinstance(frontmatter, dict):
                frontmatter = {}
        except yaml.YAMLError as e:
            logger.warning(f"Failed to parse frontmatter in {file_path}: {e}")
        cleaned_content = content[frontmatter_match.end():]

    # Extract Tags (e.g., #tag) - not matching headers like # Header
    tags = re.findall(r'(?<!#)(#[^\s#][^ \t\n\r<>\'"]+)', cleaned_content)
    # Also include tags from frontmatter
    fm_tags = frontmatter.get('tags', [])
    if isinstance(fm_tags, list):
        tags.extend([f"#{t}" if not t.startswith("#") else t for t in fm_tags])
    elif isinstance(fm_tags, str):
        tags.extend([f"#{t.strip()}" if not t.strip().startswith("#") else t.strip() for t in fm_tags.split(',')])
    tags = list(set(tags))

    # Extract WikiLinks [[Link]] or [[Link|Alias]]
    wikilinks_matches = re.findall(r'\[\[(.*?)\]\]', cleaned_content)
    wikilinks = [w.split('|')[0] for w in wikilinks_matches]
    
    # Extract Aliases from frontmatter
    aliases = frontmatter.get('aliases', [])
    if isinstance(aliases, str):
        aliases = [a.strip() for a in aliases.split(',')]
    elif not isinstance(aliases, list):
        aliases = []

    return cleaned_content, frontmatter, tags, aliases, wikilinks
