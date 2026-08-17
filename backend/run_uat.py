import asyncio
import httpx
from sqlalchemy import text
from app.db.session import async_session_factory

queries = [
    "Какую конкретно команду Git мы использовали для хотфикса в задаче с `nginx_logparser`?",
    "А почему нельзя было использовать `git merge` для этой же задачи?",
    "Какие ошибки в оформлении коммитов и pull request упоминаются в разных уроках по Git?",
    "Что общего между принципом Lean в CALMS и нашими практиками в программировании?",
    "Как менялся мой подход к организации веток от ранних проектов к текущим?",
    "Есть ли в моих материалах противоречия относительно того, когда использовать `git reset`, а когда `git revert`?",
    "Какая конфигурация для Kafka Broker описана в моих заметках?",
    "Что ты заметил обо мне, моих привычках или подходах к работе на основе всех загруженных данных, чего я сам явно не формулировал?"
]

async def run_uat():
    results_md = "# UAT Baseline Results (v1.0)\n\n## 1. Базовые метрики БД\n\n"
    
    async with async_session_factory() as db:
        sources = await db.scalar(text("SELECT COUNT(*) FROM sources"))
        chunks = await db.scalar(text("SELECT COUNT(*) FROM chunks"))
        claims = await db.scalar(text("SELECT COUNT(*) FROM claims"))
        entities = await db.scalar(text("SELECT COUNT(*) FROM entities"))
        relations = await db.scalar(text("SELECT COUNT(*) FROM claim_relations"))
        patterns = await db.scalar(text("SELECT COUNT(*) FROM patterns"))
        
        results_md += f"| Метрика | Значение |\n|---|---|\n"
        results_md += f"| Источники (Sources) | {sources} |\n"
        results_md += f"| Чанки (Chunks) | {chunks} |\n"
        results_md += f"| Утверждения (Claims) | {claims} |\n"
        results_md += f"| Сущности (Entities) | {entities} |\n"
        results_md += f"| Связи (Relations) | {relations} |\n"
        results_md += f"| Паттерны (Patterns) | {patterns} |\n\n"
        
    results_md += "## 2. Результаты 8 контрольных запросов\n\n"
    
    async with httpx.AsyncClient(timeout=300.0) as client:
        history = []
        for i, q in enumerate(queries, 1):
            print(f"Executing Q{i}: {q}")
            results_md += f"### Q{i}: {q}\n"
            try:
                # Add a bit of context for follow up questions
                payload = {"query": q, "history": history}
                resp = await client.post("http://localhost:8000/api/v1/chat/", json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    answer = data.get("answer", "No answer field")
                    results_md += f"**Ответ:**\n> {answer}\n\n"
                    # Add to history for Q2 (followup)
                    if i == 1:
                        history.append({"role": "user", "content": q})
                        history.append({"role": "assistant", "content": answer})
                    if i == 2:
                        history = [] # clear after Q2
                else:
                    results_md += f"**Ошибка:** {resp.status_code} - {resp.text}\n\n"
            except Exception as e:
                results_md += f"**Исключение:** {str(e)}\n\n"
                
    with open("uat_results.md", "w", encoding="utf-8") as f:
        f.write(results_md)
    print("UAT complete. Saved to uat_results.md")

if __name__ == "__main__":
    asyncio.run(run_uat())
