// reports.js - ABTC Facility Reports Compiler & Central PHO Submission Engine
// Conformed to CRIS Master Architecture ('patients')

import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { 
    doc, getDoc, collection, query, where, getDocs, addDoc 
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

import { auth, db } from '../firebase/firebase-config.js';

let activeFacilityId = sessionStorage.getItem("activeFacilityId") || null;
let currentFacilityName = sessionStorage.getItem("activeFacilityName") || "ABTC Facility";
let currentPersonnelName = sessionStorage.getItem("activePersonnelName") || "Facility Administrator";
let aggregatedMetrics = {};

/* --------------------
    1. Authentication & Session Setup
-------------------- */
async function initReportsSession() {
    const userRole = sessionStorage.getItem("activeDesignation") || "Owner";

    if (activeFacilityId) {
        try {
            const facilityDocRef = doc(db, "facilities", activeFacilityId);
            const facilitySnapshot = await getDoc(facilityDocRef);

            if (facilitySnapshot.exists()) {
                const data = facilitySnapshot.data();
                const facName = data.facilityName || data.name || "ABTC Facility";
                const acronym = data.acronym || data.code || "ABTC";

                currentFacilityName = `${facName} (${acronym.toUpperCase()})`;
                currentPersonnelName = sessionStorage.getItem("activePersonnelName") || data.contactInfo?.contactPerson || "Facility Administrator";

                sessionStorage.setItem("activeFacilityName", facName);
                sessionStorage.setItem("activeFacilityAcronym", acronym);

                if (data.logoData) {
                    const sidebarLogo = document.getElementById("sidebarLogoPreview");
                    if (sidebarLogo) sidebarLogo.src = data.logoData;
                }
            }
        } catch (e) {
            console.warn("Reports branding read bypassed:", e);
        }
    }

    renderHeaderUI(userRole);
    if (activeFacilityId) {
        await loadAndCompileReportData();
    }
}

initReportsSession();

if (auth) {
    onAuthStateChanged(auth, async (user) => {
        if (user && !activeFacilityId) {
            activeFacilityId = user.uid;
            sessionStorage.setItem("activeFacilityId", activeFacilityId);
            initReportsSession();
        }
    });
}

function renderHeaderUI(userRole) {
    const titleEl = document.getElementById("facilityHeaderTitle");
    const subTitleEl = document.getElementById("facilitySubTitle");
    const profileInfoEl = document.getElementById("profileInfoText");

    const currentPeriod = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

    if (titleEl) titleEl.innerText = `${currentFacilityName.toUpperCase()} - BITE CASES REPORT DRAFT`;
    if (subTitleEl) subTitleEl.innerText = `Operational Statistics & PHO Submission Prep — ${currentPeriod}`;
    
    if (profileInfoEl) {
        const roleText = userRole === "Owner" ? "Administrator / Owner" : "Nurse Duty Personnel";
        profileInfoEl.innerHTML = `<strong>${currentPersonnelName}</strong><br><span>${roleText}</span>`;
    }
}

/* --------------------
    2. Load Patient Data & Compile Tally Matrix (Targeting 'patients')
-------------------- */
async function loadAndCompileReportData() {
    const tableBody = document.getElementById("casesTableBody");
    if (!tableBody) return;

    try {
        const patientQuery = query(
            collection(db, "patients"), 
            where("facilityId", "==", activeFacilityId)
        );

        const snapshot = await getDocs(patientQuery);

        const totals = {
            male: 0, female: 0,
            under15: 0, over15: 0,
            dog: 0, cat: 0, others: 0,
            cat1: 0, cat2: 0, cat3New: 0, cat3Booster: 0,
            rigType: "HR",
            tcv: 0, hrig: 0, erig: 0, totalDoses: 0,
            compCat2: 0, compCat3: 0,
            incompCat2: 0, incompCat3: 0,
            noneCat2: 0, noneCat3: 0,
            rep: snapshot.size
        };

        snapshot.forEach((docSnap) => {
            const patient = docSnap.data();

            const sexVal = (patient.sex || "").toLowerCase();
            if (sexVal === "male") totals.male++;
            else if (sexVal === "female") totals.female++;

            const ageNum = Number(patient.age || 0);
            if (ageNum < 15) totals.under15++;
            else totals.over15++;

            const animal = (patient.exposure?.animalType || patient.animalType || "").toLowerCase();
            if (animal.includes("dog")) totals.dog++;
            else if (animal.includes("cat")) totals.cat++;
            else totals.others++;

            const category = (patient.exposure?.category || patient.classification || patient.exposureCategory || "").toUpperCase();
            const isBooster = patient.priorVaccination === "Yes" || patient.isBooster === true;

            if (category.includes("CAT I") || category === "CATEGORY I" || category === "I") totals.cat1++;
            else if (category.includes("CAT II") || category === "CATEGORY II" || category === "II") totals.cat2++;
            else if (category.includes("CAT III") || category === "CATEGORY III" || category === "III") {
                if (isBooster) totals.cat3Booster++;
                else totals.cat3New++;
            }

            const rig = (patient.rigType || "").toUpperCase();
            if (rig.includes("HRIG") || rig.includes("HUMAN")) {
                totals.hrig++;
                totals.rigType = "HR";
            } else if (rig.includes("ERIG") || rig.includes("EQUINE")) {
                totals.erig++;
                totals.rigType = "ER";
            }

            if (patient.completedDoses || patient.pepScheduleDates) {
                totals.tcv++;
                totals.totalDoses++;
            }

            const status = (patient.status || patient.treatmentStatus || "").toLowerCase();
            const isCat3 = category.includes("III") || category === "III";

            if (status.includes("complete")) {
                if (isCat3) totals.compCat3++; else totals.compCat2++;
            } else if (status.includes("incomplete")) {
                if (isCat3) totals.incompCat3++; else totals.incompCat2++;
            } else {
                if (isCat3) totals.noneCat3++; else totals.noneCat2++;
            }
        });

        aggregatedMetrics = totals;
        renderReportTableRow(tableBody, totals);

    } catch (error) {
        console.error("Error generating report tallies:", error);
        tableBody.innerHTML = `<tr><td colspan="23" style="text-align:center; color:#dc3545; padding:20px;">Error compiling report statistics: ${error.message}</td></tr>`;
    }
}

function renderReportTableRow(tableBody, t) {
    tableBody.innerHTML = `
        <tr>
            <td><strong>${currentFacilityName}</strong></td>
            <td>${t.male}</td>
            <td>${t.female}</td>
            <td>${t.under15}</td>
            <td>${t.over15}</td>
            <td>${t.dog}</td>
            <td>${t.cat}</td>
            <td>${t.others}</td>
            <td>${t.cat1}</td>
            <td>${t.cat2}</td>
            <td>${t.cat3New}</td>
            <td>${t.cat3Booster}</td>
            <td><strong>${t.rigType}</strong></td>
            <td>${t.tcv}</td>
            <td>${t.hrig}</td>
            <td>${t.erig}</td>
            <td><strong>${t.totalDoses}</strong></td>
            <td>${t.compCat2}</td>
            <td>${t.compCat3}</td>
            <td>${t.incompCat2}</td>
            <td>${t.incompCat3}</td>
            <td>${t.noneCat2}</td>
            <td>${t.noneCat3}</td>
            <td><strong>${t.rep}</strong></td>
        </tr>
    `;
}

/* --------------------
    3. Submit Report Draft to PHO
-------------------- */
const submitPhoBtn = document.getElementById("submitPhoBtn");
if (submitPhoBtn) {
    submitPhoBtn.addEventListener("click", async () => {
        if (!activeFacilityId) return alert("Session expired. Please log in again.");

        const reportMonthYear = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
        
        if (!confirm(`Are you sure you want to submit the official Bite Cases Report for ${currentFacilityName} (${reportMonthYear}) to the Provincial Health Office (PHO)?`)) {
            return;
        }

        try {
            submitPhoBtn.disabled = true;
            submitPhoBtn.style.pointerEvents = "none";
            submitPhoBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Submitting...`;

            const reportPayload = {
                facilityId: activeFacilityId,
                facilityName: currentFacilityName,
                submittedBy: currentPersonnelName,
                reportPeriod: reportMonthYear,
                totalCasesReported: aggregatedMetrics.rep || 0,
                
                abtc: currentFacilityName,
                maleCases: aggregatedMetrics.male || 0,
                femaleCases: aggregatedMetrics.female || 0,
                ageLessThan15: aggregatedMetrics.under15 || 0,
                ageGreaterThan15: aggregatedMetrics.over15 || 0,
                bitingDog: aggregatedMetrics.dog || 0,
                bitingCat: aggregatedMetrics.cat || 0,
                bitingOthers: aggregatedMetrics.others || 0,
                humanCat1: aggregatedMetrics.cat1 || 0,
                humanCat2: aggregatedMetrics.cat2 || 0,
                humanCatNew: aggregatedMetrics.cat3New || 0,
                humanCatBooster: aggregatedMetrics.cat3Booster || 0,
                hr: aggregatedMetrics.rigType === "HR" ? 1 : 0,
                petTcv: aggregatedMetrics.tcv || 0,
                petHrig: aggregatedMetrics.hrig || 0,
                petErig: aggregatedMetrics.erig || 0,
                total: aggregatedMetrics.totalDoses || 0,
                remarksCompII: aggregatedMetrics.compCat2 || 0,
                remarksCompIII: aggregatedMetrics.compCat3 || 0,
                remarksIncompleteII: aggregatedMetrics.incompCat2 || 0,
                remarksIncompleteIII: aggregatedMetrics.incompCat3 || 0,
                remarksNoneII: aggregatedMetrics.noneCat2 || 0,
                remarksNoneIII: aggregatedMetrics.noneCat3 || 0,
                rep: aggregatedMetrics.rep || 0,

                status: "Submitted to PHO",
                submittedAt: new Date().toISOString()
            };

            await addDoc(collection(db, "abtc-reports"), reportPayload);
            await addDoc(collection(db, "facilities", activeFacilityId, "submitted-reports"), reportPayload);

            alert(`Success! Report for ${reportMonthYear} has been officially submitted to PHO.`);
            submitPhoBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Report Submitted`;
            submitPhoBtn.style.backgroundColor = "#2b8a3e";

        } catch (error) {
            console.error("Submission failed:", error);
            alert("Error submitting report: " + error.message);
            submitPhoBtn.disabled = false;
            submitPhoBtn.style.pointerEvents = "auto";
            submitPhoBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Submit Report to PHO`;
        }
    });
}

const caseSearchInput = document.getElementById("caseSearch");
if (caseSearchInput) {
    caseSearchInput.addEventListener("input", (e) => {
        const queryVal = e.target.value.toLowerCase().trim();
        const rows = document.querySelectorAll("#casesTableBody tr");

        rows.forEach(row => {
            const text = row.innerText.toLowerCase();
            row.style.display = text.includes(queryVal) ? "" : "none";
        });
    });
}

document.getElementById("logout-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (confirm("Are you sure you want to log out?")) {
        sessionStorage.clear();
        localStorage.removeItem("activeDesignation");
        localStorage.removeItem("activePersonnelName");
        window.location.href = 'abtc-login.html';
    }
});