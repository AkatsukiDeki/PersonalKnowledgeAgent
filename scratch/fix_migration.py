import sys

path = r'c:\Users\Andrey\PycharmProjects\PKA\backend\alembic\versions\081775aa945b_add_calendar_events_and_reminders.py'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace(
    "op.drop_index(op.f('idx_relations_chunk'), table_name='entity_relations')",
    "# op.drop_index(op.f('idx_relations_chunk'), table_name='entity_relations')"
)
text = text.replace(
    "op.drop_index(op.f('idx_relations_source'), table_name='entity_relations')",
    "# op.drop_index(op.f('idx_relations_source'), table_name='entity_relations')"
)
text = text.replace(
    "op.drop_index(op.f('idx_relations_target'), table_name='entity_relations')",
    "# op.drop_index(op.f('idx_relations_target'), table_name='entity_relations')"
)
text = text.replace(
    "op.drop_table('entity_relations')",
    "# op.drop_table('entity_relations')"
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
print("Done!")
