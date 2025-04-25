import pathlib
import utils
import subprocess
import shlex
import shutil

def run_scan_task(task_id: str, directory: pathlib.Path, profile: dict, tasks: dict, logger):
    """Function executed in background thread to perform scan, adapting recursion."""
    if task_id not in tasks:
        tasks[task_id] = {}
    tasks[task_id].update({
        "status": "running",
        "result": [],
        "processed_count": 0,
        "progress": 0,
        "current_file": None,
        "total_files": 0,
        "error": None,
        "cancel_requested": False
    })
    logger.info(f"Task {task_id}: Background scan started for '{directory}'")
    analysis_results_list = tasks[task_id]["result"]
    processed_count = 0
    scan_cancelled = False

    try:
        found_top_level_media = False
        found_subdirectories = False
        scan_type = "Non-Recursive"
        logger.info(f"Task {task_id}: Checking top-level content of '{directory}'...")
        try:
            items_checked = 0
            max_items_to_check = 500
            for item in directory.iterdir():
                if tasks.get(task_id, {}).get('cancel_requested', False):
                    raise StopIteration("Scan cancelled during initial check")
                items_checked += 1
                if item.is_dir():
                    found_subdirectories = True
                elif item.is_file() and item.suffix.lower() in utils.SUPPORTED_EXTENSIONS:
                    found_top_level_media = True
                    break
                if items_checked >= max_items_to_check:
                    break
        except Exception as e:
            logger.error(f"Task {task_id}: Error during directory check: {e}", exc_info=False)
            found_subdirectories = True
        if found_top_level_media:
            glob_pattern = "*"
        elif found_subdirectories:
            glob_pattern = "**/*"
            scan_type = "Recursive"
        else:
            glob_pattern = "*"
        logger.info(f"Task {task_id}: Determined scan type: {scan_type}")

        logger.info(f"Task {task_id}: Globbing with pattern '{glob_pattern}' in '{directory}'")
        media_files_list = list(directory.glob(glob_pattern))
        valid_media_files = []
        for item in media_files_list:
            if tasks.get(task_id, {}).get('cancel_requested', False):
                raise StopIteration("Scan cancelled during discovery")
            if item.is_file() and item.suffix.lower() in utils.SUPPORTED_EXTENSIONS:
                valid_media_files.append(item)
        total_files_to_process = len(valid_media_files)
        tasks[task_id]["total_files"] = total_files_to_process
        logger.info(f"Task {task_id}: Found {total_files_to_process} media files to analyze.")
        if not valid_media_files:
            raise StopIteration("No media files found matching supported extensions.")

        for media_file in valid_media_files:
            if tasks.get(task_id, {}).get('cancel_requested', False):
                raise StopIteration("Scan cancelled during analysis")
            processed_count += 1
            relative_path_str = str(media_file.relative_to(directory))
            tasks[task_id]["progress"] = int((processed_count / total_files_to_process) * 100) if total_files_to_process > 0 else 0
            tasks[task_id]["processed_count"] = processed_count
            tasks[task_id]["current_file"] = relative_path_str
            logger.info(f"Task {task_id}: [{processed_count}/{total_files_to_process}] Attempting ffprobe for: {relative_path_str}")

            analysis_result_item = {
                "file_path": str(media_file),
                "relative_path": relative_path_str,
                "is_compatible": False,
                "reason": "",
                "error": None,
                "container": "N/A",
                "video_details": "N/A",
                "audio_tracks": [],
                "subtitle_codecs": []
            }
            media_info = utils.run_ffprobe(media_file)
            if media_info:
                try:
                    analysis_result_item["container"] = media_info.get('format', {}).get('format_name', 'N/A').split(',')[0]
                    if 'streams' in media_info:
                        video_codec = "N/A"
                        video_level_str = ""
                        sub_list = []
                        detailed_audio_list = []
                        for stream in media_info['streams']:
                            codec_type = stream.get('codec_type')
                            codec_name = stream.get('codec_name', 'unknown')
                            stream_tags = stream.get('tags', {})
                            if codec_type == 'video' and video_codec == "N/A":
                                video_codec = codec_name
                                level = stream.get('level')
                                profile_str = stream.get('profile', '')
                                current_video_level_str = ""
                                if level is not None:
                                    current_video_level_str = f" L{level / 10.0:.1f}"
                                analysis_result_item["video_details"] = f"{video_codec} {profile_str}{current_video_level_str}".strip()
                            elif codec_type == 'audio':
                                track_info = {
                                    "index": stream.get('index'),
                                    "codec": codec_name,
                                    "language": stream_tags.get('language'),
                                    "title": stream_tags.get('title'),
                                    "channels": stream.get('channels'),
                                    "channel_layout": stream.get('channel_layout')
                                }
                                detailed_audio_list.append(track_info)
                            elif codec_type == 'subtitle':
                                sub_list.append(codec_name)
                        analysis_result_item["audio_tracks"] = detailed_audio_list
                        analysis_result_item["subtitle_codecs"] = sorted(list(set(sub_list)))
                except Exception as e:
                    logger.error(f"Task {task_id}: Detail extraction error: {e}", exc_info=False)
                    analysis_result_item["error"] = f"Detail extraction failed: {e}"

                try:
                    is_compatible, reason = utils.check_compatibility(media_info, profile)
                    analysis_result_item["is_compatible"] = is_compatible
                    if reason or not analysis_result_item["error"]:
                        analysis_result_item["reason"] = reason
                    elif not reason and is_compatible and not analysis_result_item["error"]:
                        analysis_result_item["reason"] = "Direct Play OK"
                except Exception as e:
                    logger.error(f"Task {task_id}: Check failed: {e}", exc_info=False)
                    analysis_result_item["error"] = f"Check failed: {e}"
                    analysis_result_item["reason"] = "[Check Error]"
                    analysis_result_item["is_compatible"] = False
            else:
                analysis_result_item["error"] = "ffprobe command failed or gave empty output"
                analysis_result_item["reason"] = "[Probe Failed]"
                analysis_result_item["container"] = "[Probe Err]"
                analysis_result_item["video_details"] = "[Probe Err]"
                analysis_result_item["is_compatible"] = False

            analysis_results_list.append(analysis_result_item)

        tasks[task_id]["status"] = "completed"
        tasks[task_id]["current_file"] = None
        tasks[task_id]["progress"] = 100
        logger.info(f"Scan completed. Processed {processed_count} files.")
    except StopIteration as stop_reason:
        reason_str = str(stop_reason) if str(stop_reason) else "Unknown"
        logger.info(f"Scan stopped cleanly. Reason: {reason_str}")
        if tasks.get(task_id):
            if "cancelled" in reason_str.lower():
                tasks[task_id]["status"] = "cancelled"
                scan_cancelled = True
            elif tasks[task_id].get("status") not in ["cancelling", "cancelled", "failed"]:
                tasks[task_id]["status"] = "completed"
            if "No media files found" in reason_str:
                tasks[task_id]["result"] = [{"message": "No media files found."}]
            tasks[task_id]["current_file"] = None
            tasks[task_id]["progress"] = 100
    except Exception as e:
        logger.error(f"Scan failed unexpectedly: {e}", exc_info=True)
        if tasks.get(task_id):
            tasks[task_id]["status"] = "failed"
            tasks[task_id]["error"] = f"Unexpected error: {str(e)}"
            tasks[task_id]["current_file"] = None
    if tasks.get(task_id) and tasks[task_id].get("status") == "running":
        if not scan_cancelled:
            tasks[task_id]["status"] = "completed"
            logger.warning(f"Task ended but status 'running'. Setting 'completed'.")

def run_fix_task(task_id: str, files_to_fix: list[dict], fix_options: dict, tasks: dict, logger):
    """Background task to iterate through files and attempt fixes using ffmpeg."""
    if task_id not in tasks:
        tasks[task_id] = {}
    tasks[task_id].update({
        "status": "running",
        "result": [],
        "processed_count": 0,
        "progress": 0,
        "current_file": "Starting fix...",
        "total_files": len(files_to_fix),
        "error": None,
        "cancel_requested": False
    })
    logger.info(f"Task {task_id}: Background fix started for {len(files_to_fix)} files.")
    fix_results_list = tasks[task_id]["result"]
    processed_count = 0
    success_count = 0
    fail_count = 0
    skipped_count = 0
    fix_cancelled = False
    target_audio_codec = fix_options.get('target_audio_codec', 'aac')
    target_audio_bitrate = fix_options.get('target_audio_bitrate')
    output_suffix = fix_options.get('output_suffix', '.fixed')
    backup_original = fix_options.get('backup', False)

    try:
        for file_info in files_to_fix:
            if tasks.get(task_id, {}).get('cancel_requested', False):
                raise StopIteration("Fix cancelled by user")
            processed_count += 1
            input_path_str = file_info.get('file_path')
            relative_path = file_info.get('relative_path', input_path_str)
            tasks[task_id]["progress"] = int((processed_count / tasks[task_id]["total_files"]) * 100) if tasks[task_id]["total_files"] > 0 else 0
            tasks[task_id]["processed_count"] = processed_count
            tasks[task_id]["current_file"] = f"Processing: {relative_path}"
            logger.info(f"Task {task_id}: Fixing {processed_count}/{tasks[task_id]['total_files']}: {relative_path}")
            fix_outcome = {
                "relative_path": relative_path,
                "status": "skipped",
                "message": "Unknown state",
                "output_path": None,
                "backup_path": None
            }

            if not input_path_str:
                fix_outcome["status"] = "failed"
                fix_outcome["message"] = "Missing file path"
                fail_count += 1
                fix_results_list.append(fix_outcome)
                continue
            input_path = pathlib.Path(input_path_str)
            if not input_path.is_file():
                fix_outcome["status"] = "failed"
                fix_outcome["message"] = "Input file not found"
                fail_count += 1
                fix_results_list.append(fix_outcome)
                continue
            output_filename = f"{input_path.stem}{output_suffix}{input_path.suffix}"
            output_path = input_path.parent / output_filename
            if output_path.exists():
                logger.info(f"... Skipping, output exists")
                fix_outcome["status"] = "skipped"
                fix_outcome["message"] = "Output file already exists"
                skipped_count += 1
                fix_results_list.append(fix_outcome)
                continue
            if backup_original:
                backup_path = input_path.with_suffix(input_path.suffix + ".bak")
                if backup_path.exists():
                    logger.warning(f"... Backup exists, skipping backup.")
                else:
                    try:
                        logger.info(f"... Creating backup")
                        shutil.copy2(input_path, backup_path)
                        fix_outcome["backup_path"] = str(backup_path)
                        logger.info(f"... Backup created.")
                    except Exception as bk_err:
                        logger.error(f"... Backup failed: {bk_err}")
                        fix_outcome["status"] = "failed"
                        fix_outcome["message"] = f"Backup failed: {bk_err}"
                        fail_count += 1
                        fix_results_list.append(fix_outcome)
                        continue

            ffmpeg_cmd = [
                "ffmpeg",
                "-y",
                "-i", str(input_path),
                "-map", "0",
                "-map_metadata", "0",
                "-c:v", "copy",
                "-c:a", target_audio_codec,
                *(["-b:a", target_audio_bitrate] if target_audio_bitrate else []),
                "-c:s", "copy",
                "-loglevel", "warning",
                str(output_path)
            ]
            logger.info(f"Task {task_id}: Running command: {shlex.join(ffmpeg_cmd)}")

            try:
                result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True, check=False, encoding='utf-8', errors='ignore', timeout=3600)
                if result.returncode == 0:
                    logger.info(f"... Success: {output_path.name}")
                    fix_outcome["status"] = "success"
                    fix_outcome["message"] = "Fix completed"
                    fix_outcome["output_path"] = str(output_path)
                    success_count += 1
                else:
                    logger.error(f"... ffmpeg failed code {result.returncode} for {relative_path}. Error:\n{result.stderr[-1000:]}")
                    fix_outcome["status"] = "failed"
                    fix_outcome["message"] = f"ffmpeg error (code {result.returncode})"
                    fail_count += 1
                    if output_path.exists():
                        try:
                            output_path.unlink()
                            logger.info(f"... Deleted incomplete output file.")
                        except Exception as del_e:
                            logger.warning(f"... Failed to delete incomplete output file: {del_e}")
            except subprocess.TimeoutExpired:
                logger.error(f"Task {task_id}: ffmpeg timed out for {relative_path}")
                fix_outcome["status"] = "failed"
                fix_outcome["message"] = "ffmpeg timeout"
                fail_count += 1
                if output_path.exists():
                    try:
                        output_path.unlink()
                        logger.info(f"... Deleted incomplete output file after timeout.")
                    except Exception as del_e:
                        logger.warning(f"... Failed to delete incomplete output file after timeout: {del_e}")
            except Exception as exec_e:
                logger.error(f"Task {task_id}: Error running ffmpeg for {relative_path}: {exec_e}", exc_info=True)
                fix_outcome["status"] = "failed"
                fix_outcome["message"] = f"Execution error: {exec_e}"
                fail_count += 1
                if output_path.exists():
                    try:
                        output_path.unlink()
                        logger.info(f"... Deleted potentially incomplete output file after execution error.")
                    except Exception as del_e:
                        logger.warning(f"... Failed to delete potentially incomplete output file after execution error: {del_e}")

            fix_results_list.append(fix_outcome)

        final_msg = f"Finished. Success: {success_count}, Failed: {fail_count}, Skipped: {skipped_count}"
        tasks[task_id]["status"] = "completed"
        tasks[task_id]["current_file"] = final_msg
        tasks[task_id]["progress"] = 100
        logger.info(f"Task {task_id}: Fix completed. {final_msg}")
    except StopIteration as stop_reason:
        reason_str = str(stop_reason) if str(stop_reason) else "Unknown"
        logger.info(f"Task {task_id}: Fix stopped cleanly. Reason: {reason_str}")
        if tasks.get(task_id):
            tasks[task_id]["status"] = "cancelled"
            fix_cancelled = True
            tasks[task_id]["current_file"] = "Fix cancelled."
            tasks[task_id]["progress"] = 100
    except Exception as e:
        logger.error(f"Task {task_id}: Fix failed unexpectedly. Error: {e}", exc_info=True)
        if tasks.get(task_id):
            tasks[task_id]["status"] = "failed"
            tasks[task_id]["error"] = f"Unexpected error: {str(e)}"
            tasks[task_id]["current_file"] = "Unexpected Error"
    if tasks.get(task_id) and tasks[task_id].get("status") == "running":
        if not fix_cancelled:
            tasks[task_id]["status"] = "completed"
            logger.warning(f"Task {task_id}: Fix task ended but status 'running'. Setting 'completed'.")
