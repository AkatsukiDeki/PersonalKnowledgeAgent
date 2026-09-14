from aiogram.fsm.state import State, StatesGroup

class FolderCreation(StatesGroup):
    waiting_for_folder_name = State()
