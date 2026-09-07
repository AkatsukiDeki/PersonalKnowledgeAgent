import json
from typing import List
from pydantic import BaseModel
from .schemas import (
    AdaptiveRoadmapPayload,
    GenerateRoadmapRequest,
    RoadmapEvidence,
    RoadmapSubtopic,
    RoadmapModule,
)
from ..db.models import Claim, Chunk, Source
from ..core.llm import model_manager, TaskType
from fastapi import HTTPException


class RoadmapGenerator:
    def __init__(self):
        pass

    def _build_prompt(
        self,
        request: GenerateRoadmapRequest,
        sources: List[Source],
        claims: List[Claim],
        chunks: List[Chunk],
    ) -> str:
        prompt_parts = []

        prompt_parts.append(f"Goal: {request.target_goal or 'Understand the provided context'}")
        if request.target_role:
            prompt_parts.append(f"Target Role: {request.target_role}")

        if not claims and not chunks and sources:
            prompt_parts.append("\n--- AVAILABLE SOURCES ---")
            for idx, source in enumerate(sources):
                prompt_parts.append(f"[{idx+1}] ID: {str(source.id)} - {source.title}")
            prompt_parts.append(
                "\nBuild a foundational learning roadmap based on the titles and general domains of these available sources."
            )
        else:
            prompt_parts.append("\n--- EXTRACTED CONCEPTS (CLAIMS) ---")
            for idx, claim in enumerate(claims):
                prompt_parts.append(
                    f"[{idx+1}] ID: {str(claim.id)} (Source: {str(claim.source_id)}) - {claim.content}"
                )

            prompt_parts.append("\n--- RAW CONTEXT (CHUNKS) ---")
            for idx, chunk in enumerate(chunks[:10]):
                prompt_parts.append(
                    f"[{idx+1}] ID: {str(chunk.id)} (Source: {str(chunk.source_id)}) - {chunk.text_content[:200]}..."
                )

        return "\n".join(prompt_parts)

    async def generate(
        self,
        request: GenerateRoadmapRequest,
        sources: List[Source],
        claims: List[Claim],
        chunks: List[Chunk],
    ) -> AdaptiveRoadmapPayload:
        if not claims and not chunks:
            if not sources:
                raise HTTPException(
                    status_code=400,
                    detail="В выбранной папке или домене нет доступных материалов. Загрузите файлы или выберите другую папку.",
                )

        system_prompt = """
        You are an expert curriculum designer and AI tutor.
        Build an adaptive roadmap based strictly on the provided EXTRACTED CONCEPTS and RAW CONTEXT.
        - Create a structured curriculum with strictly 3 to 6 Modules (high-level categories).
        - Each Module MUST contain 2 to 5 Topics (specific subjects to study). Do not leave the `topics` array empty!
        - Do NOT create a separate module for every single concept. Group related concepts into broader Modules as Topics.
        - Ensure topics are logically ordered by complexity (e.g., fundamentals -> core -> advanced -> troubleshooting).
        - Do not hallucinate concepts that are not present in the context.
        - Use the provided Claim IDs and Source IDs as evidence for the topics you generate.
        - The resulting JSON must exactly match the AdaptiveRoadmapPayload schema.
        """

        prompt = self._build_prompt(request, sources, claims, chunks)

        result = await model_manager.generate_structured(
            task_type=TaskType.DEEP_SYNTHESIS,
            schema=AdaptiveRoadmapPayload,
            prompt=prompt,
            system_instruction=system_prompt,
            allow_cloud_fallback=True,
        )

        if not result:
            raise ValueError("Failed to generate AdaptiveRoadmapPayload")

        valid_claim_ids = {str(c.id) for c in claims}
        valid_chunk_ids = {str(c.id) for c in chunks}
        valid_source_ids = {str(c.source_id) for c in claims + chunks}

        seen_module_titles = set()
        deduped_modules = []

        for module in result.modules:
            normalized_mod_title = module.title.strip().lower()
            if normalized_mod_title in seen_module_titles:
                continue
            seen_module_titles.add(normalized_mod_title)

            seen_topic_titles = set()
            deduped_topics = []

            for topic in module.topics:
                normalized_top_title = topic.title.strip().lower()
                if normalized_top_title in seen_topic_titles:
                    continue
                seen_topic_titles.add(normalized_top_title)

                filtered_evidence = []
                for ev in topic.evidence:
                    ev.claim_ids = [cid for cid in ev.claim_ids if cid in valid_claim_ids]
                    ev.chunk_ids = [chid for chid in ev.chunk_ids if chid in valid_chunk_ids]

                    if ev.source_id in valid_source_ids or ev.claim_ids or ev.chunk_ids:
                        for c in claims:
                            if str(c.source_id) == ev.source_id:
                                ev.source_name = getattr(c.source, "title", "Unknown Source")
                                break
                        filtered_evidence.append(ev)

                topic.evidence = filtered_evidence
                deduped_topics.append(topic)

            # Fallback: если модель вернула модуль без вложенных тем, создаем тему из описания модуля
            if not deduped_topics:
                deduped_topics.append(
                    RoadmapSubtopic(
                        id=f"{module.id}-topic-1",
                        title=module.title,
                        summary=module.description or module.title,
                        key_takeaways=(
                            [module.description]
                            if module.description
                            else ["Изучить ключевые аспекты темы."]
                        ),
                        evidence=[],
                    )
                )

            module.topics = deduped_topics
            deduped_modules.append(module)

        # Fallback: гарантируем наличие минимум одного модуля в схеме
        if not deduped_modules:
            deduped_modules.append(
                RoadmapModule(
                    id="mod-core-1",
                    title=result.title or "Основы",
                    level="core",
                    description=result.overview or "Базовый модуль курса",
                    topics=[
                        RoadmapSubtopic(
                            id="top-core-1",
                            title="Ключевые концепции",
                            summary="Изучение основных положений темы",
                            key_takeaways=["Разобрать базовые концепции и команды."],
                            evidence=[],
                        )
                    ],
                )
            )

        result.modules = deduped_modules
        return AdaptiveRoadmapPayload.model_validate(result.model_dump())
