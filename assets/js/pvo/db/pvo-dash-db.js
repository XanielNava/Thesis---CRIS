/* ==========================================================================
   CRIS PVO MODULE — DASHBOARD DATABASE SERVICE (pvo-dash-db.js)
   Handles PVO Auth Profile, Root `population-data` Retrieval, Root
   `legacy-summary` & Live `patients` Aggregation, PHO Rabies Outbreak
   Alerts (`rabies_alerts`), Incident Logs, and PVO Calendar Events.
   ========================================================================== */

import { auth, db } from '../../firebase/firebase-config.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    query,
    where,
    orderBy,
    limit,
    onSnapshot
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function fetchCurrentOfficerProfile(uid) {
    try {
        const pvoSnap = await getDoc(doc(db, 'pvo-users', uid));
        if (pvoSnap.exists()) return pvoSnap.data();

        const userDocRef = doc(db, 'users', uid);
        const snap = await getDoc(userDocRef);
        return snap.exists() ? snap.data() : null;
    } catch (err) {
        console.warn('PVO officer profile lookup skipped:', err);
        return null;
    }
}

/**
 * Fetches Iloilo Province human population total from root `population-data`
 * (with fallback to `pho-database/main/population-data`).
 */
export async function fetchPvoHumanPopulationTotal() {
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
        console.error('PVO population fetch error:', error);
        return 0;
    }
}

function extractDateParts(data) {
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
        data.exposureDate ||
        data.date ||
        data.createdAt ||
        data.submittedAt;
    if (rawDate) {
        const dt =
            typeof rawDate.toDate === 'function' ? rawDate.toDate() : new Date(rawDate);
        if (!isNaN(dt.getTime())) {
            if (!year) year = dt.getFullYear();
            if (month === null) month = dt.getMonth();
        }
    }

    if ((!year || month === null) && Array.isArray(data.rawData)) {
        for (let i = 0; i < data.rawData.length; i++) {
            const item = String(data.rawData[i]).trim();
            if (!year && /^(20\d\d)$/.test(item)) year = Number(item);
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

/**
 * Fetches legacy provincial summary records from root `legacy-summary`
 * (with fallback to `pho-database/main/legacy-summary` and `pvo_rabies_cases`).
 */
export async function fetchPvoSurveillanceMetrics() {
    let snapshot = await getDocs(collection(db, 'legacy-summary'));
    if (!snapshot || snapshot.empty) {
        snapshot = await getDocs(collection(db, 'pho-database', 'main', 'legacy-summary'));
    }
    if (!snapshot || snapshot.empty) {
        snapshot = await getDocs(collection(db, 'pvo_rabies_cases'));
    }

    const records = [];
    snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const rawName =
            (data.rawData && data.rawData[0]) || data.abtc || data.facilityName || docSnap.id || '';
        if (
            typeof rawName === 'string' &&
            (rawName.toLowerCase().includes('facility') ||
                rawName.toLowerCase().includes('abtc / health'))
        ) {
            return;
        }

        let bites = 0;
        let vaccinations = 0;
        let confirmed = 0;

        if (data.rawData && Array.isArray(data.rawData)) {
            const row = data.rawData;
            const is24Col = row.length >= 17;
            bites = is24Col ? Number(row[16]) || Number(row[1]) + Number(row[2]) || 0 : Number(row[1]) || 0;
            vaccinations = is24Col ? Number(row[13]) || 0 : Number(row[4]) || 0;
            confirmed = is24Col ? Number(row[12]) || 0 : Number(row[2]) || 0;
        } else {
            bites = Number(data.total || data.totalCases || data.biteCases || 0);
            vaccinations = Number(data.tcv || data.petTcv || data.vaccinated || 0);
            confirmed = Number(data.hr || data.humanDeaths || data.confirmed || 0);
        }

        const { year, month } = extractDateParts(data);
        records.push({ year, month, bites, vaccinations, confirmed });
    });

    return records;
}

/**
 * Streams active `patients` records in real time for PVO metrics, incident log,
 * and epidemiological stratification.
 */
export function subscribeToLivePvoPatients(onUpdate) {
    return onSnapshot(collection(db, 'patients'), (snapshot) => {
        const liveMetrics = [];
        const liveIncidents = [];

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

            const { year, month } = extractDateParts(data);
            const orders = data.physicianOrders || {};
            const completedDoses = Array.isArray(data.completedDoses) ? data.completedDoses : [];
            const hasTcv =
                Boolean(orders.pcecvPvrv) ||
                Boolean(data.vaccineBrand) ||
                completedDoses.length > 0;
            const isConfirmedRabies =
                data.isHumanRabies === true ||
                data.mortalityFlag === 'Confirmed' ||
                data.isAnimalRabies === true;

            const animalStatus = String(
                data.exposure?.animalStatus || data.animalStatus || 'Unknown'
            );
            const isObserved =
                Boolean(orders.observeAnimal) ||
                animalStatus.toLowerCase().includes('alive') ||
                animalStatus.toLowerCase().includes('observ');

            const catCode = String(
                data.exposureCategory || data.classification || 'Category II'
            );

            liveMetrics.push({
                year,
                month,
                bites: 1,
                vaccinations: hasTcv ? 1 : 0,
                confirmed: isConfirmedRabies ? 1 : 0,
                observed: isObserved ? 1 : 0,
                category: catCode,
                animalStatus
            });

            const incidentDate =
                data.exposure?.date ||
                data.exposureDate ||
                (data.consultDateTime ? String(data.consultDateTime).split('T')[0] : '—');
            const municipality =
                data.address?.cityMunicipality ||
                data.municipality ||
                data.facilityAcronym ||
                'Iloilo';

            liveIncidents.push({
                id: docSnap.id,
                incidentDate,
                municipality,
                animalSpecies: data.exposure?.animalType || data.animalType || 'Unknown',
                exposureCategory: catCode.startsWith('Category') ? catCode : `Category ${catCode}`,
                status: isConfirmedRabies
                    ? 'Confirmed Rabies'
                    : isObserved
                    ? 'Under Observation'
                    : 'Logged (ABTC)'
            });
        });

        liveIncidents.sort((a, b) => String(b.incidentDate).localeCompare(String(a.incidentDate)));
        onUpdate({ liveMetrics, liveIncidents: liveIncidents.slice(0, 10) });
    });
}

/**
 * Streams active PHO-confirmed human rabies outbreak alerts dispatched to PVO
 * (`rabies_alerts` where `targetAgency == 'PVO'` and `status == 'Active'`).
 */
export function subscribeToPvoOutbreakAlerts(onAlertsUpdate) {
    const q = query(
        collection(db, 'rabies_alerts'),
        where('targetAgency', '==', 'PVO'),
        where('status', '==', 'Active')
    );

    return onSnapshot(
        q,
        (snapshot) => {
            const alerts = [];
            snapshot.forEach((docSnap) => {
                alerts.push({ id: docSnap.id, ...docSnap.data() });
            });
            onAlertsUpdate(alerts);
        },
        (err) => {
            console.warn('PVO outbreak alerts stream skipped:', err);
            onAlertsUpdate([]);
        }
    );
}

/**
 * Marks a PVO outbreak alert as acknowledged / dispatched for field trace-back.
 */
export async function acknowledgePvoOutbreakAlert(alertId, officerName) {
    await updateDoc(doc(db, 'rabies_alerts', alertId), {
        status: 'Acknowledged',
        acknowledgedByPvo: officerName || 'PVO Officer',
        acknowledgedAt: new Date().toISOString()
    });
}

export async function fetchRecentSurveillanceLogs(limitCount = 10) {
    try {
        const q = query(
            collection(db, 'bite_reports'),
            orderBy('reportedAt', 'desc'),
            limit(limitCount)
        );
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
        return [];
    }
}

export async function fetchCalendarEventsForMonth(startStr, endStr) {
    const q = query(
        collection(db, 'calendar-events'),
        where('date', '>=', startStr),
        where('date', '<=', endStr)
    );
    const snap = await getDocs(q);
    const dates = new Set();
    snap.forEach((d) => dates.add(d.data().date));
    return dates;
}

export async function getCalendarEvent(dateStr) {
    const snap = await getDoc(doc(db, 'calendar-events', dateStr));
    return snap.exists() ? snap.data().description || '' : '';
}

export async function saveCalendarEvent(dateStr, description) {
    await setDoc(
        doc(db, 'calendar-events', dateStr),
        {
            category: 'PVO Announcement',
            date: dateStr,
            description,
            updatedAt: new Date().toISOString()
        },
        { merge: true }
    );
}

export async function signOutPvoSession() {
    if (auth) {
        await signOut(auth);
    }
}