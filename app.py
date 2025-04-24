# app.py (FINAL COMPLETE CODE - Verified)
from flask import Flask, render_template, request, jsonify, abort
import pathlib
import threading
import time
import uuid
import utils # Import our helper functions
import logging
import json
import re
import os
import subprocess # Needed for ffmpeg fix
import shlex # Needed for quoting ffmpeg command for logging
import shutil # Needed for backup

app = Flask(__name__)
app.secret_key = 'change-this-in-production!' # Change this!
app.logger.setLevel(logging.INFO) # Set Flask's logger level

# --- Globals / Setup ---
CONFIG_DIR = pathlib.Path('/config')
PROFILES_DIR = CONFIG_DIR / "profiles"
tasks = {} # In-memory task store

# --- Helper for filename sanitization ---
def sanitize_filename(name):
    """Removes potentially dangerous characters for use as filename stem."""
    if not isinstance(name, str): return None
    name = name.strip().replace(" ", "_")
    name = re.sub(r'[^\w\-\.]+', '', name) # Allow dot in filename stem
    if not name or name.startswith('.') or name.endswith('.') or '..' in name or '/' in name or '\\' in name: return None
    if name.lower().endswith('.json'): name = name[:-5]
    if len(name) > 100: name = name[:100]
    if not name: return None
    return name

# --- Profile Loading Function ---
def get_current_profiles():
    """Loads profiles fresh from disk."""
    try:
        # Ensure profiles directory exists within the mounted config volume
        if not PROFILES_DIR.is_dir():
            app.logger.warning(f"Profiles directory '{PROFILES_DIR}' not found! Attempting to create.")
            try:
                PROFILES_DIR.mkdir(parents=True, exist_ok=True) # Correctly indented
                app.logger.info(f"Created profiles directory: '{PROFILES_DIR}'")
            except Exception as e:
                app.logger.error(f"Failed to create profiles directory '{PROFILES_DIR}': {e}") # Correctly indented
        # Load profiles using the utility function
        loaded_profiles = utils.load_profiles(PROFILES_DIR) # Load from /config/profiles
        if not loaded_profiles:
             app.logger.warning(f"No client profiles were loaded from '{PROFILES_DIR}'. Check host directory content and permissions.")
        # else: # Reduce startup noise
             # app.logger.info(f"Loaded/reloaded profile keys from '{PROFILES_DIR}': {list(loaded_profiles.keys())}")
             pass
        return loaded_profiles
    except Exception as e:
        app.logger.error(f"Critical error during profile loading function: {e}", exc_info=True)
        return {} # Return empty on error

# Log initial profiles at startup
initial_profiles_load_on_start = get_current_profiles()
app.logger.info(f"Initial check found profile keys at startup: {list(initial_profiles_load_on_start.keys())}")


# --- Background Task Runner - SCAN ---
def run_scan_task(task_id: str, directory: pathlib.Path, profile: dict):
    """Function executed in background thread to perform scan, adapting recursion."""
    global tasks
    if task_id not in tasks: tasks[task_id] = {}
    tasks[task_id].update({ "status": "running", "result": [], "processed_count": 0, "progress": 0, "current_file": None, "total_files": 0, "error": None, "cancel_requested": False })
    app.logger.info(f"Task {task_id}: Background scan started for '{directory}'")
    analysis_results_list = tasks[task_id]["result"]
    processed_count = 0; scan_cancelled = False

    try:
        # --- Adaptive Recursion Logic ---
        found_top_level_media = False; found_subdirectories = False; scan_type = "Non-Recursive"
        app.logger.info(f"Task {task_id}: Checking top-level content of '{directory}'...")
        try:
            items_checked = 0; max_items_to_check = 500
            for item in directory.iterdir():
                 if tasks.get(task_id, {}).get('cancel_requested', False): raise StopIteration("Scan cancelled during initial check")
                 items_checked += 1;
                 if item.is_dir(): found_subdirectories = True
                 elif item.is_file() and item.suffix.lower() in utils.SUPPORTED_EXTENSIONS: found_top_level_media = True; break
                 if items_checked >= max_items_to_check: break
        except Exception as e: app.logger.error(f"Task {task_id}: Error during directory check: {e}", exc_info=False); found_subdirectories = True
        if found_top_level_media: glob_pattern = "*"
        elif found_subdirectories: glob_pattern = "**/*"; scan_type = "Recursive"
        else: glob_pattern = "*"
        app.logger.info(f"Task {task_id}: Determined scan type: {scan_type}")

        # --- File Discovery ---
        app.logger.info(f"Task {task_id}: Globbing with pattern '{glob_pattern}' in '{directory}'")
        media_files_list = list(directory.glob(glob_pattern))
        valid_media_files = []
        for item in media_files_list:
             if tasks.get(task_id, {}).get('cancel_requested', False): raise StopIteration("Scan cancelled during discovery")
             if item.is_file() and item.suffix.lower() in utils.SUPPORTED_EXTENSIONS: valid_media_files.append(item)
        total_files_to_process = len(valid_media_files); tasks[task_id]["total_files"] = total_files_to_process
        app.logger.info(f"Task {task_id}: Found {total_files_to_process} media files to analyze.")
        if not valid_media_files: raise StopIteration("No media files found matching supported extensions.")

        # --- Analyze Files ---
        for media_file in valid_media_files:
            if tasks.get(task_id, {}).get('cancel_requested', False): raise StopIteration("Scan cancelled during analysis")
            processed_count += 1; relative_path_str = str(media_file.relative_to(directory))
            tasks[task_id]["progress"] = int((processed_count / total_files_to_process) * 100) if total_files_to_process > 0 else 0
            tasks[task_id]["processed_count"] = processed_count; tasks[task_id]["current_file"] = relative_path_str
            # Add Pre-ffprobe Log Line
            app.logger.info(f"Task {task_id}: [{processed_count}/{total_files_to_process}] Attempting ffprobe for: {relative_path_str}")

            # Perform Analysis & Extract Fields
            analysis_result_item = { "file_path": str(media_file), "relative_path": relative_path_str, "is_compatible": False, "reason": "", "error": None, "container": "N/A", "video_details": "N/A", "audio_tracks": [], "subtitle_codecs": [] }
            media_info = utils.run_ffprobe(media_file)
            if media_info:
                try: # Extract details
                    analysis_result_item["container"] = media_info.get('format', {}).get('format_name', 'N/A').split(',')[0]
                    if 'streams' in media_info:
                         video_codec, video_level_str = "N/A", ""; sub_list = [] ; detailed_audio_list = []
                         for stream in media_info['streams']:
                            codec_type = stream.get('codec_type'); codec_name = stream.get('codec_name', 'unknown'); stream_tags = stream.get('tags', {})
                            # --- Corrected Video Block Indentation ---
                            if codec_type == 'video' and video_codec == "N/A":
                                video_codec = codec_name; level = stream.get('level'); profile_str = stream.get('profile', '')
                                current_video_level_str = "" # Init
                                if level is not None:
                                    current_video_level_str = f" L{level / 10.0:.1f}" # Indented
                                analysis_result_item["video_details"] = f"{video_codec} {profile_str}{current_video_level_str}".strip() # Indented
                            # --- End Correction ---
                            elif codec_type == 'audio': track_info = {"index": stream.get('index'),"codec": codec_name,"language": stream_tags.get('language'),"title": stream_tags.get('title'),"channels": stream.get('channels'), "channel_layout": stream.get('channel_layout')}; detailed_audio_list.append(track_info)
                            elif codec_type == 'subtitle': sub_list.append(codec_name)
                         analysis_result_item["audio_tracks"] = detailed_audio_list; analysis_result_item["subtitle_codecs"] = sorted(list(set(sub_list)))
                except Exception as e: app.logger.error(f"Task {task_id}: Detail extraction error: {e}", exc_info=False); analysis_result_item["error"] = f"Detail extraction failed: {e}"

                try: # Check compatibility
                    is_compatible, reason = utils.check_compatibility(media_info, profile); analysis_result_item["is_compatible"] = is_compatible
                    if reason or not analysis_result_item["error"]: analysis_result_item["reason"] = reason
                    elif not reason and is_compatible and not analysis_result_item["error"]: analysis_result_item["reason"] = "Direct Play OK"
                except Exception as e: app.logger.error(f"Task {task_id}: Check failed: {e}", exc_info=False); analysis_result_item["error"] = f"Check failed: {e}"; analysis_result_item["reason"] = "[Check Error]"; analysis_result_item["is_compatible"] = False
            else: # ffprobe failed (Corrected Indentation)
                 analysis_result_item["error"] = "ffprobe command failed or gave empty output"
                 analysis_result_item["reason"] = "[Probe Failed]"
                 analysis_result_item["container"] = "[Probe Err]"
                 analysis_result_item["video_details"] = "[Probe Err]"
                 analysis_result_item["is_compatible"] = False

            analysis_results_list.append(analysis_result_item)

        # --- Scan Complete ---
        tasks[task_id]["status"] = "completed"; tasks[task_id]["current_file"] = None; tasks[task_id]["progress"] = 100; app.logger.info(f"Scan completed. Processed {processed_count} files.")
    except StopIteration as stop_reason:
        # --- Updated Cancellation Handling ---
        reason_str = str(stop_reason) if str(stop_reason) else "Unknown"; app.logger.info(f"Scan stopped cleanly. Reason: {reason_str}")
        if tasks.get(task_id):
             if "cancelled" in reason_str.lower():
                 tasks[task_id]["status"] = "cancelled"
                 scan_cancelled = True
             elif tasks[task_id].get("status") not in ["cancelling", "cancelled", "failed"]:
                 tasks[task_id]["status"] = "completed"
             if "No media files found" in reason_str: tasks[task_id]["result"] = [{"message": "No media files found."}]
             tasks[task_id]["current_file"] = None; tasks[task_id]["progress"] = 100
    except Exception as e: # Catch unexpected errors
        app.logger.error(f"Scan failed unexpectedly: {e}", exc_info=True);
        if tasks.get(task_id): tasks[task_id]["status"] = "failed"; tasks[task_id]["error"] = f"Unexpected error: {str(e)}"; tasks[task_id]["current_file"] = None
    # Final status check
    if tasks.get(task_id) and tasks[task_id].get("status") == "running":
         if not scan_cancelled: tasks[task_id]["status"] = "completed"; app.logger.warning(f"Task ended but status 'running'. Setting 'completed'.")


# --- Background Task Runner - FIX ---
def run_fix_task(task_id: str, files_to_fix: list[dict], fix_options: dict):
    """Background task to iterate through files and attempt fixes using ffmpeg."""
    global tasks
    if task_id not in tasks: tasks[task_id] = {}
    tasks[task_id].update({ "status": "running", "result": [], "processed_count": 0, "progress": 0, "current_file": "Starting fix...", "total_files": len(files_to_fix), "error": None, "cancel_requested": False })
    app.logger.info(f"Task {task_id}: Background fix started for {len(files_to_fix)} files.")
    fix_results_list = tasks[task_id]["result"]
    processed_count = 0; success_count = 0; fail_count = 0; skipped_count = 0; fix_cancelled = False
    target_audio_codec = fix_options.get('target_audio_codec', 'aac'); target_audio_bitrate = fix_options.get('target_audio_bitrate'); output_suffix = fix_options.get('output_suffix', '.fixed'); backup_original = fix_options.get('backup', False)

    try:
        for file_info in files_to_fix:
            if tasks.get(task_id, {}).get('cancel_requested', False): raise StopIteration("Fix cancelled by user")
            processed_count += 1; input_path_str = file_info.get('file_path'); relative_path = file_info.get('relative_path', input_path_str)
            tasks[task_id]["progress"] = int((processed_count / tasks[task_id]["total_files"]) * 100) if tasks[task_id]["total_files"] > 0 else 0
            tasks[task_id]["processed_count"] = processed_count; tasks[task_id]["current_file"] = f"Processing: {relative_path}"
            app.logger.info(f"Task {task_id}: Fixing {processed_count}/{tasks[task_id]['total_files']}: {relative_path}")
            fix_outcome = { "relative_path": relative_path, "status": "skipped", "message": "Unknown state", "output_path": None, "backup_path": None }

            if not input_path_str: fix_outcome["status"] = "failed"; fix_outcome["message"] = "Missing file path"; fail_count += 1; fix_results_list.append(fix_outcome); continue
            input_path = pathlib.Path(input_path_str)
            if not input_path.is_file(): fix_outcome["status"] = "failed"; fix_outcome["message"] = "Input file not found"; fail_count += 1; fix_results_list.append(fix_outcome); continue
            output_filename = f"{input_path.stem}{output_suffix}{input_path.suffix}"; output_path = input_path.parent / output_filename
            if output_path.exists(): app.logger.info(f"... Skipping, output exists"); fix_outcome["status"] = "skipped"; fix_outcome["message"] = "Output file already exists"; skipped_count += 1; fix_results_list.append(fix_outcome); continue
            if backup_original: # Backup logic
                backup_path = input_path.with_suffix(input_path.suffix + ".bak")
                if backup_path.exists(): app.logger.warning(f"... Backup exists, skipping backup.")
                else:
                    try: app.logger.info(f"... Creating backup"); shutil.copy2(input_path, backup_path); fix_outcome["backup_path"] = str(backup_path); app.logger.info(f"... Backup created.")
                    except Exception as bk_err: app.logger.error(f"... Backup failed: {bk_err}"); fix_outcome["status"] = "failed"; fix_outcome["message"] = f"Backup failed: {bk_err}"; fail_count += 1; fix_results_list.append(fix_outcome); continue

            # --- FFmpeg Command Construction ---
            # Basic command - copy video/subs, transcode ALL audio
            ffmpeg_cmd = [
                "ffmpeg",
                "-y",                    # Overwrite output without asking (though we check existence above)
                "-i", str(input_path),   # Input file
                "-map", "0",             # Map ALL streams from input 0
                "-map_metadata", "0",    # Copy global metadata from input 0
                "-c:v", "copy",          # Copy video stream(s)
                "-c:a", target_audio_codec, # Transcode ALL audio streams
                # Add bitrate if specified
                *(["-b:a", target_audio_bitrate] if target_audio_bitrate else []),
                "-c:s", "copy",          # Copy subtitle stream(s)
                "-loglevel", "warning",    # Reduce ffmpeg verbosity
                str(output_path)         # Output file
            ]
            app.logger.info(f"Task {task_id}: Running command: {shlex.join(ffmpeg_cmd)}")

            # --- Execute ffmpeg ---
            try:
                # Using check=False allows us to handle non-zero exit codes manually
                result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True, check=False, encoding='utf-8', errors='ignore', timeout=3600) # 1 hour timeout

                if result.returncode == 0:
                    app.logger.info(f"... Success: {output_path.name}")
                    fix_outcome["status"] = "success"; fix_outcome["message"] = "Fix completed"; fix_outcome["output_path"] = str(output_path); success_count += 1;
                else:
                    # ffmpeg ran but returned an error code
                    app.logger.error(f"... ffmpeg failed code {result.returncode} for {relative_path}. Error:\n{result.stderr[-1000:]}") # Show last part of stderr
                    fix_outcome["status"] = "failed"; fix_outcome["message"] = f"ffmpeg error (code {result.returncode})"; fail_count += 1;
                    # Attempt cleanup of potentially bad output file
                    if output_path.exists():
                        try:
                            output_path.unlink()
                            app.logger.info(f"... Deleted incomplete output file.")
                        except Exception as del_e:
                            app.logger.warning(f"... Failed to delete incomplete output file: {del_e}")
            except subprocess.TimeoutExpired:
                 app.logger.error(f"Task {task_id}: ffmpeg timed out for {relative_path}")
                 fix_outcome["status"] = "failed"; fix_outcome["message"] = "ffmpeg timeout"; fail_count += 1;
                 # Cleanup after timeout
                 if output_path.exists():
                     try:
                         output_path.unlink()
                         app.logger.info(f"... Deleted incomplete output file after timeout.")
                     except Exception as del_e:
                         app.logger.warning(f"... Failed to delete incomplete output file after timeout: {del_e}")
            except Exception as exec_e: # Catch other errors during subprocess.run
                app.logger.error(f"Task {task_id}: Error running ffmpeg for {relative_path}: {exec_e}", exc_info=True)
                fix_outcome["status"] = "failed"; fix_outcome["message"] = f"Execution error: {exec_e}"; fail_count += 1;
                # Cleanup after other errors
                if output_path.exists():
                    try:
                        output_path.unlink()
                        app.logger.info(f"... Deleted potentially incomplete output file after execution error.")
                    except Exception as del_e:
                        app.logger.warning(f"... Failed to delete potentially incomplete output file after execution error: {del_e}")

            fix_results_list.append(fix_outcome) # Append outcome for this file

        # --- Fix Loop Complete ---
        final_msg = f"Finished. Success: {success_count}, Failed: {fail_count}, Skipped: {skipped_count}"
        tasks[task_id]["status"] = "completed"; tasks[task_id]["current_file"] = final_msg; tasks[task_id]["progress"] = 100; app.logger.info(f"Task {task_id}: Fix completed. {final_msg}")
    except StopIteration as stop_reason:
        reason_str = str(stop_reason) if str(stop_reason) else "Unknown"; app.logger.info(f"Task {task_id}: Fix stopped cleanly. Reason: {reason_str}")
        if tasks.get(task_id): tasks[task_id]["status"] = "cancelled"; fix_cancelled = True; tasks[task_id]["current_file"] = "Fix cancelled."; tasks[task_id]["progress"] = 100
    except Exception as e: # Catch unexpected errors in the loop/setup
        app.logger.error(f"Task {task_id}: Fix failed unexpectedly. Error: {e}", exc_info=True);
        if tasks.get(task_id): tasks[task_id]["status"] = "failed"; tasks[task_id]["error"] = f"Unexpected error: {str(e)}"; tasks[task_id]["current_file"] = "Unexpected Error"
    # Final status check
    if tasks.get(task_id) and tasks[task_id].get("status") == "running":
         if not fix_cancelled: tasks[task_id]["status"] = "completed"; app.logger.warning(f"Task {task_id}: Fix task ended but status 'running'. Setting 'completed'.")


# --- Flask Routes ---
@app.route('/')
def index():
    """Serves the main HTML page."""
    current_profiles = get_current_profiles()
    profile_names = sorted(list(current_profiles.keys()))
    app.logger.info(f"Rendering index.html with profiles: {profile_names}")
    return render_template('index.html', profiles=profile_names)

# --- API Routes ---
@app.route('/api/scan', methods=['POST'])
def start_scan():
    """API endpoint to start an adaptively recursive scan task."""
    global tasks
    data = request.json
    directory = data.get('directory')
    profile_name = data.get('profile_name')
    if not directory: return jsonify({"error": "Missing directory parameter"}), 400
    if not profile_name: return jsonify({"error": "Missing profile name parameter"}), 400
    current_profiles = get_current_profiles()
    if profile_name not in current_profiles: return jsonify({"error": f"Profile '{profile_name}' not found."}), 400
    scan_dir = pathlib.Path(directory)
    if not scan_dir.is_dir(): return jsonify({"error": f"Scan directory '{directory}' not found."}), 400
    selected_profile_data = current_profiles[profile_name]
    task_id = f"scan_{uuid.uuid4()}"
    tasks[task_id] = {"status": "queued", "result": [], "cancel_requested": False, "error": None, "progress": 0}
    thread = threading.Thread(target=run_scan_task, args=(task_id, scan_dir, selected_profile_data))
    thread.daemon = True
    thread.start()
    app.logger.info(f"Task {task_id}: Queued ADAPTIVE scan for '{directory}', profile '{profile_name}'.")
    return jsonify({"message": "Scan queued", "task_id": task_id}), 202

@app.route('/api/status/<task_id>', methods=['GET'])
def get_status(task_id):
    """API endpoint to get the status and partial/full results of a task."""
    task = tasks.get(task_id)
    if not task: return jsonify({"error": "Task not found"}), 404
    response_data = { key: task.get(key) for key in ["status", "progress", "processed_count", "total_files", "current_file", "error", "result"] if task.get(key) is not None or key == 'result' }
    if 'result' not in response_data: response_data['result'] = []
    return jsonify(response_data)

@app.route('/api/stop_task/<task_id>', methods=['POST'])
def stop_task(task_id):
    """API endpoint to request cancellation of a running task."""
    global tasks
    task = tasks.get(task_id)
    if not task: return jsonify({"error": "Task not found"}), 404
    current_status = task.get('status')
    if current_status in ['running', 'queued', 'cancelling']:
        tasks[task_id]['cancel_requested'] = True
        tasks[task_id]['status'] = 'cancelling'
        app.logger.info(f"Task {task_id}: Cancellation requested.")
        return jsonify({"message": "Cancellation requested"}), 200
    else:
        app.logger.warning(f"Task {task_id}: Stop requested but status is '{current_status}'.")
        return jsonify({"error": f"Task cannot be stopped in status: {current_status}"}), 400

# --- Profile Management API Routes ---
@app.route('/api/profiles', methods=['GET'])
def get_profile_list():
    """Returns a list of available profile names."""
    profiles = get_current_profiles()
    return jsonify(sorted(list(profiles.keys())))

@app.route('/api/profiles/<profile_name>', methods=['GET'])
def get_profile_content(profile_name):
    """Gets the JSON content (as a string) of a specific profile."""
    safe_name = sanitize_filename(profile_name)
    if not safe_name: abort(400, description="Invalid profile name format.")
    profile_path = PROFILES_DIR / f"{safe_name}.json"
    app.logger.info(f"Reading profile: {profile_path}")
    if not profile_path.is_file(): abort(404, description="Profile not found.")
    try: content = profile_path.read_text(encoding='utf-8'); return jsonify({"profile_name": safe_name, "content": content})
    except Exception as e: app.logger.error(f"Error reading profile {profile_path}: {e}"); abort(500, description="Could not read profile.")

@app.route('/api/profiles/<profile_name>', methods=['PUT'])
def save_profile_content(profile_name):
    """Saves (overwrites) the JSON content for a specific profile."""
    safe_name = sanitize_filename(profile_name)
    if not safe_name: return jsonify({"error": "Invalid profile name format."}), 400
    profile_path = PROFILES_DIR / f"{safe_name}.json"
    app.logger.info(f"Saving profile (PUT): {profile_path}")
    if not request.is_json or 'content' not in request.json: return jsonify({"error": "Invalid request format."}), 400
    content_str = request.json['content']
    try: json.loads(content_str); # Validate JSON
    except Exception as e: return jsonify({"error": f"Invalid JSON format: {e}"}), 400
    try: profile_path.write_text(content_str, encoding='utf-8'); app.logger.info(f"Profile '{safe_name}' saved."); return jsonify({"message": f"Profile '{safe_name}' saved."}), 200
    except Exception as e: app.logger.error(f"Error writing profile {profile_path}: {e}"); return jsonify({"error": f"Could not save profile: {e}"}), 500

@app.route('/api/profiles', methods=['POST'])
def add_profile():
    """Adds a new profile."""
    if not request.is_json or 'content' not in request.json or 'name' not in request.json: return jsonify({"error": "Invalid request."}), 400
    new_name = request.json['name']; content_str = request.json['content']
    safe_name = sanitize_filename(new_name)
    if not safe_name: return jsonify({"error": "Invalid profile name format."}), 400
    profile_path = PROFILES_DIR / f"{safe_name}.json"
    app.logger.info(f"Adding profile (POST): {profile_path}")
    if profile_path.exists(): return jsonify({"error": f"Profile '{safe_name}' already exists."}), 409
    try: json.loads(content_str); # Validate JSON
    except Exception as e: return jsonify({"error": f"Invalid JSON format: {e}"}), 400
    try: PROFILES_DIR.mkdir(parents=True, exist_ok=True); profile_path.write_text(content_str, encoding='utf-8'); app.logger.info(f"Profile '{safe_name}' added."); return jsonify({"message": f"Profile '{safe_name}' added."}), 201
    except Exception as e: app.logger.error(f"Error writing profile {profile_path}: {e}"); return jsonify({"error": f"Could not add profile: {e}"}), 500

@app.route('/api/profiles/<profile_name>', methods=['DELETE'])
def delete_profile(profile_name):
    """Deletes a specific profile."""
    safe_name = sanitize_filename(profile_name)
    if not safe_name: return jsonify({"error": "Invalid profile name format."}), 400
    profile_path = PROFILES_DIR / f"{safe_name}.json"
    app.logger.info(f"Deleting profile (DELETE): {profile_path}")
    if not profile_path.is_file(): return jsonify({"error": "Profile not found."}), 404
    try: os.remove(profile_path); app.logger.info(f"Profile '{safe_name}' deleted."); return jsonify({"message": f"Profile '{safe_name}' deleted."}), 200
    except Exception as e: app.logger.error(f"Error deleting profile {profile_path}: {e}"); return jsonify({"error": f"Could not delete profile: {e}"}), 500

# --- API Route to Start Fix Task ---
@app.route('/api/fix', methods=['POST'])
def start_fix():
    """API endpoint to start a fix task for selected files."""
    global tasks
    if not request.is_json: return jsonify({"error": "Request must be JSON"}), 400;
    data = request.json; files_to_fix = data.get('files_to_fix'); fix_options = data.get('fix_options');
    if not isinstance(files_to_fix, list) or not files_to_fix: return jsonify({"error": "Missing 'files_to_fix' list."}), 400;
    if not isinstance(fix_options, dict): return jsonify({"error": "Missing 'fix_options' object."}), 400;
    task_id = f"fix_{uuid.uuid4()}"; tasks[task_id] = {"status": "queued", "result": [], "cancel_requested": False};
    thread = threading.Thread(target=run_fix_task, args=(task_id, files_to_fix, fix_options)); thread.daemon = True; thread.start();
    app.logger.info(f"Task {task_id}: Queued fix task for {len(files_to_fix)} files."); return jsonify({"message": "Fix task queued", "task_id": task_id}), 202

# --- Main Execution ---
if __name__ == '__main__':
    # Reload profiles just before running (safe fallback for direct run)
    final_check_profiles = get_current_profiles()
    app.logger.info(f"Profile keys just before app.run: {list(final_check_profiles.keys())}")

    # Default profile creation logic (Corrected indentation)
    if PROFILES_DIR.is_dir() and not any(PROFILES_DIR.glob('*.json')):
         default_profile_filename = "Plex - Generic.json"
         default_profile_path = PROFILES_DIR / default_profile_filename
         app.logger.info(f"No profiles found in '{PROFILES_DIR}', creating example '{default_profile_path.name}'")
         # V1.0 spec content
         default_profile_content = { "description": "Plex - Generic Profile (Based on V1.0 Spec)", "notes": "...", "supported_containers": ["matroska","mkv","mp4","mov","m4v"], "unsupported_containers_strict": ["avi","ts","m2ts"], "supported_video_codecs": ["h264","hevc"], "max_h264_level": 41, "supported_audio_codecs": ["aac","ac3","eac3"], "unsupported_audio_codecs_strict": ["dca","dts","truehd","mlpm","pcm","pcm_s16be","pcm_s16le","pcm_s24be","pcm_s24le","pcm_f32le","wmapro","wmav2","alac"], "supported_subtitle_codecs": ["subrip","ssa","ass"], "unsupported_subtitle_formats": ["hdmv_pgs_subtitle","dvd_subtitle"] }
         try:
            # Correctly indented block
            with open(default_profile_path, 'w', encoding='utf-8') as f:
                json.dump(default_profile_content, f, indent=4)
            app.logger.info(f"Successfully created '{default_profile_path.name}'")
         except Exception as e:
            # Correctly indented block
            app.logger.error(f"Could not write default profile '{default_profile_path.name}': {e}")

    app.logger.info("Starting Flask application server via __main__...")
    app.run(host='0.0.0.0', port=5000, debug=False) # Keep debug=False for container