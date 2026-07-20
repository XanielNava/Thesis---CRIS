// js/settings.js

import { db, collection, addDoc, writeBatch, doc, getDocs, query, orderBy } from '../js/settings-firebase.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Locate the specific card container for CASE DATA by searching for its title text
    let caseCardElement = null;
    const headings = document.querySelectorAll('h3.card-title');
    for (const h3 of headings) {
        if (h3.textContent.includes('Import Case Data')) {
            caseCardElement = h3.closest('section.card');
            break;
        }
    }

    if (!caseCardElement) {
        console.error("Case data card element not found.");
        return;
    }

    // 2. Select DOM Elements scoped strictly within the case data card
    const fileInput = caseCardElement.querySelector('#caseDataFile');
    const uploadLabel = caseCardElement.querySelector('label.file-upload');
    const uploadBtn = caseCardElement.querySelector('.card-actions .btn-primary');

    const defaultLabelText = "📤 Click to upload (CSV, XLSX, max 10MB)";
    let selectedFile = null;
    let parsedData = null;
    let historyTableBody = document.getElementById('uploadHistoryTableBody');

    // Set the initial state of the process button to enabled so it can be clicked
    if (uploadBtn) uploadBtn.disabled = false;

    // Reset value on click so choosing the same file twice triggers change event
    fileInput.addEventListener('click', () => {
        fileInput.value = null;
    });

    fileInput.addEventListener('change', handleFileSelection);
    if (uploadBtn) uploadBtn.addEventListener('click', handleProcessUpload);

    function handleFileSelection(e) {
        const file = e.target.files[0];
        if (!file) {
            resetToEmptyState();
            return;
        }

        // Boundary 1: Basic extension check
        const fileExt = file.name.split('.').pop().toUpperCase();
        if (fileExt !== 'XLSX' && fileExt !== 'XLS' && fileExt !== 'CSV') {
            alert("❌ Invalid File Type: Please upload an Excel (.xlsx, .xls) or CSV file.");
            resetToEmptyState();
            return;
        }

        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Parse spreadsheet to JSON
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

                if (jsonData.length === 0) {
                    throw new Error("The selected spreadsheet is empty.");
                }

                // --- ROBUST HEADER SCANNER & NORMALIZATION ---
                let rawHeaders = Object.keys(jsonData[0]);
                
                // Scan the top 5 rows to identify nested column structures (like "Male" and "Female" under "Sex")
                let sampleHeadersCombined = [...rawHeaders];
                for (let i = 0; i < Math.min(jsonData.length, 5); i++) {
                    Object.keys(jsonData[i]).forEach(key => {
                        const val = jsonData[i][key];
                        if (val !== undefined && val !== null && val !== "") {
                            sampleHeadersCombined.push(val.toString());
                        }
                    });
                }

                // Normalize strings for matching
                const normalize = (str) => str.toString().toLowerCase().replace(/[^a-z0-9]/g, '');

                // 1. Locate Location/Facility/ABTC Column
                const matchedMunicipality = rawHeaders.find(header => {
                    const hNorm = normalize(header);
                    if (hNorm === 'abtc' || hNorm.includes('municipality') || hNorm.includes('location') || hNorm.includes('town') || hNorm.includes('facility') || hNorm.includes('hospital')) {
                        return true;
                    }
                    return sampleHeadersCombined.some(sampleVal => {
                        const sNorm = normalize(sampleVal);
                        return sNorm === 'abtc' || sNorm.includes('municipality') || sNorm.includes('facility');
                    });
                }) || rawHeaders[0];

                // 2. Locate Year/Time Column
                let matchedYear = rawHeaders.find(header => {
                    const hNorm = normalize(header);
                    return hNorm.includes('year') || hNorm.includes('yr') || hNorm.includes('date') || hNorm.includes('time');
                });

                if (!matchedYear) {
                    matchedYear = "Assigned Year (Default)";
                    jsonData.forEach(row => {
                        row[matchedYear] = new Date().getFullYear();
                    });
                }

                // Filter out non-facility data rows (metadata, subheaders, and the written 'Total' rows)
                const cleanData = jsonData.filter(row => {
                    const val = row[matchedMunicipality];
                    if (!val) return false;
                    
                    const strVal = val.toString().trim();
                    const cleanVal = strVal.toLowerCase();

                    if (cleanVal === 'abtc' || cleanVal === 'total' || cleanVal === 'grand total' || cleanVal === '') {
                        return false;
                    }
                    if (cleanVal === 'male' || cleanVal === 'female' || cleanVal.includes('<') || cleanVal.includes('>')) {
                        return false;
                    }

                    return true;
                });

                if (cleanData.length === 0) {
                    throw new Error("No valid data rows found in the spreadsheet.");
                }

                // --- STATED TOTALITY LOGIC (BYPASS "TOTAL" HEADER) ---
                let maleKey = null;
                let femaleKey = null;

                for (let i = 0; i < Math.min(jsonData.length, 3); i++) {
                    Object.keys(jsonData[i]).forEach(key => {
                        const cellVal = jsonData[i][key].toString().trim().toLowerCase();
                        if (cellVal === 'male') {
                            maleKey = key;
                        } else if (cellVal === 'female') {
                            femaleKey = key;
                        }
                    });
                }

                let totalCasesCount = 0;
                let maleCasesCount = 0;
                let femaleCasesCount = 0;

                if (maleKey && femaleKey) {
                    // Calculate the totality mathematically based only on the sex distribution columns
                    cleanData.forEach(row => {
                        const mVal = parseFloat(row[maleKey]) || 0;
                        const fVal = parseFloat(row[femaleKey]) || 0;
                        maleCasesCount += mVal;
                        femaleCasesCount += fVal;
                    });
                    totalCasesCount = maleCasesCount + femaleCasesCount;
                } else {
                    // Absolute safety fallback
                    cleanData.forEach(row => {
                        Object.keys(row).forEach(k => {
                            if (k !== matchedMunicipality && k !== matchedYear) {
                                const val = parseFloat(row[k]);
                                if (!isNaN(val)) totalCasesCount += val;
                            }
                        });
                    });
                }

                // --- VALIDATION SUCCESSFUL ---
                selectedFile = file;
                parsedData = {
                    cleanData,
                    matchedMunicipality,
                    matchedYear,
                    maleKey,
                    femaleKey,
                    totalCasesCount,
                    maleCasesCount,
                    femaleCasesCount,
                    facilityCount: cleanData.length
                };

                const formattedSize = (file.size / 1024).toFixed(1);

                // Update label to show button - BUTTON-BASED APPROACH
                uploadLabel.innerHTML = `
                    <button type="button" style="
                        background: none;
                        border: 2px dashed #d0d0d0;
                        padding: 12px 16px;
                        width: 100%;
                        text-align: center;
                        cursor: pointer;
                        border-radius: 6px;
                        font-size: 14px;
                        color: #333;
                        font-weight: 500;
                        transition: all 0.2s ease;
                    " id="caseFileSelectBtn">
                        📥 Change selected file...
                    </button>
                    <input type="file" id="caseDataFile" accept=".csv, .xlsx, .xls" style="display: none;">
                    <div style="
                        margin-top: 12px;
                        padding: 10px 12px;
                        background-color: #f5f5f5;
                        border-radius: 6px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    ">
                        <span style="font-weight: 600; color: #333; font-size: 13px;">${file.name}</span>
                        <span style="font-size: 12px; color: #666;">(${formattedSize} KB)</span>
                    </div>
                `;

                // Re-bind the button and file input
                const newBtn = uploadLabel.querySelector('#caseFileSelectBtn');
                const newInput = uploadLabel.querySelector('#caseDataFile');
                
                newBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    newInput.click();
                });

                newInput.addEventListener('click', () => { 
                    newInput.value = null; 
                });
                newInput.addEventListener('change', handleFileSelection);

                if (uploadBtn) {
                    uploadBtn.disabled = false;
                }

            } catch (err) {
                console.error("Error reading spreadsheet: ", err);
                alert(`❌ Validation Failed:\n${err.message}`);
                resetToEmptyState();
            }
        };

        reader.readAsArrayBuffer(file);
    }

    function resetToEmptyState() {
        selectedFile = null;
        parsedData = null;

        uploadLabel.innerHTML = defaultLabelText;
        uploadLabel.appendChild(fileInput);

        // Keep button enabled so the user can still trigger the alert if they click upload
        if (uploadBtn) {
            uploadBtn.disabled = false;
        }
    }

    // =========================================================================
    // 🚀 BATCH UPLOAD & IMPORT LOG SYNC
    // =========================================================================
    async function handleProcessUpload() {
        if (!selectedFile || !parsedData) {
            alert('⚠️ Please select a file first.');
            return;
        }

        const originalBtnText = uploadBtn.textContent;
        uploadBtn.disabled = true;
        uploadBtn.textContent = '⏳ Processing...';

        try {
            console.log("⚡ [CRIS] Preparing database transaction batch for Case Data...");
            const batch = writeBatch(db);

            // 1. Queue all facility cases
            parsedData.cleanData.forEach(row => {
                const docRef = doc(collection(db, "rabies_cases"));
                const maleValue = parsedData.maleKey ? (parseFloat(row[parsedData.maleKey]) || 0) : 0;
                const femaleValue = parsedData.femaleKey ? (parseFloat(row[parsedData.femaleKey]) || 0) : 0;

                batch.set(docRef, {
                    facilityName: row[parsedData.matchedMunicipality].toString().trim(),
                    year: row[parsedData.matchedYear],
                    maleCases: maleValue,
                    femaleCases: femaleValue,
                    totalCases: maleValue + femaleValue,
                    uploadedAt: new Date()
                });
            });

            // 2. Queue upload history log entry
            const logRef = doc(collection(db, "import_history"));
            batch.set(logRef, {
                fileName: selectedFile.name,
                totalCases: parsedData.totalCasesCount,
                totalFacilities: parsedData.facilityCount,
                timestamp: new Date(),
                status: "Completed"
            });

            console.log(`📤 [CRIS] Uploading ${parsedData.facilityCount} facility documents to Firestore...`);
            await batch.commit();
            console.log("✅ [CRIS] Batch commit completed successfully!");

            // Dispatch event to inform any listeners to refresh import history
            const refreshEvent = new CustomEvent("importHistoryUpdated");
            document.dispatchEvent(refreshEvent);

            const formattedCases = parsedData.totalCasesCount.toLocaleString();
            const uploadTime = new Date().toLocaleString('en-US', { 
                month: '2-digit', 
                day: '2-digit', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true 
            });

            // Add to history table
            addHistoryRow(uploadTime, selectedFile.name, `${formattedCases} Cases (${parsedData.facilityCount} Facilities)`, 'Completed');

            let alertDetails = `🎉 Success! Case data uploaded to Firestore.\n\n` +
                `📁 File: ${selectedFile.name}\n` +
                `📊 Calculated Totality: ${formattedCases} patients\n` +
                `📍 Monitored Locations: ${parsedData.facilityCount} facilities\n\n`;
            
            if (parsedData.maleKey && parsedData.femaleKey) {
                alertDetails += `Calculated Breakdown:\n` +
                    `♂️ Male Patients: ${parsedData.maleCasesCount.toLocaleString()}\n` +
                    `♀️ Female Patients: ${parsedData.femaleCasesCount.toLocaleString()}\n`;
            }

            alert(alertDetails);
            
            resetToEmptyState();

        } catch (error) {
            console.error("Database upload failed: ", error);
            alert('Upload failed: ' + error.message);
        } finally {
            uploadBtn.disabled = false;
            uploadBtn.textContent = originalBtnText;
        }
    }

    // Helper: Add a row to the history table
    function addHistoryRow(date, fileName, records, status) {
        if (!historyTableBody) return;

        const tr = document.createElement('tr');
        const statusClass = status.toLowerCase() === 'completed' ? 'success' : 'danger';

        tr.innerHTML = `
            <td>${date}</td>
            <td style="font-family: monospace;">${fileName}</td>
            <td><strong>${records}</strong></td>
            <td><span class="badge ${statusClass}">${status}</span></td>
        `;

        historyTableBody.insertBefore(tr, historyTableBody.firstChild);
    }

    // Load and display history entries dynamically on page boot
    async function loadImportHistory() {
        if (!historyTableBody) return;
        try {
            const q = query(collection(db, "import_history"), orderBy("timestamp", "desc"));
            const querySnapshot = await getDocs(q);
            
            querySnapshot.forEach((docSnapshot) => {
                const data = docSnapshot.data();
                const dateString = data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleString('en-US', {
                    month: '2-digit',
                    day: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                }) : 'N/A';
                
                addHistoryRow(
                    dateString, 
                    data.fileName || 'unknown_file', 
                    `${(data.totalCases || 0).toLocaleString()} Cases (${data.totalFacilities || 0} Facilities)`, 
                    data.status || 'Completed'
                );
            });
        } catch (error) {
            console.error("Failed to fetch initial import logs:", error);
        }
    }

    // Boot up the log loader
    loadImportHistory();
});