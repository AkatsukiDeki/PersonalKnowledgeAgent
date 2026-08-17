from fastapi import APIRouter

from .chat import router as chat_router
from .sources import router as sources_router
from .claims import router as claims_router
from .entities import router as entities_router
from .graph import router as graph_router
from .patterns import router as patterns_router
from .conflicts import router as conflicts_router
from .chat_import import router as chat_import_router
from ..connectors.obsidian.router import router as obsidian_router

from .insights import router as insights_router
from .system import router as system_router
from .endpoints import conversations
from .endpoints import timeline

api_router = APIRouter()

api_router.include_router(sources_router)
api_router.include_router(chat_router)
api_router.include_router(conversations.router, prefix="/conversations", tags=["conversations"])
api_router.include_router(claims_router)
api_router.include_router(entities_router)
api_router.include_router(graph_router)
api_router.include_router(patterns_router, prefix="/patterns", tags=["patterns"])
api_router.include_router(conflicts_router, prefix="/conflicts", tags=["conflicts"])
api_router.include_router(obsidian_router, prefix="/connectors", tags=["obsidian"])
api_router.include_router(chat_import_router, prefix="/connectors/chats", tags=["chat_import"])
api_router.include_router(insights_router, prefix="/insights", tags=["insights"])
api_router.include_router(system_router, prefix="/system", tags=["system"])
api_router.include_router(timeline.router)