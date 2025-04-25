document.addEventListener('DOMContentLoaded', () => {

    // Initialize button and input elements
    const scanButton = document.getElementById('scan-button');
    const stopButton = document.getElementById('stop-button');
    const manageProfilesButton = document.getElementById('manage-profiles-button');
    const themeToggleButton = document.getElementById('theme-toggle-button');
    const profileSelect = document.getElementById('profile-select');
    const directoryInput = document.getElementById('directory-input');
    const statusMessage = document.getElementById('status-message');
    const progressBarContainer = document.getElementById('progress-bar-container');
    const progressBarInner = document.getElementById('progress-bar-inner');
    const progressText = document.getElementById('progress-text');
    const resultsTableBody = document.querySelector('#results-table tbody');
    const resultsSummary = document.getElementById('results-summary');
    const filterRadios = document.querySelectorAll('input[name="result-filter"]');

function showHelpModal() {
    alert("Help modal content goes here.");
}

function showAboutModal() {
    alert("About modal content goes here.");
}

    // --- Existing event listeners ---

    // Add export to CSV functionality
    function exportTableToCSV(filename) {
        const csv = [];
        const rows = document.querySelectorAll("#results-table tr");
        for (const row of rows) {
            const cols = row.querySelectorAll("th, td");
            const rowData = [];
            for (const col of cols) {
                let data = col.innerText.replace(/"/g, '""');
                if (data.search(/("|,|\n)/g) >= 0) {
                    data = `"${data}"`;
                }
                rowData.push(data);
            }
            csv.push(rowData.join(","));
        }
        const csvFile = new Blob([csv.join("\n")], { type: "text/csv" });
        const downloadLink = document.createElement("a");
        downloadLink.download = filename;
        downloadLink.href = window.URL.createObjectURL(csvFile);
        downloadLink.style.display = "none";
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    }

    const exportCsvButton = document.getElementById("export-csv-button");
    if (exportCsvButton) {
        exportCsvButton.addEventListener("click", () => {
            exportTableToCSV("playarr_results.csv");
        });
    }

    const resultsSearchInput = document.getElementById("results-search");
    if (resultsSearchInput) {
        resultsSearchInput.addEventListener("input", (event) => {
            const filter = event.target.value.toLowerCase();
            const rows = document.querySelectorAll("#results-table tbody tr");
            rows.forEach(row => {
                const text = row.innerText.toLowerCase();
                if (text.includes(filter)) {
                    row.style.display = "";
                } else {
                    row.style.display = "none";
                }
            });
        });
    }

    function updateFilterButtonCounts() {
        if (!Array.isArray(fullResultsData)) {
            if (filterAllLabel) filterAllLabel.textContent = "All (0)";
            if (filterNeedsAttentionLabel) filterNeedsAttentionLabel.textContent = "Needs Attention (0)";
            return;
        }

        const totalCount = fullResultsData.length;
        let needsAttentionCount = 0;

        needsAttentionCount = fullResultsData.filter(item => !item.is_compatible && !item.error && item.relative_path !== undefined).length;

        if (filterAllLabel) {
            filterAllLabel.textContent = `All (${totalCount})`;
        }

        if (filterNeedsAttentionLabel) {
            const attentionText = (currentTaskType === 'fix') ? "Failed" : "Needs Attention";
            filterNeedsAttentionLabel.textContent = `${attentionText} (${needsAttentionCount})`;
        }
    }

    const filterAllLabel = document.querySelector('input[name="result-filter"][value="all"] + span.filter-label-text');
    const filterNeedsAttentionLabel = document.querySelector('input[name="result-filter"][value="attention"] + span.filter-label-text');

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

    let currentTaskId = null;
    let currentTaskType = null;
    let pollInterval = null;
    let fullResultsData = [];
    let profileBeingEdited = null;
    let currentProfileList = [];

    if (scanButton) {
        scanButton.addEventListener('click', startScan);
    }

    if (stopButton) {
        stopButton.addEventListener('click', stopTask);
    }

    if (themeToggleButton) {
        themeToggleButton.addEventListener('click', toggleTheme);
    }

    if (filterRadios && filterRadios.length > 0) {
        filterRadios.forEach(radio => radio.addEventListener('change', applyFilterAndRenderTable));
    }

    if (manageProfilesButton) {
        manageProfilesButton.addEventListener('click', openProfileManager);
    }

    if (modalCloseButton) {
        modalCloseButton.addEventListener('click', closeProfileManager);
    }

    if (addNewProfileButton) {
        addNewProfileButton.addEventListener('click', startAddProfile);
    }

    if (saveProfileButton) {
        saveProfileButton.addEventListener('click', saveProfile);
    }

    if (cancelEditButton) {
        cancelEditButton.addEventListener('click', cancelEdit);
    }

    if (profileListManagerDiv) {
        profileListManagerDiv.addEventListener('click', handleProfileListActions);
    }

    if (profileManagerModal) {
        profileManagerModal.addEventListener('click', (event) => {
            if (event.target === profileManagerModal) closeProfileManager();
        });
    }

    function applyTheme(theme) {
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
            if (themeToggleButton) themeToggleButton.textContent = '☀️';
        } else {
            document.body.classList.remove('dark-mode');
            if (themeToggleButton) themeToggleButton.textContent = '🌙';
        }
    }
    function toggleTheme() {
        const currentTheme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
    }
    const savedTheme = localStorage.getItem('theme') || 'light';

    function setUIState(isScanning, isEditing = false) {
        const disableScanAndProfile = isScanning || isEditing;
        const disableManage = isScanning || isEditing;
        const disableFilters = isScanning;
        const enableStop = isScanning;

        if (scanButton) scanButton.disabled = disableScanAndProfile;
        if (profileSelect) profileSelect.disabled = disableScanAndProfile;
        if (manageProfilesButton) manageProfilesButton.disabled = disableManage;

        if (stopButton) {
            stopButton.disabled = !enableStop;
            stopButton.style.display = enableStop ? 'inline-block' : 'none';
        }
        if (progressBarContainer) progressBarContainer.style.display = enableStop ? 'flex' : 'none';
        if (!isScanning) {
            if (progressBarInner) progressBarInner.style.width = '0%';
            if (progressText) progressText.textContent = '0%';
        }

        if (filterRadios) filterRadios.forEach(radio => radio.disabled = disableFilters);
    }

    async function startScan() {
        if (!profileSelect || !profileSelect.value) { statusMessage.textContent = "Error: No profile selected."; return; }
        clearPreviousResults();
        cancelEdit();
        setUIState(true, false);
        statusMessage.textContent = 'Requesting scan...';
        currentTaskType = 'scan';
        const data = { directory: directoryInput.value, profile_name: profileSelect.value };
        try {
            const response = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            const resultData = await response.json();
            if (!response.ok) throw new Error(resultData.error || `HTTP error ${response.status}`);
            currentTaskId = resultData.task_id;
            sessionStorage.setItem('activeTaskId', currentTaskId);
            sessionStorage.setItem('activeTaskType', currentTaskType);
            statusMessage.textContent = `Scan queued. Polling...`;
            if (progressBarContainer) progressBarContainer.style.display = 'flex';
            if (progressBarInner) progressBarInner.style.width = '0%';
            if (progressText) progressText.textContent = '0%';
            startPolling();
        } catch (e) {
            statusMessage.textContent = `Error starting scan: ${e.message}`;
            setUIState(false);
            currentTaskType = null;
        }
    }

    async function stopTask() {
        if (!currentTaskId) { statusMessage.textContent = "No active task to stop."; return; }
        const taskType = currentTaskType || 'task';
        statusMessage.textContent = `Requesting stop for ${taskType}...`;
        if (stopButton) stopButton.disabled = true;
        try {
            const response = await fetch(`/api/stop_task/${currentTaskId}`, { method: 'POST' });
            const resultData = await response.json();
            if (!response.ok) throw new Error(resultData.error || `HTTP error ${response.status}`);
            statusMessage.textContent = `Cancellation requested. Waiting for task to stop...`;
        } catch(e) {
            statusMessage.textContent = `Error stopping task: ${e.message}`;
        }
    }

    function startPolling() {
        stopPolling();
        pollInterval = setInterval(async () => {
            if (!currentTaskId) {
                stopPolling();
                return;
            }
            try {
                const response = await fetch(`/api/status/${currentTaskId}`);
                if (!response.ok) {
                    let eMsg = `Poll error ${response.status}`;
                    try { const d = await response.json(); eMsg = d.error || eMsg; } catch (e) {}
                    if (response.status === 404) eMsg += ` Task ${currentTaskId} not found (maybe expired?).`;
                    throw new Error(eMsg);
                }
                const task = await response.json();

                let resultsChanged = false;
                const newResults = task.result;

                if (newResults !== null && newResults !== undefined) {
                    const newResultsArray = Array.isArray(newResults) ? newResults : (newResults.message ? [newResults] : []);
                    if (JSON.stringify(fullResultsData) !== JSON.stringify(newResultsArray)) {
                        fullResultsData = newResultsArray;
                        resultsChanged = true;
                    }
                }

                updateStatus(task);

                if (resultsChanged) {
                    applyFilterAndRenderTable();
                    updateSummary(fullResultsData, currentTaskType === 'fix');
                    updateFilterButtonCounts();
                }

                if (['completed', 'failed', 'cancelled'].includes(task.status)) {
                    const finalTaskType = currentTaskType;
                    const finalTaskId = currentTaskId;
                    stopPolling();

                    if (resultsChanged) {
                      applyFilterAndRenderTable();
                    }
                    updateSummary(fullResultsData, finalTaskType === 'fix');
                    updateFilterButtonCounts();

                    let finalMsg = "";
                    if (task.status === 'cancelled') {
                        finalMsg = `${finalTaskType || 'Task'} cancelled.`;
                        if (Array.isArray(fullResultsData) && fullResultsData.length > 0 && !fullResultsData[0]?.message) {
                            finalMsg += " Displaying partial results.";
                        }
                    } else if (task.status === 'failed') {
                        finalMsg = `${finalTaskType || 'Task'} failed: ${task.error || 'Unknown reason'}`;
                    } else if (task.status === 'completed') {
                        if (finalTaskType === 'fix') {
                            finalMsg = "Fix task completed.";
                        } else {
                            const scanMsg = (Array.isArray(fullResultsData) && fullResultsData.length > 0 && fullResultsData[0]?.message && !fullResultsData[0]?.status)
                                ? fullResultsData[0].message
                                : (Array.isArray(fullResultsData) ? `Processed ${fullResultsData.length} files.` : "Processing completed.");
                            finalMsg = `Scan completed. ${scanMsg}`;
                        }
                    }
                    if (statusMessage) statusMessage.textContent = finalMsg;

                    currentTaskId = null;
                    currentTaskType = null;
                    sessionStorage.removeItem('activeTaskId');
                    sessionStorage.removeItem('activeTaskType');
                    setUIState(false);
                }
            } catch (error) {
                if(statusMessage) statusMessage.textContent = `Polling error: ${error.message}. Stopping polling.`;
                setUIState(false);
                stopPolling();
                currentTaskId = null;
                currentTaskType = null;
                sessionStorage.removeItem('activeTaskId');
                sessionStorage.removeItem('activeTaskType');
                updateFilterButtonCounts();
            }
        }, 2000);
    }
    function stopPolling() { if (pollInterval) { clearInterval(pollInterval); pollInterval = null; } }

    let scanStartTime = null;
    let elapsedTimerInterval = null;

    function updateStatus(task) {
         if (!pollInterval && ['completed', 'failed', 'cancelled'].includes(task.status)) {
             return;
         }

         let statusText = `Status: ${task.status}`; let showProgressBar = false;
         const taskTypeDisplay = currentTaskType === 'fix' ? 'Fixing' : 'Scanning';

         if (task.status === 'running' && task.total_files != null && task.total_files >= 0) {
             const p = task.progress || 0;
             const d = task.processed_count || 0;
             const t = task.total_files;
             statusText = `${taskTypeDisplay}...`;
             showProgressBar = true;
             if (progressBarInner) progressBarInner.style.width = `${p}%`;
             if (progressText) progressText.textContent = `${p}% (${d}/${t})`;

             if (!document.querySelector('.spinner')) {
                 const spinner = document.createElement('span');
                 spinner.className = 'spinner';
                 statusMessage.appendChild(spinner);
             }

             if (!scanStartTime) {
                 scanStartTime = Date.now();
                 elapsedTimerInterval = setInterval(() => {
                     const elapsedMs = Date.now() - scanStartTime;
                     const seconds = Math.floor((elapsedMs / 1000) % 60);
                     const minutes = Math.floor((elapsedMs / (1000 * 60)) % 60);
                     const hours = Math.floor(elapsedMs / (1000 * 60 * 60));
                     let elapsedStr = '';
                     if (hours > 0) elapsedStr += `${hours}h `;
                     if (minutes > 0 || hours > 0) elapsedStr += `${minutes}m `;
                     elapsedStr += `${seconds}s elapsed`;
                     let elapsedElem = document.getElementById('elapsed-time');
                     if (!elapsedElem) {
                         elapsedElem = document.createElement('span');
                         elapsedElem.id = 'elapsed-time';
                         elapsedElem.style.marginLeft = '10px';
                         elapsedElem.style.fontWeight = 'bold';
                         statusMessage.appendChild(elapsedElem);
                     }
                     elapsedElem.textContent = elapsedStr;
                 }, 1000);
             }

             if (task.current_file) {
                 const maxLen = 80;
                 let currentFileDisplay = task.current_file;
                 if (currentFileDisplay.length > maxLen) {
                    currentFileDisplay = '...' + currentFileDisplay.slice(-(maxLen-3));
                 }
                 statusText += `\n${currentFileDisplay}`;
             } else if (d === 0) {
                  statusText += `\nInitializing file list...`;
             }
         } else {
             const spinner = document.querySelector('.spinner');
             if (spinner) spinner.remove();
             const elapsedElem = document.getElementById('elapsed-time');
             if (elapsedElem) elapsedElem.remove();
             if (elapsedTimerInterval) {
                 clearInterval(elapsedTimerInterval);
                 elapsedTimerInterval = null;
             }
             scanStartTime = null;

             if (task.status === 'cancelling') {
                 statusText = `Status: cancelling ${taskTypeDisplay}...`;
                 showProgressBar = true;
                 const p = task.progress || 0; const d = task.processed_count || 0; const t = task.total_files || 0;
                 if (progressBarInner) progressBarInner.style.width = `${p}%`;
                 if (progressText) progressText.textContent = `Stopping... (${p}%)`;
             } else if (task.status === 'queued') {
                 statusText = `Status: ${taskTypeDisplay} queued...`;
             }
         }

         if (statusMessage) statusMessage.textContent = statusText;
         if (progressBarContainer) progressBarContainer.style.display = showProgressBar ? 'flex' : 'none';
    }

    function getSelectedFilter() { const r=document.querySelector('input[name="result-filter"]:checked'); return r?r.value:'all'; }
    function applyFilterAndRenderTable() {
        const filterValue = getSelectedFilter(); let filteredData = [];
        const dataToFilter = (Array.isArray(fullResultsData)) ? fullResultsData : [];

        if (dataToFilter.length === 1 && dataToFilter[0]?.message && dataToFilter[0]?.relative_path === undefined && dataToFilter[0]?.status === undefined) {
            filteredData = dataToFilter;
            if (statusMessage) statusMessage.textContent = "No files scanned yet — choose a directory and profile to begin.";
        }
        else if (currentTaskType === 'fix') {
             filteredData = dataToFilter.filter(item => item.status !== undefined);
        }
        else if (filterValue === 'attention') {
            filteredData = dataToFilter.filter(i => !i.is_compatible && !i.error && !i.message && i.relative_path !== undefined);
        }
        else {
            filteredData = dataToFilter.filter(i => i.relative_path !== undefined && !i.message);
        }
        renderTable(filteredData);
    }

    function renderTable(resultsToDisplay) {
        if (!resultsTableBody) { return; }
        resultsTableBody.innerHTML = '';
        const colCount = 7;
        const dataIsArray = Array.isArray(resultsToDisplay);
        const isEmpty = !dataIsArray || resultsToDisplay.length === 0;
        const isFixResults = dataIsArray && resultsToDisplay.length > 0 && resultsToDisplay[0]?.status !== undefined && resultsToDisplay[0]?.relative_path !== undefined;
        const isMessageResult = dataIsArray && resultsToDisplay.length === 1 && resultsToDisplay[0]?.message !== undefined && resultsToDisplay[0]?.relative_path === undefined && !isFixResults;

        if (isMessageResult) {
            const row = resultsTableBody.insertRow();
            const cell = row.insertCell(); cell.colSpan = colCount; cell.textContent = resultsToDisplay[0].message;
        } else if (isEmpty) {
            const row = resultsTableBody.insertRow();
            const cell = row.insertCell(); cell.colSpan = colCount;
            const filterVal = getSelectedFilter();
            cell.textContent = (filterVal === 'attention' && currentTaskType !== 'fix') ? "No items match 'Needs Attention' filter."
                             : (currentTaskType === 'fix' ? "No fix results available."
                             : "Scan results will appear here.");
        } else if (dataIsArray) {
            resultsToDisplay.forEach(item => {
                const row = resultsTableBody.insertRow();
                if (isFixResults) {
                    row.className = `fix-${item.status || 'unknown'}`;
                    row.insertCell().textContent = item.relative_path || 'N/A';
                    const statusCell = row.insertCell(); statusCell.colSpan = 5;
                    statusCell.textContent = item.status ? item.status.toUpperCase() : '?';
                    row.insertCell().textContent = item.message || '';
                } else if (item.relative_path !== undefined) {
                    row.className = item.is_compatible ? 'directplay-yes' : 'directplay-no';
                    const filenameCell = row.insertCell();
                    const fullPath = item.relative_path || '';
                    const baseFilename = fullPath.split(/[\\/]/).pop() || fullPath;
                    filenameCell.textContent = baseFilename;
                    filenameCell.title = fullPath;
                    row.insertCell().textContent = item.container || 'N/A';
                    row.insertCell().textContent = item.video_details || 'N/A';
                    const audioCell = row.insertCell();
                    if (Array.isArray(item.audio_tracks) && item.audio_tracks.length > 0) {
                        audioCell.innerHTML = item.audio_tracks.map(track => {
                            let parts = [];
                            if (track.index != null) parts.push(`#${track.index}`);
                            parts.push(track.codec || '?');
                            if (track.language && track.language !== 'und') parts.push(`(${track.language})`);
                            if (track.channels) parts.push(`${track.channels}ch`);
                            if (track.title) parts.push(`'${track.title}'`);
                            return parts.join(' ').replace(/</g, "<").replace(/>/g, ">");
                        }).join('<br>');
                    } else { audioCell.textContent = 'N/A'; }
                    const subsCell = row.insertCell();
                    subsCell.textContent = Array.isArray(item.subtitle_codecs) && item.subtitle_codecs.length > 0 ? item.subtitle_codecs.join(', ') : 'N/A';
                    row.insertCell().textContent = item.is_compatible ? 'Yes' : 'No';
                    row.insertCell().textContent = item.reason || item.error || (item.is_compatible ? 'Direct Play OK' : '');
                }
            });
        }
    }

    function updateSummary(fullDataSet, isFixSummary = false) {
         if (!resultsSummary) return; let summaryText = "";
         const dataArray = (Array.isArray(fullDataSet))
             ? fullDataSet.filter(item => item.relative_path !== undefined || item.status !== undefined)
             : [];
         const processedCount = dataArray.length;

         if (isFixSummary) {
             let s = 0, f = 0, k = 0;
             dataArray.forEach(item => {
                 if (item.status === 'success') s++;
                 else if (item.status === 'failed') f++;
                 else if (item.status === 'skipped') k++;
             });
             summaryText = `Fix Summary - Success: ${s}, Failed: ${f}, Skipped: ${k} (Total Attempted: ${processedCount})`;
         } else {
             let compatible = 0, incompatible = 0, errors = 0;
             dataArray.forEach(item => {
                 if (item.error) errors++;
                 else if (item.is_compatible) compatible++;
                 else incompatible++;
             });
             summaryText = `Scan Summary:\n✅ Direct Play Compatible: ${compatible}\n⚠️ Needs Attention: ${incompatible}\n❌ Errors: ${errors}\n📄 Total Processed: ${processedCount}`;
         }
         resultsSummary.textContent = summaryText;
     }

    function clearPreviousResults(resetSummary = true) {
        if (resultsTableBody) resultsTableBody.innerHTML = '';
        fullResultsData = [];

        if (currentTaskId) {
             stopPolling();
             currentTaskId = null;
             currentTaskType = null;
             sessionStorage.removeItem('activeTaskId');
             sessionStorage.removeItem('activeTaskType');
        }

        if (resetSummary && resultsSummary) { resultsSummary.textContent = 'Summary will appear here.'; }
        if (progressBarContainer) progressBarContainer.style.display = 'none';
        if (progressBarInner) progressBarInner.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
        const allRadio = document.querySelector('input[name="result-filter"][value="all"]');
        if (allRadio) allRadio.checked = true;

        updateFilterButtonCounts();
        applyFilterAndRenderTable();
        if (statusMessage) statusMessage.textContent = "Idle";
        setUIState(false);
    }

    async function openProfileManager() { if (!profileManagerModal) return; cancelEdit(); await populateProfileManagerList(); profileManagerModal.style.display='block'; setUIState(false, false, true); }
    function closeProfileManager() { if(profileManagerModal)profileManagerModal.style.display='none'; cancelEdit(); setUIState(false, false, false); }
    async function populateProfileManagerList() { if (!profileListManagerDiv) return; profileListManagerDiv.innerHTML='<p>Loading...</p>'; try { const r=await fetch('/api/profiles'); if(!r.ok){const err=await r.json(); throw new Error(err.error||`HTTP Error ${r.status}`);} const n=await r.json(); currentProfileList=n; let h='<ul>'; if(n.length===0){h='<p>No profiles found.</p>'} else {n.forEach(name=>{h+=`<li><span>${name}</span><span class="profile-actions"><button class="clone-button" data-profile-name="${name}" title="Clone">Clone</button><button class="edit-profile-list-btn" data-profile-name="${name}" title="Edit">Edit</button><button class="delete-profile-list-btn danger-button" data-profile-name="${name}" title="Delete">Delete</button></span></li>`;}); h+='</ul>';} profileListManagerDiv.innerHTML=h; } catch(e){profileListManagerDiv.innerHTML=`<p class="error">Error loading profiles: ${e.message}</p>`;} }
    function handleProfileListActions(event) { const target = event.target; const profileName = target.getAttribute('data-profile-name'); if(!profileName)return; if(target.classList.contains('edit-profile-list-btn')){startEditProfile(profileName);} else if(target.classList.contains('delete-profile-list-btn')){deleteProfile(profileName);} else if(target.classList.contains('clone-profile-list-btn')){cloneProfile(profileName);} }
    function startAddProfile() { profileBeingEdited=null; if(editingProfileNameSpan)editingProfileNameSpan.textContent=""; if(editorHeading)editorHeading.textContent="Add New Profile"; if(profileEditorTextarea)profileEditorTextarea.value=`{\n  "description": "New Custom Profile",\n  "notes": "Add rules here",\n  "supported_containers": ["mkv", "mp4"],\n  "supported_video_codecs": ["h264", "hevc"],\n  "supported_audio_codecs": ["aac", "ac3"],\n  "max_h264_level": null,\n  "unsupported_subtitle_formats": ["hdmv_pgs_subtitle", "dvd_subtitle"]\n}`; if(editorStatusDiv)editorStatusDiv.textContent="Enter name and valid JSON content."; if(editorStatusDiv)editorStatusDiv.className='editor-status'; if(newProfileNameContainer)newProfileNameContainer.style.display='flex'; if(newProfileNameInput)newProfileNameInput.value=""; if(saveProfileButton)saveProfileButton.disabled=false; if(cancelEditButton)cancelEditButton.disabled=false; if(profileEditorContainer)profileEditorContainer.style.display='block'; }
    async function startEditProfile(profileName) { if (!profileName) return; if(editorStatusDiv)editorStatusDiv.textContent="Loading profile content..."; if(editorStatusDiv)editorStatusDiv.className='editor-status'; if(profileEditorTextarea)profileEditorTextarea.value=""; if(newProfileNameContainer)newProfileNameContainer.style.display='none'; if(editorHeading)editorHeading.textContent="Edit Profile: "; if(editingProfileNameSpan)editingProfileNameSpan.textContent=profileName; try { const response=await fetch(`/api/profiles/${profileName}`); const data=await response.json(); if(!response.ok)throw new Error(data.error||`HTTP error ${response.status}`); profileBeingEdited=profileName; try{profileEditorTextarea.value=JSON.stringify(JSON.parse(data.content),null,2);}catch(e){profileEditorTextarea.value=data.content;} if(profileEditorContainer)profileEditorContainer.style.display='block'; if(editorStatusDiv)editorStatusDiv.textContent="Profile loaded for editing."; if(saveProfileButton)saveProfileButton.disabled=false; if(cancelEditButton)cancelEditButton.disabled=false; } catch(e){if(editorStatusDiv)editorStatusDiv.textContent=`Error loading profile: ${e.message}`; if(editorStatusDiv)editorStatusDiv.className='editor-status error'; profileBeingEdited=null; if(profileEditorContainer)profileEditorContainer.style.display='none';} }
    async function saveProfile() { const isAdding = profileBeingEdited === null; let profileName = isAdding ? newProfileNameInput.value : profileBeingEdited; const content = profileEditorTextarea.value; if(!profileName && isAdding){ editorStatusDiv.textContent=`Error: Profile name is required.`; editorStatusDiv.className='editor-status error'; return; } const safeName = profileName.trim().replace(/[^a-zA-Z0-9\-_\.]/g, '_').replace(/\.+/g, '.'); if(!safeName || safeName.startsWith('.') || safeName.endsWith('.')){ editorStatusDiv.textContent=`Error: Invalid characters in profile name. Use A-Z, 0-9, -, _, .`; editorStatusDiv.className='editor-status error'; return; } try{ JSON.parse(content); }catch(e){ editorStatusDiv.textContent=`Error: Invalid JSON format. ${e.message}`; editorStatusDiv.className='editor-status error'; return; } editorStatusDiv.textContent=`Saving '${safeName}'...`; editorStatusDiv.className='editor-status'; saveProfileButton.disabled=true; cancelEditButton.disabled=true; const url = isAdding ? '/api/profiles' : `/api/profiles/${profileBeingEdited}`; const method = isAdding ? 'POST' : 'PUT'; const body = isAdding ? {name: safeName, content: content} : {content: content}; try{ const response = await fetch(url, {method: method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)}); const resultData = await response.json(); if(!response.ok) throw new Error(resultData.error || `HTTP error ${response.status}`); editorStatusDiv.textContent = resultData.message || "Profile saved successfully!"; editorStatusDiv.className = 'editor-status success'; setTimeout(async () => { cancelEdit(); await updateProfileDropdown(); await populateProfileManagerList(); }, 1000); } catch(e){ if(editorStatusDiv)editorStatusDiv.textContent=`Error saving profile: ${e.message}`; editorStatusDiv.className='editor-status error'; saveProfileButton.disabled=false; cancelEditButton.disabled=false; } }
    function cancelEdit() { if(profileEditorContainer)profileEditorContainer.style.display='none'; if(profileEditorTextarea)profileEditorTextarea.value=""; if(editorStatusDiv)editorStatusDiv.textContent=""; if(editorStatusDiv)editorStatusDiv.className='editor-status'; profileBeingEdited=null; if(saveProfileButton)saveProfileButton.disabled=false; if(cancelEditButton)cancelEditButton.disabled=false; }
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

});
