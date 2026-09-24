import sys

def patch():
    file_path = "c:\\Users\\Andrey\\PycharmProjects\\PKA\\backend\\app\\agent\\gemini.py"
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    schema_additions = """
CREATE_TASK_SCHEMA = {
    "type": "function",
    "function": {
        "name": "create_planner_task",
        "description": "Create a new task in the planner",
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Task title"},
                "description": {"type": "string", "description": "Task description"},
                "due_date": {"type": "string", "description": "Due date in ISO 8601 format (YYYY-MM-DD)"},
                "estimated_minutes": {"type": "integer", "description": "Estimated minutes to complete"},
            },
            "required": ["title", "due_date"],
        },
    },
}

RESCHEDULE_TASK_SCHEMA = {
    "type": "function",
    "function": {
        "name": "reschedule_planner_task",
        "description": "Reschedule an existing task",
        "parameters": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "ID of the task"},
                "new_due_date": {"type": "string", "description": "New due date in ISO 8601 format (YYYY-MM-DD)"},
            },
            "required": ["task_id", "new_due_date"],
        },
    },
}
"""

    if "CREATE_TASK_SCHEMA" not in content:
        content = content.replace("EXECUTE_CODE_SCHEMA = {", schema_additions + "\nEXECUTE_CODE_SCHEMA = {")

    old_tools = "ollama_tools = [EXECUTE_CODE_SCHEMA] if tools else None"
    new_tools = "ollama_tools = [EXECUTE_CODE_SCHEMA, CREATE_TASK_SCHEMA, RESCHEDULE_TASK_SCHEMA] if tools else None"
    
    if old_tools in content:
        content = content.replace(old_tools, new_tools)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

if __name__ == "__main__":
    patch()
