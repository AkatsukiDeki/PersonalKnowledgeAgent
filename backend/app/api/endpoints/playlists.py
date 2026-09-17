from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from pydantic import BaseModel
import asyncio

from app.db.session import get_db
from app.db.models import Playlist, PlaylistItem, Source

router = APIRouter()

class PlaylistItemCreate(BaseModel):
    source_id: UUID

class PlaylistItemResponse(BaseModel):
    id: UUID
    playlist_id: UUID
    source_id: UUID
    sequence_num: int
    
    class Config:
        from_attributes = True

class PlaylistCreate(BaseModel):
    title: str
    description: str | None = None

class PlaylistUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    last_played_item_id: UUID | None = None

class PlaylistResponse(BaseModel):
    id: UUID
    title: str
    description: str | None
    last_played_item_id: UUID | None
    items: List[PlaylistItemResponse] = []
    
    class Config:
        from_attributes = True

class ReorderRequest(BaseModel):
    item_ids: List[UUID]

@router.get("/", response_model=List[PlaylistResponse])
async def list_playlists(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Playlist).order_by(Playlist.created_at.desc()))
    playlists = result.scalars().all()
    # Need to load items manually or configure lazy="selectin" on relationship
    # By default, items is selectin or not loaded. Since we want to return items:
    for p in playlists:
        await db.refresh(p, ['items'])
    return playlists

@router.post("/", response_model=PlaylistResponse)
async def create_playlist(playlist: PlaylistCreate, db: AsyncSession = Depends(get_db)):
    new_playlist = Playlist(title=playlist.title, description=playlist.description)
    db.add(new_playlist)
    await db.commit()
    await db.refresh(new_playlist, ['items'])
    return new_playlist

@router.get("/{playlist_id}", response_model=PlaylistResponse)
async def get_playlist(playlist_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    await db.refresh(playlist, ['items'])
    return playlist

@router.patch("/{playlist_id}", response_model=PlaylistResponse)
async def update_playlist(playlist_id: UUID, update_data: PlaylistUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    if update_data.title is not None:
        playlist.title = update_data.title
    if update_data.description is not None:
        playlist.description = update_data.description
    if hasattr(update_data, "last_played_item_id") and update_data.last_played_item_id is not None:
        playlist.last_played_item_id = update_data.last_played_item_id
        
    await db.commit()
    await db.refresh(playlist, ['items'])
    return playlist

@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_playlist(playlist_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    await db.delete(playlist)
    await db.commit()

@router.post("/{playlist_id}/items", response_model=PlaylistItemResponse)
async def add_item_to_playlist(playlist_id: UUID, item: PlaylistItemCreate, db: AsyncSession = Depends(get_db)):
    # Verify playlist exists
    result_pl = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    if not result_pl.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Playlist not found")
        
    # Verify source exists and is media
    result_src = await db.execute(select(Source).where(Source.id == item.source_id))
    source = result_src.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
        
    if source.source_type not in ["audio", "video", "voice_note"]:
        raise HTTPException(status_code=400, detail="Only media sources can be added to a playlist")
        
    # Get max sequence_num
    result_seq = await db.execute(select(PlaylistItem.sequence_num).where(PlaylistItem.playlist_id == playlist_id).order_by(PlaylistItem.sequence_num.desc()).limit(1))
    max_seq = result_seq.scalar_one_or_none()
    next_seq = (max_seq + 1) if max_seq is not None else 0
    
    new_item = PlaylistItem(playlist_id=playlist_id, source_id=item.source_id, sequence_num=next_seq)
    db.add(new_item)
    try:
        await db.commit()
        await db.refresh(new_item)
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Item might already be in the playlist")
        
    return new_item

@router.delete("/{playlist_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_item_from_playlist(playlist_id: UUID, item_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PlaylistItem).where(PlaylistItem.id == item_id, PlaylistItem.playlist_id == playlist_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
        
    await db.delete(item)
    await db.commit()

@router.put("/{playlist_id}/reorder")
async def reorder_playlist(playlist_id: UUID, req: ReorderRequest, db: AsyncSession = Depends(get_db)):
    # We receive a list of item IDs in the correct order
    # To avoid UniqueConstraint violations during update, we can either:
    # 1. Update all to negative values temporarily, then update to correct indices.
    # 2. Delete and recreate or just run a direct SQL statement
    
    # Verify playlist
    result_pl = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    if not result_pl.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Playlist not found")
        
    # Get existing items
    result_items = await db.execute(select(PlaylistItem).where(PlaylistItem.playlist_id == playlist_id))
    items = result_items.scalars().all()
    
    if set([str(i.id) for i in items]) != set([str(i) for i in req.item_ids]):
        raise HTTPException(status_code=400, detail="Provided items do not match the playlist contents")
        
    # Safe reordering using negative indices first to avoid constraint violation
    for item in items:
        # Move out of the way
        item.sequence_num = -1000 - items.index(item)
    await db.commit()
    
    # Now set correct indices
    for idx, req_id in enumerate(req.item_ids):
        item = next(i for i in items if str(i.id) == str(req_id))
        item.sequence_num = idx
        
    await db.commit()
    return {"status": "ok"}
