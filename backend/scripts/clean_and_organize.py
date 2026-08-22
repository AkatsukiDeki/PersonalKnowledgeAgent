#!/usr/bin/env python3
import os
import shutil
from pathlib import Path
from typing import List, Tuple

PROJECT_ROOT = Path(__file__).resolve().parent
BACKEND_DIR = PROJECT_ROOT / "backend"
SCRIPTS_DIR = BACKEND_DIR / "scripts"

# Список системных/обязательных файлов в корне backend, которые НЕЛЬЗЯ трогать
CRITICAL_BACKEND_FILES = {
    "main.py",
    "app.py",
    "alembic.ini",
    "Dockerfile",
    "docker-compose.yml",
    "requirements.txt",
    "pyproject.toml",
    "setup.cfg",
    "README.md",
    ".env",
    ".env.example",
    ".gitignore",
}

# Явный одноразовый мусор/дубликаты (рекомендуется удалить)
TRASH_CANDIDATES = [
    "fix_db2.py",
    "check_status.py",
    "count_claims.py",
    "alter_dim.py",
    "clear_relations.py",
    "force_reindex.ps1",
]


def find_loose_scripts(target_dir: Path) -> List[Path]:
    """Поиск всех разрозненных скриптов в корне директории."""
    loose = []
    if not target_dir.exists():
        return loose

    for item in target_dir.iterdir():
        if item.is_file():
            if item.suffix in [".py", ".ps1", ".sh", ".bat", ".sql"]:
                if item.name not in CRITICAL_BACKEND_FILES:
                    loose.append(item)
    return sorted(loose, key=lambda x: x.name)


def organize_project():
    print("\n" + "=" * 65)
    print("🧹 ОРГАНИЗАЦИЯ И ОЧИСТКА ВРЕМЕННЫХ СКРИПТОВ (BACKEND)")
    print("=" * 65)

    loose_scripts = find_loose_scripts(BACKEND_DIR) + find_loose_scripts(PROJECT_ROOT)
    # Убираем дубликаты путей
    loose_scripts = list({p.resolve(): p for p in loose_scripts}.values())

    if not loose_scripts:
        print("\n✅ Корень проекта и backend чист! Лишних скриптов не обнаружено.\n")
        return

    print(f"\nОбнаружено {len(loose_scripts)} утилитарных/временных скриптов:")
    for s in loose_scripts:
        is_trash = s.name in TRASH_CANDIDATES or "2" in s.stem or "temp" in s.stem
        marker = "🗑️  [Мусор]" if is_trash else "📦 [Утилита]"
        print(f"  {marker} {s.relative_to(PROJECT_ROOT)}")

    print("\nВарианты действий:")
    print("  [1] Переместить все полезные скрипты в 'backend/scripts/', а явный мусор удалить")
    print("  [2] Переместить ВСЕ найденные скрипты в 'backend/scripts/' (без удаления)")
    print("  [3] Удалить ВСЕ найденные скрипты из корня")
    print("  [0] Отмена (ничего не делать)")

    # АВТОМАТИЗИРОВАНО ВЫБОРОМ "1" (как просил юзер)
    choice = "1"
    print(f"\nАвтоматически выбрано действие: {choice}")

    SCRIPTS_DIR.mkdir(parents=True, exist_ok=True)

    if choice == "1":
        moved = 0
        deleted = 0
        for s in loose_scripts:
            if s.name in TRASH_CANDIDATES or "2" in s.stem or "temp" in s.stem:
                s.unlink()
                deleted += 1
            else:
                dest = SCRIPTS_DIR / s.name
                shutil.move(str(s), str(dest))
                moved += 1
        print(f"\n✨ Готово! Удалено мусора: {deleted}, Перемещено в 'backend/scripts/': {moved}")

    print("=" * 65 + "\n")


if __name__ == "__main__":
    organize_project()
