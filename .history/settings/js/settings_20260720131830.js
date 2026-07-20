// ============================================================================
// SETTINGS.JS
// Community-Centric Rabies Intelligence System (CRIS)
// ============================================================================



// ============================================================================
// SECTION 1 - IMPORT FIREBASE MODULES
// ============================================================================

import {
    db,
    collection,
    writeBatch,
    doc,
    getDocs,
    query,
    orderBy
} from "../js/settings-firebase.js";



// ============================================================================
// SECTION 2 - PAGE INITIALIZATION
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {

    // ========================================================================
    // GLOBAL ELEMENTS
    // ========================================================================

    const historyTableBody = document.getElementById("uploadHistoryTableBody");



    // ========================================================================
    // SECTION 3 - REUSABLE IMPORT CARD INITIALIZER
    // ========================================================================

    function initImportSection({

        cardTitle,
        fileInputId,
        collectionName,
        dataType

    }) {

        // ====================================================================
        // Locate the Card by Title
        // ====================================================================

        let cardElement = null;

        const cardHeadings = document.querySelectorAll("h3.card-title");

        for (const heading of cardHeadings) {

            if (heading.textContent.includes(cardTitle)) {

                cardElement = heading.closest("section.card");
                break;

            }

        }

        if (!cardElement) {

            console.error(`Card "${cardTitle}" not found.`);
            return;

        }



        // ====================================================================
        // SECTION 4 - ELEMENT REFERENCES
        // Everything inside this card is isolated from other cards.
        // ====================================================================

        const fileInput = cardElement.querySelector(
            `#${fileInputId}`
        );

        const uploadLabel = cardElement.querySelector(
            "label.file-upload"
        );

        const uploadButton = cardElement.querySelector(
            ".card-actions .btn-primary"
        );



        // ====================================================================
        // SECTION 5 - LOCAL VARIABLES
        // ====================================================================

        const defaultLabelText =
            "📤 Click to upload (CSV, XLSX, max 10MB)";

        let selectedFile = null;

        let parsedData = null;



        // ====================================================================
        // Enable Upload Button
        // ====================================================================

        if (uploadButton) {

            uploadButton.disabled = false;

        }



        // ====================================================================
        // SECTION 6 - FILE INPUT EVENTS
        // ====================================================================

        if (fileInput) {

            // Allows selecting the same file twice

            fileInput.addEventListener("click", () => {

                fileInput.value = "";

            });


            // Fires whenever a new file is chosen

            fileInput.addEventListener(

                "change",

                handleFileSelection

            );

        }



        // ====================================================================
        // SECTION 7 - CLICKABLE LABEL
        // Clicking anywhere inside the upload box opens the file picker.
        // ====================================================================

        attachLabelClickHandler();

        function attachLabelClickHandler() {

            if (!uploadLabel) return;

            uploadLabel.onclick = (event) => {

                // Ignore clicks coming from the remove button

                if (
                    event.target.closest(".file-clear-trigger-btn")
                ) {
                    return;
                }

                if (fileInput) {

                    fileInput.click();

                }

            };

        }



        // ====================================================================
        // SECTION 8 - PROCESS BUTTON
        // ====================================================================

        if (uploadButton) {

            uploadButton.addEventListener(

                "click",

                handleProcessUpload

            );

        }



        // ====================================================================
        // SECTION 9 - FUNCTION PLACEHOLDERS
        // (Implemented in Part 2)
        // ====================================================================

        function handleFileSelection(event) {

            // ====================================================================
// SECTION 9.1 - HANDLE FILE SELECTION
// Reads and validates the selected spreadsheet.
// ====================================================================

function handleFileSelection(event) {

    const file = event.target.files[0];

    // ------------------------------------------------------------
    // No file selected
    // ------------------------------------------------------------

    if (!file) {

        resetToEmptyState();
        return;

    }


    // ------------------------------------------------------------
    // Validate file extension
    // ------------------------------------------------------------

    const extension = file.name
        .split(".")
        .pop()
        .toUpperCase();

    const allowedExtensions = ["CSV", "XLS", "XLSX"];

    if (!allowedExtensions.includes(extension)) {

        alert(
            "❌ Invalid file.\n\nPlease upload a CSV, XLS or XLSX file."
        );

        resetToEmptyState();
        return;

    }


    // ------------------------------------------------------------
    // Read Spreadsheet
    // ------------------------------------------------------------

    const reader = new FileReader();

    reader.onload = function (e) {

        try {

            const data = new Uint8Array(e.target.result);

            const workbook = XLSX.read(data, {

                type: "array"

            });

            const firstSheet = workbook.SheetNames[0];

            const worksheet = workbook.Sheets[firstSheet];

            const rawRows = XLSX.utils.sheet_to_json(

                worksheet,

                {
                    header: 1,
                    defval: ""
                }

            );


            // --------------------------------------------------------
            // Basic validation
            // --------------------------------------------------------

            if (rawRows.length < 5) {

                throw new Error(
                    "The spreadsheet does not contain enough rows."
                );

            }


            const cleanData = [];


            // --------------------------------------------------------
            // Parse Spreadsheet
            // Data begins on row index 3.
            // --------------------------------------------------------

            for (

                let rowIndex = 3;

                rowIndex < rawRows.length;

                rowIndex++

            ) {

                const row = rawRows[rowIndex];

                if (!row || row.length < 2) continue;


                const facilityName = row[0]
                    ? row[0].toString().trim()
                    : "";

                if (!facilityName) continue;


                // ----------------------------------------------------
                // Ignore totals
                // ----------------------------------------------------

                const lowerName = facilityName.toLowerCase();

                if (

                    lowerName === "total" ||

                    lowerName === "grand total"

                ) {

                    continue;

                }


                // ----------------------------------------------------
                // Ignore Barangays
                // ----------------------------------------------------

                const barangayIndicators = [

                    "barangay",

                    "brgy",

                    "bgy",

                    "poblacion"

                ];

                const isBarangay = barangayIndicators.some(keyword =>

                    lowerName.includes(keyword)

                );

                if (isBarangay) continue;


                // ----------------------------------------------------
                // Ignore indented rows
                // ----------------------------------------------------

                const rawName = row[0]
                    ? row[0].toString()
                    : "";

                const leadingSpaces =
                    rawName.length -
                    rawName.trimStart().length;

                if (leadingSpaces > 2) {

                    continue;

                }


                // ----------------------------------------------------
                // CASE DATA IMPORT
                // ----------------------------------------------------

                if (dataType === "cases") {

                    cleanData.push({

                        abtc: facilityName,

                        maleCases: Number(row[1]) || 0,

                        femaleCases: Number(row[2]) || 0,

                        ageLt15: Number(row[3]) || 0,

                        ageGt15: Number(row[4]) || 0,

                        bitingDog: Number(row[5]) || 0,

                        bitingCat: Number(row[6]) || 0,

                        bitingOthers: Number(row[7]) || 0,

                        humanCat1: Number(row[8]) || 0,

                        humanCat2: Number(row[9]) || 0,

                        humanCatNew: Number(row[10]) || 0,

                        humanCatBooster: Number(row[11]) || 0,

                        hr: Number(row[12]) || 0,

                        petTcv: Number(row[13]) || 0,

                        petHrig: Number(row[14]) || 0,

                        petErig: Number(row[15]) || 0,

                        total: Number(row[16]) || 0,

                        remarksCompII: Number(row[17]) || 0,

                        remarksCompIII: Number(row[18]) || 0,

                        remarksIncompleteII: Number(row[19]) || 0,

                        remarksIncompleteIII: Number(row[20]) || 0,

                        remarksNoneII: Number(row[21]) || 0,

                        remarksNoneIII: Number(row[22]) || 0,

                        rep: Number(row[23]) || 0

                    });

                }


                // ----------------------------------------------------
                // POPULATION DATA IMPORT
                // ----------------------------------------------------

                else if (dataType === "population") {

                    cleanData.push({

                        municipality: facilityName,

                        totalPopulation: Number(row[1]) || 0

                    });

                }

            }


            // --------------------------------------------------------
            // No valid rows
            // --------------------------------------------------------

            if (cleanData.length === 0) {

                throw new Error(
                    "No valid data rows were found."
                );

            }


            // --------------------------------------------------------
            // Save parsed data
            // --------------------------------------------------------

            selectedFile = file;

            parsedData = {

                cleanData,

                recordCount: cleanData.length

            };


            // --------------------------------------------------------
            // Update Upload Card UI
            // --------------------------------------------------------

            renderSelectedFile(file);


            if (uploadButton) {

                uploadButton.disabled = false;

            }

        }

        catch (error) {

            console.error(error);

            alert(

                `❌ Validation Failed\n\n${error.message}`

            );

            resetToEmptyState();

        }

    };


    reader.readAsArrayBuffer(file);

}

        }



        // ====================================================================
// SECTION 9.2 - RENDER SELECTED FILE
// Updates the upload box after a file has been selected.
// ====================================================================

function renderSelectedFile(file) {

    const formattedSize = (file.size / 1024).toFixed(1);

    uploadLabel.innerHTML = `

        <!-- ==========================================================
             Change File Button
        =========================================================== -->

        <button
            type="button"
            class="file-change-trigger-btn"
            style="
                width:100%;
                padding:12px;
                border:2px dashed #d4d4d4;
                border-radius:8px;
                background:white;
                cursor:pointer;
                font-size:14px;
                font-weight:600;
                transition:.25s;
            ">

            📂 Change selected file

        </button>


        <!-- ==========================================================
             Selected File Information
        =========================================================== -->

        <div
            style="
                margin-top:12px;
                display:flex;
                justify-content:space-between;
                align-items:center;
                background:#f7f7f7;
                border-radius:8px;
                padding:12px;
                gap:12px;
            ">

            <div
                style="
                    flex:1;
                    min-width:0;
                ">

                <div
                    style="
                        font-weight:600;
                        white-space:nowrap;
                        overflow:hidden;
                        text-overflow:ellipsis;
                    ">

                    ${file.name}

                </div>

                <small
                    style="
                        color:#666;
                    ">

                    ${formattedSize} KB

                </small>

            </div>


            <!-- ======================================================
                 Remove Button
            ======================================================= -->

            <button
                type="button"
                class="file-clear-trigger-btn"
                style="
                    width:36px;
                    height:36px;
                    border:none;
                    border-radius:6px;
                    background:#d32f2f;
                    color:white;
                    cursor:pointer;
                    font-size:16px;
                    font-weight:bold;
                    flex-shrink:0;
                ">

                ✕

            </button>

        </div>

    `;

    bindFileButtons();

}



        // ====================================================================
// SECTION 9.3 - BIND BUTTON EVENTS
// Connects the Change and Remove buttons.
// ====================================================================

function bindFileButtons() {

    const changeButton =
        uploadLabel.querySelector(".file-change-trigger-btn");

    const clearButton =
        uploadLabel.querySelector(".file-clear-trigger-btn");


    // ------------------------------------------------------------
    // Change File
    // ------------------------------------------------------------

    if (changeButton) {

        changeButton.onclick = () => {

            fileInput.click();

        };

    }


    // ------------------------------------------------------------
    // Remove File
    // ------------------------------------------------------------

    if (clearButton) {

        clearButton.onclick = () => {

            resetToEmptyState();

        };

    }

}



        // ====================================================================
// SECTION 9.4 - RESET IMPORT CARD
// Restores the upload card back to its original state.
// ====================================================================

function resetToEmptyState() {

    selectedFile = null;

    parsedData = null;

    if (fileInput) {

        fileInput.value = "";

    }


    uploadLabel.innerHTML = defaultLabelText;


    attachLabelClickHandler();


    if (uploadButton) {

        uploadButton.disabled = false;

    }

}
        // ====================================================================
// SECTION 9.5 - PROCESS UPLOAD
// Uploads the parsed spreadsheet into Firestore.
// ====================================================================

async function handleProcessUpload() {

    // ------------------------------------------------------------
    // Validate
    // ------------------------------------------------------------

    if (!selectedFile || !parsedData) {

        alert("Please select a file first.");

        return;

    }


    const originalButtonText = uploadButton.textContent;

    uploadButton.disabled = true;

    uploadButton.textContent = "Processing...";


    try {

        console.log(`Uploading ${cardTitle}...`);


        // ==========================================================
        // SECTION A - FIRESTORE BATCH WRITES
        // ==========================================================

        const MAX_BATCH_SIZE = 500;

        let batch = writeBatch(db);

        let operationCount = 0;


        for (

            let index = 0;

            index < parsedData.cleanData.length;

            index++

        ) {

            const row = parsedData.cleanData[index];


            if (operationCount >= MAX_BATCH_SIZE) {

                await batch.commit();

                batch = writeBatch(db);

                operationCount = 0;

            }


            const documentReference = doc(

                collection(

                    db,

                    collectionName

                )

            );


            // ======================================================
            // CASE DATA
            // ======================================================

            if (dataType === "cases") {

                batch.set(documentReference, {

                    facilityName: row.abtc,

                    year: new Date().getFullYear(),

                    maleCases: row.maleCases,

                    femaleCases: row.femaleCases,

                    ageLessThan15: row.ageLt15,

                    ageGreaterThan15: row.ageGt15,

                    bitingDog: row.bitingDog,

                    bitingCat: row.bitingCat,

                    bitingOthers: row.bitingOthers,

                    humanCat1: row.humanCat1,

                    humanCat2: row.humanCat2,

                    humanCatNew: row.humanCatNew,

                    humanCatBooster: row.humanCatBooster,

                    hr: row.hr,

                    petTcv: row.petTcv,

                    petHrig: row.petHrig,

                    petErig: row.petErig,

                    totalCases:
                        row.total ||
                        (row.maleCases + row.femaleCases),

                    remarksCompII: row.remarksCompII,

                    remarksCompIII: row.remarksCompIII,

                    remarksIncompleteII:
                        row.remarksIncompleteII,

                    remarksIncompleteIII:
                        row.remarksIncompleteIII,

                    remarksNoneII:
                        row.remarksNoneII,

                    remarksNoneIII:
                        row.remarksNoneIII,

                    rep: row.rep,

                    documentOrder: index,

                    uploadedAt: new Date()

                });

            }


            // ======================================================
            // POPULATION DATA
            // ======================================================

            else {

                batch.set(documentReference, {

                    municipality: row.municipality,

                    year: new Date().getFullYear(),

                    totalPopulation: row.totalPopulation,

                    documentOrder: index,

                    uploadedAt: new Date()

                });

            }


            operationCount++;

        }


        // ==========================================================
        // Commit Remaining Documents
        // ==========================================================

        if (operationCount > 0) {

            await batch.commit();

        }



        // ==========================================================
        // SECTION B - SAVE IMPORT HISTORY
        // ==========================================================

        batch = writeBatch(db);

        const historyReference = doc(

            collection(

                db,

                "import_history"

            )

        );


        const totalValue =

            dataType === "cases"

                ? parsedData.cleanData.reduce(

                    (sum, row) =>

                        sum + row.total,

                    0

                )

                : parsedData.cleanData.reduce(

                    (sum, row) =>

                        sum + row.totalPopulation,

                    0

                );


        batch.set(historyReference, {

            fileName: selectedFile.name,

            totalCases: totalValue,

            totalFacilities: parsedData.recordCount,

            timestamp: new Date(),

            status: "Completed",

            importType: dataType

        });


        await batch.commit();



        // ==========================================================
        // SECTION C - REFRESH OTHER COMPONENTS
        // ==========================================================

        document.dispatchEvent(

            new CustomEvent(

                "importHistoryUpdated"

            )

        );



        // ==========================================================
        // SECTION D - ADD TABLE ROW
        // ==========================================================

        const uploadTime = new Date().toLocaleString(

            "en-US",

            {

                month: "2-digit",

                day: "2-digit",

                year: "numeric",

                hour: "2-digit",

                minute: "2-digit",

                hour12: true

            }

        );


        const recordText =

            dataType === "cases"

                ? `${parsedData.recordCount} Municipalities (All Columns)`

                : `${parsedData.recordCount} Municipalities (Population)`;


        addHistoryRow(

            uploadTime,

            selectedFile.name,

            recordText,

            "Completed"

        );



        // ==========================================================
        // SECTION E - SUCCESS MESSAGE
        // ==========================================================

        alert(

`✅ Upload Successful!

File:
${selectedFile.name}

Records Imported:
${parsedData.recordCount}`

        );


        resetToEmptyState();

    }

    catch (error) {

        console.error(error);

        alert(

            `Upload Failed

${error.message}`

        );

    }

    finally {

        uploadButton.disabled = false;

        uploadButton.textContent = originalButtonText;

    }

}



    // ========================================================================
    // SECTION 10 - IMPORT HISTORY
    // (Implemented in Part 3)
    // ========================================================================

    // ============================================================================
// SECTION 10 - IMPORT HISTORY
// ============================================================================

function addHistoryRow(date, fileName, records, status) {

    if (!historyTableBody) return;

    const row = document.createElement("tr");

    const badgeClass =
        status.toLowerCase() === "completed"
            ? "success"
            : "danger";

    row.innerHTML = `

        <td>${date}</td>

        <td style="font-family: monospace;">

            ${fileName}

        </td>

        <td>

            <strong>${records}</strong>

        </td>

        <td>

            <span class="badge ${badgeClass}">

                ${status}

            </span>

        </td>

    `;

    historyTableBody.prepend(row);

}
    // ============================================================================
// SECTION 10 - IMPORT HISTORY
// ============================================================================

function addHistoryRow(date, fileName, records, status) {

    if (!historyTableBody) return;

    const row = document.createElement("tr");

    const badgeClass =
        status.toLowerCase() === "completed"
            ? "success"
            : "danger";

    row.innerHTML = `

        <td>${date}</td>

        <td style="font-family: monospace;">

            ${fileName}

        </td>

        <td>

            <strong>${records}</strong>

        </td>

        <td>

            <span class="badge ${badgeClass}">

                ${status}

            </span>

        </td>

    `;

    historyTableBody.prepend(row);

}



    // ========================================================================
    // SECTION 11 - INITIALIZE IMPORT CARDS
    // ========================================================================

    initImportSection({

        cardTitle: "Import Case Data",

        fileInputId: "caseDataFile",

        collectionName: "rabies_cases",

        dataType: "cases"

    });



    initImportSection({

        cardTitle: "Import Iloilo Province Population Dataset",

        fileInputId: "populationDataFile",

        collectionName: "population_data",

        dataType: "population"

    });



    // ========================================================================
    // Load Existing Import History
    // ========================================================================

    loadImportHistory();

});

//PART 2
