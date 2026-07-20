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

                // --- ROBUST HEADER SCANNER & NORMALIZATION ---
                let rawHeaders = Object.keys(jsonData[0]);
                
                // Scan the top 5 rows to combine potential merged headers (e.g., "ABTC", "Human Bite Case")
                let sampleHeadersCombined = [...rawHeaders];
                for (let i = 0; i < Math.min(jsonData.length, 5); i++) {
                    Object.keys(jsonData[i]).forEach(key => {
                        const val = jsonData[i][key];
                        if (val !== undefined && val !== null && val !== "") {
                            sampleHeadersCombined.push(val.toString());
                        }
                    });
                }

                // Normalize strings (lowercase, remove spaces, trim) for robust matching
                const normalize = (str) => str.toString().toLowerCase().replace(/[^a-z0-9]/g, '');

                // 1. Locate Location/Facility/ABTC Column
                const matchedMunicipality = rawHeaders.find(header => {
                    const hNorm = normalize(header);
                    // Check top-level key first
                    if (hNorm === 'abtc' || hNorm.includes('municipality') || hNorm.includes('location') || hNorm.includes('town') || hNorm.includes('facility') || hNorm.includes('hospital')) {
                        return true;
                    }
                    // Check if any sample cells under this column contained these terms
                    return sampleHeadersCombined.some(sampleVal => {
                        const sNorm = normalize(sampleVal);
                        return sNorm === 'abtc' || sNorm.includes('municipality') || sNorm.includes('facility');
                    });
                }) || rawHeaders[0]; // Fallback to the very first column if all else fails

                // 2. Locate Year/Time Column
                let matchedYear = rawHeaders.find(header => {
                    const hNorm = normalize(header);
                    return hNorm.includes('year') || hNorm.includes('yr') || hNorm.includes('date') || hNorm.includes('time');
                });

                if (!matchedYear) {
                    // Fallback: Assign a default year column if not found
                    matchedYear = "Assigned Year (Default)";
                    jsonData.forEach(row => {
                        row[matchedYear] = new Date().getFullYear();
                    });
                }

                // 3. Locate Total Cases/Bites Column (looking for "human bite case", "total", "cases", "bites")
                const matchedBites = rawHeaders.find(header => {
                    const hNorm = normalize(header);
                    return hNorm.includes('bite') || hNorm.includes('case') || hNorm.includes('count') || hNorm.includes('total');
                }) || rawHeaders.find(header => normalize(header).includes('total'));

                // Validate minimum matches
                if (!matchedMunicipality || !matchedBites) {
                    let missing = [];
                    if (!matchedMunicipality) missing.push("'ABTC/Municipality/Location'");
                    if (!matchedBites) missing.push("'Bite Cases/Total Count'");

                    throw new Error(
                        `Missing required column(s): ${missing.join(', ')}.\n\n` +
                        `Detected columns:\n[ ${rawHeaders.filter(h => !h.startsWith('__EMPTY')).join(', ')} ]`
                    );
                }

                // Clean data: Strip out top structural empty rows, structural headers, and the "Total" row at the bottom
                const cleanData = jsonData.filter(row => {
                    const val = row[matchedMunicipality];
                    if (!val) return false;
                    
                    const strVal = val.toString().trim();
                    const cleanVal = strVal.toLowerCase();

                    // Reject structural headers or bottom summary totals
                    if (cleanVal === 'abtc' || cleanVal === 'total' || cleanVal === 'grand total' || cleanVal === '') {
                        return false;
                    }
                    // Reject rows that are purely placeholders (like 'male' / 'female' / '< 15' helper cells from merged headers)
                    if (cleanVal === 'male' || cleanVal === 'female' || cleanVal.includes('<') || cleanVal.includes('>')) {
                        return false;
                    }

                    return true;
                });

                // Save validated dataset
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

                // Add to UI history table
                addHistoryRow(uploadTime, file.name, recordCount, 'Completed');

                // Success notification outlining mapping
                alert(
                    `🎉 Success! File Processed.\n\n` +
                    `📁 File Type: ${fileExt.toUpperCase()}\n` +
                    `📄 Sheet Name: "${firstSheetName}"\n` +
                    `📊 Processed Locations: ${recordCount} facilities (Hospitals, RHUs, & ABTCs)\n\n` +
                    `Mapped Columns:\n` +
                    `📍 Location ➔ "${matchedMunicipality}"\n` +
                    `📅 Timeframe ➔ "${matchedYear}"\n` +
                    `🐕 Cases ➔ "${matchedBites}"`
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