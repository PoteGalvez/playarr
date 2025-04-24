# utils.py
import pathlib
import subprocess
import json
from rich.console import Console

console = Console(stderr=True, force_terminal=True, color_system="auto")

SUPPORTED_EXTENSIONS = {".mkv", ".mp4", ".avi", ".mov", ".ts", ".m2ts", ".wmv", ".flv"}

# --- ffprobe Execution ---
def run_ffprobe(file_path: pathlib.Path) -> dict | None:
    """Runs ffprobe on a file and returns parsed JSON data or None on error."""
    abs_file_path = str(file_path.resolve())
    ffprobe_cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", abs_file_path]
    # console.print(f"Running ffprobe for: {abs_file_path}", style="dim") # Uncomment for verbose debugging
    try:
        result = subprocess.run(ffprobe_cmd, capture_output=True, text=True, check=False, encoding='utf-8', errors='ignore', timeout=60) # 60s timeout
        if result.returncode != 0:
            console.print(f"[red]ffprobe failed for '{file_path.name}'. Code: {result.returncode}. Stderr:[/red]\n{result.stderr[:500]}...", style="dim")
            return None
        if not result.stdout.strip():
            console.print(f"[yellow]Warn: ffprobe produced empty output for '{file_path.name}'[/yellow]", style="dim")
            return None
        return json.loads(result.stdout)
    except FileNotFoundError:
        console.print("[bold red]CRITICAL ERROR: 'ffprobe' command not found in container PATH![/bold red]")
        raise RuntimeError("ffprobe not found in container path")
    except subprocess.TimeoutExpired:
         console.print(f"[red]Error: ffprobe timed out for '{file_path.name}'[/red]")
         return None
    except json.JSONDecodeError:
        console.print(f"[red]Error parsing ffprobe JSON output for '{file_path.name}'[/red]")
        return None
    except Exception as e:
        console.print(f"[red]An unexpected error occurred running ffprobe for '{file_path.name}': {e}[/red]")
        return None

# --- Compatibility Check Logic (With improved reason strings) ---
def check_compatibility(media_info: dict, profile: dict) -> tuple[bool, str]:
    """
    Checks media info against profile rules.
    Returns: (can_direct_play, reason_string)
    """
    reasons = []
    can_direct_play = True # Assume true unless a rule fails
    if not isinstance(media_info, dict) or not isinstance(profile, dict): return False, "Internal error: Invalid data"

    # 1. Check Container
    container = media_info.get('format', {}).get('format_name', '').lower().split(',')[0]
    supported_containers = profile.get("supported_containers", [])
    if container and supported_containers and container not in supported_containers:
        can_direct_play = False
        reasons.append(f"Container '{container}' unsupported")

    # 2. Check Streams
    if 'streams' in media_info and isinstance(media_info['streams'], list):
        first_video_checked = False; audio_codecs_present = []; compatible_audio_found = False
        for stream in media_info['streams']:
            if not isinstance(stream, dict): continue
            codec_type = stream.get('codec_type'); codec_name = stream.get('codec_name', 'unknown')
            if codec_type == 'video' and not first_video_checked:
                first_video_checked = True; level = stream.get('level'); supported_video = profile.get("supported_video_codecs", []); max_level = profile.get("max_h264_level")
                if supported_video and codec_name not in supported_video: can_direct_play = False; reasons.append(f"Video codec '{codec_name}' unsupported")
                if codec_name == 'h264' and max_level is not None and isinstance(level, int) and level > max_level: level_str = f"{level / 10.0:.1f}"; max_level_str = f"{max_level / 10.0:.1f}"; can_direct_play = False; reasons.append(f"H.264 Level L{level_str} exceeds profile max L{max_level_str}")
            elif codec_type == 'audio':
                audio_codecs_present.append(codec_name); supported_audio = profile.get("supported_audio_codecs", [])
                if supported_audio and codec_name in supported_audio: compatible_audio_found = True
            elif codec_type == 'subtitle':
                unsupported_subs = profile.get("unsupported_subtitle_formats", [])
                # --- Corrected Syntax/Indentation ---
                if unsupported_subs and codec_name in unsupported_subs:
                    reason_text = f"Subtitle format '{codec_name}' requires transcode"
                    if reason_text not in reasons:
                        can_direct_play = False
                        reasons.append(reason_text)
                # --- End Correction ---
        # After checking all streams...
        if audio_codecs_present and not compatible_audio_found:
             supported_audio = profile.get("supported_audio_codecs", [])
             if supported_audio:
                incompatible_found = [c for c in audio_codecs_present if c not in supported_audio]
                audio_reason_exists = any(r.startswith("Audio codec") for r in reasons)
                if not audio_reason_exists and incompatible_found: can_direct_play = False; first_incompatible = incompatible_found[0]; reasons.append(f"Audio codec '{first_incompatible}' unsupported")
    reason_str = ", ".join(reasons) if reasons else ""
    if can_direct_play and not reason_str: reason_str = "Direct Play OK"
    return can_direct_play, reason_str

# --- Profile Loading ---
def load_profiles(profiles_dir: pathlib.Path) -> dict:
    """Loads profile JSON files from the specified directory."""
    profiles = {}
    if not profiles_dir.is_dir(): console.print(f"[yellow]Warning: Profiles directory not found: {profiles_dir}[/yellow]"); return profiles
    profile_files_found = list(profiles_dir.glob("*.json"))
    if not profile_files_found: console.print(f"[yellow]Warning: No JSON profiles found in {profiles_dir}[/yellow]")
    for profile_file in profile_files_found:
        profile_name = profile_file.stem
        try:
            with open(profile_file, 'r', encoding='utf-8') as f: profile_data = json.load(f)
            if isinstance(profile_data, dict): profiles[profile_name] = profile_data
            else: console.print(f"[red]Warn: Content of '{profile_file.name}' is not a valid JSON object. Skipping.[/red]")
        except json.JSONDecodeError as e: console.print(f"[red]Warn: Could not parse JSON in '{profile_file.name}': {e}. Skipping.[/red]")
        except PermissionError: console.print(f"[red]Warn: Permission denied reading profile '{profile_file.name}'. Skipping.[/red]")
        except Exception as e: console.print(f"[red]Warn: Unexpected error loading profile '{profile_file.name}': {e}. Skipping.[/red]")
    if profile_files_found and not profiles: console.print(f"[red]Warning: Found JSON files, but none loaded successfully.[/red]")
    return profiles