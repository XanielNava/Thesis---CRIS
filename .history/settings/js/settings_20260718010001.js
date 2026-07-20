// js/settings.js

import { db, collection, writeBatch, doc, getDocs, query, orderBy } from '../js/settings-firebase.js';

document.addEventListener('DOMContentLoaded', () => {
    
    // =========================================================================
    // 📂 CARD 1: CASE DATA IMPORT LOGIC
    // =========================================================================
    let caseCardElement = null;
    const headings = document.querySelectorAll('h3.card-title');
    for (const h3 of headings) {
        if (h3.textContent.includes('Import Case Data')) {
            caseCardElement = h3.closest('section.card');
            break;
        }
    }

    if (caseCardElement) {
        const fileInput = caseCardElement.querySelector('#caseDataFile');
        const uploadLabel = caseCardElement.querySelector('label.file-upload');
        const uploadBtn = caseCardElement.querySelector('.card-actions .btn-primary');
        const defaultLabelText = "📤 Click to upload (CSV, XLSX, max 10MB)";
        let selectedFile = null;
        let parsedData = null;

        if (uploadBtn) uploadBtn.disabled = false;
        if (fileInput) {
            fileInput.addEventListener('click', () => { fileInput.value = null; });
            fileInput.addEventListener('change', handleCaseFileSelection);
        }
        if (uploadBtn) uploadBtn.addEventListener('click', handleProcessCaseUpload);

        function handleCaseFileSelection(e) {
            const file = e.target.files[0];
            if (!file) { resetToEmptyState(); return; }
            const fileExt = file.name.split('.').pop().toUpperCase();
            if (fileExt !== 'XLSX' && fileExt !== 'XLS' && fileExt !== 'CSV') {
                alert("❌ Invalid File Type: Please upload an Excel (.xlsx, .xls) or CSV file.");
                resetToEmptyState(); return;
            }

            const reader = new FileReader();
            reader.onload = function(evt) {
                try {
                    const data = new Uint8Array(evt.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
                    if (jsonData.length === 0) throw new Error("The selected spreadsheet is empty.");

                    let rawHeaders = Object.keys(jsonData[0]);
                    const normalize = (str) => str.toString().toLowerCase().replace(/[^a-z0-9]/g, '');

                    const matchedMunicipality = rawHeaders.find(header => {
                        const hNorm = normalize(header);
                        return hNorm === 'abtc' || hNorm.includes('municipality') || hNorm.includes('location') || hNorm.includes('facility');
                    }) || rawHeaders[0];

                    let matchedYear = rawHeaders.find(header => normalize(header).includes('year') || normalize(header).includes('date'));
                    if (!matchedYear) {
                        matchedYear = "Assigned Year (Default)";
                        jsonData.forEach(row => { row[matchedYear] = new Date().getFullYear(); });
                    }

                    const cleanData = jsonData.filter(row => {
                        const val = row[matchedMunicipality];
                        if (!val) return false;
                        const cleanVal = val.toString().trim().toLowerCase();
                        return Object.keys(row).length > 0 && cleanVal !== 'total' && cleanVal !== 'grand total' && cleanVal !== '';
                    });

                    let maleKey = null, femaleKey = null;
                    for (let i = 0; i < Math.min(jsonData.length, 3); i++) {
                        Object.keys(jsonData[i]).forEach(key => {
                            const cellVal = jsonData[i][key].toString().trim().toLowerCase();
                            if (cellVal === 'male') maleKey = key;
                            else if (cellVal === 'female') femaleKey = key;
                        });
                    }

                    let totalCasesCount = 0, maleCasesCount = 0, femaleCasesCount = 0;
                    if (maleKey && femaleKey) {
                        cleanData.forEach(row => {
                            maleCasesCount += parseFloat(row[maleKey]) || 0;
                            femaleCasesCount += parseFloat(row[femaleKey]) || 0;
                        });
                        totalCasesCount = maleCasesCount + femaleCasesCount;
                    } else {
                        cleanData.forEach(row => {
                            Object.keys(row).forEach(k => {
                                if (k !== matchedMunicipality && k !== matchedYear) {
                                    const val = parseFloat(row[k]); if (!isNaN(val)) totalCasesCount += val;
                                }
                            });
                        });
                    }

                    selectedFile = file;
                    parsedData = { cleanData, matchedMunicipality, matchedYear, maleKey, femaleKey, totalCasesCount, maleCasesCount, femaleCasesCount, facilityCount: cleanData.length };
                    
                    uploadLabel.innerHTML = `
                        <button type="button" style="background: none; border: 2px dashed #d0d0d0; padding: 12px 16px; width: 100%; text-align: center; cursor: pointer; border-radius: 6px; font-size: 14px;" id="caseFileSelectBtn">📥 Change file...</button>
                        <div style="margin-top: 12px; padding: 10px 12px; background-color: #f5f5f5; border-radius: 6px; display: flex; justify-content: space-between;"><span style="font-weight: 600;">${file.name}</span></div>
                    `;
                    uploadLabel.querySelector('#caseFileSelectBtn').addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });
                } catch (err) { alert(`❌ Validation Failed:\n${err.message}`); resetToEmptyState(); }
            };
            reader.readAsArrayBuffer(file);
        }

        function resetToEmptyState() { selectedFile = null; parsedData = null; uploadLabel.innerHTML = defaultLabelText; if (fileInput) fileInput.value = null; }

        async function handleProcessCaseUpload() {
            if (!selectedFile || !parsedData) { alert('Please select a file first.'); return; }
            uploadBtn.disabled = true; uploadBtn.textContent = 'Processing...';
            try {
                let batch = writeBatch(db); let opCount = 0;
                for (const row of parsedData.cleanData) {
                    if (opCount >= 500) { await batch.commit(); batch = writeBatch(db); opCount = 0; }
                    const docRef = doc(collection(db, "rabies_cases"));
                    const mVal = parsedData.maleKey ? (parseFloat(row[parsedData.maleKey]) || 0) : 0;
                    const fVal = parsedData.femaleKey ? (parseFloat(row[parsedData.femaleKey]) || 0) : 0;
                    batch.set(docRef, { facilityName: row[parsedData.matchedMunicipality].toString().trim(), year: row[parsedData.matchedYear], maleCases: mVal, femaleCases: fVal, totalCases: mVal + fVal, uploadedAt: new Date() });
                    opCount++;
                }
                const logRef = doc(collection(db, "import_history"));
                batch.set(logRef, { fileName: selectedFile.name, totalCases: parsedData.totalCasesCount, totalFacilities: parsedData.facilityCount, timestamp: new Date(), status: "Completed" });
                await batch.commit();
                document.dispatchEvent(new CustomEvent("importHistoryUpdated"));
                addHistoryRow(new Date().toLocaleString(), selectedFile.name, `${parsedData.totalCasesCount.toLocaleString()} Cases`, 'Completed');
                alert('Success! Case data uploaded.');
                resetToEmptyState();
            } catch (e) { alert('Upload failed: ' + e.message); } finally { uploadBtn.disabled = false; uploadBtn.textContent = 'Process Upload'; }
        }
    }


    // =========================================================================
    // 👥 CARD 2: POPULATION DATA IMPORT LOGIC (NEW FIXED CODE)
    // =========================================================================
    let popCardElement = null;
    for (const h3 of headings) {
        if (h3.textContent.includes('Import Population Data') || h3.textContent.includes('Population')) {
            popCardElement = h3.closest('section.card');
            break;
        }
    }

    if (popCardElement) {
        const popFileInput = popCardElement.querySelector('input[type="file"]');
        const popUploadLabel = popCardElement.querySelector('label.file-upload');
        const popUploadBtn = popCardElement.querySelector('.card-actions .btn-primary');
        
        let popSelectedFile = null;
        let popParsedData = null;

        if (popFileInput) {
            popFileInput.addEventListener('click', () => { popFileInput.value = null; });
            popFileInput.addEventListener('change', handlePopFileSelection);
        }
        if (popUploadBtn) popUploadBtn.addEventListener('click', handleProcessPopUpload);

        function handlePopFileSelection(e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(evt) {
                try {
                    const data = new Uint8Array(evt.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
                    
                    if (jsonData.length === 0) throw new Error("The population spreadsheet is empty.");

                    let headers = Object.keys(jsonData[0]);
                    
                    // Match Municipality Column
                    let munHeader = headers.find(h => h.toLowerCase().includes('municipality') || h.toLowerCase().includes('town') || h.toLowerCase().includes('city'));
                    // Match Total Population Column
                    let popHeader = headers.find(h => h.toLowerCase().includes('totalpopulation') || h.toLowerCase().includes('total population') || h.toLowerCase().includes('population'));

                    // Strict Schema Enforcement Fallback
                    if (!munHeader) munHeader = headers[0];
                    if (!popHeader) popHeader = headers.find(h => h.toLowerCase().includes('pop') || h.toLowerCase().includes('human'));

                    if (!popHeader) throw new Error("Could not automatically locate a 'totalPopulation' field column header.");

                    // Filter out header text anomalies or total summation rows safely
                    const cleanPopLines = jsonData.filter(row => {
                        if (!row[munHeader]) return false;
                        const text = row[munHeader].toString().trim().toLowerCase();
                        return text !== 'total' && text !== 'grand total' && text !== '';
                    });

                    popSelectedFile = file;
                    popParsedData = { cleanPopLines, munHeader, popHeader };

                    popUploadLabel.innerHTML = `<div style="padding: 10px; background: #e3f2fd; color:#0d47a1; border-radius:6px;">Selected Population Data File: <b>${file.name}</b></div>`;
                } catch (err) {
                    alert(`❌ Population Validation Failed:\n${err.message}`);
                    popFileInput.value = null;
                }
            };
            reader.readAsArrayBuffer(file);
        }

        async function handleProcessPopUpload() {
            if (!popSelectedFile || !popParsedData) { alert('Please select a population file first.'); return; }
            popUploadBtn.disabled = true; popUploadBtn.textContent = 'Saving to Firestore...';

            try {
                let batch = writeBatch(db);
                let count = 0;

                for (const row of popParsedData.cleanPopLines) {
                    if (count >= 500) { await batch.commit(); batch = writeBatch(db); count = 0; }

                    const docRef = doc(collection(db, "population_data"));
                    
                    // Force fields to perfectly match your Firestore console visual layout schema structures
                    batch.set(docRef, {
                        municipality: row[popParsedData.munHeader].toString().trim().toUpperCase(), // Stores as "MINA"
                        totalPopulation: Number(row[popParsedData.popHeader]) || 0,
                        householdPopulation: Number(row[popParsedData.popHeader]) || 0, // Fallback mirror field
                        numberofHouseholds: 0,
                        uploadedAt: new Date()
                    });
                    count++;
                }

                // Append an audit log trail entry inside the action log
                const logRef = doc(collection(db, "import_history"));
                batch.set(logRef, {
                    fileName: popSelectedFile.name,
                    totalCases: 0, 
                    totalFacilities: count,
                    timestamp: new Date(),
                    status: "Completed (Population)"
                });

                await batch.commit();
                addHistoryRow(new Date().toLocaleString(), popSelectedFile.name, `${count} Municipalities Saved`, 'Completed');
                alert(`✅ Success! Population records correctly written to Firestore.`);
                
                popUploadLabel.innerHTML = "📤 Click to upload (CSV, XLSX, max 10MB)";
                popSelectedFile = null; popParsedData = null;
            } catch (err) {
                console.error(err);
                alert('Firestore Error: ' + err.message);
            } finally {
                popUploadBtn.disabled = false; popUploadBtn.textContent = 'Process Upload';
            }
        }
    }

    // =========================================================================
    // ⏳ SHARED LOG HISTORIES & VIEW HANDLERS
    // =========================================================================
    let historyTableBody = document.getElementById('uploadHistoryTableBody');

    function addHistoryRow(date, fileName, records, status) {
        if (!historyTableBody) return;
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${date}</td><td style="font-family: monospace;">${fileName}</td><td><strong>${records}</strong></td><td><span class="badge success">${status}</span></td>`;
        historyTableBody.insertBefore(tr, historyTableBody.firstChild);
    }

    async function loadImportHistory() {
        if (!historyTableBody) return;
        try {
            const q = query(collection(db, "import_history"), orderBy("timestamp", "desc"));
            const querySnapshot = await getDocs(q);
            historyTableBody.innerHTML = '';

            querySnapshot.forEach((docSnapshot) => {
                const data = docSnapshot.data();
                let dateObj = data.timestamp?.seconds ? new Date(data.timestamp.seconds * 1000) : new Date();
                const descText = data.totalCases > 0 ? `${data.totalCases} Cases` : `${data.totalFacilities} Locations`;
                addHistoryRow(dateObj.toLocaleString(), data.fileName || 'unknown_file', descText, data.status || 'Completed');
            });
        } catch (error) { console.error(error); }
    }

    loadImportHistory();
});