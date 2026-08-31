import json
import hashlib
from datetime import datetime
from collections.abc import AsyncIterator

from .base import BaseChatParser
from .models import UnifiedConversation, UnifiedMessage, MessageRole


class UnsupportedExportSchemaError(Exception):
    pass


class GeminiParser(BaseChatParser):
    provider = "gemini"

    async def parse(self, file_path: str) -> AsyncIterator[UnifiedConversation]:
        # Google Takeout Gemini/Bard JSON format is usually a list of conversations/turns
        try:
            from ...knowledge.parsers.chat_parser import safe_decode
            with open(file_path, "rb") as f:
                raw_bytes = f.read()
            text = safe_decode(raw_bytes)
            data = json.loads(text)
        except Exception as e:
            raise UnsupportedExportSchemaError(f"Failed to read JSON: {e}")

        if not isinstance(data, list):
            # If it's a dict, it might be nested
            if isinstance(data, dict) and "conversations" in data:
                data = data["conversations"]
            else:
                data = [data] # Treat whole file as one if we can't tell

        # In a real scenario, this would be mapped accurately to the specific takeout structure.
        # For MVP, assuming a structure where we might have a single massive conversation history 
        # or list of turns that we group into one Conversation and let Segmenter split it.
        
        messages = []
        parent_id = None
        
        for idx, item in enumerate(data):
            # Try to extract user prompt and model response
            user_text = item.get("prompt", "")
            model_text = item.get("response", "")
            
            timestamp_str = item.get("timestamp") or item.get("time")
            timestamp = None
            if timestamp_str:
                try:
                    timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                except:
                    pass
            
            if user_text:
                hash_input = f"{MessageRole.USER.value}{user_text.strip()}".encode('utf-8')
                content_hash = hashlib.sha256(hash_input).hexdigest()
                msg_id = f"gemini-{idx}-user"
                
                messages.append(UnifiedMessage(
                    external_id=msg_id,
                    role=MessageRole.USER,
                    content=user_text.strip(),
                    timestamp=timestamp,
                    parent_id=parent_id,
                    content_hash=content_hash,
                    metadata={}
                ))
                parent_id = msg_id
                
            if model_text:
                hash_input = f"{MessageRole.ASSISTANT.value}{model_text.strip()}".encode('utf-8')
                content_hash = hashlib.sha256(hash_input).hexdigest()
                msg_id = f"gemini-{idx}-model"
                
                messages.append(UnifiedMessage(
                    external_id=msg_id,
                    role=MessageRole.ASSISTANT,
                    content=model_text.strip(),
                    timestamp=timestamp,
                    parent_id=parent_id,
                    content_hash=content_hash,
                    metadata={}
                ))
                parent_id = msg_id
                
        if messages:
            conv_hash_input = "".join(msg.content_hash for msg in messages).encode('utf-8')
            conversation_hash = hashlib.sha256(conv_hash_input).hexdigest()

            yield UnifiedConversation(
                provider=self.provider,
                external_id="gemini-export-history",
                title="Gemini History",
                created_at=messages[0].timestamp if messages else None,
                updated_at=messages[-1].timestamp if messages else None,
                messages=messages,
                conversation_hash=conversation_hash,
                metadata={}
            )
