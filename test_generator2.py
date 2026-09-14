import asyncio, json  
from app.db.session import async_session_factory  
from app.learning.roadmap_generator import RoadmapGenerator  
from app.learning.schemas import GenerateRoadmapRequest, LearningScope  
from sqlalchemy import select  
from app.db.models import Source, Claim, Chunk  
async def test():  
    async with async_session_factory() as db:  
        req = GenerateRoadmapRequest(  
            scope=LearningScope(folder='DevSecOps/DevOps', recursive=True),  
            target_role='Senior DevOps Engineer',  
            target_goal='Понять как работает Git Rebase'  
        )  
        sources = (await db.execute(select(Source).limit(5))).scalars().all()  
        claims = (await db.execute(select(Claim).limit(10))).scalars().all()  
        chunks = (await db.execute(select(Chunk).limit(10))).scalars().all()  
        gen = RoadmapGenerator()  
        res = await gen.generate(req, sources=sources, claims=claims, chunks=chunks)  
        print(f'Generated modules count: {len(res.modules)}')  
        for m in res.modules:  
            print(f'Module {m.title} has {len(m.topics)} topics')  
asyncio.run(test())  
