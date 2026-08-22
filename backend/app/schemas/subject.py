from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field
import uuid
from datetime import datetime

class SubjectBase(BaseModel):
    title: str
    description: Optional[str] = None
    icon: Optional[str] = "book"
    color_theme: Optional[str] = "indigo"

class SubjectCreate(SubjectBase):
    pass

class SubjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color_theme: Optional[str] = None

class SubjectRoadmapOut(BaseModel):
    id: uuid.UUID
    content: Dict[str, Any]
    version: int

    model_config = {"from_attributes": True}

class LearningStatOut(BaseModel):
    streak_days: int
    last_activity_date: Optional[datetime]
    accuracy: float
    retention_index: Dict[str, Any]

    model_config = {"from_attributes": True}

class SubjectOut(SubjectBase):
    id: uuid.UUID
    mastery_score: float
    is_mastered: bool
    created_at: datetime
    updated_at: datetime
    
    # Optional nested fields
    roadmaps: Optional[List[SubjectRoadmapOut]] = []
    stats: Optional[List[LearningStatOut]] = []

    model_config = {"from_attributes": True}

class LearningSessionCreate(BaseModel):
    subject_id: uuid.UUID
    session_type: str
    topic_name: str
    score: float
    failed_concepts: List[str] = []

class LearningSessionOut(LearningSessionCreate):
    id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}

class SubjectSourceAttach(BaseModel):
    source_ids: List[uuid.UUID]

class RoadmapConcept(BaseModel):
    title: str
    key_points: List[str] = Field(description="Ключевые идеи или термины концепта")

class RoadmapTopic(BaseModel):
    node_id: str = Field(description="Уникальный идентификатор темы, например module1_topic1")
    title: str = Field(description="Название темы")
    description: str = Field(description="Краткое описание того, что будет изучаться")
    concepts: List[RoadmapConcept] = Field(description="Список концептов для изучения")
    status: Optional[str] = "todo" # Dynamically calculated: todo, in_progress, completed

class RoadmapModule(BaseModel):
    module_id: str
    title: str
    order: int
    topics: List[RoadmapTopic]

class RoadmapStructure(BaseModel):
    modules: List[RoadmapModule]
