import json
import re
from typing import List
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from .schemas import (
    GenerateStudyNoteRequest,
    StudyNoteResponse,
    StudyCitation,
    GenerateSummaryNoteRequest,
    StudyNoteLLMOut,
)
from .context_resolver import LearningContextResolver
from ..knowledge.retrieval import hybrid_search
from ..db.models import Claim, Chunk
from ..core.llm import model_manager, TaskType


class StudyNoteGenerator:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _find_evidence(self, request: GenerateStudyNoteRequest) -> List[Chunk]:
        resolver = LearningContextResolver(self.db)
        sources, _, _ = await resolver.resolve(request.scope)
        source_ids = [str(s.id) for s in sources]

        if not source_ids:
            return []

        topic = None
        for module in request.roadmap_payload.modules:
            if module.id == request.module_id:
                for t in module.topics:
                    if t.id == request.topic_id:
                        topic = t
                        break

        if not topic:
            raise ValueError(
                f"Topic {request.topic_id} not found in module {request.module_id}"
            )

        search_text = f"{topic.title} {topic.summary}"

        results = await hybrid_search(
            self.db,
            original_query=search_text,
            search_query=search_text,
            source_ids=source_ids,
            limit=20,
        )

        class MockChunk:
            def __init__(self, c_id, s_id, txt):
                self.id = c_id
                self.source_id = s_id
                self.text_content = txt

        chunks = [
            MockChunk(r.get("chunk_id") or r.get("id"), r["source_id"], r["text_content"])
            for r in results
        ]

        return chunks

    async def generate(self, request: GenerateStudyNoteRequest) -> StudyNoteResponse:
        chunks = await self._find_evidence(request)

        total_chars = sum(len(c.text_content) for c in chunks)
        if not chunks or total_chars < 300:
            return StudyNoteResponse(
                title="Insufficient Data",
                markdown="Not enough data in the provided sources to generate a comprehensive study note on this topic.",
                key_insights=[],
                citations=[],
                insufficient_evidence=True,
                evidence_warning="В загруженных материалах недостаточно подробностей для формирования качественного конспекта (требуется от 300 символов релевантного текста).",
            )

        topic_title = request.topic_id
        topic_summary = ""
        for m in request.roadmap_payload.modules:
            for t in m.topics:
                if t.id == request.topic_id:
                    topic_title = t.title
                    topic_summary = t.summary

        system_prompt = f"""
        You are an expert AI tutor. Your task is to generate a detailed Study Note in Markdown format for the topic: '{topic_title}'.
        Topic Summary: {topic_summary}

        MANDATORY DOCUMENT STRUCTURE:
        Your output MUST follow this order:
        1. Short Introduction & Context (with [citations]).
        2. Visual Architecture/Process Diagram: MUST contain exactly one ```mermaid block (`flowchart TD` or `sequenceDiagram`).
        3. Core Concepts & Technical Deep Dive (with configs/code snippets).
        4. Best Practices & Pitfalls (using blockquotes).

        STRICT RULES:
        1. You must ONLY use the provided CHUNK evidence.
        2. DO NOT hallucinate facts outside the provided evidence.
        3. Insert citations using markers like [1], [2].
        4. Provide callouts: `> [!TIP]`, `> [!WARNING]`, `> [!NOTE]`.
        5. MERMAID DIAGRAM RULES (CRITICAL FOR PARSING):
           - The note MUST contain EXACTLY ONE ```mermaid block.
           - Use ONLY `flowchart TD` or `sequenceDiagram` (do NOT use mindmap or graph).
           - NODE IDS: Use simple ASCII identifiers without special characters (e.g., nodeA, nodeB, srv1, dbMain). NEVER use Cyrillic, spaces, or hyphens in node IDs.
           - LABELS: ALWAYS enclose the text of labels inside DOUBLE QUOTES inside brackets:
             * CORRECT: nodeA["API Gateway (v1/auth)"] --> nodeB[("PostgreSQL Cluster")]
             * INCORRECT: nodeA[API Gateway (v1/auth)] --> nodeB[(PostgreSQL Cluster)]
           - EDGES: Use standard arrows `-->`. If an edge has a label, wrap it in double quotes within pipes:
             * CORRECT: nodeA -->|"Payload (JSON)"| nodeB
             * INCORRECT: nodeA -- Payload (JSON) --> nodeB
           - SPECIAL CHARACTERS: Do not use unescaped double quotes, backticks, or angle brackets (`<`, `>`) inside label text.
        """

        prompt_parts = ["\n--- CHUNK EVIDENCE ---"]
        for idx, chunk in enumerate(chunks):
            prompt_parts.append(
                f"[{idx + 1}] (Chunk ID: {str(chunk.id)}, Source: {str(chunk.source_id)})\n{chunk.text_content}\n"
            )

        prompt = "\n".join(prompt_parts)

        llm_out = await model_manager.generate_structured(
            task_type=TaskType.DEEP_SYNTHESIS,
            schema=StudyNoteLLMOut,
            prompt=prompt,
            system_instruction=system_prompt,
            allow_cloud_fallback=True,
        )

        if not llm_out:
            raise ValueError("Failed to generate Study Note")

        raw_diagram = (llm_out.mermaid_diagram or "").strip()
        clean_diagram = raw_diagram.replace("```mermaid", "").replace("```", "").strip()

        if not clean_diagram or len(clean_diagram) < 10:
            clean_diagram = (
                "flowchart TD\n"
                "    A[Input Context] --> B[Processing Engine]\n"
                "    B --> C[PostgreSQL Storage]"
            )

        assembled_markdown = (
            f"{llm_out.summary_intro.strip()}\n\n"
            f"## Архитектурная схема процесса\n\n```mermaid\n{clean_diagram}\n```\n\n"
            f"{llm_out.core_content.strip()}\n\n"
            f"{llm_out.best_practices_and_pitfalls.strip()}"
        )

        valid_citations = []
        found_markers = set(map(int, re.findall(r"\[(\d+)\]", assembled_markdown)))
        for marker in found_markers:
            idx = marker - 1
            if 0 <= idx < len(chunks):
                chunk = chunks[idx]
                valid_citations.append(
                    StudyCitation(
                        marker=marker,
                        chunk_id=str(chunk.id),
                        source_id=str(chunk.source_id),
                        source_name="",
                    )
                )

        return StudyNoteResponse(
            title=llm_out.title,
            markdown=assembled_markdown,
            key_insights=llm_out.key_insights,
            citations=valid_citations,
            insufficient_evidence=False,
            evidence_warning=None,
        )

    async def stream_generate(self, request: GenerateStudyNoteRequest):
        chunks = await self._find_evidence(request)

        total_chars = sum(len(c.text_content) for c in chunks)
        if not chunks or total_chars < 300:
            yield f"data: {json.dumps({'type': 'metadata', 'citations': [], 'insufficient_evidence': True, 'evidence_warning': 'В загруженных материалах недостаточно подробностей для формирования качественного конспекта (требуется от 300 символов релевантного текста).'})}\n\n"
            return

        topic_title = request.topic_id
        topic_summary = ""
        for m in request.roadmap_payload.modules:
            for t in m.topics:
                if t.id == request.topic_id:
                    topic_title = t.title
                    topic_summary = t.summary

        system_prompt = f"""
        You are an expert AI tutor. Your task is to generate a detailed Study Note in Markdown format for the topic: '{topic_title}'.
        Topic Summary: {topic_summary}

        MANDATORY DOCUMENT STRUCTURE:
        Your output MUST follow this order:
        1. Short Introduction & Context (with [citations]).
        2. Visual Architecture/Process Diagram: MUST contain exactly one ```mermaid block (`flowchart TD` or `sequenceDiagram`).
        3. Core Concepts & Technical Deep Dive (with configs/code snippets).
        4. Best Practices & Pitfalls (using blockquotes).

        STRICT RULES:
        1. You must ONLY use the provided CHUNK evidence.
        2. DO NOT hallucinate facts outside the provided evidence.
        3. Insert citations using markers like [1], [2].
        4. Provide callouts: `> [!TIP]`, `> [!WARNING]`, `> [!NOTE]`.
        5. MERMAID DIAGRAM RULES (CRITICAL FOR PARSING):
           - The note MUST contain EXACTLY ONE ```mermaid block.
           - Use ONLY `flowchart TD` or `sequenceDiagram` (do NOT use mindmap or graph).
           - NODE IDS: Use simple ASCII identifiers without special characters (e.g., nodeA, nodeB, srv1, dbMain). NEVER use Cyrillic, spaces, or hyphens in node IDs.
           - LABELS: ALWAYS enclose the text of labels inside DOUBLE QUOTES inside brackets:
             * CORRECT: nodeA["API Gateway (v1/auth)"] --> nodeB[("PostgreSQL Cluster")]
             * INCORRECT: nodeA[API Gateway (v1/auth)] --> nodeB[(PostgreSQL Cluster)]
           - EDGES: Use standard arrows `-->`. If an edge has a label, wrap it in double quotes within pipes:
             * CORRECT: nodeA -->|"Payload (JSON)"| nodeB
             * INCORRECT: nodeA -- Payload (JSON) --> nodeB
           - SPECIAL CHARACTERS: Do not use unescaped double quotes, backticks, or angle brackets (`<`, `>`) inside label text.
        """

        prompt_parts = ["\n--- CHUNK EVIDENCE ---"]
        for idx, chunk in enumerate(chunks):
            prompt_parts.append(
                f"[{idx + 1}] (Chunk ID: {str(chunk.id)}, Source: {str(chunk.source_id)})\n{chunk.text_content}\n"
            )

        prompt = "\n".join(prompt_parts)

        full_markdown = ""
        async for text_chunk in model_manager.stream_text(
                task_type=TaskType.DEEP_SYNTHESIS,
                prompt=prompt,
                system_instruction=system_prompt,
                allow_cloud_fallback=True,
        ):
            full_markdown += text_chunk
            yield f"data: {json.dumps({'type': 'content', 'delta': text_chunk})}\n\n"

        valid_citations = []
        found_markers = set(map(int, re.findall(r"\[(\d+)\]", full_markdown)))
        for marker in found_markers:
            idx = marker - 1
            if 0 <= idx < len(chunks):
                chunk = chunks[idx]
                valid_citations.append(
                    {
                        "marker": marker,
                        "chunk_id": str(chunk.id),
                        "source_id": str(chunk.source_id),
                        "quote": None,
                    }
                )

        yield f"data: {json.dumps({'type': 'metadata', 'citations': valid_citations, 'insufficient_evidence': False, 'evidence_warning': None})}\n\n"

    async def generate_summary(self, request: GenerateSummaryNoteRequest) -> StudyNoteResponse:
        resolver = LearningContextResolver(self.db)
        sources, _, _ = await resolver.resolve(request.scope)
        source_ids = [str(s.id) for s in sources]

        if not source_ids:
            chunks = []
        else:
            search_text = f"{request.roadmap_payload.title} {request.roadmap_payload.overview}"
            results = await hybrid_search(
                self.db,
                original_query=search_text,
                search_query=search_text,
                source_ids=source_ids,
                limit=40,
            )

            class MockChunk:
                def __init__(self, c_id, s_id, txt):
                    self.id = c_id
                    self.source_id = s_id
                    self.text_content = txt

            chunks = [
                MockChunk(r.get("chunk_id") or r.get("id"), r["source_id"], r["text_content"])
                for r in results
            ]

        total_chars = sum(len(c.text_content) for c in chunks)
        if not chunks or total_chars < 300:
            return StudyNoteResponse(
                title="Insufficient Data",
                markdown="Not enough data in the provided sources to generate a comprehensive study note.",
                key_insights=[],
                citations=[],
                insufficient_evidence=True,
                evidence_warning="В загруженных материалах недостаточно подробностей для формирования качественного конспекта.",
            )

        system_prompt = f"""
        You are a Principal Software Architect and educator. Synthesize a comprehensive Master Study Summary across all modules for the curriculum: '{request.roadmap_payload.title}'.
        Curriculum Overview: {request.roadmap_payload.overview}

        This Master Note MUST be an hierarchical synthesis (Map-Reduce) of the whole course. Do not just blindly combine chunks.

        STRUCTURE REQUIRED:
        ## 1. Архитектурная карта системы
        Provide a comprehensive ```mermaid flowchart TD visual architecture map showing the interaction of all key layers and entities.
        
        CRITICAL MERMAID RULES:
        - Use ONLY `flowchart TD` (STRICTLY FORBIDDEN: mindmap, graph).
        - Use simple alphanumeric IDs for nodes (e.g., clientApp, coreApi, queueBroker, dbPostgres).
        - ALWAYS enclose ALL label text in double quotes inside brackets: `nodeId["Layer Name (Details)"]`.
        - Use `subgraph` blocks to logically isolate layers (e.g., `subgraph Presentation ["Клиентский слой"] ... end`).
        - If text is placed on edges, enclose it in quotes: `-->|"Protocol / Format"|`.
        - No unescaped angle brackets, backticks, or nested quotes in labels.

        ## 2. 💡 Инженерные советы & Best Practices
        Real-world rules for production use (use `> [!TIP]` blockquotes).

        ## 3. ⚠️ Подводные камни & Anti-patterns
        Common mistakes and how to avoid them (use `> [!WARNING]` blockquotes).

        ## 4. 🛠 Шпаргалка команд / Конфигураций
        Ready-to-use snippets (use `> [!NOTE]` blockquotes with code blocks).

        STRICT GROUNDING & FORMATTING RULES:
        1. You must ONLY use the provided CHUNK evidence.
        2. DO NOT hallucinate facts or theories outside the provided evidence.
        3. Insert citations using markers like [1], [2], etc., corresponding to the chunk index.
        4. DO NOT output any raw HTML tags. Use ONLY pure Markdown syntax.
        """

        prompt_parts = ["\n--- CHUNK EVIDENCE ---"]
        for idx, chunk in enumerate(chunks):
            prompt_parts.append(
                f"[{idx + 1}] (Chunk ID: {str(chunk.id)}, Source: {str(chunk.source_id)})\n{chunk.text_content}\n"
            )

        prompt = "\n".join(prompt_parts)

        llm_out = await model_manager.generate_structured(
            task_type=TaskType.DEEP_SYNTHESIS,
            schema=StudyNoteLLMOut,
            prompt=prompt,
            system_instruction=system_prompt,
            allow_cloud_fallback=True,
        )

        if not llm_out:
            raise ValueError("Failed to generate Summary Study Note")

        raw_diagram = (llm_out.mermaid_diagram or "").strip()
        clean_diagram = raw_diagram.replace("```mermaid", "").replace("```", "").strip()

        if not clean_diagram or len(clean_diagram) < 10:
            clean_diagram = (
                "flowchart TD\n"
                "    A[Input Context] --> B[Processing Engine]\n"
                "    B --> C[PostgreSQL Storage]"
            )

        assembled_markdown = (
            f"{llm_out.summary_intro.strip()}\n\n"
            f"## Архитектурная карта системы\n\n```mermaid\n{clean_diagram}\n```\n\n"
            f"{llm_out.core_content.strip()}\n\n"
            f"{llm_out.best_practices_and_pitfalls.strip()}"
        )

        valid_citations = []
        found_markers = set(map(int, re.findall(r"\[(\d+)\]", assembled_markdown)))
        for marker in found_markers:
            idx = marker - 1
            if 0 <= idx < len(chunks):
                chunk = chunks[idx]
                valid_citations.append(
                    StudyCitation(
                        marker=marker,
                        chunk_id=str(chunk.id),
                        source_id=str(chunk.source_id),
                        source_name="",
                    )
                )

        return StudyNoteResponse(
            title=llm_out.title,
            markdown=assembled_markdown,
            key_insights=llm_out.key_insights,
            citations=valid_citations,
            insufficient_evidence=False,
            evidence_warning=None,
        )

    async def stream_generate_summary(self, request: GenerateSummaryNoteRequest):
        resolver = LearningContextResolver(self.db)
        sources, _, _ = await resolver.resolve(request.scope)
        source_ids = [str(s.id) for s in sources]

        chunks = []
        if source_ids:
            search_text = f"{request.roadmap_payload.title} {request.roadmap_payload.overview}"
            results = await hybrid_search(
                self.db,
                original_query=search_text,
                search_query=search_text,
                source_ids=source_ids,
                limit=30,
            )

            class MockChunk:
                def __init__(self, c_id, s_id, txt):
                    self.id = c_id
                    self.source_id = s_id
                    self.text_content = txt

            chunks = [
                MockChunk(r.get("chunk_id") or r.get("id"), r["source_id"], r["text_content"])
                for r in results
            ]

        # Не глушим стрим при малом объеме, сразу шлем метаданные для фронтенда
        yield f"data: {json.dumps({'type': 'metadata', 'citations': [], 'insufficient_evidence': False})}\n\n"

        context_lines = []
        for idx, chunk in enumerate(chunks[:10]):
            context_lines.append(f"[{idx+1}] {chunk.text_content}")
        context_str = (
            "\n\n".join(context_lines)
            if context_lines
            else "Используй общепринятые фундаментальные знания по теме."
        )

        system_prompt = f"""
        Ты — ведущий AI-наставник и системный архитектор.
        Создай полный структурированный конспект (Master Study Note) по учебному плану: '{request.roadmap_payload.title}'.
        Обзор курса: {request.roadmap_payload.overview}

        ОБЯЗАТЕЛЬНАЯ СТРУКТУРА КОНСПЕКТА (строго в Markdown):
        ## 1. Архитектурная карта системы
        Опиши логику курса и взаимодействие компонентов. Включи схему в блоке ```mermaid (диаграмма flowchart TD).

        ## 2. 💡 Инженерные советы & Best Practices
        Практические правила для продакшна (оформляй через blockquote `> [!TIP]`).

        ## 3. ⚠️ Подводные камни & Anti-patterns
        Типичные ошибки и как их избежать (оформляй через blockquote `> [!WARNING]`).

        ## 4. 🛠 Шпаргалка команд и конфигураций
        Готовые сниппеты кода и CLI-команд (оформляй через blockquote `> [!NOTE]`).
        """

        user_prompt = f"КОНТЕКСТ МАТЕРИАЛОВ:\n{context_str}\n\nСформируй полный подробный конспект на русском языке."

        try:
            async for text_chunk in model_manager.stream_text(
                task_type=TaskType.DEEP_SYNTHESIS,
                prompt=user_prompt,
                system_instruction=system_prompt,
                allow_cloud_fallback=True,
            ):
                if text_chunk:
                    yield f"data: {json.dumps({'type': 'content', 'delta': text_chunk})}\n\n"
        except Exception as e:
            err_msg = f"\n\n> [!WARNING]\n> Ошибка при формировании потока: {e}"
            yield f"data: {json.dumps({'type': 'content', 'delta': err_msg})}\n\n"
