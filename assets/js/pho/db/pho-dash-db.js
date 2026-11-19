/* ==========================================================================
   CRIS PHO MODULE — DASHBOARD DATABASE SERVICE (pho-dash-db.js)
   Handles PHO Auth Profile, Root `population-data` Retrieval, Root
   `legacy-summary` & Live `patients` Aggregation, Pending Rabies Mortality
   Verification Queue, PVO Outbreak Alert Dispatch, and PHO Calendar Events.
   ========================================================================== */

import { auth, db } from '../../firebase/firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    setDoc,
    addDoc,
    updateDoc,
    onSnapshot,
    arrayUnion,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function watchPhoAuthProfile(onProfileResolved) {
    if (!auth) {
        onProfileResolved(null);
        return;
    }

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            onProfileResolved(null);
            return;
        }

        try {
            const userDocSnap = await getDoc(doc(db, 'users', user.uid));
            let displayName = user.displayName || '';
            let role = 'PHO Surveillance Officer';

            if (userDocSnap && userDocSnap.exists()) {
                const userData = userDocSnap.data();
                const fullNameParts = [
                    userData.firstName,
                    userData.middleName ? `${userData.middleName[0]}.` : '',
                    userData.lastName,
                    userData.suffix
                ].filter(Boolean);

                if (fullNameParts.length > 0) {
                    displayName = fullNameParts.join(' ');
                }
                role = userData.position || userData.designation || userData.role || role;
            }

            if (!displayName) {
                displayName = user.email ? user.email.split('@')[0] : 'Authorized Personnel';
            }

            onProfileResolved({ uid: user.uid, displayName, role });
        } catch (err) {
            onProfileResolved({
                uid: user.uid,
                displayName: user.email ? user.email.split('@')[0] : 'Authorized Personnel',
                role: 'PHO Officer'
            });
        }
    });
}

export async function fetchIloiloPopulationTotal() {
    try {
        let querySnapshot = await getDocs(collection(db, 'population-data'));
        if (!querySnapshot || querySnapshot.empty) {
            querySnapshot = await getDocs(
                collection(db, 'pho-database', 'main', 'population-data')
            );
        }

        let municipalTotal = 0;
        let iloiloSummaryTotal = 0;

        if (querySnapshot && !querySnapshot.empty) {
            querySnapshot.forEach((docSnap) => {
                const docIdUpper = docSnap.id.trim().toUpperCase();
                const data = docSnap.data();

                const labelText = String(
                    data.municipality ||
                        data.city ||
                        data.name ||
                        (data.rawData && data.rawData[0]) ||
                        ''
                ).toLowerCase();
                if (
                    labelText.includes('municipality') ||
                    labelText.includes('total population')
                ) {
                    return;
                }

                let rawVal =
                    data.totalPopulation ??
                    data.population ??
                    data.humanPopulation ??
                    data.total ??
                    data.count ??
                    data.iloiloPopulation ??
                    data.value ??
                    null;

                if (rawVal === null && Array.isArray(data.rawData)) {
                    for (let i = 1; i < data.rawData.length; i++) {
                        const candidate = Number(
                            String(data.rawData[i]).replace(/,/g, '').trim()
                        );
                        if (!isNaN(candidate) && candidate > 0) {
                            rawVal = candidate;
                            break;
                        }
                    }
                }

                if (rawVal === null) {
                    for (const [key, val] of Object.entries(data)) {
                        if (key === 'year' || key === 'documentOrder') continue;
                        const num =
                            typeof val === 'string'
                                ? Number(val.replace(/,/g, '').trim())
                                : typeof val === 'number'
                                ? val
                                : NaN;
                        if (!isNaN(num) && num > 100) {
                            rawVal = num;
                            break;
                        }
                    }
                }

                const cleanVal =
                    typeof rawVal === 'string'
                        ? Number(rawVal.replace(/,/g, '').trim())
                        : Number(rawVal || 0);

                if (isNaN(cleanVal) || cleanVal <= 0) return;

                if (
                    docIdUpper === 'ILOILO' ||
                    docIdUpper === 'ILOILO_TOTAL' ||
                    labelText.trim() === 'iloilo' ||
                    labelText.trim() === 'iloilo province'
                ) {
                    iloiloSummaryTotal = cleanVal;
                } else {
                    municipalTotal += cleanVal;
                }
            });
        }

        return iloiloSummaryTotal > 0 ? iloiloSummaryTotal : municipalTotal;
    } catch (error) {
        console.error('Population fetch error:', error);
        return 0;
    }
}

function extractDateDetails(data) {
    let year = null;
    let month = null;

    if (data.year && !isNaN(Number(data.year))) {
        year = Number(data.year);
    }
    if (data.month !== undefined && data.month !== null && !isNaN(Number(data.month))) {
        const m = Number(data.month);
        month = m >= 1 && m <= 12 ? m - 1 : m >= 0 && m <= 11 ? m : null;
    }

    const rawDate =
        data.consultDateTime ||
        data.date ||
        data.createdAt ||
        data.exposureDate ||
        data.submittedAt;
    if (rawDate) {
        if (typeof rawDate.toDate === 'function') {
            const dt = rawDate.toDate();
            if (!year) year = dt.getFullYear();
            if (month === null) month = dt.getMonth();
        } else {
            const dt = new Date(rawDate);
            if (!isNaN(dt.getTime())) {
                if (!year) year = dt.getFullYear();
                if (month === null) month = dt.getMonth();
            }
        }
    }

    if ((!year || month === null) && data.rawData && Array.isArray(data.rawData)) {
        for (let i = 0; i < data.rawData.length; i++) {
            const item = String(data.rawData[i]).trim();
            if (!year && /^(20\d\d)$/.test(item)) {
                year = Number(item);
            }
            if (month === null) {
                const mIdx = shortMonths.findIndex(
                    (sm) => sm.toLowerCase() === item.substring(0, 3).toLowerCase()
                );
                if (mIdx !== -1) month = mIdx;
            }
        }
    }

    return { year, month };
}

export async function fetchLegacySurveillanceRows() {
    const records = [];
    try {
        let snap = await getDocs(collection(db, 'legacy-summary'));
        if (!snap || snap.empty) {
            snap = await getDocs(collection(db, 'pho-database', 'main', 'legacy-summary'));
        }
        if (!snap || snap.empty) {
            snap = await getDocs(collection(db, 'pho_rabies_cases'));
        }

        if (snap && !snap.empty) {
            snap.forEach((docSnap) => {
                const data = docSnap.data();
                const rawName =
                    (data.rawData && data.rawData[0]) ||
                    data.abtc ||
                    data.facilityName ||
                    docSnap.id ||
                    '';
                if (
                    typeof rawName === 'string' &&
                    (rawName.toLowerCase().includes('facility') ||
                        rawName.toLowerCase().includes('abtc / health'))
                ) {
                    return;
                }

                const { year, month } = extractDateDetails(data);

                if (data.rawData && Array.isArray(data.rawData)) {
                    const row = data.rawData;
                    const is24Col = row.length >= 17;
                    records.push({
                        year,
                        month,
                        biteCases: is24Col
                            ? Number(row[16]) || Number(row[1]) + Number(row[2]) || 0
                            : Number(row[1]) || 0,
                        vaccinated: is24Col ? Number(row[13]) || 0 : Number(row[4]) || 0,
                        deaths: is24Col ? Number(row[12]) || 0 : Number(row[2]) || 0,
                        completedPEP: is24Col
                            ? (Number(row[17]) || 0) + (Number(row[18]) || 0)
                            : 0
                    });
                } else {
                    records.push({
                        year,
                        month,
                        biteCases: Number(data.total || data.totalCases || data.biteCases || 0),
                        vaccinated: Number(data.tcv || data.petTcv || data.vaccinated || 0),
                        deaths: Number(data.hr || data.humanDeaths || 0),
                        completedPEP:
                            Number(data.remarksCompII || 0) + Number(data.remarksCompIII || 0)
                    });
                }
            });
        }
    } catch (err) {
        console.warn('Legacy surveillance read skipped:', err);
    }
    return records;
}

/**
 * Streams all registered `patients` records in real time, producing both:
 * 1) Live provincial KPI/chart records, and
 * 2) Pending human rabies mortality flags awaiting PHO verification (`mortalityFlag === 'Suspect'`).
 */
export function subscribeToLivePhoPatients(onUpdate) {
    return onSnapshot(collection(db, 'patients'), (snapshot) => {
        const liveMetricsRows = [];
        const pendingMortalityReviews = [];

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const statusLower = String(data.status || '').toLowerCase();

            if (
                data.claimedByAbtc === false ||
                data.abtcClaimed === false ||
                statusLower.includes('pending abtc')
            ) {
                return;
            }

            const { year, month } = extractDateDetails(data);
            const orders = data.physicianOrders || {};
            const completedDoses = Array.isArray(data.completedDoses)
                ? data.completedDoses.map((d) => String(d).toLowerCase().replace(/\s+/g, ''))
                : [];

            const hasTcv =
                Boolean(orders.pcecvPvrv) ||
                Boolean(data.vaccineBrand) ||
                completedDoses.length > 0;
            const isCompletedPep =
                completedDoses.length >= 4 ||
                (completedDoses.includes('day28') && completedDoses.length >= 3);
            const isConfirmedDeath =
                data.isHumanRabies === true || data.mortalityFlag === 'Confirmed';

            liveMetricsRows.push({
                year,
                month,
                biteCases: 1,
                vaccinated: hasTcv ? 1 : 0,
                deaths: isConfirmedDeath ? 1 : 0,
                completedPEP: isCompletedPep ? 1 : 0
            });

            if (data.mortalityFlag === 'Suspect') {
                pendingMortalityReviews.push({
                    docId: docSnap.id,
                    itrNo: data.itrDisplayNo || data.caseId || data.recordNo || docSnap.id,
                    patientName: data.fullName || data.name || 'Unknown Patient',
                    age: data.age ?? 'N/A',
                    sex: data.sex || 'N/A',
                    barangay: data.address?.barangay || data.barangay || 'N/A',
                    municipality: data.address?.cityMunicipality || data.municipality || 'N/A',
                    province: data.address?.province || 'Iloilo',
                    facilityId: data.facilityId || '',
                    facilityAcronym: data.facilityAcronym || 'ABTC',
                    animalType: data.exposure?.animalType || data.animalType || 'Unknown',
                    classification: data.classification || 'Unclassified',
                    deathDate: data.deathDate || 'N/A',
                    reportingHospital: data.reportingHospital || 'N/A',
                    cifRefNo: data.cifRefNo || 'N/A',
                    flaggedByAbtc: data.flaggedByAbtc || 'ABTC Personnel'
                });
            }
        });

        onUpdate({ liveMetricsRows, pendingMortalityReviews });
    });
}

/**
 * PHO Verification Action:
 * - If `decision === 'Confirmed'`: marks `isHumanRabies: true`, `mortalityFlag: 'Confirmed'`,
 *   updates `historyLogs`, and dispatches an outbreak alert to `rabies_alerts` for PVO trace-back.
 * - If `decision === 'Dismissed'`: clears the suspect rabies flag while keeping non-rabies mortality status.
 */
export async function resolvePhoMortalityReview({
    patientDocId,
    patientRecord,
    decision,
    phoOfficerName,
    verificationNotes
}) {
    const patientRef = doc(db, 'patients', patientDocId);
    const isConfirmed = decision === 'Confirmed';

    await updateDoc(patientRef, {
        mortalityFlag: isConfirmed ? 'Confirmed' : 'Dismissed',
        isHumanRabies: isConfirmed,
        status: isConfirmed ? 'Deceased - Confirmed Rabies' : 'Deceased (Non-Rabies)',
        confirmedByPho: phoOfficerName,
        phoVerificationNotes: verificationNotes || '',
        phoVerifiedAt: new Date().toISOString(),
        historyLogs: arrayUnion({
            action: isConfirmed
                ? 'PHO Confirmed Human Rabies Death'
                : 'PHO Cleared Suspect Rabies Flag',
            timestamp: new Date().toISOString(),
            personnel: phoOfficerName,
            details: isConfirmed
                ? `Official PHO confirmation recorded (CIF: ${patientRecord.cifRefNo}). PVO trace-back alert dispatched. ${verificationNotes || ''}`.trim()
                : `Cleared as non-rabies mortality after PHO review. ${verificationNotes || ''}`.trim()
        })
    });

    if (isConfirmed) {
        await addDoc(collection(db, 'rabies_alerts'), {
            type: 'CONFIRMED_HUMAN_RABIES_DEATH',
            targetAgency: 'PVO',
            status: 'Active',
            patientDocId,
            itrNo: patientRecord.itrNo,
            patientName: patientRecord.patientName,
            barangay: patientRecord.barangay,
            municipality: patientRecord.municipality,
            province: patientRecord.province,
            animalType: patientRecord.animalType,
            deathDate: patientRecord.deathDate,
            cifRefNo: patientRecord.cifRefNo,
            sourceFacilityId: patientRecord.facilityId,
            sourceFacilityAcronym: patientRecord.facilityAcronym,
            verifiedByPho: phoOfficerName,
            notes: verificationNotes || 'Initiate animal trace-back and ring vaccination.',
            createdAt: serverTimestamp()
        });
    }
}

export async function fetchPhoCalendarMonthEvents(startMonthStr, endMonthStr) {
    const eventsSet = new Set();
    try {
        const monthEventsQuery = query(
            collection(db, 'calendar-events'),
            where('date', '>=', startMonthStr),
            where('date', '<=', endMonthStr)
        );
        const monthSnap = await getDocs(monthEventsQuery);
        if (monthSnap) {
            monthSnap.forEach((docSnap) => {
                const d = docSnap.data();
                if (d.description && d.description.trim() !== '') {
                    eventsSet.add(d.date);
                }
            });
        }
    } catch (err) {
        // Fallback
    }
    return eventsSet;
}

export async function fetchPhoCalendarDateDescription(dateKey) {
    const q = query(collection(db, 'calendar-events'), where('date', '==', dateKey));
    const querySnapshot = await getDocs(q);
    let desc = '';
    querySnapshot.forEach((docSnap) => {
        desc = docSnap.data().description || '';
    });
    return desc;
}

export async function savePhoCalendarEvent(dateKey, text) {
    const docRef = doc(db, 'calendar-events', dateKey);
    await setDoc(
        docRef,
        {
            category: 'Announcement',
            created: new Date(),
            date: dateKey,
            description: text,
            title: text.split('\n')[0] || 'New Announcement'
        },
        { merge: true }
    );
}

export async function signOutPhoDashboard() {
    if (auth) {
        await signOut(auth);
    }
}