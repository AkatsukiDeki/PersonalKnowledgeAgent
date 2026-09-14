import asyncio
import tempfile
import os
import sys
from typing import Dict, Any, Tuple
import logging

logger = logging.getLogger(__name__)

class CodeRunner:
    """
    Песочница для безопасного выполнения Python-кода, сгенерированного LLM.
    Работает через локальный subprocess (в качестве fallback/MVP).
    В production-окружении (в Docker) следует вынести этот функционал 
    в отдельный worker-контейнер для безопасности.
    """
    
    def __init__(self, timeout: int = 5):
        self.timeout = timeout
        
    async def run_python(self, code: str) -> Tuple[bool, str]:
        """
        Выполняет переданный Python-код в изолированном (насколько это возможно) процессе.
        Возвращает кортеж: (is_success, output_string)
        """
        # Создаем временный файл для кода
        fd, temp_path = tempfile.mkstemp(suffix=".py", prefix="pka_sandbox_")
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                f.write(code)
                
            # Аргументы:
            # -I : isolate from user environment (no user site-packages)
            # -B : don't write .pyc files
            cmd = [sys.executable, "-I", "-B", temp_path]
            
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            try:
                stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=self.timeout)
                out_str = stdout.decode('utf-8').strip()
                err_str = stderr.decode('utf-8').strip()
                
                if process.returncode == 0:
                    return True, out_str if out_str else "Выполнено успешно (нет вывода)"
                else:
                    return False, f"Ошибка выполнения (код {process.returncode}):\n{err_str}\n{out_str}".strip()
                    
            except asyncio.TimeoutError:
                process.kill()
                await process.communicate()
                return False, f"Ошибка: превышен лимит времени выполнения ({self.timeout} сек)."
                
        except Exception as e:
            logger.error(f"Sandbox error: {e}")
            return False, f"Системная ошибка песочницы: {str(e)}"
            
        finally:
            # Подчищаем временный файл
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass

    async def run_python_detailed(self, code: str) -> Dict[str, Any]:
        """
        Выполняет переданный Python-код.
        Возвращает детальную информацию: stdout, stderr, exit_code, execution_time_ms
        """
        fd, temp_path = tempfile.mkstemp(suffix=".py", prefix="pka_sandbox_det_")
        start_time = asyncio.get_event_loop().time()
        
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                f.write(code)
                
            cmd = [sys.executable, "-I", "-B", temp_path]
            
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            try:
                stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=self.timeout)
                end_time = asyncio.get_event_loop().time()
                out_str = stdout.decode('utf-8').strip()
                err_str = stderr.decode('utf-8').strip()
                
                return {
                    "stdout": out_str,
                    "stderr": err_str,
                    "exit_code": process.returncode,
                    "execution_time_ms": (end_time - start_time) * 1000
                }
                    
            except asyncio.TimeoutError:
                process.kill()
                await process.communicate()
                return {
                    "stdout": "",
                    "stderr": f"Execution timed out (limit: {self.timeout}s)",
                    "exit_code": 124,
                    "execution_time_ms": self.timeout * 1000
                }
                
        except Exception as e:
            logger.error(f"Sandbox error: {e}")
            return {
                "stdout": "",
                "stderr": f"Системная ошибка песочницы: {str(e)}",
                "exit_code": -1,
                "execution_time_ms": 0
            }
            
        finally:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass

sandbox_runner = CodeRunner()
