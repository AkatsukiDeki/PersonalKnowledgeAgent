import json
import hashlib
from datetime import datetime
from collections.abc import AsyncIterator

from .base import BaseChatParser
from .models import UnifiedConversation, UnifiedMessage, MessageRole


class UnsupportedExportSchemaError(Exception):
    pass


class ChatGPTParser(BaseChatParser):
    provider = "chatgpt"

    async def parse(self, file_path: str) -> AsyncIterator[UnifiedConversation]:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            raise UnsupportedExportSchemaError(f"Failed to read JSON: {e}")

        if not isinstance(data, list):
            raise UnsupportedExportSchemaError("Expected a list of conversations")

        for conv in data:
            if "mapping" not in conv or "current_node" not in conv:
                continue
                
            external_id = conv.get("id") or conv.get("conversation_id", "")
            title = conv.get("title", "Untitled")
            created_time = conv.get("create_time")
            updated_time = conv.get("update_time")
            
            created_at = datetime.fromtimestamp(created_time) if created_time else None
            updated_at = datetime.fromtimestamp(updated_time) if updated_time else None

            mapping = conv["mapping"]
            current_node_id = conv["current_node"]

            # Traverse upwards from current_node
            messages = []
            node_id = current_node_id
            
            while node_id:
                node = mapping.get(node_id)
                if not node:
                    break
                
                msg_data = node.get("message")
                if msg_data:
                    author_role = msg_data.get("author", {}).get("role")
                    
                    if author_role in ["user", "assistant", "system", "tool"]:
                        role = MessageRole(author_role)
                    else:
                        role = MessageRole.SYSTEM
                        
                    content_parts = msg_data.get("content", {}).get("parts", [])
                    content = ""
                    for part in content_parts:
                        if isinstance(part, str):
                            content += part
                        elif isinstance(part, dict):
                            # Handle multimodal or other structures if necessary
                            pass

                    msg_time = msg_data.get("create_time")
                    timestamp = datetime.fromtimestamp(msg_time) if msg_time else None
                    
                    if content.strip():
                        hash_input = f"{role.value}{content.strip()}".encode('utf-8')
                        content_hash = hashlib.sha256(hash_input).hexdigest()
                        
                        messages.append(UnifiedMessage(
                            external_id=msg_data.get("id", node_id),
                            role=role,
                            content=content.strip(),
                            timestamp=timestamp,
                            parent_id=node.get("parent"),
                            content_hash=content_hash,
                            metadata={"original_author": author_role}
                        ))
                
                node_id = node.get("parent")

            messages.reverse()
            
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
