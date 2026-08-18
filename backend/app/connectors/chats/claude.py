import json
import hashlib
from datetime import datetime
from collections.abc import AsyncIterator

from .base import BaseChatParser
from .models import UnifiedConversation, UnifiedMessage, MessageRole


class UnsupportedExportSchemaError(Exception):
    pass


class ClaudeParser(BaseChatParser):
    provider = "claude"

    async def parse(self, file_path: str) -> AsyncIterator[UnifiedConversation]:
        try:
            from app.knowledge.parsers.chat_parser import safe_decode
            with open(file_path, "rb") as f:
                raw_bytes = f.read()
            text = safe_decode(raw_bytes)
            data = json.loads(text)
        except Exception as e:
            raise UnsupportedExportSchemaError(f"Failed to read JSON: {e}")

        if not isinstance(data, list):
            if isinstance(data, dict):
                data = [data]
            else:
                raise UnsupportedExportSchemaError("Expected a list of conversations or a single conversation object")

        for conv in data:
            if "chat_messages" not in conv:
                continue

            external_id = conv.get("uuid", "")
            title = conv.get("name", "Untitled")
            
            created_at_str = conv.get("created_at")
            updated_at_str = conv.get("updated_at")
            
            created_at = None
            if created_at_str:
                created_at = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
            
            updated_at = None
            if updated_at_str:
                updated_at = datetime.fromisoformat(updated_at_str.replace('Z', '+00:00'))

            messages = []
            parent_id = None
            
            for msg in conv.get("chat_messages", []):
                sender = msg.get("sender")
                if sender == "human":
                    role = MessageRole.USER
                elif sender == "assistant":
                    role = MessageRole.ASSISTANT
                else:
                    role = MessageRole.SYSTEM
                    
                text_content = msg.get("text", "")
                if not text_content.strip():
                    continue
                    
                msg_time_str = msg.get("created_at")
                timestamp = None
                if msg_time_str:
                    timestamp = datetime.fromisoformat(msg_time_str.replace('Z', '+00:00'))
                
                msg_id = msg.get("uuid", "")
                
                hash_input = f"{role.value}{text_content.strip()}".encode('utf-8')
                content_hash = hashlib.sha256(hash_input).hexdigest()
                
                messages.append(UnifiedMessage(
                    external_id=msg_id,
                    role=role,
                    content=text_content.strip(),
                    timestamp=timestamp,
                    parent_id=parent_id,
                    content_hash=content_hash,
                    metadata={"original_sender": sender}
                ))
                parent_id = msg_id
            
            if not messages:
                continue

            conv_hash_input = "".join(msg.content_hash for msg in messages).encode('utf-8')
            conversation_hash = hashlib.sha256(conv_hash_input).hexdigest()

            yield UnifiedConversation(
                provider=self.provider,
                external_id=external_id,
                title=title,
                created_at=created_at,
                updated_at=updated_at,
                messages=messages,
                conversation_hash=conversation_hash,
                metadata={}
            )
