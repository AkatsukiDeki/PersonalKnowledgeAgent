import json
from typing import List
from app.learning.schemas import GenerateStudyNoteRequest, StudyNoteResponse, StudyCitation, GenerateSummaryNoteRequest
from app.db.models import Claim, Chunk
from app.core.llm import model_manager, TaskType
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

class StudyNoteGenerator:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _find_evidence(self, request: GenerateStudyNoteRequest) -> List[Chunk]:
        # Using context resolver or direct query
        # Let's extract source_ids from the scope
        from app.learning.context_resolver import LearningContextResolver
        resolver = LearningContextResolver(self.db)
        sources, _, _ = await resolver.resolve(request.scope)
        source_ids = [str(s.id) for s in sources]
        
        if not source_ids:
            return []
            
        # We also want to narrow down based on the topic. 
        # For simplicity, we just fetch chunks from the scope and then filter or just pass up to 30 chunks.
        # But if we have specific chunk_ids in the roadmap, we can use them!
        
        # Find the topic in the roadmap
        topic = None
        for module in request.roadmap_payload.modules:
            if module.id == request.module_id:
                for t in module.topics:
                    if t.id == request.topic_id:
                        topic = t
                        break
                
        if not topic:
            raise ValueError(f"Topic {request.topic_id} not found in module {request.module_id}")
            
        # Extract claim_ids and chunk_ids from topic evidence
        target_chunk_ids = []
        target_claim_ids = []
        for ev in topic.evidence:
            target_chunk_ids.extend(ev.chunk_ids)
            target_claim_ids.extend(ev.claim_ids)
            
        # Fetch those specific chunks if present, else fallback to searching the source_ids
        conditions = []
        if target_chunk_ids:
            conditions.append(Chunk.id.in_(target_chunk_ids))
        if target_claim_ids:
            # We would need to map claims to chunks, but let's just query chunks by source_ids for now
            pass
            
        from app.knowledge.retrieval import hybrid_search
        search_text = f"{topic.title} {topic.summary}"
        
        results = await hybrid_search(
            self.db, 
            original_query=search_text, 
            search_query=search_text, 
            source_ids=source_ids, 
            limit=20
        )
        
        class MockChunk:
            def __init__(self, c_id, s_id, txt):
                self.id = c_id
                self.source_id = s_id
                self.text_content = txt
                
        chunks = [MockChunk(r.get("chunk_id") or r.get("id"), r["source_id"], r["text_content"]) for r in results]
        
        return chunks

    async def generate(self, request: GenerateStudyNoteRequest) -> StudyNoteResponse:
        chunks = await self._find_evidence(request)
        
        # EVIDENCE SUFFICIENCY GATE
        total_chars = sum(len(c.text_content) for c in chunks)
        if not chunks or total_chars < 300:
            return StudyNoteResponse(
                title="Insufficient Data",
                markdown="Not enough data in the provided sources to generate a comprehensive study note on this topic.",
                key_insights=[],
                citations=[],
                insufficient_evidence=True,
                evidence_warning="В загруженных материалах недостаточно подробностей для формирования качественного конспекта (требуется от 300 символов релевантного текста)."
            )

        # Prepare Prompt
        topic_title = request.topic_id # Will use title from payload
        topic_summary = ""
        for m in request.roadmap_payload.modules:
            for t in m.topics:
                if t.id == request.topic_id:
                    topic_title = t.title
                    topic_summary = t.summary

        system_prompt = f"""
        You are an expert AI tutor. Your task is to generate a detailed Study Note in Markdown format for the topic: '{topic_title}'.
        Topic Summary: {topic_summary}
        
        STRICT GROUNDING & FORMATTING RULES:
        1. You must ONLY use the provided CHUNK evidence.
        2. DO NOT hallucinate facts or theories outside the provided evidence.
        3. Insert citations using markers like [1], [2], etc., corresponding to the chunk index.
        4. Provide key insights.
        5. Include visual callout blocks (if applicable):
           - `> [!TIP]` for "💡 Совет сеньора / Best Practice" (practical production rules).
           - `> [!WARNING]` for "⚠️ Подводные камни (Pitfalls / Anti-patterns)".
           - `> [!NOTE]` for "🛠 Шпаргалка команд / Конфиг" (quick-copy snippets).
        6. DO NOT output any raw HTML tags (like <p>, <ul>, <li>, <strong>, <br>, <div>). Use ONLY pure Markdown syntax (e.g. ## for headers, - for lists, ** for bold, ``` for code).
        """
        
        prompt_parts = ["\n--- CHUNK EVIDENCE ---"]
        for idx, chunk in enumerate(chunks):
            # marker = idx + 1
            prompt_parts.append(f"[{idx+1}] (Chunk ID: {str(chunk.id)}, Source: {str(chunk.source_id)})\n{chunk.text_content}\n")
            
        prompt = "\n".join(prompt_parts)
        
        # We use a relaxed structure for Markdown content, but we want structured JSON output
        result = await model_manager.generate_structured(
            task_type=TaskType.DEEP_SYNTHESIS,
            schema=StudyNoteResponse,
            prompt=prompt,
            system_instruction=system_prompt,
            allow_cloud_fallback=True
        )
        
        if not result:
            raise ValueError("Failed to generate Study Note")
            
        # Enforce valid citations based on chunks
        valid_citations = []
        for cit in result.citations:
            # check if marker matches a chunk
            idx = cit.marker - 1
            if 0 <= idx < len(chunks):
                chunk = chunks[idx]
                cit.chunk_id = str(chunk.id)
                cit.source_id = str(chunk.source_id)
                # optionally fetch source name
                valid_citations.append(cit)
                
        result.citations = valid_citations
        result.insufficient_evidence = False
        result.evidence_warning = None
        
        return result

    async def stream_generate(self, request: GenerateStudyNoteRequest):
        import re
        chunks = await self._find_evidence(request)
        
        # EVIDENCE SUFFICIENCY GATE
        total_chars = sum(len(c.text_content) for c in chunks)
        if not chunks or total_chars < 300:
            yield json.dumps({
                "type": "metadata",
                "citations": [],
                "insufficient_evidence": True,
                "evidence_warning": "В загруженных материалах недостаточно подробностей для формирования качественного конспекта (требуется от 300 символов релевантного текста)."
            }) + "\n\n"
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
        
        STRICT GROUNDING & FORMATTING RULES:
        1. You must ONLY use the provided CHUNK evidence.
        2. DO NOT hallucinate facts or theories outside the provided evidence.
        3. Insert citations using markers like [1], [2], etc., corresponding to the chunk index.
        4. Provide key insights using Markdown blockquotes.
        5. Include visual callout blocks (if applicable):
           - `> [!TIP]` for "💡 Совет сеньора / Best Practice" (practical production rules).
           - `> [!WARNING]` for "⚠️ Подводные камни (Pitfalls / Anti-patterns)".
           - `> [!NOTE]` for "🛠 Шпаргалка команд / Конфиг" (quick-copy snippets).
        6. Output ONLY raw Markdown syntax. DO NOT wrap output in a JSON object.
        """
        
        prompt_parts = ["\n--- CHUNK EVIDENCE ---"]
        for idx, chunk in enumerate(chunks):
            prompt_parts.append(f"[{idx+1}] (Chunk ID: {str(chunk.id)}, Source: {str(chunk.source_id)})\n{chunk.text_content}\n")
            
        prompt = "\n".join(prompt_parts)
        
        full_markdown = ""
        async for text_chunk in model_manager.stream_text(
            task_type=TaskType.DEEP_SYNTHESIS,
            prompt=prompt,
            system_instruction=system_prompt,
            allow_cloud_fallback=True
        ):
            full_markdown += text_chunk
            yield json.dumps({
                "type": "content",
                "delta": text_chunk
            }) + "\n\n"

        # POST-PROCESSING: Extract citations
        valid_citations = []
        found_markers = set(map(int, re.findall(r'\[(\d+)\]', full_markdown)))
        for marker in found_markers:
            idx = marker - 1
            if 0 <= idx < len(chunks):
                chunk = chunks[idx]
                valid_citations.append({
                    "marker": marker,
                    "chunk_id": str(chunk.id),
                    "source_id": str(chunk.source_id),
                    "quote": None
                })
        
        yield json.dumps({
            "type": "metadata",
            "citations": valid_citations,
            "insufficient_evidence": False,
            "evidence_warning": None
        }) + "\n\n"

    async def generate_summary(self, request: GenerateSummaryNoteRequest) -> StudyNoteResponse:
        from app.learning.context_resolver import LearningContextResolver
        resolver = LearningContextResolver(self.db)
        sources, _, _ = await resolver.resolve(request.scope)
        source_ids = [str(s.id) for s in sources]
        
        if not source_ids:
            chunks = []
        else:
            from app.knowledge.retrieval import hybrid_search
            search_text = f"{request.roadmap_payload.title} {request.roadmap_payload.overview}"
            results = await hybrid_search(
                self.db, 
                original_query=search_text, 
                search_query=search_text, 
                source_ids=source_ids, 
                limit=40
            )
            
            class MockChunk:
                def __init__(self, c_id, s_id, txt):
                    self.id = c_id
                    self.source_id = s_id
                    self.text_content = txt
                    
            chunks = [MockChunk(r.get("chunk_id") or r.get("id"), r["source_id"], r["text_content"]) for r in results]

        total_chars = sum(len(c.text_content) for c in chunks)
        if not chunks or total_chars < 300:
            return StudyNoteResponse(
                title="Insufficient Data",
                markdown="Not enough data in the provided sources to generate a comprehensive study note.",
                key_insights=[],
                citations=[],
                insufficient_evidence=True,
                evidence_warning="В загруженных материалах недостаточно подробностей для формирования качественного конспекта."
            )

        system_prompt = f"""
        You are an expert AI tutor. Generate a comprehensive MASTER STUDY NOTE (Executive Summary) for the entire curriculum: '{request.roadmap_payload.title}'.
        Curriculum Overview: {request.roadmap_payload.overview}
        
        This Master Note MUST be an hierarchical synthesis (Map-Reduce) of the whole course. Do not just blindly combine chunks.
        It MUST contain these key sections:
        ## 1. Архитектурная карта курса
        Explain the logical relationship between the modules.
        
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
        4. DO NOT output any raw HTML tags. Use ONLY pure Markdown syntax (e.g. ## for headers, - for lists, ** for bold, ``` for code).
        """
        
        prompt_parts = ["\n--- CHUNK EVIDENCE ---"]
        for idx, chunk in enumerate(chunks):
            prompt_parts.append(f"[{idx+1}] (Chunk ID: {str(chunk.id)}, Source: {str(chunk.source_id)})\n{chunk.text_content}\n")
            
        prompt = "\n".join(prompt_parts)
        
        result = await model_manager.generate_structured(
            task_type=TaskType.DEEP_SYNTHESIS,
            schema=StudyNoteResponse,
            prompt=prompt,
            system_instruction=system_prompt,
            allow_cloud_fallback=True
        )
        
        if not result:
            raise ValueError("Failed to generate Summary Study Note")
            
        valid_citations = []
        for cit in result.citations:
            idx = cit.marker - 1
            if 0 <= idx < len(chunks):
                chunk = chunks[idx]
                cit.chunk_id = str(chunk.id)
                cit.source_id = str(chunk.source_id)
                valid_citations.append(cit)
                
        result.citations = valid_citations
        result.insufficient_evidence = False
        result.evidence_warning = None
        
        return result

    async def stream_generate_summary(self, request: GenerateSummaryNoteRequest):
        import re
        from app.learning.context_resolver import LearningContextResolver
        resolver = LearningContextResolver(self.db)
        sources, _, _ = await resolver.resolve(request.scope)
        source_ids = [str(s.id) for s in sources]
        
        if not source_ids:
            chunks = []
        else:
            from app.knowledge.retrieval import hybrid_search
            search_text = f"{request.roadmap_payload.title} {request.roadmap_payload.overview}"
            results = await hybrid_search(
                self.db, 
                original_query=search_text, 
                search_query=search_text, 
                source_ids=source_ids, 
                limit=40
            )
            
            class MockChunk:
                def __init__(self, c_id, s_id, txt):
                    self.id = c_id
                    self.source_id = s_id
                    self.text_content = txt
                    
            chunks = [MockChunk(r.get("chunk_id") or r.get("id"), r["source_id"], r["text_content"]) for r in results]

        total_chars = sum(len(c.text_content) for c in chunks)
        if not chunks or total_chars < 300:
            yield json.dumps({
                "type": "metadata",
                "citations": [],
                "insufficient_evidence": True,
                "evidence_warning": "В загруженных материалах недостаточно подробностей для формирования качественного конспекта."
            }) + "\n\n"
            return

        system_prompt = f"""
        You are an expert AI tutor. Generate a comprehensive MASTER STUDY NOTE (Executive Summary) for the entire curriculum: '{request.roadmap_payload.title}'.
        Curriculum Overview: {request.roadmap_payload.overview}
        
        This Master Note MUST be an hierarchical synthesis (Map-Reduce) of the whole course.
        It MUST contain these key sections:
        ## 1. Архитектурная карта курса
        Explain the logical relationship between the modules.
        
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
        4. Output ONLY raw Markdown syntax. DO NOT wrap output in a JSON object.
        """
        
        prompt_parts = ["\n--- CHUNK EVIDENCE ---"]
        for idx, chunk in enumerate(chunks):
            prompt_parts.append(f"[{idx+1}] (Chunk ID: {str(chunk.id)}, Source: {str(chunk.source_id)})\n{chunk.text_content}\n")
            
        prompt = "\n".join(prompt_parts)
        
        full_markdown = ""
        async for text_chunk in model_manager.stream_text(
            task_type=TaskType.DEEP_SYNTHESIS,
            prompt=prompt,
            system_instruction=system_prompt,
            allow_cloud_fallback=True
        ):
            full_markdown += text_chunk
            yield json.dumps({
                "type": "content",
                "delta": text_chunk
            }) + "\n\n"

        valid_citations = []
        found_markers = set(map(int, re.findall(r'\[(\d+)\]', full_markdown)))
        for marker in found_markers:
            idx = marker - 1
            if 0 <= idx < len(chunks):
                chunk = chunks[idx]
                valid_citations.append({
                    "marker": marker,
                    "chunk_id": str(chunk.id),
                    "source_id": str(chunk.source_id),
                    "quote": None
                })
        
        yield json.dumps({
            "type": "metadata",
            "citations": valid_citations,
            "insufficient_evidence": False,
            "evidence_warning": None
        }) + "\n\n"
