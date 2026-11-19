/* ==========================================================================
   CRIS PVO MODULE — ANIMAL BITE & RABIES CASES DATABASE SERVICE (pvo-AB-db.js)
   ========================================================================== */

import { auth, db } from '../../firebase/firebase-config.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
    collection,
    getDocs,
    onSnapshot
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

/**
 * Fetches base PVO municipal rabies surveillance rows from `pvo_rabies_cases`
 * (with fallback to `rabies_cases` or `legacy-summary`).
 */
export async function fetchPvoAnimalBiteCases() {
    let records = [];

    try {
        // Query pvo_rabies_cases first, as that is your active collection in Firebase
        let snapshot = await getDocs(collection(db, 'pvo_rabies_cases'));
        if (!snapshot || snapshot.empty) {
            snapshot = await getDocs(collection(db, 'rabies_cases'));
        }

        if (snapshot && !snapshot.empty) {
            snapshot.forEach((docSnap) => {
                const data = docSnap.data() || {};
                
                const municipality = String(
                    data['Mun/City'] || data.municipality || data.city || data.facilityName || docSnap.id || 'Unknown'
                ).trim();

                if (
                    municipality.toLowerCase() === 'total' ||
                    municipality.toLowerCase().includes('municipality')
                ) {
                    return;
                }

                // Clean district name and remove N/A or empty values
                let rawDistrict = String(data.District || data.district || '').trim();
                if (rawDistrict.toUpperCase() === 'N/A' || !rawDistrict) {
                    rawDistrict = '';
                }

                const dogPop = Number(data['Dog Population'] || data.dogPopulation || 0);
                const vDogs = Number(data['Vaccinated Dogs'] || data.vaccinatedDogs || 0);
                const vCats = Number(data['Vaccinated Cats'] || data.vaccinatedCats || 0);
                
                const rawPct = data['% of Vaccination'] !== undefined ? data['% of Vaccination'] : data.vaccinationPercentage;
                const computedPct =
                    rawPct !== undefined && rawPct !== null
                        ? Number(rawPct)
                        : dogPop > 0
                        ? Number(((vDogs / dogPop) * 100).toFixed(2))
                        : 0;

                const humanDeathVal = Number(
                    data['Human Death'] !== undefined ? data['Human Death'] : 
                    data.humanDeath !== undefined ? data.humanDeath : 
                    data.humanDeaths || data.hr || 0
                );

                records.push({
                    id: docSnap.id,
                    district: rawDistrict,
                    municipality,
                    year: Number(data.year) || new Date().getFullYear(),
                    dogPopulation: dogPop,
                    vaccinatedDogs: vDogs,
                    vaccinatedCats: vCats,
                    vaccinationPercentage: computedPct,
                    castrated: Number(data.Castrated !== undefined ? data.Castrated : data.castrated || 0),
                    spayed: Number(data.Spayed !== undefined ? data.Spayed : data.spayed || 0),
                    headSamplesSubmitted: Number(
                        data['No. of head samples submitted to:'] !== undefined ? data['No. of head samples submitted to:'] : 
                        data.headSamplesSubmitted || 0
                    ),
                    rabiesPositive: Number(data['Rabies Positive'] !== undefined ? data['Rabies Positive'] : data.rabiesPositive || 0),
                    rabiesNegative: Number(data['Rabies Negative'] !== undefined ? data['Rabies Negative'] : data.rabiesNegative || 0),
                    baseHumanDeath: humanDeathVal,
                    humanDeath: humanDeathVal,
                    documentOrder: Number(data.documentOrder || 0)
                });
            });
        }
    } catch (err) {
        console.error('❌ Error reading pvo_rabies_cases:', err);
    }

    // Fallback if records array is still empty
    if (records.length === 0) {
        try {
            let legacySnap = await getDocs(collection(db, 'legacy-summary'));
            if (!legacySnap || legacySnap.empty) {
                legacySnap = await getDocs(collection(db, 'pho-database', 'main', 'legacy-summary'));
            }

            let order = 0;
            legacySnap?.forEach((docSnap) => {
                const data = docSnap.data() || {};
                const rawName = String(
                    (Array.isArray(data.rawData) ? data.rawData[0] : '') ||
                        data.municipality ||
                        data.facilityName ||
                        docSnap.id ||
                        ''
                ).trim();

                if (!rawName || rawName.toLowerCase().includes('abtc / health')) return;
                order++;

                const is24Col = Array.isArray(data.rawData) && data.rawData.length >= 17;
                const hrDeaths = is24Col
                    ? Number(data.rawData[12] || 0)
                    : Number(data.hr || data.humanDeaths || 0);

                records.push({
                    id: docSnap.id,
                    district: '',
                    municipality: rawName,
                    year: Number(data.year) || new Date().getFullYear(),
                    dogPopulation: 0,
                    vaccinatedDogs: 0,
                    vaccinatedCats: 0,
                    vaccinationPercentage: 0,
                    castrated: 0,
                    spayed: 0,
                    headSamplesSubmitted: 0,
                    rabiesPositive: 0,
                    rabiesNegative: 0,
                    baseHumanDeath: hrDeaths,
                    humanDeath: hrDeaths,
                    documentOrder: Number(data.documentOrder || order)
                });
            });
        } catch (legacyErr) {
            console.error('❌ Error reading legacy-summary fallback:', legacyErr);
        }
    }

    records.sort((a, b) => a.documentOrder - b.documentOrder);
    return records;
}

/**
 * Real-time listener on `patients` that counts PHO-confirmed human rabies deaths
 */
export function subscribeToConfirmedHumanDeathsByMunicipality(onDeathsMapUpdate) {
    try {
        return onSnapshot(
            collection(db, 'patients'),
            (snapshot) => {
                const deathsByMun = new Map();
                snapshot.forEach((docSnap) => {
                    const data = docSnap.data() || {};
                    const isConfirmed =
                        data.isHumanRabies === true || data.mortalityFlag === 'Confirmed';
                    if (!isConfirmed) return;

                    const rawMun = String(
                        data.address?.cityMunicipality ||
                            data.patient?.municipality ||
                            data.municipality ||
                            data.city ||
                            ''
                    )
                        .trim()
                        .toLowerCase();

                    if (!rawMun) return;
                    deathsByMun.set(rawMun, (deathsByMun.get(rawMun) || 0) + 1);
                });

                onDeathsMapUpdate(deathsByMun);
            },
            (err) => {
                console.warn('Confirmed human deaths stream skipped:', err);
                onDeathsMapUpdate(new Map());
            }
        );
    } catch (e) {
        console.warn('Patient snapshot subscription failed:', e);
        return () => {};
    }
}

/**
 * Signs out the active PVO Firebase Auth session.
 */
export async function signOutPvoSession() {
    if (auth) {
        await signOut(auth);
    }
}