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

            // Part 2

        }



        function renderSelectedFile(file) {

            // Part 2

        }



        function bindFileButtons() {

            // Part 2

        }



        function resetToEmptyState() {

            // Part 2

        }



        async function handleProcessUpload() {

            // Part 3

        }

    }



    // ========================================================================
    // SECTION 10 - IMPORT HISTORY
    // (Implemented in Part 3)
    // ========================================================================

    function addHistoryRow(date, fileName, records, status) {

        // Part 3

    }



    async function loadImportHistory() {

        // Part 3

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
