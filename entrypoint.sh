#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

# --- Determine User/Group IDs ---
USER_ID=${PUID:-911}
GROUP_ID=${PGID:-911}

echo "Starting entrypoint script..."
echo "Using UID: ${USER_ID}, GID: ${GROUP_ID}"

# --- Configuration Directory Setup ---
CONFIG_DIR="/config"
PROFILES_DIR="${CONFIG_DIR}/profiles"
DEFAULT_PROFILES_SRC="/app/default_profiles" # Temp location inside image

# Create config/profiles directories if they don't exist within the volume
mkdir -p "${PROFILES_DIR}"
echo "Setting ownership for ${CONFIG_DIR} and ${PROFILES_DIR}..."
chown "${USER_ID}:${GROUP_ID}" "${CONFIG_DIR}" || echo "Warning: Could not chown ${CONFIG_DIR}"
chown "${USER_ID}:${GROUP_ID}" "${PROFILES_DIR}" || echo "Warning: Could not chown ${PROFILES_DIR}"

# --- Copy Default Profiles (if target is empty) ---
if [ -z "$(ls -A "${PROFILES_DIR}" 2>/dev/null)" ] || [ ! "$(find "${PROFILES_DIR}" -maxdepth 1 -name '*.json' -print -quit)" ]; then
    echo "Profiles directory '${PROFILES_DIR}' empty or contains no .json files. Copying defaults..."
    cp -n "${DEFAULT_PROFILES_SRC}/"*.json "${PROFILES_DIR}/"
    echo "Default profiles copied."
    echo "Setting ownership for copied profiles..."
    chown "${USER_ID}:${GROUP_ID}" "${PROFILES_DIR}"/*.json || echo "Warning: Could not chown copied profiles."
else
    echo "Profiles directory '${PROFILES_DIR}' already contains files. Skipping default copy."
fi

# --- Execute the main command (CMD) as the specified user/group ---
echo "Starting application as user ${USER_ID}:${GROUP_ID}..."
exec setpriv --reuid "${USER_ID}" --regid "${GROUP_ID}" --clear-groups --reset-env -- "$@"

echo "Entrypoint finished." # Should not be reached due to exec