from flask import Blueprint, render_template, request, jsonify, abort
import pathlib
import uuid
import threading
import os
import utils
from .tasks import run_scan_task, run_fix_task
import pathlib
import os

main_bp = Blueprint('main', __name__)

@main_bp.route('/settings')
def settings():
    return render_template('settings.html')

@main_bp.route('/logs')
def logs():
    return render_template('logs.html')

@main_bp.route('/profiles')
def profiles():
    return render_template('profiles.html')

@main_bp.route('/help')
def help_page():
    return render_template('help.html')

@main_bp.route('/restart-tasks', methods=['POST'])
def restart_tasks():
    # Implement restart tasks logic here
    # For now, just return success
    from flask import current_app

    current_app.logger.info("Restart tasks requested")
    return jsonify({'status': 'success', 'message': 'Tasks restarted'})

@main_bp.route('/stop-tasks', methods=['POST'])
def stop_tasks():
    # Implement stop tasks logic here
    # For now, just return success
    from flask import current_app

    current_app.logger.info("Stop tasks requested")
    return jsonify({'status': 'success', 'message': 'Tasks stopped'})

def sanitize_filename(name):
    return utils.sanitize_filename(name)

def get_current_profiles():
    return utils.load_profiles(pathlib.Path(os.environ.get('CONFIG_DIR', '/config')) / "profiles")

tasks = {}  # In-memory task store

from datetime import timedelta
import json

class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, timedelta):
            return str(obj)
        return super().default(obj)

@main_bp.route('/')
def index():
    """Serves the main HTML page."""
    current_profiles = get_current_profiles()
    profile_names = sorted(list(current_profiles.keys()))
    # Use current_app logger instead of blueprint logger
    from flask import current_app, current_app as app
    current_app.logger.info(f"Rendering index.html with profiles: {profile_names}")
    # Pass config to template with custom JSON encoder for timedelta
    config_json = json.dumps(app.config, cls=CustomJSONEncoder)
    return render_template('index.html', profiles=profile_names, config=config_json)

@main_bp.route('/about')
def about():
    """Serves the About page."""
    return render_template('about.html')

@main_bp.route('/faq')
def faq():
    """Serves the FAQ page."""
    return render_template('faq.html')

from flask import current_app

@main_bp.route('/api/scan', methods=['POST'])
def start_scan():
    """API endpoint to start an adaptively recursive scan task."""
    global tasks
    data = request.json
    directory = data.get('directory')
    profile_name = data.get('profile_name')
    if not directory:
        return jsonify({"error": "Missing directory parameter"}), 400
    if not profile_name:
        return jsonify({"error": "Missing profile name parameter"}), 400
    current_profiles = get_current_profiles()
    if profile_name not in current_profiles:
        return jsonify({"error": f"Profile '{profile_name}' not found."}), 400
    scan_dir = pathlib.Path(directory)
    if not scan_dir.is_dir():
        return jsonify({"error": f"Scan directory '{directory}' not found."}), 400
    selected_profile_data = current_profiles[profile_name]
    task_id = f"scan_{uuid.uuid4()}"
    thread = threading.Thread(target=run_scan_task, args=(task_id, scan_dir, selected_profile_data, tasks, current_app.logger))
    thread.daemon = True
    thread.start()
    current_app.logger.info(f"Task {task_id}: Queued ADAPTIVE scan for '{directory}', profile '{profile_name}'.")
    return jsonify({"message": "Scan queued", "task_id": task_id}), 202

@main_bp.route('/api/status/<task_id>', methods=['GET'])
def get_status(task_id):
    """API endpoint to get the status and partial/full results of a task."""
    task = tasks.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    response_data = {key: task.get(key) for key in ["status", "progress", "processed_count", "total_files", "current_file", "error", "result"] if task.get(key) is not None or key == 'result'}
    if 'result' not in response_data:
        response_data['result'] = []
    return jsonify(response_data)

@main_bp.route('/api/stop_task/<task_id>', methods=['POST'])
def stop_task(task_id):
    """API endpoint to request cancellation of a running task."""
    from flask import current_app
    global tasks
    task = tasks.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    current_status = task.get('status')
    if current_status in ['running', 'queued', 'cancelling']:
        tasks[task_id]['cancel_requested'] = True
        tasks[task_id]['status'] = 'cancelling'
        current_app.logger.info(f"Task {task_id}: Cancellation requested.")
        return jsonify({"message": "Cancellation requested"}), 200
    else:
        current_app.logger.warning(f"Task {task_id}: Stop requested but status is '{current_status}'.")
        return jsonify({"error": f"Task cannot be stopped in status: {current_status}"}), 400

@main_bp.route('/api/profiles', methods=['GET'])
def get_profile_list():
    """Returns a list of available profile names."""
    profiles = get_current_profiles()
    return jsonify(sorted(list(profiles.keys())))

@main_bp.route('/api/profiles/<profile_name>', methods=['GET'])
def get_profile_content(profile_name):
    """Gets the JSON content (as a string) of a specific profile."""
    safe_name = sanitize_filename(profile_name)
    if not safe_name:
        abort(400, description="Invalid profile name format.")
    profile_path = os.path.join(os.environ.get('CONFIG_DIR', '/config'), 'profiles', f"{safe_name}.json")
    current_app.logger.info(f"Reading profile: {profile_path}")
    if not pathlib.Path(profile_path).is_file():
        abort(404, description="Profile not found.")
    try:
        content = pathlib.Path(profile_path).read_text(encoding='utf-8')
        return jsonify({"profile_name": safe_name, "content": content})
    except Exception as e:
        from flask import current_app
        current_app.logger.error(f"Error reading profile {profile_path}: {e}")
        abort(500, description="Could not read profile.")

@main_bp.route('/api/profiles/<profile_name>', methods=['PUT'])
def save_profile_content(profile_name):
    """Saves (overwrites) the JSON content for a specific profile."""
    from flask import current_app
    safe_name = sanitize_filename(profile_name)
    if not safe_name:
        return jsonify({"error": "Invalid profile name format."}), 400
    profile_path = os.path.join(os.environ.get('CONFIG_DIR', '/config'), 'profiles', f"{safe_name}.json")
    current_app.logger.info(f"Saving profile (PUT): {profile_path}")
    if not request.is_json or 'content' not in request.json:
        return jsonify({"error": "Invalid request format."}), 400
    content_str = request.json['content']
    import json
    try:
        json.loads(content_str)  # Validate JSON
    except Exception as e:
        return jsonify({"error": f"Invalid JSON format: {e}"}), 400
    try:
        pathlib.Path(profile_path).write_text(content_str, encoding='utf-8')
        current_app.logger.info(f"Profile '{safe_name}' saved.")
        return jsonify({"message": f"Profile '{safe_name}' saved."}), 200
    except Exception as e:
        current_app.logger.error(f"Error writing profile {profile_path}: {e}")
        return jsonify({"error": f"Could not save profile: {e}"}), 500

@main_bp.route('/api/profiles', methods=['POST'])
def add_profile():
    """Adds a new profile."""
    from flask import current_app
    if not request.is_json or 'content' not in request.json or 'name' not in request.json:
        return jsonify({"error": "Invalid request."}), 400
    new_name = request.json['name']
    content_str = request.json['content']
    safe_name = sanitize_filename(new_name)
    if not safe_name:
        return jsonify({"error": "Invalid profile name format."}), 400
    profile_path = os.path.join(os.environ.get('CONFIG_DIR', '/config'), 'profiles', f"{safe_name}.json")
    current_app.logger.info(f"Adding profile (POST): {profile_path}")
    if pathlib.Path(profile_path).exists():
        return jsonify({"error": f"Profile '{safe_name}' already exists."}), 409
    import json
    try:
        json.loads(content_str)  # Validate JSON
    except Exception as e:
        return jsonify({"error": f"Invalid JSON format: {e}"}), 400
    try:
        pathlib.Path(os.path.dirname(profile_path)).mkdir(parents=True, exist_ok=True)
        pathlib.Path(profile_path).write_text(content_str, encoding='utf-8')
        current_app.logger.info(f"Profile '{safe_name}' added.")
        return jsonify({"message": f"Profile '{safe_name}' added."}), 201
    except Exception as e:
        from flask import current_app
        current_app.logger.error(f"Error writing profile {profile_path}: {e}")
        return jsonify({"error": f"Could not add profile: {e}"}), 500

@main_bp.route('/api/profiles/<profile_name>', methods=['DELETE'])
def delete_profile(profile_name):
    """Deletes a specific profile."""
    from flask import current_app
    safe_name = sanitize_filename(profile_name)
    if not safe_name:
        return jsonify({"error": "Invalid profile name format."}), 400
    profile_path = os.path.join(os.environ.get('CONFIG_DIR', '/config'), 'profiles', f"{safe_name}.json")
    current_app.logger.info(f"Deleting profile (DELETE): {profile_path}")
    if not pathlib.Path(profile_path).is_file():
        return jsonify({"error": "Profile not found."}), 404
    try:
        pathlib.Path(profile_path).unlink()
        current_app.logger.info(f"Profile '{safe_name}' deleted.")
        return jsonify({"message": f"Profile '{safe_name}' deleted."}), 200
    except Exception as e:
        from flask import current_app
        current_app.logger.error(f"Error deleting profile {profile_path}: {e}")
        return jsonify({"error": f"Could not delete profile: {e}"}), 500

@main_bp.route('/api/fix', methods=['POST'])
def start_fix():
    """API endpoint to start a fix task for selected files."""
    from flask import current_app
    global tasks
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400
    data = request.json
    files_to_fix = data.get('files_to_fix')
    fix_options = data.get('fix_options')
    if not isinstance(files_to_fix, list) or not files_to_fix:
        return jsonify({"error": "Missing 'files_to_fix' list."}), 400
    if not isinstance(fix_options, dict):
        return jsonify({"error": "Missing 'fix_options' object."}), 400
    task_id = f"fix_{uuid.uuid4()}"
    thread = threading.Thread(target=run_fix_task, args=(task_id, files_to_fix, fix_options, tasks, current_app.logger))
    thread.daemon = True
    thread.start()
    current_app.logger.info(f"Task {task_id}: Queued fix task for {len(files_to_fix)} files.")
    return jsonify({"message": "Fix task queued", "task_id": task_id}), 202
