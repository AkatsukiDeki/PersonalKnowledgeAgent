import hashlib
from datetime import timedelta
from typing import Iterator

from .models import UnifiedConversation, TopicChunk, MessageRole


class TopicSegmenter:
    def __init__(self, time_gap_hours: int = 4):
        self.time_gap = timedelta(hours=time_gap_hours)

    def segment(self, conv: UnifiedConversation) -> Iterator[TopicChunk]:
        if not conv.messages:
            return

        current_topic_msgs = []
        last_timestamp = None
        topic_index = 1

        def flush_topic() -> TopicChunk | None:
            if not current_topic_msgs:
                return None

            user_candidates = []
            context_lines = []

            for m in current_topic_msgs:
                prefix = "User" if m.role == MessageRole.USER else "Assistant"
                context_lines.append(f"{prefix}: {m.content}")

                if m.role == MessageRole.USER:
                    user_candidates.append(m.content)

            context_text = "\n\n".join(context_lines)
            
            hash_input = f"{conv.external_id}_{topic_index}_{context_text}".encode('utf-8')
            content_hash = hashlib.sha256(hash_input).hexdigest()

            # For now, put all under 'personal' domain or deduce from title
            # In a real app, this would be classified by LLM
            domain = "personal" 

            chunk = TopicChunk(
                conversation_external_id=conv.external_id,
                provider=conv.provider,
                topic_title=f"{conv.title} - Part {topic_index}",
                domain=domain,
                start_message_id=current_topic_msgs[0].external_id,
                end_message_id=current_topic_msgs[-1].external_id,
                message_ids=[m.external_id for m in current_topic_msgs],
                user_claims_candidates=user_candidates,
                context_text=context_text,
                content_hash=content_hash
            )
            return chunk

        for msg in conv.messages:
            if not msg.timestamp:
                current_topic_msgs.append(msg)
                continue

            if last_timestamp and (msg.timestamp - last_timestamp) > self.time_gap:
                chunk = flush_topic()
                if chunk:
                    yield chunk
                    topic_index += 1
                current_topic_msgs = []

            current_topic_msgs.append(msg)
            last_timestamp = msg.timestamp

        chunk = flush_topic()
        if chunk:
            yield chunk
