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
        // Query pvo_rabies_cases first, as that is where your active data resides
        let snapshot = await getDocs(collection(db, 'pvo_rabies_cases'));
        if (!snapshot || snapshot.empty) {
            snapshot = await getDocs(collection(db, 'rabies_cases'));
        }

        if (snapshot && !snapshot.empty) {
            snapshot.forEach((docSnap) => {
                const data = docSnap.data() || {};
                
                // Flexible helper to find property case-insensitively and handle spaces
                const getVal = (keys) => {
                    for (const k of keys) {
                        if (data[k] !== undefined && data[k] !== null) return data[k];
                        const foundKey = Object.keys(data).find(
                            realKey => realKey.trim().toLowerCase() === k.trim().toLowerCase()
                        );
                        if (foundKey && data[foundKey] !== undefined && data[foundKey] !== null) {
                            return data[foundKey];
                        }
                    }
                    return undefined;
                };

                const municipality = String(
                    getVal(['Mun/City', 'municipality', 'city', 'facilityName']) || docSnap.id || 'Unknown'
                ).trim();

                if (
                    municipality.toLowerCase() === 'total' ||
                    municipality.toLowerCase().includes('municipality')
                ) {
                    return;
                }

                // Clean district name and remove N/A
                let rawDistrict = String(getVal(['District', 'district']) || '').trim();
                if (rawDistrict.toUpperCase() === 'N/A' || !rawDistrict) {
                    rawDistrict = '';
                }

                const dogPop = Number(getVal(['Dog Population', 'dogPopulation']) || 0);
                const vDogs = Number(getVal(['Vaccinated Dogs', 'vaccinatedDogs']) || 0);
                const vCats = Number(getVal(['Vaccinated Cats', 'vaccinatedCats']) || 0);
                
                const rawPct = getVal(['% of Vaccination', 'vaccinationPercentage']);
                const computedPct =
                    rawPct !== undefined && rawPct !== null
                        ? Number(rawPct)
                        : dogPop > 0
                        ? Number(((vDogs / dogPop) * 100).toFixed(2))
                        : 0;

                const humanDeathVal = Number(getVal(['Human Death', 'humanDeath', 'humanDeaths', 'hr']) || 0);
                const castratedVal = Number(getVal(['Castrated', 'castrated']) || 0);
                const spayedVal = Number(getVal(['Spayed', 'spayed']) || 0);
                const headSamplesVal = Number(getVal(['No. of head samples submitted to:', 'headSamplesSubmitted']) || 0);
                const rabiesPosVal = Number(getVal(['Rabies Positive', 'rabiesPositive']) || 0);
                const rabiesNegVal = Number(getVal(['Rabies Negative', 'rabiesNegative']) || 0);

                records.push({
                    id: docSnap.id,
                    district: rawDistrict,
                    municipality,
                    year: Number(getVal(['year'])) || new Date().getFullYear(),
                    dogPopulation: dogPop,
                    vaccinatedDogs: vDogs,
                    vaccinatedCats: vCats,
                    vaccinationPercentage: computedPct,
                    castrated: castratedVal,
                    spayed: spayedVal,
                    headSamplesSubmitted: headSamplesVal,
                    rabiesPositive: rabiesPosVal,
                    rabiesNegative: rabiesNegVal,
                    baseHumanDeath: humanDeathVal,
                    humanDeath: humanDeathVal,
                    documentOrder: Number(getVal(['documentOrder']) || 0)
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