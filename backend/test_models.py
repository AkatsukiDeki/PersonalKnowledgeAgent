import sys
import os
sys.path.append(os.path.abspath('.'))

from app.db.base import Base
from app.db import models
print("TABLES:", Base.metadata.tables.keys())
