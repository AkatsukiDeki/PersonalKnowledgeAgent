from typing import Optional, List, Dict, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, text
from ...db.models import Source, Entity
import logging

logger = logging.getLogger(__name__)

async def resolve_wikilink(db: AsyncSession, vault_name: str, wikilink_target: str) -> Tuple[Optional[Source], Optional[Entity]]:
    """
    Two-phase WikiLink resolution.
    Phase 1: Target Source Lookup
    Phase 2: Canonical Entity Lookup
    
    Returns (Target_Source, Canonical_Entity) where at most one is not None.
    """
    
    # Clean the target (remove extension if present for matching)
    clean_target = wikilink_target.replace('.md', '').strip()
    if not clean_target:
        return None, None
        
    # Phase 1: Search for an existing Markdown file in the Vault
    # We look for files where the title matches the target, or the relative_path ends with the target
    # or the target is in the aliases
    source_stmt = select(Source).where(
        Source.is_deleted == False,
        Source.source_type == "obsidian",
        Source.metadata_info["vault_name"].astext == vault_name,
        or_(
            Source.title.ilike(f"%{clean_target}%"),
            Source.metadata_info["relative_path"].astext.ilike(f"%{clean_target}.md"),
            Source.metadata_info["aliases"].contains(f'"{clean_target}"')  # Simple JSONB text search
        )
    ).limit(1)
    
    result = await db.execute(source_stmt)
    target_source = result.scalars().first()
    
    if target_source:
        return target_source, None
        
    # Phase 2: Search Canonical Entity
    entity_stmt = select(Entity).where(
        or_(
            Entity.name.ilike(clean_target),
            Entity.aliases.contains([clean_target])
        )
    ).limit(1)
    
    result = await db.execute(entity_stmt)
    canonical_entity = result.scalars().first()
    
    if canonical_entity:
        return None, canonical_entity
        
    return None, None
    
def determine_domain_from_tags(tags: List[str]) -> Optional[str]:
    """Determine the domain based on tags using TAG_DOMAIN_MAPPING."""
    from ...core.config import settings
    
    for tag in tags:
        tag_lower = tag.lower()
        for domain, domain_tags in settings.TAG_DOMAIN_MAPPING.items():
            if tag_lower in domain_tags:
                return domain
                
    return None
