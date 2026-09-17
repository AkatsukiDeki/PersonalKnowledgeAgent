import re
import aiosqlite
import httpx
from typing import Dict, Any

PISTON_API_URL = "http://piston:2000/api/v2/execute"

class PolyglotSandbox:
    @staticmethod
    def sanitize_code(raw_code: str) -> str:
        """Очищает код от артефактов Markdown и системных вставок."""
        # Удаляем заголовки результатов и системные теги
        cleaned = re.sub(r"\*\*Результат выполнения.*?\*\*", "", raw_code, flags=re.DOTALL)
        cleaned = re.sub(r"```[a-zA-Z0-9_\+\#]*", "", cleaned)
        cleaned = cleaned.replace("```", "")
        return cleaned.strip()

    @classmethod
    async def execute(cls, language: str, code: str, stdin: str = "") -> Dict[str, Any]:
        lang = language.lower().strip()
        clean_code = cls.sanitize_code(code)

        if not clean_code:
            return {"stdout": "", "stderr": "Код для выполнения пуст", "exit_code": 1}

        # 1. Выполнение чистого SQL через локальный sqlite в памяти
        if lang in ("sql", "sqlite"):
            return await cls._run_sql(clean_code)

        # 2. Выполнение формул и математики (Python math/sympy)
        if lang in ("math", "formula", "calc"):
            return await cls._run_math(clean_code)

        # 3. Полиглот-выполнение через Piston (C++, C#, Bash, Python)
        return await cls._run_piston(lang, clean_code, stdin)

    @staticmethod
    async def _run_sql(query: str) -> Dict[str, Any]:
        try:
            async with aiosqlite.connect(":memory:") as db:
                cursor = await db.cursor()
                # Выполняем скрипт (поддержка CREATE TABLE + INSERT + SELECT)
                await cursor.executescript(query)
                rows = await cursor.fetchall()
                cols = [desc[0] for desc in cursor.description] if cursor.description else []
                
                output = []
                if cols:
                    output.append(" | ".join(cols))
                    output.append("-" * (len(output[0]) + 4))
                for row in rows:
                    output.append(" | ".join(map(str, row)))
                    
                return {"stdout": "\n".join(output) if output else "Запрос успешно выполнен (0 строк возвращено).", "stderr": "", "exit_code": 0}
        except Exception as e:
            return {"stdout": "", "stderr": f"SQL Error: {str(e)}", "exit_code": 1}

    @staticmethod
    async def _run_math(expr: str) -> Dict[str, Any]:
        try:
            # Безопасный расчет математических выражений
            import sympy
            result = sympy.sympify(expr, evaluate=True)
            return {"stdout": f"Result: {result}\nDecimal: {float(result.evalf()):.6g}", "stderr": "", "exit_code": 0}
        except Exception as e:
            return {"stdout": "", "stderr": f"Math Parse Error: {str(e)}", "exit_code": 1}

    @staticmethod
    async def _run_piston(language: str, code: str, stdin: str = "") -> Dict[str, Any]:
        lang_map = {
            "python": ("python", "3.10.0"),
            "py": ("python", "3.10.0"),
            "cpp": ("c++", "10.2.0"),
            "c++": ("c++", "10.2.0"),
            "csharp": ("mono", "6.12.0"),
            "c#": ("mono", "6.12.0"),
            "cs": ("mono", "6.12.0"),
            "bash": ("bash", "5.1.0"),
            "sh": ("bash", "5.1.0"),
            "linux": ("bash", "5.1.0")
        }

        piston_lang, version = lang_map.get(language, (language, "*"))

        payload = {
            "language": piston_lang,
            "version": version,
            "files": [{"name": "main", "content": code}],
            "stdin": stdin,
            "run_timeout": 3000,
            "compile_timeout": 3000
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                resp = await client.post(PISTON_API_URL, json=payload)
                if resp.status_code != 200:
                    return {"stdout": "", "stderr": f"Piston Error: {resp.text}", "exit_code": resp.status_code}
                
                data = resp.json().get("run", {})
                return {
                    "stdout": data.get("stdout", ""),
                    "stderr": data.get("stderr", ""),
                    "exit_code": data.get("code", 0)
                }
            except Exception as e:
                return {"stdout": "", "stderr": f"Sandbox unreachable: {str(e)}", "exit_code": 1}
