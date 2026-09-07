from typing import List, Optional, Literal
from pydantic import BaseModel, Field

class LearningScope(BaseModel):
    source_ids: List[str] = Field(default_factory=list)
    domains: List[str] = Field(default_factory=list)
    folder: Optional[str] = None
    recursive: bool = True

class RoadmapEvidence(BaseModel):
    source_id: str
    source_name: str
    claim_ids: List[str] = Field(default_factory=list)
    chunk_ids: List[str] = Field(default_factory=list)

class InteractionContextChunk(BaseModel):
    chunk_id: str
    relevance_score: float
    text_content: str
    source_name: Optional[str] = None

class ContextResolutionResponse(BaseModel):
    sources: List[str] = Field(default_factory=list)
    top_chunks: List[InteractionContextChunk] = Field(default_factory=list)

class StudyNoteLLMOut(BaseModel):
    title: str = Field(
        description="Краткий и точный заголовок темы конспекта"
    )
    summary_intro: str = Field(
        description="Вводный контекст и суть темы с расстановкой маркеров цитат [1], [2]"
    )
    mermaid_diagram: str = Field(
        description="Строгий синтаксис Mermaid (начиная со строчки 'flowchart TD' или 'sequenceDiagram'). Без обратных кавычек. Узлы без сложных скобок."
    )
    core_content: str = Field(
        description="Основная техническая часть: подробные объяснения, конфигурации, примеры кода, разбор механизмов и ссылки на источники [1], [2]"
    )
    best_practices_and_pitfalls: str = Field(
        description="Практические советы и подводные камни с использованием Markdown callouts: > [!TIP], > [!WARNING], > [!NOTE]"
    )
    key_insights: List[str] = Field(
        default_factory=list,
        description="3-5 ключевых выводов в виде коротких тезисов"
    )

class RoadmapSubtopic(BaseModel):
    id: str
    title: str
    summary: str
    key_takeaways: List[str] = Field(default_factory=list)
    evidence: List[RoadmapEvidence] = Field(default_factory=list)

class RoadmapModule(BaseModel):
    id: str
    title: str
    level: str = "core"
    description: str
    topics: List[RoadmapSubtopic] = Field(default_factory=list, min_length=1)

class AdaptiveRoadmapPayload(BaseModel):
    title: str
    target_role: Optional[str] = None
    overview: str
    modules: List[RoadmapModule] = Field(min_length=1)

class GenerateRoadmapRequest(BaseModel):
    scope: LearningScope
    target_role: Optional[str] = None
    target_goal: Optional[str] = None
    preferred_depth: Optional[int] = None

class StudyCitation(BaseModel):
    marker: int
    source_id: str
    chunk_id: str
    source_name: str

class GenerateStudyNoteRequest(BaseModel):
    roadmap_payload: AdaptiveRoadmapPayload
    module_id: str
    topic_id: str
    scope: LearningScope

class GenerateSummaryNoteRequest(BaseModel):
    roadmap_payload: AdaptiveRoadmapPayload
    scope: LearningScope

class StudyNoteResponse(BaseModel):
    title: str
    markdown: str
    key_insights: List[str]
    citations: List[StudyCitation]
    insufficient_evidence: bool = False
    evidence_warning: Optional[str] = None

class SaveAsSubjectRequest(BaseModel):
    roadmap_payload: AdaptiveRoadmapPayload
    scope: LearningScope
    notes_by_topic: dict[str, StudyNoteResponse] = Field(default_factory=dict)

class SaveAsSubjectResponse(BaseModel):
    subject_id: str

class QuizOption(BaseModel):
    id: str
    text: str
    is_correct: bool = False

class QuizQuestion(BaseModel):
    id: str
    question_type: Literal["single_choice", "multiple_choice", "code_fix"]
    prompt: str
    code_snippet: Optional[str] = None
    options: List[QuizOption] = Field(min_length=2, max_length=5)
    explanation: str
    evidence_claim_ids: List[str] = Field(default_factory=list)

class QuizPayload(BaseModel):
    title: str
    description: str
    questions: List[QuizQuestion] = Field(min_length=3, max_length=10)

class GenerateQuizRequest(BaseModel):
    scope: LearningScope
    module_id: Optional[str] = None
    topic_id: Optional[str] = None
    difficulty: Literal["beginner", "intermediate", "advanced"] = "intermediate"
    question_count: int = 5

class GradeQuizRequest(BaseModel):
    quiz: QuizPayload
    user_answers: dict[str, List[str]] # question_id -> list of selected option ids

class QuizGradeResult(BaseModel):
    score_percentage: float
    correct_count: int
    total_count: int
    feedback: dict[str, str] # question_id -> explanation of why right/wrong

class CopilotChatRequest(BaseModel):
    scope: LearningScope
    topic_id: str
    roadmap_payload: AdaptiveRoadmapPayload
    message: str
    history: List[dict] = Field(default_factory=list) # [{"role": "user", "content": "..."}, ...]

class StudyNoteLLMOut(BaseModel):
    title: str = Field(
        description="Краткий и точный заголовок темы конспекта"
    )
    summary_intro: str = Field(
        description="Вводный контекст и суть темы с расстановкой маркеров цитат [1], [2]"
    )
    mermaid_diagram: str = Field(
        description="Строгий синтаксис Mermaid (начиная со строчки 'flowchart TD' или 'sequenceDiagram'). Без обратных кавычек. Узлы без сложных скобок."
    )
    core_content: str = Field(
        description="Основная техническая часть: подробные объяснения, конфигурации, примеры кода, разбор механизмов и ссылки на источники [1], [2]"
    )
    best_practices_and_pitfalls: str = Field(
        description="Практические советы и подводные камни с использованием Markdown callouts: > [!TIP], > [!WARNING], > [!NOTE]"
    )
    key_insights: List[str] = Field(
        default_factory=list,
        description="3-5 ключевых выводов в виде коротких тезисов"
    )
