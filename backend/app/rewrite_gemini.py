import re

with open("/app/app/agent/gemini.py", "r", encoding="utf-8") as f:
    content = f.read()

# Chunk 1: Update _do_stream signature and generate_content_stream call
do_stream_pattern = r'async def _do_stream\(messages: list, system_instruction: str, target_model: str = "qwen2\.5:3b"\):.*?return await get_client\(\)\.aio\.models\.generate_content_stream\([^)]+\)'

new_do_stream = '''async def _do_stream(messages: list, system_instruction: str, target_model: str = "qwen2.5:3b", tools: list = None):
    is_gemini_model = "gemini" in target_model.lower()
    has_valid_key = settings.GEMINI_API_KEY and settings.GEMINI_API_KEY not in ("your_gemini_api_key_here", "dummy")
    
    if not is_gemini_model or not has_valid_key or settings.REASONING_PROVIDER == "ollama":
        local_model = target_model if not is_gemini_model else settings.OLLAMA_QA_MODEL
        ollama = OllamaClient()
        
        async def ollama_stream():
            async for chunk in ollama.stream_chat(messages=messages, model=local_model):
                yield type('FakeChunk', (), {'text': chunk})()
                
        return ollama_stream()

    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        temperature=0.1,
    )
    if tools:
        config.tools = tools
        config.tool_config = types.ToolConfig(function_calling_config={"mode": "AUTO"})

    contents = messages if messages and isinstance(messages[0], types.Content) else _to_gemini_contents(messages)

    return await get_client().aio.models.generate_content_stream(
        model=target_model if "gemini" in target_model else model_manager.get_model('reasoning'),
        contents=contents,
        config=config,
    )'''

content = re.sub(do_stream_pattern, new_do_stream, content, flags=re.DOTALL)

# Chunk 2: Update SANDBOX_PROMPT and add execute_code_tool
sandbox_pattern = r'SANDBOX_PROMPT = """\n--- ВЫПОЛНЕНИЕ КОДА \(SANDBOX\) ---.*?"""'

new_sandbox = '''SANDBOX_PROMPT = """
# ПРАВИЛА ВЫБОРА СРЕДЫ ВЫПОЛНЕНИЯ (POLYGLOT EXECUTION)
1. Определяй целевой язык задачи строго по интенту пользователя:
   - Если задача сформулирована как SQL-запрос (DDL/DML/SELECT) -> вызывай инструмент execute_code с language='sql'. ЗАПРЕЩЕНО оборачивать SQL в скрипты на Python/sqlite3, если пользователь явно не попросил "напиши скрипт на Python для работы с БД".
   - Если задача математическая (уравнение, интеграл, производная) -> вызывай инструмент execute_code с language='math' (SymPy) или используй LaTeX. Не пиши скрипт вычислений без просьбы.
   - Если задача системная (Linux, терминал, файлы) -> вызывай инструмент execute_code с language='bash'.
   - Если задача алгоритмическая на C++/C#/Python -> вызывай инструмент execute_code с соответствующим language ('cpp', 'csharp', 'python').

2. ПРАВИЛО ЧИСТОТЫ КОДА:
   - Вызывай инструмент execute_code только для одного целевого языка за раз.
   - Никаких вспомогательных "обвязок" на других языках, если их прямо не запрашивали.
   - Код должен быть сразу готов к запуску в соответствующей песочнице (sql -> aiosqlite, python/cpp/bash -> Piston).
"""

execute_code_tool = types.Tool(
    function_declarations=[
        types.FunctionDeclaration(
            name="execute_code",
            description=(
                "Executes code in an isolated backend sandbox and returns stdout/stderr. "
                "Use 'sql' for relational database queries, 'python' for general computing/data analysis, "
                "'cpp' for C++ algorithms, 'bash' for Linux commands, and 'math' for symbolic equations."
            ),
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "language": types.Schema(
                        type=types.Type.STRING,
                        enum=["python", "sql", "cpp", "bash", "math"],
                        description="Target runtime environment. Match strictly to the problem domain.",
                    ),
                    "code": types.Schema(
                        type=types.Type.STRING,
                        description="Clean, executable code. Do NOT wrap in markdown backticks.",
                    ),
                },
                required=["language", "code"],
            ),
        )
    ]
)'''

content = re.sub(sandbox_pattern, new_sandbox, content, flags=re.DOTALL)

# Chunk 3: Update stream_rag_response_sse
stream_pattern = r'async def stream_rag_response_sse.*?yield SSEEnvelope\(event="error", data=SSEEventData\(error=str\(e\)\)\)'

new_stream = '''async def stream_rag_response_sse(
        query: str,
        retrieved_chunks: List[Dict[str, Any]],
        user_profile: str = "",
        mode: str = "assistant",
        history: list = None,
        target_model: str = "qwen2.5:3b",
        role_preset: str = None
) -> AsyncGenerator[Any, None]:
    """Потоковая генерация типизированных SSE-событий на базе чанков."""
    from ..schemas.chat_events import SSEEnvelope, SSEEventData
    from app.services.sandbox_service import PolyglotSandbox

    context_blocks = [
        f"--- Чанк {i + 1} ---\\n{chunk['text_content']}"
        for i, chunk in enumerate(retrieved_chunks)
    ]
    context_text = "\\n\\n".join(context_blocks)

    base_instruction = get_rag_system_instruction(user_profile)
    if role_preset and role_preset in ROLE_PRESETS:
        base_instruction += f"\\n\\n--- ВЫБРАННАЯ РОЛЬ ТЬЮТОРА: {role_preset.upper()} ---\\n{ROLE_PRESETS[role_preset]}"
    elif mode == "learning_tutor":
        base_instruction += f"\\n\\n--- СОКРАТОВСКИЙ ТЬЮТОР ---\\n{ROLE_PRESETS['socrates']}"

    active_system_prompt = f"{base_instruction}{MERMAID_PROMPT}{SANDBOX_PROMPT}{PKA_JAILBREAK}"
    raw_messages = build_chat_messages(active_system_prompt, history, query, context_text)
    
    contents = _to_gemini_contents(raw_messages)

    mermaid_keywords = ("flowchart ", "graph ", "sequenceDiagram", "gantt", "classDiagram", "stateDiagram", "pie title", "erDiagram")

    try:
        max_tool_calls = 3
        
        for _ in range(max_tool_calls):
            response_stream = await _do_stream(contents, system_instruction=active_system_prompt, target_model=target_model, tools=[execute_code_tool])
            
            has_tool_call = False
            model_parts = []
            func_resp_part = None
            
            buffer = ""
            full_model_text = ""
            in_code_block = False
            in_injected_mermaid = False

            async for chunk in response_stream:
                if chunk.function_calls:
                    for fc in chunk.function_calls:
                        model_parts.append(types.Part.from_function_call(name=fc.name, args=fc.args))
                        if fc.name == "execute_code":
                            has_tool_call = True
                            lang = fc.args.get("language", "python")
                            code = fc.args.get("code", "")
                            
                            yield SSEEnvelope(event="tool_start", data=SSEEventData(output={"tool": "execute_code", "input": {"language": lang, "code": code}}))
                            
                            sandbox_result = await PolyglotSandbox.execute(language=lang, code=code)
                            
                            tool_out = {
                                "stdout": sandbox_result.get("stdout", ""),
                                "stderr": sandbox_result.get("stderr", ""),
                                "exit_code": sandbox_result.get("exit_code", 0)
                            }
                            
                            yield SSEEnvelope(event="tool_result", data=SSEEventData(output=tool_out))
                            
                            func_resp_part = types.Part.from_function_response(
                                name="execute_code",
                                response={"result": tool_out}
                            )
                
                if chunk.text:
                    full_model_text += chunk.text
                    buffer += chunk.text
                    
                    while "\\n" in buffer:
                        line, buffer = buffer.split("\\n", 1)
                        
                        if "```" in line:
                            in_code_block = not in_code_block
                            if not in_code_block and in_injected_mermaid:
                                in_injected_mermaid = False
                                
                        stripped = line.strip()
                        if not in_code_block and any(stripped.startswith(kw) for kw in mermaid_keywords):
                            yield SSEEnvelope(event="token", data=SSEEventData(text_chunk="\\n```mermaid\\n"))
                            in_code_block = True
                            in_injected_mermaid = True
                            
                        yield SSEEnvelope(event="token", data=SSEEventData(text_chunk=line + "\\n"))
            
            if buffer:
                stripped = buffer.strip()
                if not in_code_block and any(stripped.startswith(kw) for kw in mermaid_keywords):
                    yield SSEEnvelope(event="token", data=SSEEventData(text_chunk="\\n```mermaid\\n"))
                    in_injected_mermaid = True
                yield SSEEnvelope(event="token", data=SSEEventData(text_chunk=buffer))
                
            if in_injected_mermaid:
                yield SSEEnvelope(event="token", data=SSEEventData(text_chunk="\\n```\\n"))
                
            if full_model_text:
                model_parts.insert(0, types.Part.from_text(text=full_model_text))
                
            if model_parts:
                contents.append(types.Content(role="model", parts=model_parts))
                
            if has_tool_call and func_resp_part:
                contents.append(types.Content(role="user", parts=[func_resp_part]))
            else:
                break

        yield SSEEnvelope(event="done", data=SSEEventData())

    except Exception as e:
        yield SSEEnvelope(event="error", data=SSEEventData(error=str(e)))'''

content = re.sub(stream_pattern, new_stream, content, flags=re.DOTALL)

with open("/app/app/agent/gemini.py", "w", encoding="utf-8") as f:
    f.write(content)
