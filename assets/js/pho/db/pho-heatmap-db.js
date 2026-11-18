/* ==========================================================================
   CRIS PHO MODULE — HEATMAP DATABASE SERVICE (pho-heat-map-db.js)
   Handles Coordinate Mapping, Root `population-data` Retrieval, Real-Time
   `patients` Spatial Aggregation, Root `legacy-summary` Merging, and Sign-Out.
   ========================================================================== */

import { auth, db } from '../../firebase/firebase-config.js';
import {
    collection,
    getDocs,
    onSnapshot
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

export const FALLBACK_LOCATION = { lat: 10.90, lng: 122.60 };

/**
 * Loads municipality & facility coordinates from `facility-mapping.json`
 * and enriches them with registered `facilities` records in Firestore.
 */
export async function loadSpatialCoordinatesMap() {
    const coordsMap = {};
    const facilitiesById = new Map();

    try {
        const response = await fetch('../../assets/data/facility-mapping.json');
        if (response.ok) {
            const data = await response.json();
            if (data && Array.isArray(data.facilities)) {
                data.facilities.forEach((facility) => {
                    const lat = Number(facility.latitude);
                    const lng = Number(facility.longitude);
                    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return;

                    if (facility.facility_name) {
                        coordsMap[facility.facility_name.trim().toLowerCase()] = { lat, lng };
                    }
                    if (facility.municipality) {
                        coordsMap[facility.municipality.trim().toLowerCase()] = { lat, lng };
                    }
                });
            }
        }
    } catch (error) {
        console.warn('Error loading facility-mapping.json:', error);
    }

    try {
        const facSnap = await getDocs(collection(db, 'facilities'));
        facSnap.forEach((docSnap) => {
            const d = docSnap.data();
            const mun =
                d.address?.cityMunicipality ||
                d.address?.city ||
                d.municipality ||
                d.city ||
                '';
            const facName = d.facilityName || d.name || '';
            const lat = Number(d.latitude ?? d.location?.lat ?? d.coords?.lat ?? 0);
            const lng = Number(d.longitude ?? d.location?.lng ?? d.coords?.lng ?? 0);

            facilitiesById.set(docSnap.id, {
                municipality: mun,
                facilityName: facName,
                lat: Number.isFinite(lat) && lat !== 0 ? lat : null,
                lng: Number.isFinite(lng) && lng !== 0 ? lng : null
            });

            if (lat && lng) {
                if (facName) coordsMap[facName.trim().toLowerCase()] = { lat, lng };
                if (mun && !coordsMap[mun.trim().toLowerCase()]) {
                    coordsMap[mun.trim().toLowerCase()] = { lat, lng };
                }
            }
        });
    } catch (err) {
        console.warn('Firestore facilities coordinate enrichment skipped:', err);
    }

    return { coordsMap, facilitiesById };
}

/**
 * Resolves [lat, lng] for a municipality or facility name using exact and partial matching.
 */
export function resolveLocationCoordinates(placeName, coordsMap, fallbackCoords = null) {
    if (fallbackCoords && Number.isFinite(fallbackCoords.lat) && Number.isFinite(fallbackCoords.lng)) {
        return fallbackCoords;
    }
    if (!placeName) return FALLBACK_LOCATION;

    const clean = String(placeName)
        .trim()
        .toLowerCase()
        .replace(/^municipality of\s+/i, '')
        .replace(/\s+city$/i, '')
        .trim();

    if (coordsMap[clean]) return coordsMap[clean];

    for (const [key, coords] of Object.entries(coordsMap)) {
        if (clean.includes(key) || key.includes(clean)) {
            return coords;
        }
    }

    return FALLBACK_LOCATION;
}

/**
 * Fetches population totals from the root `population-data` collection
 * (with fallback to `pho-database/main/population-data`).
 */
export async function fetchHeatmapPopulationData() {
    try {
        let querySnapshot = await getDocs(collection(db, 'population-data'));
        if (!querySnapshot || querySnapshot.empty) {
            querySnapshot = await getDocs(
                collection(db, 'pho-database', 'main', 'population-data')
            );
        }

        if (!querySnapshot || querySnapshot.empty) {
            return { totalHumanPopulation: 0, municipalityPopulations: {} };
        }

        let totalPopulationAccumulator = 0;
        const updatedMunicipalities = {};

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const docIdUpper = docSnap.id.trim().toUpperCase();

            const rawMunicipality = String(
                data.municipality ||
                    data.city ||
                    data.facilityName ||
                    data.name ||
                    (Array.isArray(data.rawData) ? data.rawData[0] : '') ||
                    docSnap.id
            ).trim();

            const labelLower = rawMunicipality.toLowerCase();
            if (labelLower.includes('municipality') || labelLower.includes('total population')) {
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
                    const candidate = Number(String(data.rawData[i]).replace(/,/g, '').trim());
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
                labelLower === 'iloilo' ||
                labelLower === 'iloilo province'
            ) {
                totalPopulationAccumulator = cleanVal;
            } else if (rawMunicipality) {
                updatedMunicipalities[labelLower] = cleanVal;
            }
        });

        if (totalPopulationAccumulator === 0) {
            Object.values(updatedMunicipalities).forEach((val) => {
                totalPopulationAccumulator += val;
            });
        }

        return {
            totalHumanPopulation: totalPopulationAccumulator,
            municipalityPopulations: updatedMunicipalities
        };
    } catch (error) {
        console.error('Error fetching population data:', error);
        return { totalHumanPopulation: 0, municipalityPopulations: {} };
    }
}

/**
 * Loads legacy provincial rows from root `legacy-summary`
 * (with fallbacks to `pho-database/main/legacy-summary` and `pho_rabies_cases`).
 */
export async function fetchLegacyHeatmapRows(coordsMap) {
    const legacyRows = [];

    try {
        let querySnapshot = await getDocs(collection(db, 'legacy-summary'));
        if (!querySnapshot || querySnapshot.empty) {
            querySnapshot = await getDocs(
                collection(db, 'pho-database', 'main', 'legacy-summary')
            );
        }
        if (!querySnapshot || querySnapshot.empty) {
            querySnapshot = await getDocs(collection(db, 'pho_rabies_cases'));
        }

        if (!querySnapshot || querySnapshot.empty) return legacyRows;

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.rawData && Array.isArray(data.rawData)) {
                const row = data.rawData;
                const cleanedMunName = String(
                    row[0] || data.facilityName || docSnap.id || ''
                ).trim();
                if (!cleanedMunName || cleanedMunName.toLowerCase().includes('abtc / health')) {
                    return;
                }
                const coords = resolveLocationCoordinates(cleanedMunName, coordsMap);
                const is24Col = row.length >= 17;
                legacyRows.push({
                    Year: Number(data.year) || new Date().getFullYear(),
                    Municipality: cleanedMunName,
                    Latitude: coords.lat,
                    Longitude: coords.lng,
                    'Animal Bite Cases': is24Col
                        ? Number(row[16]) || Number(row[1]) + Number(row[2]) || 0
                        : Number(row[1]) || 0,
                    'Human Rabies Deaths': is24Col ? Number(row[12]) || 0 : Number(row[2]) || 0,
                    'Animal Rabies Deaths': is24Col ? 0 : Number(row[3]) || 0
                });
            } else {
                const cleanedMunName = String(
                    data.municipality || data.facilityName || docSnap.id || ''
                ).trim();
                if (!cleanedMunName) return;
                const coords = resolveLocationCoordinates(cleanedMunName, coordsMap);
                legacyRows.push({
                    Year: Number(data.year) || new Date().getFullYear(),
                    Municipality: cleanedMunName,
                    Latitude: coords.lat,
                    Longitude: coords.lng,
                    'Animal Bite Cases':
                        Number(data.total || data.totalCases || data.biteCases) || 0,
                    'Human Rabies Deaths': Number(data.hr || data.humanDeaths) || 0,
                    'Animal Rabies Deaths': Number(data.animalDeaths) || 0
                });
            }
        });
    } catch (error) {
        console.error('Error fetching legacy heatmap rows:', error);
    }

    return legacyRows;
}

/**
 * Streams active `patients` records in real time, grouping by (Year, Municipality)
 * and including PHO-confirmed human rabies deaths (`isHumanRabies === true || mortalityFlag === 'Confirmed'`).
 */
export function subscribeToLiveHeatmapCases({ coordsMap, facilitiesById }, onUpdate, onError) {
    return onSnapshot(
        collection(db, 'patients'),
        (snapshot) => {
            const grouped = new Map();

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

                let year = new Date().getFullYear();
                const rawDate =
                    data.consultDateTime ||
                    data.exposureDate ||
                    data.createdAt ||
                    data.submittedAt;
                if (rawDate) {
                    const dt =
                        typeof rawDate.toDate === 'function'
                            ? rawDate.toDate()
                            : new Date(rawDate);
                    if (!isNaN(dt.getTime())) {
                        year = dt.getFullYear();
                    }
                }

                const facInfo = data.facilityId ? facilitiesById.get(data.facilityId) : null;
                const municipalityName = String(
                    data.address?.cityMunicipality ||
                        data.patient?.municipality ||
                        data.municipality ||
                        data.city ||
                        facInfo?.municipality ||
                        data.facilityName ||
                        facInfo?.facilityName ||
                        'Iloilo City'
                ).trim();

                const explicitLat = Number(data.latitude ?? data.location?.lat ?? 0);
                const explicitLng = Number(data.longitude ?? data.location?.lng ?? 0);
                const explicitCoords =
                    explicitLat && explicitLng
                        ? { lat: explicitLat, lng: explicitLng }
                        : facInfo?.lat && facInfo?.lng
                        ? { lat: facInfo.lat, lng: facInfo.lng }
                        : null;

                const coords = resolveLocationCoordinates(
                    municipalityName,
                    coordsMap,
                    explicitCoords
                );

                const isConfirmedHumanDeath =
                    data.isHumanRabies === true || data.mortalityFlag === 'Confirmed';
                const animalStatusLower = String(
                    data.exposure?.animalStatus || data.animalStatus || ''
                ).toLowerCase();
                const isRabidAnimal =
                    data.isAnimalRabies === true ||
                    animalStatusLower.includes('rabid') ||
                    animalStatusLower.includes('positive');

                const key = `${year}__${municipalityName.toLowerCase()}`;
                if (!grouped.has(key)) {
                    grouped.set(key, {
                        Year: year,
                        Municipality: municipalityName,
                        Latitude: coords.lat,
                        Longitude: coords.lng,
                        'Animal Bite Cases': 0,
                        'Human Rabies Deaths': 0,
                        'Animal Rabies Deaths': 0
                    });
                }

                const entry = grouped.get(key);
                entry['Animal Bite Cases'] += 1;
                if (isConfirmedHumanDeath) {
                    entry['Human Rabies Deaths'] += 1;
                }
                if (isRabidAnimal) {
                    entry['Animal Rabies Deaths'] += 1;
                }
            });

            onUpdate(Array.from(grouped.values()));
        },
        (error) => {
            console.error('Live heatmap stream error:', error);
            if (onError) onError(error);
        }
    );
}

/**
 * Signs out the active PHO session.
 */
export async function signOutPhoHeatmap() {
    if (auth) {
        await signOut(auth);
    }
}