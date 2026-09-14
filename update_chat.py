import re
import json

with open("backend/app/api/chat.py", "r", encoding="utf-8") as f:
    content = f.read()

# Replace import
content = content.replace(
    "from ..agent.gemini import generate_rag_response, stream_rag_response\n",
    "from ..agent.gemini import generate_rag_response, stream_rag_response_sse\n"
)

# Replace metadata yield
content = content.replace(
    'yield f"event: metadata\\ndata: {json.dumps({\'conversation_id\': str(conv.id)}, ensure_ascii=False)}\\n\\n"',
    'from ..schemas.chat_events import SSEEnvelope, SSEEventData\n                yield SSEEnvelope(event="metadata", data=SSEEventData(output={"conversation_id": str(conv.id)})).to_sse()'
)

# Replace retrieval yield
content = content.replace(
    'yield f"event: retrieval\\ndata: {json.dumps({\'status\': \'searching\', \'query\': search_query, \'intent\': intent}, ensure_ascii=False)}\\n\\n"',
    'yield SSEEnvelope(event="retrieval", data=SSEEventData(output={"status": "searching", "query": search_query, "intent": intent})).to_sse()'
)

# Replace citations yield
content = content.replace(
    'yield f"event: citations\\ndata: {json.dumps(citations_data, ensure_ascii=False)}\\n\\n"',
    'yield SSEEnvelope(event="citations", data=SSEEventData(output=citations_data)).to_sse()'
)

# Replace META yield
content = content.replace(
    'yield f"event: message\\ndata: {json.dumps({\'text\': answer}, ensure_ascii=False)}\\n\\n"',
    'yield SSEEnvelope(event="token", data=SSEEventData(text_chunk=answer)).to_sse()'
)

# Replace vision token yield
content = content.replace(
    'yield f"event: message\\ndata: {json.dumps({\'text\': token}, ensure_ascii=False)}\\n\\n"',
    'yield SSEEnvelope(event="token", data=SSEEventData(text_chunk=token)).to_sse()'
)

# Replace telemetry yield
content = content.replace(
    'yield f"event: telemetry\\ndata: {json.dumps(telemetry_data, ensure_ascii=False)}\\n\\n"',
    'yield SSEEnvelope(event="telemetry", data=SSEEventData(output=telemetry_data)).to_sse()'
)

# Replace done
content = content.replace(
    'yield "event: done\\ndata: [DONE]\\n\\n"',
    'yield SSEEnvelope(event="done", data=SSEEventData()).to_sse()'
)

with open("backend/app/api/chat.py", "w", encoding="utf-8") as f:
    f.write(content)
