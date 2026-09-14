import asyncio  
from sqlalchemy import text  
from app.db.session import async_session_factory  
async def check():  
    async with async_session_factory() as db:  
        total_r = (await db.execute(text('SELECT count(*) FROM entity_relations;'))).scalar()  
        print(f'Total entity relations in DB: {total_r}')  
asyncio.run(check())  
