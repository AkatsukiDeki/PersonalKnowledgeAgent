import asyncio, uuid  
from app.db.session import async_session_factory  
from app.learning.roadmap_generator import RoadmapGenerator  
from app.learning.schemas import GenerateRoadmapRequest, LearningScope  
async def test_roadmap():  
    async with async_session_factory() as db:  
        req = GenerateRoadmapRequest(  
            scope=LearningScope(  
                sources=[uuid.UUID('1eb29ece-140b-44cb-aa51-d8d12be017a9')]  
            ),  
            target_role='DevOps Engineer',  
        )  
        generator = RoadmapGenerator()  
        try:  
            res = await generator.generate(req, [], [], [])  
            print('=== ROADMAP GENERATED ===')  
            print(f'Title: {res.title}')  
            print(f'Modules count: {len(res.modules)}')  
            for idx, m in enumerate(res.modules):  
                print(f'  Module {idx+1}: {m.title} (topics: {len(m.topics)})')  
        except Exception as e:  
            print(f'ERROR GENERATING ROADMAP: {type(e).__name__}: {e}')  
asyncio.run(test_roadmap())  
