import asyncio
import httpx

BASE_URL = "http://localhost:8000/api/v1"

async def test_learning_studio():
    async with httpx.AsyncClient(timeout=60.0) as client:
        # 1. Запрос на генерацию дорожной карты по папке / домену
        payload_roadmap = {
            "scope": {
                "folder": "STUDY/architecture",
                "recursive": True
            },
            "target_role": "Backend Engineer",
            "target_goal": "Master system design and clean architecture",
            "preferred_depth": 3
        }
        
        print("Отправка запроса на генерацию дорожной карты...")
        resp = await client.post(f"{BASE_URL}/learning/roadmap", json=payload_roadmap)
        if resp.status_code != 200:
            print(f"Ошибка Roadmap API: {resp.status_code} - {resp.text}")
            return
        
        roadmap = resp.json()
        print(f"Дорожная карта успешно создана: {roadmap['title']}")
        print(f"Модулей: {len(roadmap['modules'])}")
        
        # Берем первый модуль и первую тему для теста генерации конспекта
        first_module = roadmap['modules'][0]
        first_topic = first_module['topics'][0]
        
        print(f"Тестируем генерацию конспекта для темы: {first_topic['title']} (ID: {first_topic['id']})")
        
        # 2. Запрос на генерацию конспекта
        payload_note = {
            "roadmap_payload": roadmap,
            "module_id": first_module['id'],
            "topic_id": first_topic['id'],
            "scope": payload_roadmap["scope"]
        }
        
        resp_note = await client.post(f"{BASE_URL}/learning/generate-note", json=payload_note)
        if resp_note.status_code != 200:
            print(f"Ошибка Note API: {resp_note.status_code} - {resp_note.text}")
            return
            
        note_text = resp_note.text
        if "insufficient_evidence" in note_text:
            print("Внимание: сработал Evidence Sufficiency Gate — недостаточно чанков для генерации.")
        else:
            print(f"Конспект сгенерирован! Получен SSE поток. Длина ответа: {len(note_text)} символов.")
            if "citations" in note_text:
                print("Найдено поле citations с привязкой к источникам.")

if __name__ == "__main__":
    asyncio.run(test_learning_studio())
