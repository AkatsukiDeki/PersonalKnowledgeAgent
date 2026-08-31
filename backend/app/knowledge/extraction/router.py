from .strategies.whole_document import WholeDocumentExtractor
from .strategies.hierarchical import HierarchicalMapReduceExtractor
from .strategies.dataset import DatasetProfileExtractor

def select_extraction_strategy(source_type: str, text_length: int):
    if source_type in ("dataset", "xlsx", "csv"):
        return DatasetProfileExtractor(min_budget=1, max_budget=3)
    
    # 60 000 символов (~25-35 страниц текста)
    if text_length <= 60_000:
        return WholeDocumentExtractor(min_budget=3, max_budget=7)
    
    # Тяжеловесы (книги, объемные монографии, длинные транскрипты)
    return HierarchicalMapReduceExtractor(min_budget=7, max_budget=12)
