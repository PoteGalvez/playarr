function showHelpModal() {
    alert("Help modal content goes here.");
}

function showAboutModal() {
    alert("About modal content goes here.");
}

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
    if (!Array.isArray(window.fullResultsData)) {
        if (filterAllLabel) filterAllLabel.textContent = "All (0)";
        if (filterNeedsAttentionLabel) filterNeedsAttentionLabel.textContent = "Needs Attention (0)";
        return;
    }

    const totalCount = window.fullResultsData.length;
    let needsAttentionCount = 0;

    needsAttentionCount = window.fullResultsData.filter(item => !item.is_compatible && !item.error && item.relative_path !== undefined).length;

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

function getSelectedFilter() {
    const r = document.querySelector('input[name="result-filter"]:checked');
    return r ? r.value : 'all';
}

function applyFilterAndRenderTable() {
    const filterValue = getSelectedFilter();
    let filteredData = [];
    const dataToFilter = (Array.isArray(window.fullResultsData)) ? window.fullResultsData : [];

    if (dataToFilter.length === 1 && dataToFilter[0]?.message && dataToFilter[0]?.relative_path === undefined && dataToFilter[0]?.status === undefined) {
        filteredData = dataToFilter;
        if (window.statusMessage) window.statusMessage.textContent = "No files scanned yet — choose a directory and profile to begin.";
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
    if (!window.resultsTableBody) { return; }
    window.resultsTableBody.innerHTML = '';
    const colCount = 7;
    const dataIsArray = Array.isArray(resultsToDisplay);
    const isEmpty = !dataIsArray || resultsToDisplay.length === 0;
    const isFixResults = dataIsArray && resultsToDisplay.length > 0 && resultsToDisplay[0]?.status !== undefined && resultsToDisplay[0]?.relative_path !== undefined;
    const isMessageResult = dataIsArray && resultsToDisplay.length === 1 && resultsToDisplay[0]?.message !== undefined && resultsToDisplay[0]?.relative_path === undefined && !isFixResults;

    if (isMessageResult) {
        const row = window.resultsTableBody.insertRow();
        const cell = row.insertCell(); cell.colSpan = colCount; cell.textContent = resultsToDisplay[0].message;
    } else if (isEmpty) {
        const row = window.resultsTableBody.insertRow();
        const cell = row.insertCell(); cell.colSpan = colCount;
        const filterVal = getSelectedFilter();
        cell.textContent = (filterVal === 'attention' && currentTaskType !== 'fix') ? "No items match 'Needs Attention' filter."
            : (currentTaskType === 'fix' ? "No fix results available."
                : "Scan results will appear here.");
    } else if (dataIsArray) {
        resultsToDisplay.forEach(item => {
            const row = window.resultsTableBody.insertRow();
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
    if (!window.resultsSummary) return;
    let summaryText = "";
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
    window.resultsSummary.textContent = summaryText;
}
