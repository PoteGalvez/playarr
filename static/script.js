// static/script.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Get Elements ---
    console.log("DEBUG: Script Loaded. Getting elements...");
    const scanButton = document.getElementById('scan-button');
    console.log("DEBUG: Scan Button found?", scanButton);
    const stopButton = document.getElementById('stop-button');
    console.log("DEBUG: Stop Button found?", stopButton); // May be null initially
    const statusMessage = document.getElementById('status-message');
    const resultsTableBody = document.querySelector('#results-table tbody');
    const profileSelect = document.getElementById('profile');
    console.log("DEBUG: Profile Select found?", profileSelect);
    const directoryInput = document.getElementById('directory');
    const resultsSummary = document.getElementById('results-summary');
    const themeToggleButton = document.getElementById('theme-toggle');
    console.log("DEBUG: Theme Toggle Button found?", themeToggleButton);
    const progressBarContainer = document.getElementById('progress-container');
    const progressBarInner = document.getElementById('progress-bar-inner');
    const progressText = document.getElementById('progress-text');
    const filterRadios = document.querySelectorAll('input[name="result-filter"]');
    console.log("DEBUG: Filter Radios found?", filterRadios);
    // Profile Management Elements
    const manageProfilesButton = document.getElementById('manage-profiles-button');
    console.log("DEBUG: Manage Profiles Button found?", manageProfilesButton);
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
    // Fix Control Elements
    const fixButton = document.getElementById('fix-button');
    console.log("DEBUG: Fix Button found?", fixButton);
    const fixAudioCodecSelect = document.getElementById('fix-audio-codec');
    const fixAudioBitrateInput = document.getElementById('fix-audio-bitrate');
    const fixOutputSuffixInput = document.getElementById('fix-output-suffix');
    const fixBackupCheckbox = document.getElementById('fix-backup');

    // --- State Variables ---
    let currentTaskId = null; let currentTaskType = null; let pollInterval = null; let fullResultsData = [];
    let profileBeingEdited = null; let currentProfileList = [];

    // --- Event Listeners ---
    console.log("DEBUG: Attaching event listeners...");
    if (scanButton) { scanButton.addEventListener('click', startScan); console.log("DEBUG: Attached listener to Scan Button."); }
    else { console.error("DEBUG: Scan Button element NOT FOUND!"); }

    if (stopButton) { stopButton.addEventListener('click', stopTask); console.log("DEBUG: Attached listener to Stop Button."); }
    else { console.warn("DEBUG: Stop Button element not found initially."); }

    if (themeToggleButton) { themeToggleButton.addEventListener('click', toggleTheme); console.log("DEBUG: Attached listener to Theme Toggle Button."); }
    else { console.error("DEBUG: Theme Toggle Button element NOT FOUND!"); }

    if (filterRadios && filterRadios.length > 0) { filterRadios.forEach(radio => radio.addEventListener('change', applyFilterAndRenderTable)); console.log("DEBUG: Attached listeners to Filter Radios."); }
    else { console.error("DEBUG: Filter Radios not found!"); }

    if (manageProfilesButton) { manageProfilesButton.addEventListener('click', openProfileManager); console.log("DEBUG: Attached listener to Manage Profiles Button."); }
    else { console.error("DEBUG: Manage Profiles Button element NOT FOUND!"); }

    if (modalCloseButton) { modalCloseButton.addEventListener('click', closeProfileManager); console.log("DEBUG: Attached listener to Modal Close Button.");}
    else { console.error("DEBUG: Modal Close Button element NOT FOUND!"); }

    if (addNewProfileButton) { addNewProfileButton.addEventListener('click', startAddProfile); console.log("DEBUG: Attached listener to Add New Profile Button.");}
    else { console.error("DEBUG: Add New Profile Button element NOT FOUND!"); }

    if (saveProfileButton) { saveProfileButton.addEventListener('click', saveProfile); console.log("DEBUG: Attached listener to Save Profile Button.");}
    else { console.error("DEBUG: Save Profile Button element NOT FOUND!"); }

    if (cancelEditButton) { cancelEditButton.addEventListener('click', cancelEdit); console.log("DEBUG: Attached listener to Cancel Edit Button.");}
    else { console.error("DEBUG: Cancel Edit Button element NOT FOUND!"); }

    if (profileListManagerDiv) { profileListManagerDiv.addEventListener('click', handleProfileListActions); console.log("DEBUG: Attached listener to Profile List Manager Div.");}
    else { console.error("DEBUG: Profile List Manager Div element NOT FOUND!"); }

    if(profileManagerModal) { profileManagerModal.addEventListener('click', (event) => { if (event.target === profileManagerModal) closeProfileManager(); }); console.log("DEBUG: Attached listener to Profile Manager Modal (for outside click).");}
    else { console.error("DEBUG: Profile Manager Modal element NOT FOUND!"); }

    if (fixButton) { fixButton.addEventListener('click', startFix); console.log("DEBUG: Attached listener to Fix Button.");}
    else { console.error("DEBUG: Fix Button element NOT FOUND!"); }

    console.log("DEBUG: Event listeners attachment section finished.");


    // --- Dark Mode Theme Handling ---
    function applyTheme(theme) { if (theme === 'dark') { document.body.classList.add('dark-mode'); if (themeToggleButton) themeToggleButton.textContent = '☀️'; } else { document.body.classList.remove('dark-mode'); if (themeToggleButton) themeToggleButton.textContent = '🌙'; } }
    function toggleTheme() { console.log("DEBUG: toggleTheme called"); const currentTheme = document.body.classList.contains('dark-mode')?'dark':'light'; const newTheme = currentTheme === 'dark'?'light':'dark'; localStorage.setItem('theme', newTheme); applyTheme(newTheme); }
    const savedTheme = localStorage.getItem('theme') || 'light'; applyTheme(savedTheme);

    // --- UI State Management ---
    function setUIState(isScanning, isFixing = false, isEditing = false) {
        console.log(`DEBUG: setUIState called - isScanning: ${isScanning}, isFixing: ${isFixing}, isEditing: ${isEditing}`);
        const disableMainControls = isScanning || isFixing || isEditing;
        const disableFix = isScanning || isEditing || fullResultsData.length === 0 || (fullResultsData.length > 0 && fullResultsData[0]?.message);
        const disableManage = isScanning || isFixing; // Can manage profiles while editing is happening within modal

        if (scanButton) scanButton.disabled = disableMainControls; else console.warn("DEBUG: scanButton null in setUIState");
        if (profileSelect) profileSelect.disabled = disableMainControls; else console.warn("DEBUG: profileSelect null in setUIState");
        if (manageProfilesButton) manageProfilesButton.disabled = disableManage; else console.warn("DEBUG: manageProfilesButton null in setUIState");

        if (stopButton) { stopButton.disabled = !(isScanning || isFixing); stopButton.style.display = (isScanning || isFixing) ? 'inline-block' : 'none'; }
        if (progressBarContainer) progressBarContainer.style.display = (isScanning || isFixing) ? 'flex' : 'none';
        if (!isScanning && !isFixing) { if(progressBarInner) progressBarInner.style.width = '0%'; if(progressText) progressText.textContent = '0%'; }
        if (filterRadios) filterRadios.forEach(radio => radio.disabled = disableMainControls);
        // Fix controls
        if (fixButton) fixButton.disabled = disableMainControls || disableFix; else console.warn("DEBUG: fixButton null in setUIState");
        if (fixAudioCodecSelect) fixAudioCodecSelect.disabled = disableMainControls;
        if (fixAudioBitrateInput) fixAudioBitrateInput.disabled = disableMainControls;
        if (fixOutputSuffixInput) fixOutputSuffixInput.disabled = disableMainControls;
        if (fixBackupCheckbox) fixBackupCheckbox.disabled = disableMainControls;
    }

    // --- Scan/Stop/Fix Functions ---
    async function startScan() {
        console.log("DEBUG: startScan function entered.");
        if (!profileSelect || !profileSelect.value) { statusMessage.textContent = "Error: No profile selected."; console.log("DEBUG: startScan aborted - no profile selected."); return; }
        clearPreviousResults(); cancelEdit(); setUIState(true, false, false); statusMessage.textContent = 'Requesting scan...';
        currentTaskType = 'scan'; const data = { directory: directoryInput.value, profile_name: profileSelect.value };
        try { const r = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); const d = await r.json(); if (!r.ok) throw new Error(d.error||'Failed'); currentTaskId=d.task_id; statusMessage.textContent = `Scan queued. Polling...`; if (progressBarContainer) progressBarContainer.style.display='flex'; if(progressBarInner)progressBarInner.style.width='0%'; if(progressText)progressText.textContent='0%'; startPolling(); }
        catch (e) { console.error('Error starting scan:', e); statusMessage.textContent = `Error: ${e.message}`; setUIState(false); currentTaskType = null;}
    }
    async function stopTask() {
        console.log("DEBUG: stopTask function entered.");
        if (!currentTaskId) { statusMessage.textContent = "No active task to stop."; return; }
        const taskType = currentTaskType||'task'; statusMessage.textContent = `Requesting stop for ${taskType}...`; if(stopButton) stopButton.disabled=true;
        try { const r=await fetch(`/api/stop_task/${currentTaskId}`,{method:'POST'}); const d=await r.json(); if (!r.ok) throw new Error(d.error||'Failed'); statusMessage.textContent = `Cancellation requested. Waiting...`; }
        catch(e) { console.error('Error stopping task:', e); statusMessage.textContent = `Error: ${e.message}`; if(stopButton) stopButton.disabled = false; }
    }
    async function startFix() {
        console.log("DEBUG: startFix function entered.");
        const filesToFix = fullResultsData.filter(i => !i.is_compatible && !i.error && !i.message);
        if (filesToFix.length === 0) { statusMessage.textContent = "No files marked 'Needs Attention'."; return; }
        let fileListPreview = filesToFix.slice(0, 5).map(f => f.relative_path).join('\n'); if (filesToFix.length > 5) fileListPreview += '\n...and more.';
        if (!confirm(`Found ${filesToFix.length} files needing attention.\n\nExample Files:\n${fileListPreview}\n\nProceed with fixing using current options?\nWARNING: Test on backups!`)) { statusMessage.textContent = "Fix cancelled by user."; return; }
        const fixOptions = { target_audio_codec: fixAudioCodecSelect?.value||'aac', target_audio_bitrate: fixAudioBitrateInput?.value.trim()||null, output_suffix: fixOutputSuffixInput?.value.trim()||'.fixed', backup: fixBackupCheckbox?.checked||false };
        if (!fixOptions.output_suffix || fixOptions.output_suffix.includes('/') || fixOptions.output_suffix.includes('\\') ) { alert("Output Suffix invalid."); return; }
        clearPreviousResults(); cancelEdit(); setUIState(false, true, false); statusMessage.textContent = `Requesting fix...`; currentTaskType = 'fix';
        const filesPayload = filesToFix.map(i => ({ file_path: i.file_path, relative_path: i.relative_path }));
        const data = { files_to_fix: filesPayload, fix_options: fixOptions };
        try { const r=await fetch('/api/fix', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)}); const d=await r.json(); if(!r.ok) throw new Error(d.error||'Failed'); currentTaskId=d.task_id; statusMessage.textContent=`Fix task queued. Polling...`; if(progressBarContainer)progressBarContainer.style.display='flex'; if(progressBarInner)progressBarInner.style.width='0%'; if(progressText)progressText.textContent='0%'; startPolling(); }
        catch(e) { console.error('Error starting fix:', e); statusMessage.textContent = `Error: ${e.message}`; setUIState(false); currentTaskType = null; }
    }

    // --- Polling and Status Update ---
    function startPolling() {
        stopPolling(); console.log(`DEBUG: Starting polling for task ${currentTaskId} (Type: ${currentTaskType})`);
        pollInterval = setInterval(async () => {
            if (!currentTaskId) { stopPolling(); return; }
            try {
                const response = await fetch(`/api/status/${currentTaskId}`);
                if (!response.ok) { let eMsg=`Poll error ${response.status}`; try{const d=await response.json(); eMsg=d.error||eMsg;}catch(e){} if(response.status===404)eMsg+=` Task ${currentTaskId} not found.`; throw new Error(eMsg); }
                const task = await response.json();

                if (task.result !== null && task.result !== undefined) { const resultsArray = (Array.isArray(task.result) ? task.result : (task.result.message ? [task.result] : [])); if(JSON.stringify(fullResultsData)!==JSON.stringify(resultsArray)){ fullResultsData=resultsArray; applyFilterAndRenderTable();} }
                updateStatus(task);
                if (['completed', 'failed', 'cancelled'].includes(task.status)) { console.log(`DEBUG: Polling detected terminal status '${task.status}'`); const finalTaskType=currentTaskType; stopPolling(); setUIState(false); currentTaskId=null; currentTaskType=null; sessionStorage.removeItem('activeTaskId'); sessionStorage.removeItem('activeTaskType'); let finalMsg=""; if(task.status==='cancelled'){finalMsg=`${finalTaskType||'Task'} cancelled.`+(fullResultsData?.length>0&&!fullResultsData[0]?.message?" Displaying results.":"");} else if(task.status==='failed'){finalMsg=`${finalTaskType||'Task'} failed: ${task.error||'Unknown'}`;} else if(task.status==='completed'){ if(finalTaskType==='fix'){finalMsg="Fix task completed.";} else {const scanMsg=fullResultsData&&fullResultsData[0]?.message?fullResultsData[0].message:(Array.isArray(fullResultsData)?`Displayed ${fullResultsData.length} results.`:"Completed."); finalMsg=`Scan completed. ${scanMsg}`;}} statusMessage.textContent=finalMsg; applyFilterAndRenderTable();}
            } catch (error) { console.error('Polling error:', error); statusMessage.textContent = `Polling error: ${error.message}. Stopping.`; setUIState(false); stopPolling(); currentTaskId = null; currentTaskType = null; sessionStorage.removeItem('activeTaskId'); sessionStorage.removeItem('activeTaskType'); }
        }, 2000);
    }
    function stopPolling() { if (pollInterval) { clearInterval(pollInterval); pollInterval = null; } }

    function updateStatus(task) {
         if (!pollInterval && !['running', 'queued', 'cancelling'].includes(task.status)) return;
         let statusText = `Status: ${task.status}`; let showProgressBar = false;
         const taskTypeDisplay = currentTaskType === 'fix' ? 'Fixing' : 'Scanning';
         if (task.status === 'running' && task.total_files != null) { const p=task.progress||0; const d=task.processed_count||0; const t=task.total_files||0; statusText=`${taskTypeDisplay}...`; showProgressBar=true; if(progressBarInner)progressBarInner.style.width=`${p}%`; if(progressText)progressText.textContent=`${p}% (${d}/${t})`; if(task.current_file){statusText+=`\n${task.current_file}`;} else if(d===0){statusText+=`\nInitializing...`;} }
         else if (task.status === 'cancelling') { statusText=`Status: cancelling ${taskTypeDisplay}...`; showProgressBar=true; const p=task.progress||0; const d=task.processed_count||0; const t=task.total_files||0; if(progressBarInner)progressBarInner.style.width=`${p}%`; if(progressText)progressText.textContent=`${p}% (${d}/${t})`; }
         else if (task.status === 'queued') { statusText=`Status: ${taskTypeDisplay} queued...`; }
         if (!['completed', 'failed', 'cancelled'].includes(task.status)) { if(statusMessage) statusMessage.textContent = statusText; }
         if (progressBarContainer) progressBarContainer.style.display = showProgressBar ? 'flex' : 'none';
    }

    // --- Filtering and Table Rendering ---
    function getSelectedFilter() { const r=document.querySelector('input[name="result-filter"]:checked'); return r?r.value:'all'; }
    function applyFilterAndRenderTable() {
        // console.log("DEBUG: applyFilterAndRenderTable called."); // Can be noisy
        const filterValue = getSelectedFilter(); let filteredData = [];
        if (fullResultsData.length > 0 && fullResultsData[0]?.message){filteredData=fullResultsData;} else if (currentTaskType==='fix'){filteredData=fullResultsData;} else if (filterValue==='attention'){filteredData=fullResultsData.filter(i=>!i.is_compatible&&!i.error);} else {filteredData=fullResultsData;} renderTable(filteredData); updateSummary(fullResultsData, currentTaskType==='fix');
    }
    function renderTable(resultsToDisplay) {
        // console.log("DEBUG: renderTable called with", resultsToDisplay?.length, "items."); // Can be noisy
        if (!resultsTableBody) { console.error("Cannot render table, body element not found."); return; }
        resultsTableBody.innerHTML = ''; const colCount = 7;
        const isFixResults = (resultsToDisplay.length > 0 && resultsToDisplay[0]?.status && resultsToDisplay[0]?.message !== undefined);
        if (resultsToDisplay && resultsToDisplay.length > 0 && resultsToDisplay[0].message && !isFixResults) { const r=resultsTableBody.insertRow(); const c=r.insertCell(); c.colSpan=colCount; c.textContent=resultsToDisplay[0].message; }
        else if (Array.isArray(resultsToDisplay)) {
             if (resultsToDisplay.length === 0) { const r=resultsTableBody.insertRow(); const c=r.insertCell(); c.colSpan=colCount; const fVal=getSelectedFilter(); c.textContent = (fVal==='attention'&&currentTaskType!=='fix')?"No items match filter.":(currentTaskType==='fix'?"No fix results.":"No results yet."); }
             else {
                 resultsToDisplay.forEach(item => {
                    const row = resultsTableBody.insertRow();
                    if (isFixResults) { row.className=`fix-${item.status||'unknown'}`; row.insertCell().textContent=item.relative_path||'N/A'; const sCell=row.insertCell(); sCell.colSpan=5; sCell.textContent=item.status?item.status.toUpperCase():'?'; row.insertCell().textContent=item.message||''; }
                    else { row.className=item.is_compatible?'directplay-yes':'directplay-no'; row.insertCell().textContent=item.relative_path||'N/A'; row.insertCell().textContent=item.container||'N/A'; row.insertCell().textContent=item.video_details||'N/A';
                         const audioCell=row.insertCell(); if(Array.isArray(item.audio_tracks)&&item.audio_tracks.length>0){ audioCell.innerHTML=item.audio_tracks.map(track=>{let p=[];if(track.index!=null)p.push(`#${track.index}`); p.push(track.codec||'?');if(track.language&&track.language!=='und')p.push(`(${track.language})`); if(track.channels)p.push(`${track.channels}ch`); if(track.title)p.push(`'${track.title}'`); return p.join(' ').replace(/</g,"&lt;").replace(/>/g,"&gt;")}).join('<br>');} else {audioCell.textContent='N/A'}
                         const subsCell=row.insertCell(); subsCell.textContent=Array.isArray(item.subtitle_codecs)&&item.subtitle_codecs.length>0?item.subtitle_codecs.join(', '):'N/A';
                         row.insertCell().textContent=item.is_compatible?'Yes':'No'; row.insertCell().textContent=item.reason||item.error||(item.is_compatible?'OK':''); }
                });
             }
        } else { console.warn("renderTable called with unexpected data:", resultsToDisplay); }
    }

    function updateSummary(fullDataSet, isFixSummary = false) {
         if (!resultsSummary) return; let summaryText = "";
         if (isFixSummary) { let s=0, f=0, k=0, p=0; if(Array.isArray(fullDataSet)){p=fullDataSet.length; fullDataSet.forEach(i=>{if(i.status==='success')s++; else if(i.status==='failed')f++; else if(i.status==='skipped')k++;});} summaryText=`Fix Summary - Success: ${s}, Failed: ${f}, Skipped: ${k} (Total Attempted: ${p})`; }
         else { let c=0, i=0, e=0, p=0; if(fullDataSet&&Array.isArray(fullDataSet)&&!(fullDataSet.length>0&&fullDataSet[0]?.message)){p=fullDataSet.length; fullDataSet.forEach(item=>{if(item.error){e++;}else if(item.is_compatible){c++;}else{i++;}}); } summaryText=`Scan Summary - Direct Play: ${c}, Needs Attention: ${i}, Errors: ${e} (Total Processed: ${p})`; }
         resultsSummary.textContent = summaryText;
    }

    function clearPreviousResults(resetSummary = true) {
        resultsTableBody.innerHTML = ''; fullResultsData = [];
        if (!sessionStorage.getItem('activeTaskId')) { currentTaskId=null; currentTaskType=null; } // Clear only if not resuming
        sessionStorage.removeItem('activeTaskId'); sessionStorage.removeItem('activeTaskType');
        if (resetSummary && resultsSummary) { resultsSummary.textContent = 'Summary will appear here.'; }
        if (progressBarContainer) progressBarContainer.style.display = 'none'; if (progressBarInner) progressBarInner.style.width = '0%'; if (progressText) progressText.textContent = '0%';
        const allRadio = document.querySelector('input[name="result-filter"][value="all"]'); if(allRadio) allRadio.checked = true;
    }

    // --- Profile Management Functions ---
    async function openProfileManager() { console.log("DEBUG: openProfileManager entered."); if (!profileManagerModal) return; cancelEdit(); await populateProfileManagerList(); profileManagerModal.style.display='block'; setUIState(false, false, true); }
    function closeProfileManager() { if(profileManagerModal)profileManagerModal.style.display='none'; cancelEdit(); setUIState(false, false, false); }
    async function populateProfileManagerList() { console.log("DEBUG: populateProfileManagerList entered."); if (!profileListManagerDiv) return; profileListManagerDiv.innerHTML='<p>Loading...</p>'; try { const r=await fetch('/api/profiles'); const n=await r.json(); if(!r.ok)throw new Error('Failed fetch'); currentProfileList=n; let h='<ul>'; if(n.length===0){h='<p>No profiles found.</p>'} else {n.forEach(name=>{h+=`<li><span>${name}</span><span class="profile-actions"><button class="clone-profile-list-btn" data-profile-name="${name}" title="Clone">Clone</button><button class="edit-profile-list-btn" data-profile-name="${name}" title="Edit">Edit</button><button class="delete-profile-list-btn danger-button" data-profile-name="${name}" title="Delete">Delete</button></span></li>`;}); h+='</ul>';} profileListManagerDiv.innerHTML=h; } catch(e){console.error("Error populating profile list:", e); profileListManagerDiv.innerHTML=`<p class="error">Error: ${e.message}</p>`;} }
    function handleProfileListActions(event) { console.log("DEBUG: handleProfileListActions target:", event.target); const target = event.target; const profileName = target.getAttribute('data-profile-name'); if(!profileName)return; if(target.classList.contains('edit-profile-list-btn')){startEditProfile(profileName);} else if(target.classList.contains('delete-profile-list-btn')){deleteProfile(profileName);} else if(target.classList.contains('clone-profile-list-btn')){cloneProfile(profileName);} }
    function startAddProfile() { console.log("DEBUG: startAddProfile entered."); profileBeingEdited=null; if(editingProfileNameSpan)editingProfileNameSpan.textContent=""; if(editorHeading)editorHeading.textContent="Add New Profile"; if(profileEditorTextarea)profileEditorTextarea.value=`{\n  "description": "New Custom Profile",\n  "notes": "Add rules here",\n  "supported_containers": ["mkv", "mp4"],\n  "supported_video_codecs": ["h264", "hevc"],\n  "supported_audio_codecs": ["aac", "ac3"],\n  "max_h264_level": null,\n  "unsupported_subtitle_formats": ["hdmv_pgs_subtitle", "dvd_subtitle"]\n}`; if(editorStatusDiv)editorStatusDiv.textContent="Enter name and valid JSON."; if(editorStatusDiv)editorStatusDiv.className='editor-status'; if(newProfileNameContainer)newProfileNameContainer.style.display='flex'; if(newProfileNameInput)newProfileNameInput.value=""; if(saveProfileButton)saveProfileButton.disabled=false; if(cancelEditButton)cancelEditButton.disabled=false; if(profileEditorContainer)profileEditorContainer.style.display='block'; }
    async function startEditProfile(profileName) { console.log("DEBUG: startEditProfile entered for:", profileName); if (!profileName) return; if(editorStatusDiv)editorStatusDiv.textContent="Loading..."; if(editorStatusDiv)editorStatusDiv.className='editor-status'; if(profileEditorTextarea)profileEditorTextarea.value=""; if(newProfileNameContainer)newProfileNameContainer.style.display='none'; if(editorHeading)editorHeading.textContent="Edit Profile: "; if(editingProfileNameSpan)editingProfileNameSpan.textContent=profileName; try { const r=await fetch(`/api/profiles/${profileName}`); const d=await r.json(); if(!r.ok)throw new Error(d.error||'Failed'); profileBeingEdited=profileName; try{profileEditorTextarea.value=JSON.stringify(JSON.parse(d.content),null,2);}catch(e){profileEditorTextarea.value=d.content;} if(profileEditorContainer)profileEditorContainer.style.display='block'; if(editorStatusDiv)editorStatusDiv.textContent="Loaded."; if(saveProfileButton)saveProfileButton.disabled=false; if(cancelEditButton)cancelEditButton.disabled=false; } catch(e){console.error("Error fetching profile:", e); if(editorStatusDiv)editorStatusDiv.textContent=`Error: ${e.message}`; if(editorStatusDiv)editorStatusDiv.className='editor-status error'; profileBeingEdited=null; if(profileEditorContainer)profileEditorContainer.style.display='none';}}
    async function saveProfile() { console.log("DEBUG: saveProfile entered."); const isAdding=profileBeingEdited===null; let pName=isAdding?newProfileNameInput.value:profileBeingEdited; const content=profileEditorTextarea.value; if(!pName&&isAdding){editorStatusDiv.textContent=`Error: Name required.`; editorStatusDiv.className='editor-status error'; return;} const safeName=pName.replace(/[^a-zA-Z0-9\-_.]/g,'_').replace(/\.+/g,'.'); if(!safeName||safeName.startsWith('.')||safeName.endsWith('.')){editorStatusDiv.textContent=`Error: Invalid name chars.`; editorStatusDiv.className='editor-status error'; return;} try{JSON.parse(content);}catch(e){editorStatusDiv.textContent=`Error: Invalid JSON. ${e.message}`; editorStatusDiv.className='editor-status error'; return;} editorStatusDiv.textContent=`Saving '${pName}'...`; editorStatusDiv.className='editor-status'; saveProfileButton.disabled=true; cancelEditButton.disabled=true; const url=isAdding?'/api/profiles':`/api/profiles/${profileBeingEdited}`; const method=isAdding?'POST':'PUT'; const body=isAdding?{name:safeName,content:content}:{content:content}; try{const r=await fetch(url,{method:method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const d=await r.json(); if(!r.ok)throw new Error(d.error||'Failed'); editorStatusDiv.textContent=d.message||"Saved!"; editorStatusDiv.className='editor-status success'; setTimeout(async()=>{cancelEdit(); await updateProfileDropdown(); await populateProfileManagerList();},1000);} catch(e){console.error("Error saving:", e); editorStatusDiv.textContent=`Error: ${e.message}`; editorStatusDiv.className='editor-status error'; saveProfileButton.disabled=false; cancelEditButton.disabled=false;}}
    function cancelEdit() { console.log("DEBUG: cancelEdit entered."); if(profileEditorContainer)profileEditorContainer.style.display='none'; if(profileEditorTextarea)profileEditorTextarea.value=""; if(editorStatusDiv)editorStatusDiv.textContent=""; if(editorStatusDiv)editorStatusDiv.className='editor-status'; profileBeingEdited=null; if(saveProfileButton)saveProfileButton.disabled=false; if(cancelEditButton)cancelEditButton.disabled=false; setUIState(false, false, true); /* Keep main controls disabled if modal still technically open */ }
    async function deleteProfile(profileName) { console.log("DEBUG: deleteProfile entered for:", profileName); if(!profileName||!confirm(`DELETE profile "${profileName}"? Cannot be undone.`))return; try{const r=await fetch(`/api/profiles/${profileName}`,{method:'DELETE'}); const d=await r.json(); if(!r.ok)throw new Error(d.error||'Failed'); console.log("Delete successful:", d.message); await updateProfileDropdown(); await populateProfileManagerList(); if(profileBeingEdited===profileName)cancelEdit();} catch(e){console.error("Error deleting:", e); alert(`Error: ${e.message}`);}}
    async function cloneProfile(profileNameToClone) { console.log("DEBUG: cloneProfile entered for:", profileNameToClone); if(!profileNameToClone)return; const newName=prompt(`New name for clone of "${profileNameToClone}":`, `${profileNameToClone}_copy`); if(!newName||newName.trim()==='')return; const sName=newName.trim().replace(/[^a-zA-Z0-9\-_.]/g,'_').replace(/\.+/g,'.'); if(!sName||sName.startsWith('.')||sName.endsWith('.')||sName===profileNameToClone){alert(`Invalid/duplicate name: "${sName}"`); return;} try{const gR=await fetch(`/api/profiles/${profileNameToClone}`); const gD=await gR.json(); if(!gR.ok)throw new Error(gD.error||'Fetch failed'); const oContent=gD.content; const aR=await fetch('/api/profiles',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:sName,content:oContent})}); const aD=await aR.json(); if(!aR.ok)throw new Error(aD.error||'Clone failed'); alert(`Cloned as "${sName}"!`); await updateProfileDropdown(); await populateProfileManagerList();} catch(e){console.error("Error cloning:", e); alert(`Error: ${e.message}`);}}
    async function updateProfileDropdown() {
        console.log("DEBUG: updateProfileDropdown entered.");
        if (!profileSelect) return; const currentVal = profileSelect.value; profileSelect.options.length = 0; profileSelect.disabled = true; if (scanButton) scanButton.disabled = true; if (manageProfilesButton) manageProfilesButton.disabled = true;
        try { const r=await fetch('/api/profiles'); const pNames=await r.json(); if(!r.ok)throw new Error('Failed fetch'); currentProfileList = pNames;
             if(pNames.length===0){profileSelect.options.add(new Option("No profiles loaded","",true,true)); if(manageProfilesButton)manageProfilesButton.disabled=false;} // Keep manage enabled
             else {pNames.forEach(n=>profileSelect.options.add(new Option(n,n))); profileSelect.value=pNames.includes(currentVal)?currentVal:pNames[0]; profileSelect.disabled=false; if(scanButton)scanButton.disabled=false; if(manageProfilesButton)manageProfilesButton.disabled=false;}
        } catch(e){ console.error("Error updating dropdown:", e); profileSelect.options.length=0; profileSelect.options.add(new Option("Error loading","",true,true)); if(manageProfilesButton)manageProfilesButton.disabled=false; } // Keep manage enabled on error
    }

    // --- Initial Setup ---
    console.log("Playarr UI Initialized - Running initial setup..."); setUIState(false); clearPreviousResults(); updateProfileDropdown();

});