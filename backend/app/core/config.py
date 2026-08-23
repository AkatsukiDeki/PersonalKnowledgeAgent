from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
PROJECT_ROOT = BACKEND_DIR.parent

ENV_FILE_PATH = PROJECT_ROOT / ".env" if (PROJECT_ROOT / ".env").exists() else BACKEND_DIR / ".env"


class Settings(BaseSettings):
    PROJECT_NAME: str = "Personal Knowledge Agent"
    API_V1_STR: str = "/api/v1"
    
    # Embedding settings
    EMBEDDING_BACKEND: str = "local"  # "local" | "gemini"
    EMBEDDING_MODEL: str = "BAAI/bge-m3"  # or "nomic-ai/nomic-embed-text-v1.5", "models/text-embedding-004"
    EMBEDDING_DIMENSION: int = 1024
    EMBEDDING_VERSION: str = "local-bge-m3-v1"
    EMBEDDING_DEVICE: str = "cpu"  # "cpu" | "cuda"
    EMBEDDING_BATCH_SIZE: int = 16

    DATABASE_URL: str
    GEMINI_API_KEY: Optional[str] = None
    PKA_API_KEY: Optional[str] = None

    # Grounding Configuration
    FACTUAL_MIN_TOP1_SIMILARITY: float = 0.40
    FACTUAL_MIN_TOP_K_RELEVANCE_RRF: float = 0.010
    ANALYTICAL_MIN_TOP1_SIMILARITY: float = 0.40
    ANALYTICAL_MIN_TOP_K_RELEVANCE_RRF: float = 0.005
    MIN_RELEVANT_CHUNKS: int = 1
    
    # Model Routing
    LLM_ROUTING_BACKEND: str = "hybrid"  # "local" | "cloud" | "hybrid"
    
    # Ollama Settings
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    OLLAMA_EXTRACTION_MODEL: str = "qwen2.5:7b"
    OLLAMA_QA_MODEL: str = "qwen2.5:7b"
    OLLAMA_VISION_MODEL: str = "qwen2.5vl:7b"
    OLLAMA_TIMEOUT_SECONDS: float = 3000.0
    EXTRACTION_BATCH_SIZE: int = 2
    
    FAST_LLM_MODEL: str = "gemini-3.5-flash-lite"
    REASONING_LLM_MODEL: str = "gemini-3.6-flash"
    OPENAI_API_KEY: str | None = None
    
    # Obsidian Connector Settings
    OBSIDIAN_VAULT_PATH: Optional[str] = None
    OBSIDIAN_MAX_ZIP_SIZE_MB: int = 100
    OBSIDIAN_MAX_FILES: int = 2000
    TAG_DOMAIN_MAPPING: dict = {
        "programming": ["#code", "#python", "#fastapi", "#django", "#devops", "#git", "#k8s"],
        "sport": ["#running", "#fitness", "#calisthenics", "#training", "#nutrition"],
        "study": ["#econ", "#gretl", "#crypto", "#security", "#ctf", "#networking"],
        "books": ["#reading", "#literature", "#notes", "#quotes"]
    }

    model_config = SettingsConfigDict(
        env_file=ENV_FILE_PATH,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()