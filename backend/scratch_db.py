import asyncio
import asyncpg

async def test():
    try:
        conn = await asyncpg.connect('postgresql://pka_user:pka_password@localhost:5434/pka_db')
        print('Connected successfully!')
        await conn.close()
    except Exception as e:
        print(f"Failed to connect: {e}")

asyncio.run(test())
