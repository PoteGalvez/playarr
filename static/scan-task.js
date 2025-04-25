let currentTaskId = null;
let currentTaskType = null;
let pollInterval = null;

async function startScan() {
    if (!window.profileSelect || !window.profileSelect.value) {
        window.statusMessage.textContent = "Error: No profile selected.";
        return;
    }
    clearPreviousResults();
    cancelEdit();
    setUIState(true, false);
    window.statusMessage.textContent = 'Requesting scan...';
    currentTaskType = 'scan';
    const data = { directory: window.directoryInput.value, profile_name: window.profileSelect.value };
    try {
        const response = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        const resultData = await response.json();
        if (!response.ok) throw new Error(resultData.error || `HTTP error ${response.status}`);
        currentTaskId = resultData.task_id;
        sessionStorage.setItem('activeTaskId', currentTaskId);
        sessionStorage.setItem('activeTaskType', currentTaskType);
        window.statusMessage.textContent = `Scan queued. Polling...`;
        if (window.progressBarContainer) window.progressBarContainer.style.display = 'flex';
        if (window.progressBarInner) window.progressBarInner.style.width = '0%';
        if (window.progressText) window.progressText.textContent = '0%';
        startPolling();
    } catch (e) {
        window.statusMessage.textContent = `Error starting scan: ${e.message}`;
        setUIState(false);
        currentTaskType = null;
    }
}

async function stopTask() {
    if (!currentTaskId) {
        window.statusMessage.textContent = "No active task to stop.";
        return;
    }
    const taskType = currentTaskType || 'task';
    window.statusMessage.textContent = `Requesting stop for ${taskType}...`;
    if (window.stopButton) window.stopButton.disabled = true;
    try {
        const response = await fetch(`/api/stop_task/${currentTaskId}`, { method: 'POST' });
        const resultData = await response.json();
        if (!response.ok) throw new Error(resultData.error || `HTTP error ${response.status}`);
        window.statusMessage.textContent = `Cancellation requested. Waiting for task to stop...`;
    } catch (e) {
        window.statusMessage.textContent = `Error stopping task: ${e.message}`;
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
                try {
                    const d = await response.json();
                    eMsg = d.error || eMsg;
                } catch (e) { }
                if (response.status === 404) eMsg += ` Task ${currentTaskId} not found (maybe expired?).`;
                throw new Error(eMsg);
            }
            const task = await response.json();

            let resultsChanged = false;
            const newResults = task.result;

            if (newResults !== null && newResults !== undefined) {
                const newResultsArray = Array.isArray(newResults) ? newResults : (newResults.message ? [newResults] : []);
                if (JSON.stringify(window.fullResultsData) !== JSON.stringify(newResultsArray)) {
                    window.fullResultsData = newResultsArray;
                    resultsChanged = true;
                }
            }

            updateStatus(task);

            if (resultsChanged) {
                applyFilterAndRenderTable();
                updateSummary(window.fullResultsData, currentTaskType === 'fix');
                updateFilterButtonCounts();
            }

            if (['completed', 'failed', 'cancelled'].includes(task.status)) {
                const finalTaskType = currentTaskType;
                const finalTaskId = currentTaskId;
                stopPolling();

                if (resultsChanged) {
                    applyFilterAndRenderTable();
                }
                updateSummary(window.fullResultsData, finalTaskType === 'fix');
                updateFilterButtonCounts();

                let finalMsg = "";
                if (task.status === 'cancelled') {
                    finalMsg = `${finalTaskType || 'Task'} cancelled.`;
                    if (Array.isArray(window.fullResultsData) && window.fullResultsData.length > 0 && !window.fullResultsData[0]?.message) {
                        finalMsg += " Displaying partial results.";
                    }
                } else if (task.status === 'failed') {
                    finalMsg = `${finalTaskType || 'Task'} failed: ${task.error || 'Unknown reason'}`;
                } else if (task.status === 'completed') {
                    if (finalTaskType === 'fix') {
                        finalMsg = "Fix task completed.";
                    } else {
                        const scanMsg = (Array.isArray(window.fullResultsData) && window.fullResultsData.length > 0 && window.fullResultsData[0]?.message && !window.fullResultsData[0]?.status)
                            ? window.fullResultsData[0].message
                            : (Array.isArray(window.fullResultsData) ? `Processed ${window.fullResultsData.length} files.` : "Processing completed.");
                        finalMsg = `Scan completed. ${scanMsg}`;
                    }
                }
                if (window.statusMessage) window.statusMessage.textContent = finalMsg;

                currentTaskId = null;
                currentTaskType = null;
                sessionStorage.removeItem('activeTaskId');
                sessionStorage.removeItem('activeTaskType');
                setUIState(false);
            }
        } catch (error) {
            if (window.statusMessage) window.statusMessage.textContent = `Polling error: ${error.message}. Stopping polling.`;
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
function stopPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}
