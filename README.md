# playarr
 Web-based media analyzer and fixer for Plex Direct Play compatibility


🚧 Project Status
This project is currently in active development.
Features, structure, and documentation may change frequently. Use with caution until a stable release is published.


# Media Compatibility Scanner

This Flask app scans a media directory for Plex Direct Play compatibility based on custom profiles. It also offers an optional fix process using ffmpeg for unsupported audio codecs.

## Features
- Adaptive scan (recursive or flat)
- Profile-based compatibility checking
- Optional audio track fixing
- Web dashboard UI
- REST API access

## Requirements
- Python 3.9+
- Flask
- ffmpeg (in the environment)
