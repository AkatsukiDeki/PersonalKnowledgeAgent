import json
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from app.learning.schemas import CopilotChatRequest
from app.core.llm import model_manager, TaskType
from app.learning.context_resolver import LearningContextResolver
from app.knowledge.retrieval import hybrid_search

class NoteCopilot:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def stream_chat(self, request: CopilotChatRequest) -> AsyncGenerator[str, None]:
        # 1. Resolve global scope to get all valid sources
        resolver = LearningContextResolver(self.db)
        sources, _, _ = await resolver.resolve(request.scope)
        source_ids = [str(s.id) for s in sources]
        
        chunks = []
        if source_ids:
            # 2. Extract topic context from roadmap
            topic_title = request.topic_id
            topic_summary = ""
            for m in request.roadmap_payload.modules:
                for t in m.topics:
                    if t.id == request.topic_id:
                        topic_title = t.title
                        topic_summary = t.summary
                        break
            
            # 3. Perform a targeted search using the current question and topic context
            search_query = f"{topic_title} {topic_summary} {request.message}"
            results = await hybrid_search(
                self.db, 
                original_query=search_query, 
                search_query=search_query, 
                source_ids=source_ids, 
                limit=15
            )
            chunks = [r["text_content"] for r in results]

        # 4. Build context strings
        context_str = ""
        if chunks:
            context_str = "\n".join([f"- {c}" for c in chunks])
        else:
            context_str = "No relevant context found."

        # 5. Format Chat History
        history_str = ""
        if request.history:
            history_parts = []
            for msg in request.history[-5:]: # Keep last 5 messages for context length
                role = "User" if msg.get("role") == "user" else "Assistant"
                history_parts.append(f"{role}: {msg.get('content', '')}")
            history_str = "\n".join(history_parts)

        # 6. Build prompts
        system_prompt = (
            "You are a helpful AI tutor embedded in a Study Note. "
            "Your task is to answer the user's questions about the current topic.\n\n"
            "STRICT RULES:\n"
            "1. Answer ONLY based on the provided [CONTEXT]. If the context doesn't contain the answer, say 'В материалах нет информации об этом'.\n"
            "2. DO NOT hallucinate facts outside the context.\n"
            "3. Be concise, pedagogical, and use Markdown formatting.\n"
            "4. Respond in the same language as the user's question (default to Russian)."
        )

        user_prompt = f"[CURRENT TOPIC]\n{topic_title}\n\n[CONTEXT]\n{context_str}\n\n"
        if history_str:
            user_prompt += f"[CHAT HISTORY]\n{history_str}\n\n"
        user_prompt += f"[USER QUESTION]\n{request.message}"

        # 7. Stream text
        async for text_chunk in model_manager.stream_text(
            task_type=TaskType.DEEP_SYNTHESIS,
            prompt=user_prompt,
            system_instruction=system_prompt,
            allow_cloud_fallback=True
        ):
            yield json.dumps({"type": "content", "delta": text_chunk}) + "\n\n"
            
        yield json.dumps({"type": "done"}) + "\n\n"
