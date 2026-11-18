/* ==========================================================================
   CRIS PHO MODULE — ANIMAL BITE CASES DATABASE SERVICE (pho-animal-bite-cases-db.js)
   Handles Facilities Registry Mapping, Real-Time Aggregation from `patients`,
   Root `legacy-summary` Merging, and PHO Sign-Out.
   ========================================================================== */

import { auth, db } from '../../firebase/firebase-config.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
    collection,
    getDocs,
    onSnapshot
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

/**
 * Loads all registered ABTC & health facilities from `facilities`
 * (with fallback to `pho-database/main/facility-management`).
 */
export async function loadFacilitiesRegistry() {
    const facilitiesMap = new Map();

    try {
        let facSnap = await getDocs(collection(db, 'facilities'));
        if (facSnap.empty) {
            facSnap = await getDocs(
                collection(db, 'pho-database', 'main', 'facility-management')
            );
        }

        if (facSnap && !facSnap.empty) {
            facSnap.forEach((docSnap) => {
                const data = docSnap.data();
                const id = docSnap.id;

                let displayName =
                    data.facilityName || data.name || data.abtcName || '';
                const acronym = (
                    data.facilityAcronym ||
                    data.acronym ||
                    data.code ||
                    ''
                ).toUpperCase();

                if (displayName && acronym && !displayName.includes(`(${acronym})`)) {
                    displayName = `${displayName} (${acronym})`;
                } else if (!displayName && acronym) {
                    displayName = acronym;
                }

                if (!displayName && data.address && typeof data.address === 'object') {
                    const addr = data.address;
                    const locParts = [
                        addr.barangay,
                        addr.city || addr.municipality
                    ]
                        .filter(Boolean)
                        .join(', ');
                    if (locParts) {
                        displayName = acronym ? `${acronym} - ${locParts}` : locParts;
                    }
                }

                if (!displayName) {
                    displayName = data.municipality || data.city || id;
                }

                facilitiesMap.set(id, {
                    id,
                    displayName,
                    acronym
                });
            });
        }
    } catch (err) {
        console.warn('Facilities registry lookup skipped:', err);
    }

    return facilitiesMap;
}

/**
 * Resolves a human-readable ABTC / Health Facility display name from a patient or facility doc.
 */
export function resolveFacilityDisplayName(data, facilitiesMap, rawId = '') {
    const targetId = String(
        data.facilityId || data.facility_id || data.facility?.id || rawId || ''
    ).trim();

    if (targetId && facilitiesMap.has(targetId)) {
        return facilitiesMap.get(targetId).displayName;
    }

    const acronym = String(
        data.facilityAcronym || data.facilityCode || data.acronym || ''
    )
        .toUpperCase()
        .trim();
    const baseName =
        data.facilityName || data.facility?.name || data.name || data.abtc || '';

    if (baseName && acronym && !baseName.includes(`(${acronym})`)) {
        return `${baseName} (${acronym})`;
    }
    if (baseName) return baseName;
    if (acronym) return acronym;

    return targetId || 'Unassigned Facility';
}

/**
 * Extracts Year (e.g. 2026) and zero-indexed Month (0-11) from a patient ITR document.
 */
function extractRecordDateParts(data) {
    let dt = null;

    if (data.consultDateTime) {
        const parsed = new Date(data.consultDateTime);
        if (!isNaN(parsed)) dt = parsed;
    }
    if (!dt && data.createdAt && typeof data.createdAt.seconds === 'number') {
        dt = new Date(data.createdAt.seconds * 1000);
    }
    if (!dt && data.exposureDate) {
        const parsed = new Date(data.exposureDate);
        if (!isNaN(parsed)) dt = parsed;
    }
    if (!dt && data.submittedAt) {
        const parsed = new Date(data.submittedAt);
        if (!isNaN(parsed)) dt = parsed;
    }
    if (!dt) {
        dt = new Date();
    }

    return {
        year: dt.getFullYear(),
        month: dt.getMonth()
    };
}

/**
 * Classifies a single active patient ITR record into the 23 DOH surveillance columns.
 */
function classifyPatientForReport(data) {
    const sex = String(data.sex || data.patient?.sex || '').toLowerCase();
    const isMale = sex === 'male';
    const isFemale = sex === 'female';

    const ageNum = Number(data.age ?? data.patient?.age ?? 0);
    const isLt15 = !isNaN(ageNum) && ageNum > 0 && ageNum < 15;
    const isGt15 = !isNaN(ageNum) && ageNum >= 15;

    const animalRaw = String(
        data.exposure?.animalType || data.animalType || ''
    ).toLowerCase();
    const isDog = animalRaw.includes('dog');
    const isCat = animalRaw.includes('cat');
    const isOtherAnimal = !isDog && !isCat && animalRaw !== '' && animalRaw !== 'unknown';

    const catRaw = String(
        data.classification || data.exposure?.category || data.exposureCategory || ''
    ).toUpperCase();
    const isCat1 =
        catRaw === 'I' ||
        catRaw.endsWith(' I') ||
        (catRaw.includes('CATEGORY I') && !catRaw.includes('II'));
    const isCat2 =
        catRaw === 'II' ||
        catRaw.endsWith(' II') ||
        (catRaw.includes('CATEGORY II') && !catRaw.includes('III'));
    const isCat3 =
        catRaw === 'III' ||
        catRaw.endsWith(' III') ||
        catRaw.includes('CATEGORY III');

    const isBooster =
        Boolean(data.isBooster) ||
        String(data.caseType || '').toLowerCase().includes('booster') ||
        Boolean(data.pastMedicalHistory?.immunization);

    const humanCatNew = isCat3 && !isBooster ? 1 : 0;
    const humanCatBooster = isCat3 && isBooster ? 1 : 0;

    const orders = data.physicianOrders || {};
    const rigStr = `${data.rigType || ''} ${data.immunoglobulin || ''}`.toUpperCase();

    const hasTcv =
        Boolean(orders.pcecvPvrv) ||
        Boolean(data.vaccineBrand) ||
        (Array.isArray(data.completedDoses) && data.completedDoses.length > 0);
    const hasHrig = Boolean(orders.hrig) || rigStr.includes('HRIG');
    const hasErig = Boolean(orders.erig) || rigStr.includes('ERIG');

    const completedDoses = Array.isArray(data.completedDoses)
        ? data.completedDoses.map((d) => String(d).toLowerCase().replace(/\s+/g, ''))
        : [];
    const doseCount = completedDoses.length;

    const isCompletedPep =
        doseCount >= 4 ||
        (completedDoses.includes('day28') && doseCount >= 3);
    const isIncompletePep = !isCompletedPep && doseCount > 0;
    const isNonePep = doseCount === 0;

    return {
        maleCases: isMale ? 1 : 0,
        femaleCases: isFemale ? 1 : 0,
        ageLt15: isLt15 ? 1 : 0,
        ageGt15: isGt15 ? 1 : 0,
        bitingDog: isDog ? 1 : 0,
        bitingCat: isCat ? 1 : 0,
        bitingOthers: isOtherAnimal ? 1 : 0,
        humanCat1: isCat1 ? 1 : 0,
        humanCat2: isCat2 ? 1 : 0,
        humanCatNew,
        humanCatBooster,
        hr: data.isHumanRabies === true || data.mortalityFlag === 'Confirmed' ? 1 : 0,
        petTcv: hasTcv ? 1 : 0,
        petHrig: hasHrig ? 1 : 0,
        petErig: hasErig ? 1 : 0,
        total: 1,
        remarksCompII: isCat2 && isCompletedPep ? 1 : 0,
        remarksCompIII: isCat3 && isCompletedPep ? 1 : 0,
        remarksIncompleteII: isCat2 && isIncompletePep ? 1 : 0,
        remarksIncompleteIII: isCat3 && isIncompletePep ? 1 : 0,
        remarksNoneII: isCat2 && isNonePep ? 1 : 0,
        remarksNoneIII: isCat3 && isNonePep ? 1 : 0,
        rep: 1
    };
}

/**
 * Loads historical legacy summary rows from root `legacy-summary`
 * (with fallbacks to `pho-database/main/legacy-summary` and `pho_rabies_cases`).
 */
export async function fetchLegacyProvincialRows(facilitiesMap) {
    const legacyRows = [];

    try {
        let snapshot = await getDocs(collection(db, 'legacy-summary'));
        if (!snapshot || snapshot.empty) {
            snapshot = await getDocs(collection(db, 'pho-database', 'main', 'legacy-summary'));
        }
        if (!snapshot || snapshot.empty) {
            snapshot = await getDocs(collection(db, 'pho_rabies_cases'));
        }

        let orderCounter = 0;
        if (snapshot && !snapshot.empty) {
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const rawName =
                    (data.rawData && data.rawData[0]) ||
                    data.abtc ||
                    data.facilityName ||
                    docSnap.id ||
                    '';
                if (!rawName || typeof rawName !== 'string') return;

                const cleanName = rawName.trim();
                if (
                    cleanName === '' ||
                    cleanName.toLowerCase().includes('abtc / health') ||
                    cleanName.toLowerCase() === 'abtc' ||
                    cleanName.toLowerCase() === 'facility' ||
                    cleanName.toLowerCase().includes('health facility')
                ) {
                    return;
                }

                orderCounter++;
                const entryYear =
                    Number(data.year) ||
                    (data.rawData && data.rawData[0] && !isNaN(Number(data.rawData[0]))
                        ? Number(data.rawData[0])
                        : null);
                const entryMonth =
                    data.month !== undefined && data.month !== null
                        ? Number(data.month)
                        : null;

                const facilityTitle =
                    data.rawData && Array.isArray(data.rawData)
                        ? cleanName || resolveFacilityDisplayName(data, facilitiesMap, docSnap.id)
                        : resolveFacilityDisplayName(data, facilitiesMap, docSnap.id);

                if (data.rawData && Array.isArray(data.rawData)) {
                    const row = data.rawData;
                    legacyRows.push({
                        id: docSnap.id,
                        facilityId: data.facilityId || docSnap.id,
                        abtc: facilityTitle,
                        year: entryYear,
                        month: entryMonth,
                        maleCases: Number(row[1] || 0),
                        femaleCases: Number(row[2] || 0),
                        ageLt15: Number(row[3] || 0),
                        ageGt15: Number(row[4] || 0),
                        bitingDog: Number(row[5] || 0),
                        bitingCat: Number(row[6] || 0),
                        bitingOthers: Number(row[7] || 0),
                        humanCat1: Number(row[8] || 0),
                        humanCat2: Number(row[9] || 0),
                        humanCatNew: Number(row[10] || 0),
                        humanCatBooster: Number(row[11] || 0),
                        hr: Number(row[12] || 0),
                        petTcv: Number(row[13] || 0),
                        petHrig: Number(row[14] || 0),
                        petErig: Number(row[15] || 0),
                        total: Number(row[16] || 0),
                        remarksCompII: Number(row[17] || 0),
                        remarksCompIII: Number(row[18] || 0),
                        remarksIncompleteII: Number(row[19] || 0),
                        remarksIncompleteIII: Number(row[20] || 0),
                        remarksNoneII: Number(row[21] || 0),
                        remarksNoneIII: Number(row[22] || 0),
                        rep: Number(row[23] || 0),
                        documentOrder: data.documentOrder || orderCounter
                    });
                } else {
                    legacyRows.push({
                        id: docSnap.id,
                        facilityId: data.facilityId || docSnap.id,
                        abtc: facilityTitle,
                        year: entryYear,
                        month: entryMonth,
                        maleCases: Number(data.maleCases || 0),
                        femaleCases: Number(data.femaleCases || 0),
                        ageLt15: Number(data.ageLessThan15 || data.ageLt15 || 0),
                        ageGt15: Number(data.ageGreaterThan15 || data.ageGt15 || 0),
                        bitingDog: Number(data.bitingDog || 0),
                        bitingCat: Number(data.bitingCat || 0),
                        bitingOthers: Number(data.bitingOthers || 0),
                        humanCat1: Number(data.humanCat1 || 0),
                        humanCat2: Number(data.humanCat2 || 0),
                        humanCatNew: Number(data.humanCatNew || 0),
                        humanCatBooster: Number(data.humanCatBooster || 0),
                        hr: Number(data.hr || data.humanDeaths || 0),
                        petTcv: Number(data.petTcv || data.tcv || 0),
                        petHrig: Number(data.petHrig || data.hrig || 0),
                        petErig: Number(data.petErig || data.erig || 0),
                        total: Number(data.total || data.totalCases || 0),
                        remarksCompII: Number(data.remarksCompII || 0),
                        remarksCompIII: Number(data.remarksCompIII || 0),
                        remarksIncompleteII: Number(data.remarksIncompleteII || 0),
                        remarksIncompleteIII: Number(data.remarksIncompleteIII || 0),
                        remarksNoneII: Number(data.remarksNoneII || 0),
                        remarksNoneIII: Number(data.remarksNoneIII || 0),
                        rep: Number(data.rep || 0),
                        documentOrder: data.documentOrder || orderCounter
                    });
                }
            });
        }
    } catch (err) {
        console.warn('Legacy provincial summary skipped:', err);
    }

    return legacyRows;
}

/**
 * Real-time stream of all registered patient ITRs across all ABTC facilities,
 * automatically grouped by (facilityId, year, month) so PHO sees live updates
 * without requiring manual report submission.
 */
export function subscribeToLiveProvincialCases(facilitiesMap, onUpdate, onError) {
    return onSnapshot(
        collection(db, 'patients'),
        (snapshot) => {
            const groupedMap = new Map();

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const statusLower = String(data.status || '').toLowerCase();

                if (
                    data.claimedByAbtc === false ||
                    data.abtcClaimed === false ||
                    statusLower.includes('pending')
                ) {
                    return;
                }

                const facilityId = String(
                    data.facilityId || data.facility?.id || 'UNASSIGNED'
                ).trim();
                const abtcName = resolveFacilityDisplayName(
                    data,
                    facilitiesMap,
                    facilityId
                );
                const { year, month } = extractRecordDateParts(data);
                const metrics = classifyPatientForReport(data);

                const groupKey = `${facilityId}__${year}__${month}`;
                if (!groupedMap.has(groupKey)) {
                    groupedMap.set(groupKey, {
                        id: groupKey,
                        facilityId,
                        abtc: abtcName,
                        year,
                        month,
                        maleCases: 0,
                        femaleCases: 0,
                        ageLt15: 0,
                        ageGt15: 0,
                        bitingDog: 0,
                        bitingCat: 0,
                        bitingOthers: 0,
                        humanCat1: 0,
                        humanCat2: 0,
                        humanCatNew: 0,
                        humanCatBooster: 0,
                        hr: 0,
                        petTcv: 0,
                        petHrig: 0,
                        petErig: 0,
                        total: 0,
                        remarksCompII: 0,
                        remarksCompIII: 0,
                        remarksIncompleteII: 0,
                        remarksIncompleteIII: 0,
                        remarksNoneII: 0,
                        remarksNoneIII: 0,
                        rep: 0
                    });
                }

                const agg = groupedMap.get(groupKey);
                Object.keys(metrics).forEach((k) => {
                    agg[k] += metrics[k];
                });
            });

            onUpdate(Array.from(groupedMap.values()));
        },
        (error) => {
            console.error('Live PHO patient aggregation error:', error);
            if (onError) onError(error);
        }
    );
}

/**
 * Signs out the active PHO Firebase Auth session.
 */
export async function signOutPhoSession() {
    if (auth) {
        await signOut(auth);
    }
}