import os
import pathlib

class Config:
    SECRET_KEY = os.environ.get('FLASK_SECRET_KEY', 'change-this-in-production!')
    CONFIG_DIR = os.environ.get('CONFIG_DIR', '/config')
    PROFILES_DIR = pathlib.Path(CONFIG_DIR) / "profiles"
    LOG_DIR = pathlib.Path(CONFIG_DIR) / "logs"
