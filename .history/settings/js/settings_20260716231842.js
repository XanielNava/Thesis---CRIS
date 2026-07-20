// js/settings.js

import { db, collection, addDoc, writeBatch, doc, getDocs, query, orderBy } from '../js/settings-firebase.js';

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
            
            // Temporarily replace the label's text while keeping the input element inside
            uploadLabel.innerHTML = `📄 <strong>${file.name}</strong> <span style="color: #e25c1d; font-weight: bold;">[${fileExt}]</span> (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
            uploadLabel.appendChild(fileInput);
        } else {
            resetUploadLabel();
        }
    });

    // 3. Handle data parsing & database upload when "Upload & Process" is clicked
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
        uploadBtn.textContent = 'Parsing & Uploading...';

        const reader = new FileReader();

        reader.onload = async function (e) { // Marked as async for Firestore writes
            try {
                const data = new Uint8Array(e.target.result);
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
                    totalCasesCount = maleCasesCount + femaleCasesCount; // Equals 18,233 (corrected totality)
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

                // Save clean data locally
                parsedData = cleanData; 

                const facilityCount = cleanData.length;
                const formattedCases = totalCasesCount.toLocaleString();
                const uploadTime = new Date().toLocaleString('en-US', { 
                    month: '2-digit', 
                    day: '2-digit', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true 
                });

                // =======================================================
                // --- FIRESTORE BATCH COMMITTAL WRITE ---
                // =======================================================
                console.log("⚡ [CRIS] Preparing database transaction batch...");
                const batch = writeBatch(db);

                // 1. Queue all facility cases
                cleanData.forEach(row => {
                    const docRef = doc(collection(db, "rabies_cases"));
                    const maleValue = maleKey ? (parseFloat(row[maleKey]) || 0) : 0;
                    const femaleValue = femaleKey ? (parseFloat(row[femaleKey]) || 0) : 0;

                    batch.set(docRef, {
                        facilityName: row[matchedMunicipality].toString().trim(),
                        year: row[matchedYear],
                        maleCases: maleValue,
                        femaleCases: femaleValue,
                        totalCases: maleValue + femaleValue,
                        uploadedAt: new Date()
                    });
                });

                // 2. Queue upload history log entry
                const logRef = doc(collection(db, "import_history"));
                batch.set(logRef, {
                    fileName: file.name,
                    totalCases: totalCasesCount,
                    totalFacilities: facilityCount,
                    timestamp: new Date(),
                    status: "Completed"
                });

                console.log(`📤 [CRIS] Uploading ${facilityCount} facility documents to Firestore...`);
                await batch.commit();
                console.log("✅ [CRIS] Batch commit completed successfully!");

                // =======================================================
                // --- UI SUCCESS REACTION ---
                // =======================================================
                const displayRecordString = `${formattedCases} Cases (${facilityCount} Facilities)`;
                addHistoryRow(uploadTime, file.name, displayRecordString, 'Completed');

                let alertDetails = `🎉 Success! Dataset written to Firestore.\n\n` +
                    `📁 File: ${file.name}\n` +
                    `📊 Calculated Totality: ${formattedCases} patients\n` +
                    `📍 Monitored Locations: ${facilityCount} facilities\n\n`;
                
                if (maleKey && femaleKey) {
                    alertDetails += `Calculated Breakdown:\n` +
                        `♂️ Male Patients: ${maleCasesCount.toLocaleString()}\n` +
                        `♀️ Female Patients: ${femaleCasesCount.toLocaleString()}\n`;
                }

                alert(alertDetails);

                resetUploadLabel();
                fileInput.value = ''; 

            } catch (error) {
                console.error("🔥 [CRIS] Process failed:", error);
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
            <td><strong>${records}</strong></td>
            <td><span class="badge ${statusClass}">${status}</span></td>
        `;

        if (historyTableBody) {
            historyTableBody.insertBefore(tr, historyTableBody.firstChild);
        }
    }

    // Optional: Load and display history entries dynamically on page boot
    async function loadImportHistory() {
        if (!historyTableBody) return;
        try {
            const q = query(collection(db, "import_history"), orderBy("timestamp", "desc"));
            const querySnapshot = await getDocs(q);
            historyTableBody.innerHTML = ''; // clear table
            
            querySnapshot.forEach((doc) => {
                const data = doc.data();
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