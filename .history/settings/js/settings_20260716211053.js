// js/settings.js

document.addEventListener('DOMContentLoaded', () => {
    // 1. Target elements precisely from your HTML structure
    const fileInput = document.getElementById('caseDataFile');
    const uploadLabel = fileInput.closest('.file-upload');
    const uploadBtn = fileInput.closest('.card').querySelector('.card-actions .btn-primary');
    const historyTableBody = document.getElementById('uploadHistoryTableBody');

    // Default placeholder text from your HTML
    const defaultLabelText = "📤 Click to upload (CSV, XLSX, max 10MB)";
    let parsedData = null; 

    // 2. Handle visual change when a file is selected
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const fileExt = file.name.split('.').pop().toUpperCase();
            
            // We temporarily replace the label's text, but make sure to keep the input element inside it!
            uploadLabel.innerHTML = `📄 <strong>${file.name}</strong> <span style="color: #e25c1d; font-weight: bold;">[${fileExt}]</span> (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
            // Re-append the file input so it doesn't get lost from the DOM
            uploadLabel.appendChild(fileInput);
        } else {
            resetUploadLabel();
        }
    });

    // 3. Handle data parsing when "Upload & Process" is clicked
    uploadBtn.addEventListener('click', () => {
        const file = fileInput.files[0];
        if (!file) {
            alert('Please select a file to upload first.');
            return;
        }

        const fileExt = file.name.split('.').pop().toLowerCase();
        const originalBtnText = uploadBtn.textContent;
        
        // Show progress state
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Parsing Spreadsheet...';

        const reader = new FileReader();

        reader.onload = function (e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Parse spreadsheet to JSON. range: 0 keeps headers, but we sanitize empty rows dynamically.
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

                if (jsonData.length === 0) {
                    throw new Error("The selected spreadsheet is empty.");
                }

                // --- SMART HEADER SCANNER & NORMALIZATION ---
                // Get headers from the first non-empty data row if they are nested
                let rawHeaders = Object.keys(jsonData[0]);
                
                // Look for alternative headers in the first couple of rows in case of merged header cells
                let sampleRow = jsonData[0];
                let combinedHeaders = [...rawHeaders];
                for (let i = 0; i < Math.min(jsonData.length, 3); i++) {
                    Object.keys(jsonData[i]).forEach(k => {
                        if (jsonData[i][k] && typeof jsonData[i][k] === 'string') {
                            combinedHeaders.push(jsonData[i][k]);
                        }
                    });
                }

                const cleanHeaders = combinedHeaders.map(h => h.toString().trim().toLowerCase());
                
                // 1. Locate the Location/ABTC column (Matches: "abtc", "municipality", "location", "town", "city")
                const matchedMunicipality = rawHeaders.find((_, i) => {
                    const h = cleanHeaders[i] || "";
                    return h.includes('abtc') || h.includes('municipality') || h.includes('location') || h.includes('town') || h.includes('city');
                }) || rawHeaders[0]; // Fallback to first column (which is ABTC in your sheet)

                // 2. Locate the Year/Time column 
                // (Since "Year" isn't explicitly in this summary sheet, we can default to current year or fallback smartly)
                let matchedYear = rawHeaders.find((_, i) => {
                    const h = cleanHeaders[i] || "";
                    return h.includes('year') || h.includes('yr') || h.includes('date');
                });

                if (!matchedYear) {
                    // Fallback: If no year column is found, we'll assign a default current year column programmatically
                    matchedYear = "Assigned Year (Default)";
                    jsonData.forEach(row => {
                        row[matchedYear] = new Date().getFullYear();
                    });
                }

                // 3. Locate the Cases/Bite column (Matches "human bite case", "bite", "case", "count", "total")
                const matchedBites = rawHeaders.find((_, i) => {
                    const h = cleanHeaders[i] || "";
                    return h.includes('bite') || h.includes('case') || h.includes('count') || h.includes('total');
                }) || rawHeaders.find(h => h.toLowerCase().includes('total'));

                // Final Validation Guard
                if (!matchedMunicipality || !matchedBites) {
                    let missing = [];
                    if (!matchedMunicipality) missing.push("'ABTC/Municipality/Location'");
                    if (!matchedBites) missing.push("'Bite Cases/Total Count'");

                    throw new Error(
                        `Missing required column(s): ${missing.join(', ')}.\n\n` +
                        `Detected columns:\n[ ${rawHeaders.filter(h => !h.startsWith('__EMPTY')).join(', ')} ]\n\n` +
                        `Please ensure your table includes ABTC locations and bite count columns.`
                    );
                }

                // Clean data: remove sub-header rows (like Row 2/3 containing 'Male/Female' or empty entries)
                const cleanData = jsonData.filter(row => {
                    const val = row[matchedMunicipality];
                    return val && typeof val === 'string' && val.trim() !== "" && val.toLowerCase() !== 'total' && !val.toLowerCase().includes('abtc');
                });

                // Save validated dataset for Firestore
                parsedData = cleanData; 

                const recordCount = cleanData.length.toLocaleString();
                const uploadTime = new Date().toLocaleString('en-US', { 
                    month: '2-digit', 
                    day: '2-digit', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true 
                });

                // Add to history table
                addHistoryRow(uploadTime, file.name, recordCount, 'Completed');

                // Dynamic success alert mapping the spreadsheet columns
                alert(
                    `🎉 Success! File Processed.\n\n` +
                    `📁 File Type: ${fileExt.toUpperCase()}\n` +
                    `📄 Sheet Name: "${firstSheetName}"\n` +
                    `📊 Processed Locations: ${recordCount} ABTCs\n\n` +
                    `Mapped Columns:\n` +
                    `📍 Location/ABTC ➔ "${matchedMunicipality}"\n` +
                    `📅 Timeframe ➔ "${matchedYear}"\n` +
                    `🐕 Cases Column ➔ "${matchedBites}"`
                );

                resetUploadLabel();
                fileInput.value = ''; 

            } catch (error) {
                console.error("Processing failed: ", error);
                alert(`⚠️ Upload Failed:\n${error.message}`);
            } finally {
                uploadBtn.disabled = false;
                uploadBtn.textContent = originalBtnText;
            }
        };

        reader.readAsArrayBuffer(file);
    });

    // Helper: Restore default text without dropping input element
    function resetUploadLabel() {
        if (uploadLabel) {
            uploadLabel.innerHTML = defaultLabelText;
            uploadLabel.appendChild(fileInput);
        }
    }

    // Helper: Push row to target history table
    function addHistoryRow(date, fileName, records, status) {
        const tr = document.createElement('tr');
        const statusClass = status.toLowerCase() === 'completed' ? 'success' : 'danger';

        tr.innerHTML = `
            <td>${date}</td>
            <td style="font-family: monospace;">${fileName}</td>
            <td>${records}</td>
            <td><span class="badge ${statusClass}">${status}</span></td>
        `;

        if (historyTableBody) {
            historyTableBody.insertBefore(tr, historyTableBody.firstChild);
        }
    }
});