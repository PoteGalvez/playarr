document.addEventListener('DOMContentLoaded', () => {

    // Initialize button and input elements
    window.scanButton = document.getElementById('scan-button');
    window.stopButton = document.getElementById('stop-button');
    window.manageProfilesButton = document.getElementById('manage-profiles-button');
    window.themeToggleButton = document.getElementById('theme-toggle-button');
    window.profileSelect = document.getElementById('profile-select');
    window.directoryInput = document.getElementById('directory-input');
    window.statusMessage = document.getElementById('status-message');
    window.progressBarContainer = document.getElementById('progress-bar-container');
    window.progressBarInner = document.getElementById('progress-bar-inner');
    window.progressText = document.getElementById('progress-text');
    window.resultsTableBody = document.querySelector('#results-table tbody');
    window.resultsSummary = document.getElementById('results-summary');
    window.filterRadios = document.querySelectorAll('input[name="result-filter"]');

    // Setup event listeners that call functions defined in other modules
    if (window.scanButton) {
        window.scanButton.addEventListener('click', startScan);
    }

    if (window.stopButton) {
        window.stopButton.addEventListener('click', stopTask);
    }

    if (window.themeToggleButton) {
        window.themeToggleButton.addEventListener('click', toggleTheme);
    }

    if (window.filterRadios && window.filterRadios.length > 0) {
        window.filterRadios.forEach(radio => radio.addEventListener('change', applyFilterAndRenderTable));
    }

    if (window.manageProfilesButton) {
        window.manageProfilesButton.addEventListener('click', openProfileManager);
    }

    if (window.modalCloseButton) {
        window.modalCloseButton.addEventListener('click', closeProfileManager);
    }

    if (window.addNewProfileButton) {
        window.addNewProfileButton.addEventListener('click', startAddProfile);
    }

    if (window.saveProfileButton) {
        window.saveProfileButton.addEventListener('click', saveProfile);
    }

    if (window.cancelEditButton) {
        window.cancelEditButton.addEventListener('click', cancelEdit);
    }

    if (window.profileListManagerDiv) {
        window.profileListManagerDiv.addEventListener('click', handleProfileListActions);
    }

    if (window.profileManagerModal) {
        window.profileManagerModal.addEventListener('click', (event) => {
            if (event.target === window.profileManagerModal) closeProfileManager();
        });
    }

    // Apply saved theme on load
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);

});
function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
        if (window.themeToggleButton) window.themeToggleButton.textContent = '☀️';
    } else {
        document.body.classList.remove('dark-mode');
        if (window.themeToggleButton) window.themeToggleButton.textContent = '🌙';
    }
}
function toggleTheme() {
    const currentTheme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
}
function setUIState(isScanning, isEditing = false) {
    const disableScanAndProfile = isScanning || isEditing;
    const disableManage = isScanning || isEditing;
    const disableFilters = isScanning;
    const enableStop = isScanning;

    if (window.scanButton) window.scanButton.disabled = disableScanAndProfile;
    if (window.profileSelect) window.profileSelect.disabled = disableScanAndProfile;
    if (window.manageProfilesButton) window.manageProfilesButton.disabled = disableManage;

    if (window.stopButton) {
        window.stopButton.disabled = !enableStop;
        window.stopButton.style.display = enableStop ? 'inline-block' : 'none';
    }
    if (window.progressBarContainer) window.progressBarContainer.style.display = enableStop ? 'flex' : 'none';
    if (!isScanning) {
        if (window.progressBarInner) window.progressBarInner.style.width = '0%';
        if (window.progressText) window.progressText.textContent = '0%';
    }

    if (window.filterRadios) window.filterRadios.forEach(radio => radio.disabled = disableFilters);
}
