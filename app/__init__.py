import logging
import os
from logging.handlers import RotatingFileHandler
from flask import Flask

def create_app():
    app = Flask(__name__, template_folder='../templates', static_folder='../static')
    app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'change-this-in-production!')

    # Setup logging
    log_dir = os.path.join(os.environ.get('CONFIG_DIR', '/config'), 'logs')
    os.makedirs(log_dir, exist_ok=True)
    log_file = os.path.join(log_dir, 'app.log')

    handler = RotatingFileHandler(log_file, maxBytes=10*1024*1024, backupCount=5)
    formatter = logging.Formatter('%(asctime)s %(levelname)s %(name)s - %(message)s')
    handler.setFormatter(formatter)
    handler.setLevel(logging.INFO)

    app.logger.addHandler(handler)
    app.logger.setLevel(logging.INFO)

    # Import and register blueprints or routes
    from .routes import main_bp
    app.register_blueprint(main_bp)

    return app
