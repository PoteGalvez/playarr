const profileManagerModal = document.getElementById('profile-manager-modal');
const profileListManagerDiv = document.getElementById('profile-list-manager');
const addNewProfileButton = document.getElementById('add-new-profile-button');
const modalCloseButton = document.getElementById('modal-close-button');
const profileEditorContainer = document.getElementById('profile-editor-container');
const profileEditorTextarea = document.getElementById('profile-editor');
const editorHeading = document.getElementById('editor-heading');
const editingProfileNameSpan = document.getElementById('editing-profile-name');
const newProfileNameContainer = document.getElementById('new-profile-name-container');
const newProfileNameInput = document.getElementById('new-profile-name');
const saveProfileButton = document.getElementById('save-profile-button');
const cancelEditButton = document.getElementById('cancel-edit-button');
const editorStatusDiv = document.getElementById('editor-status');

let profileBeingEdited = null;
let currentProfileList = [];

async function openProfileManager() {
    if (!profileManagerModal) return;
    cancelEdit();
    await populateProfileManagerList();
    profileManagerModal.style.display = 'block';
    setUIState(false, false, true);
}
function closeProfileManager() {
    if (profileManagerModal) profileManagerModal.style.display = 'none';
    cancelEdit();
    setUIState(false, false, false);
}
async function populateProfileManagerList() {
    if (!profileListManagerDiv) return;
    profileListManagerDiv.innerHTML = '<p>Loading...</p>';
    try {
        const r = await fetch('/api/profiles');
        if (!r.ok) {
            const err = await r.json();
            throw new Error(err.error || `HTTP Error ${r.status}`);
        }
        const n = await r.json();
        currentProfileList = n;
        let h = '<ul>';
        if (n.length === 0) {
            h = '<p>No profiles found.</p>';
        } else {
            n.forEach(name => {
                h += `<li><span>${name}</span><span class="profile-actions"><button class="clone-button" data-profile-name="${name}" title="Clone">Clone</button><button class="edit-profile-list-btn" data-profile-name="${name}" title="Edit">Edit</button><button class="delete-profile-list-btn danger-button" data-profile-name="${name}" title="Delete">Delete</button></span></li>`;
            });
            h += '</ul>';
        }
        profileListManagerDiv.innerHTML = h;
    } catch (e) {
        profileListManagerDiv.innerHTML = `<p class="error">Error loading profiles: ${e.message}</p>`;
    }
}
function handleProfileListActions(event) {
    const target = event.target;
    const profileName = target.getAttribute('data-profile-name');
    if (!profileName) return;
    if (target.classList.contains('edit-profile-list-btn')) {
        startEditProfile(profileName);
    } else if (target.classList.contains('delete-profile-list-btn')) {
        deleteProfile(profileName);
    } else if (target.classList.contains('clone-profile-list-btn')) {
        cloneProfile(profileName);
    }
}
function startAddProfile() {
    profileBeingEdited = null;
    if (editingProfileNameSpan) editingProfileNameSpan.textContent = "";
    if (editorHeading) editorHeading.textContent = "Add New Profile";
    if (profileEditorTextarea) profileEditorTextarea.value = `{
  "description": "New Custom Profile",
  "notes": "Add rules here",
  "supported_containers": ["mkv", "mp4"],
  "supported_video_codecs": ["h264", "hevc"],
  "supported_audio_codecs": ["aac", "ac3"],
  "max_h264_level": null,
  "unsupported_subtitle_formats": ["hdmv_pgs_subtitle", "dvd_subtitle"]
}`;
    if (editorStatusDiv) editorStatusDiv.textContent = "Enter name and valid JSON content.";
    if (editorStatusDiv) editorStatusDiv.className = 'editor-status';
    if (newProfileNameContainer) newProfileNameContainer.style.display = 'flex';
    if (newProfileNameInput) newProfileNameInput.value = "";
    if (saveProfileButton) saveProfileButton.disabled = false;
    if (cancelEditButton) cancelEditButton.disabled = false;
    if (profileEditorContainer) profileEditorContainer.style.display = 'block';
}
async function startEditProfile(profileName) {
    if (!profileName) return;
    if (editorStatusDiv) editorStatusDiv.textContent = "Loading profile content...";
    if (editorStatusDiv) editorStatusDiv.className = 'editor-status';
    if (profileEditorTextarea) profileEditorTextarea.value = "";
    if (newProfileNameContainer) newProfileNameContainer.style.display = 'none';
    if (editorHeading) editorHeading.textContent = "Edit Profile: ";
    if (editingProfileNameSpan) editingProfileNameSpan.textContent = profileName;
    try {
        const response = await fetch(`/api/profiles/${profileName}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP error ${response.status}`);
        profileBeingEdited = profileName;
        try {
            profileEditorTextarea.value = JSON.stringify(JSON.parse(data.content), null, 2);
        } catch (e) {
            profileEditorTextarea.value = data.content;
        }
        if (profileEditorContainer) profileEditorContainer.style.display = 'block';
        if (editorStatusDiv) editorStatusDiv.textContent = "Profile loaded for editing.";
        if (saveProfileButton) saveProfileButton.disabled = false;
        if (cancelEditButton) cancelEditButton.disabled = false;
    } catch (e) {
        if (editorStatusDiv) editorStatusDiv.textContent = `Error loading profile: ${e.message}`;
        if (editorStatusDiv) editorStatusDiv.className = 'editor-status error';
        profileBeingEdited = null;
        if (profileEditorContainer) profileEditorContainer.style.display = 'none';
    }
}
async function saveProfile() {
    const isAdding = profileBeingEdited === null;
    let profileName = isAdding ? newProfileNameInput.value : profileBeingEdited;
    const content = profileEditorTextarea.value;
    if (!profileName && isAdding) {
        editorStatusDiv.textContent = `Error: Profile name is required.`;
        editorStatusDiv.className = 'editor-status error';
        return;
    }
    const safeName = profileName.trim().replace(/[^a-zA-Z0-9\-_\.]/g, '_').replace(/\.+/g, '.');
    if (!safeName || safeName.startsWith('.') || safeName.endsWith('.')) {
        editorStatusDiv.textContent = `Error: Invalid characters in profile name. Use A-Z, 0-9, -, _, .`;
        editorStatusDiv.className = 'editor-status error';
        return;
    }
    try {
        JSON.parse(content);
    } catch (e) {
        editorStatusDiv.textContent = `Error: Invalid JSON format. ${e.message}`;
        editorStatusDiv.className = 'editor-status error';
        return;
    }
    editorStatusDiv.textContent = `Saving '${safeName}'...`;
    editorStatusDiv.className = 'editor-status';
    saveProfileButton.disabled = true;
    cancelEditButton.disabled = true;
    const url = isAdding ? '/api/profiles' : `/api/profiles/${profileBeingEdited}`;
    const method = isAdding ? 'POST' : 'PUT';
    const body = isAdding ? { name: safeName, content: content } : { content: content };
    try {
        const response = await fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const resultData = await response.json();
        if (!response.ok) throw new Error(resultData.error || `HTTP error ${response.status}`);
        editorStatusDiv.textContent = resultData.message || "Profile saved successfully!";
        editorStatusDiv.className = 'editor-status success';
        setTimeout(async () => {
            cancelEdit();
            await updateProfileDropdown();
            await populateProfileManagerList();
        }, 1000);
    } catch (e) {
        if (editorStatusDiv) editorStatusDiv.textContent = `Error saving profile: ${e.message}`;
        editorStatusDiv.className = 'editor-status error';
        saveProfileButton.disabled = false;
        cancelEditButton.disabled = false;
    }
}
function cancelEdit() {
    if (profileEditorContainer) profileEditorContainer.style.display = 'none';
    if (profileEditorTextarea) profileEditorTextarea.value = "";
    if (editorStatusDiv) editorStatusDiv.textContent = "";
    if (editorStatusDiv) editorStatusDiv.className = 'editor-status';
    profileBeingEdited = null;
    if (saveProfileButton) saveProfileButton.disabled = false;
    if (cancelEditButton) cancelEditButton.disabled = false;
}
async function deleteProfile(profileName) {
    if (!profileName || !confirm(`Are you sure you want to DELETE the profile "${profileName}"?\nThis action cannot be undone.`)) return;
    try {
        const response = await fetch(`/api/profiles/${profileName}`, { method: 'DELETE' });
        const resultData = await response.json();
        if (!response.ok) throw new Error(resultData.error || `HTTP error ${response.status}`);
        alert(resultData.message || 'Profile deleted successfully.');
        await populateProfileManagerList();
        await updateProfileDropdown();
    } catch (e) {
        alert(`Error deleting profile: ${e.message}`);
    }
}
