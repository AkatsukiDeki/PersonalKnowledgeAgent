from typing import List, Optional
from pydantic import BaseModel

class Flashcard(BaseModel):
    id: str
    question: str
    answer: str

class FlashcardResponse(BaseModel):
    cards: List[Flashcard]

class QuizOption(BaseModel):
    text: str
    is_correct: bool

class QuizQuestion(BaseModel):
    id: str
    question: str
    options: List[QuizOption]
    explanation: str

class QuizResponse(BaseModel):
    questions: List[QuizQuestion]

class LearningRequest(BaseModel):
    source_id: Optional[str] = None
    topic: Optional[str] = None
    count: Optional[int] = 5
    language: Optional[str] = None

class GeneratePracticeRequest(BaseModel):
    node_id: Optional[str] = None
    topic_title: Optional[str] = None
    difficulty: str = "medium"  # "easy" | "medium" | "hard" | "exam"
    count: int = 10

class TutorMessageRequest(BaseModel):
    message: str
    topic_context: Optional[str] = None
