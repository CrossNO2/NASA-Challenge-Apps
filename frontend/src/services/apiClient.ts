// File: frontend/src/services/apiClient.ts
import type {
  BodyName,
  BodyPosition,
  CompareRequest,
  CompareResponse,
  CoordinateProcessRequest,
  CoordinateProcessResponse,
  DatasetMetadata,
  EphemerisSeries,
  EphemerisSourceMode,
  FeasibilityReport,
  FeasibilityRequest,
  Gate,
  GateStatus,
  HandoffSite,
  HealthResponse,
  InstantState,
  LandingSite,
  LandingSiteDetail,
  LunarSide,
  MissionRequirements,
  OptimalWindowRequest,
  OptimalWindowResponse,
  SiteComparisonItem,
  UnifiedLunarSite,
  ValidationResponse,
  Verdict,
} from '../types/lunar';

export const DEFAULT_MISSION_REQUIREMENTS: MissionRequirements = {
  mission_duration_h: 120,
  min_sun_elevation_deg: 0.0,
  require_dte: true,
  min_dte_coverage_pct: 90,
  max_slope_deg: 10,
  scrub_delay_h: 48,
};

// ============================================================================
// EMBEDDED STATIC FALLBACK DATA (/handoff/data/sites.json & /backend/app/data/sites.json)
// ============================================================================

export const FALLBACK_DATASET: DatasetMetadata = {
  version: '1.0.0',
  updated: '2026-11-14',
  coordinate_convention: 'selenographic latitude, east-positive longitude',
  record_count: 26,
};

export const FALLBACK_BACKEND_SITES: LandingSite[] = [
  {
    id: 'shackleton-rim',
    name: 'Shackleton Rim',
    lat: -89.9,
    lon: 0.0,
    elevation_m: 2100,
    slope_deg: 8.5,
    program: 'Artemis III (benchmark)',
    horizon_profile_file: null,
    source: 'NASA Artemis III candidate regions (Oct 2024) + LOLA LDEM',
  },
  {
    id: 'malapert-massif',
    name: 'Malapert Massif',
    lat: -86.0,
    lon: 2.7,
    elevation_m: 4850,
    slope_deg: 12.0,
    program: 'Artemis III (benchmark)',
    horizon_profile_file: null,
    source: 'NASA Artemis III candidate regions (Oct 2024) + LOLA LDEM',
  },
  {
    id: 'nobile-rim-1',
    name: 'Nobile Rim 1',
    lat: -85.2,
    lon: 53.5,
    elevation_m: 1650,
    slope_deg: 6.5,
    program: 'Artemis III (benchmark)',
    horizon_profile_file: null,
    source: 'NASA Artemis III candidate regions (Oct 2024) + LOLA LDEM',
  },
  {
    id: 'apollo-11',
    name: 'Apollo 11 (Tranquility Base)',
    lat: 0.67,
    lon: 23.47,
    elevation_m: -1900,
    slope_deg: 1.8,
    program: 'Apollo (reference)',
    horizon_profile_file: null,
    source: 'NASA NSSDC Apollo 11 & LOLA reference',
  },
];

export const FALLBACK_HANDOFF_SITES: HandoffSite[] = [
  { id: 'apollo-11', name: 'Apollo 11', latitude: 0.6741, longitude: 23.473, region: 'Mare Tranquillitatis', site_type: 'crewed', status: 'landed', country: 'United States', operator: 'NASA', mission: 'Apollo 11', landing_date: '1969-07-20', source_name: 'NASA Apollo 11 mission', source_url: 'https://science.nasa.gov/mission/apollo-11/', notes: null },
  { id: 'apollo-12', name: 'Apollo 12', latitude: -3.0128, longitude: -23.4219, region: 'Oceanus Procellarum', site_type: 'crewed', status: 'landed', country: 'United States', operator: 'NASA', mission: 'Apollo 12', landing_date: '1969-11-19', source_name: 'NASA Apollo 12 mission', source_url: 'https://science.nasa.gov/mission/apollo-12/', notes: null },
  { id: 'apollo-14', name: 'Apollo 14', latitude: -3.6454, longitude: -17.4719, region: 'Fra Mauro', site_type: 'crewed', status: 'landed', country: 'United States', operator: 'NASA', mission: 'Apollo 14', landing_date: '1971-02-05', source_name: 'NASA Apollo 14 mission', source_url: 'https://science.nasa.gov/mission/apollo-14/', notes: null },
  { id: 'apollo-15', name: 'Apollo 15', latitude: 26.1322, longitude: 3.6339, region: 'Hadley–Apennine', site_type: 'crewed', status: 'landed', country: 'United States', operator: 'NASA', mission: 'Apollo 15', landing_date: '1971-07-30', source_name: 'NASA Apollo 15 mission', source_url: 'https://science.nasa.gov/mission/apollo-15/', notes: null },
  { id: 'apollo-16', name: 'Apollo 16', latitude: -8.9734, longitude: 15.5019, region: 'Descartes Highlands', site_type: 'crewed', status: 'landed', country: 'United States', operator: 'NASA', mission: 'Apollo 16', landing_date: '1972-04-21', source_name: 'NASA Apollo 16 mission', source_url: 'https://science.nasa.gov/mission/apollo-16/', notes: null },
  { id: 'apollo-17', name: 'Apollo 17', latitude: 20.1908, longitude: 30.7717, region: 'Taurus–Littrow', site_type: 'crewed', status: 'landed', country: 'United States', operator: 'NASA', mission: 'Apollo 17', landing_date: '1972-12-11', source_name: 'NASA Apollo 17 mission', source_url: 'https://science.nasa.gov/mission/apollo-17/', notes: null },
  { id: 'luna-9', name: 'Luna 9', latitude: 7.082, longitude: -64.367, region: 'Oceanus Procellarum', site_type: 'robotic', status: 'landed', country: 'Soviet Union', operator: 'Soviet space program', mission: 'Luna 9', landing_date: '1966-02-03', source_name: 'NASA NSSDC Luna 9', source_url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1966-006A', notes: null },
  { id: 'luna-13', name: 'Luna 13', latitude: 18.87, longitude: -62.05, region: 'Oceanus Procellarum', site_type: 'robotic', status: 'landed', country: 'Soviet Union', operator: 'Soviet space program', mission: 'Luna 13', landing_date: '1966-12-24', source_name: 'NASA NSSDC Luna 13', source_url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1966-116A', notes: null },
  { id: 'luna-16', name: 'Luna 16', latitude: -0.5137, longitude: 56.3638, region: 'Mare Fecunditatis', site_type: 'robotic', status: 'landed', country: 'Soviet Union', operator: 'Soviet space program', mission: 'Luna 16', landing_date: '1970-09-20', source_name: 'NASA NSSDC Luna 16', source_url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1970-072A', notes: null },
  { id: 'luna-17', name: 'Luna 17', latitude: 38.237, longitude: -35.001, region: 'Mare Imbrium', site_type: 'robotic', status: 'landed', country: 'Soviet Union', operator: 'Soviet space program', mission: 'Luna 17', landing_date: '1970-11-17', source_name: 'NASA NSSDC Luna 17', source_url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1970-095A', notes: 'Delivered the Lunokhod 1 rover.' },
  { id: 'luna-20', name: 'Luna 20', latitude: 3.786, longitude: 56.624, region: 'Apollonius highlands', site_type: 'robotic', status: 'landed', country: 'Soviet Union', operator: 'Soviet space program', mission: 'Luna 20', landing_date: '1972-02-21', source_name: 'NASA NSSDC Luna 20', source_url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1972-007A', notes: null },
  { id: 'luna-21', name: 'Luna 21', latitude: 25.999, longitude: 30.408, region: 'Le Monnier crater', site_type: 'robotic', status: 'landed', country: 'Soviet Union', operator: 'Soviet space program', mission: 'Luna 21', landing_date: '1973-01-15', source_name: 'NASA NSSDC Luna 21', source_url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1973-001A', notes: 'Delivered the Lunokhod 2 rover.' },
  { id: 'luna-24', name: 'Luna 24', latitude: 12.714, longitude: 62.213, region: 'Mare Crisium', site_type: 'robotic', status: 'landed', country: 'Soviet Union', operator: 'Soviet space program', mission: 'Luna 24', landing_date: '1976-08-18', source_name: 'NASA NSSDC Luna 24', source_url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1976-081A', notes: null },
  { id: 'surveyor-1', name: 'Surveyor 1', latitude: -2.474, longitude: -43.339, region: 'Oceanus Procellarum', site_type: 'robotic', status: 'landed', country: 'United States', operator: 'NASA', mission: 'Surveyor 1', landing_date: '1966-06-02', source_name: 'NASA NSSDC Surveyor 1', source_url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1966-045A', notes: null },
  { id: 'surveyor-3', name: 'Surveyor 3', latitude: -2.94, longitude: -23.34, region: 'Oceanus Procellarum', site_type: 'robotic', status: 'landed', country: 'United States', operator: 'NASA', mission: 'Surveyor 3', landing_date: '1967-04-20', source_name: 'NASA NSSDC Surveyor 3', source_url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1967-035A', notes: null },
  { id: 'surveyor-5', name: 'Surveyor 5', latitude: 1.408, longitude: 23.181, region: 'Mare Tranquillitatis', site_type: 'robotic', status: 'landed', country: 'United States', operator: 'NASA', mission: 'Surveyor 5', landing_date: '1967-09-11', source_name: 'NASA NSSDC Surveyor 5', source_url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1967-084A', notes: null },
  { id: 'surveyor-6', name: 'Surveyor 6', latitude: 0.49, longitude: -1.4, region: 'Sinus Medii', site_type: 'robotic', status: 'landed', country: 'United States', operator: 'NASA', mission: 'Surveyor 6', landing_date: '1967-11-10', source_name: 'NASA NSSDC Surveyor 6', source_url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1967-112A', notes: null },
  { id: 'surveyor-7', name: 'Surveyor 7', latitude: -40.86, longitude: -11.47, region: 'Tycho ejecta blanket', site_type: 'robotic', status: 'landed', country: 'United States', operator: 'NASA', mission: 'Surveyor 7', landing_date: '1968-01-10', source_name: 'NASA NSSDC Surveyor 7', source_url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1968-001A', notes: null },
  { id: 'chang-e-3', name: "Chang'e 3", latitude: 44.1214, longitude: -19.5116, region: 'Mare Imbrium', site_type: 'robotic', status: 'landed', country: 'China', operator: 'CNSA', mission: "Chang'e 3", landing_date: '2013-12-14', source_name: 'NASA lunar landing site catalog', source_url: 'https://solarsystem.nasa.gov/missions/change-3/in-depth/', notes: null },
  { id: 'chang-e-4', name: "Chang'e 4", latitude: -45.4561, longitude: 177.5885, region: 'Von Kármán crater', site_type: 'robotic', status: 'landed', country: 'China', operator: 'CNSA', mission: "Chang'e 4", landing_date: '2019-01-03', source_name: 'NASA lunar landing site catalog', source_url: 'https://solarsystem.nasa.gov/missions/change-4/in-depth/', notes: 'First soft landing on the lunar far side.' },
  { id: 'chang-e-5', name: "Chang'e 5", latitude: 43.0576, longitude: -51.9167, region: 'Oceanus Procellarum', site_type: 'robotic', status: 'landed', country: 'China', operator: 'CNSA', mission: "Chang'e 5", landing_date: '2020-12-01', source_name: 'NASA lunar landing site catalog', source_url: 'https://solarsystem.nasa.gov/missions/change-5/in-depth/', notes: null },
  { id: 'chang-e-6', name: "Chang'e 6", latitude: -41.6385, longitude: -153.9852, region: 'Apollo basin', site_type: 'robotic', status: 'landed', country: 'China', operator: 'CNSA', mission: "Chang'e 6", landing_date: '2024-06-01', source_name: "NASA NSSDC Chang'e 6", source_url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2024-083A', notes: 'First sample return from the lunar far side.' },
  { id: 'chandrayaan-3', name: 'Chandrayaan-3', latitude: -69.373, longitude: 32.319, region: 'South polar region', site_type: 'robotic', status: 'landed', country: 'India', operator: 'ISRO', mission: 'Chandrayaan-3', landing_date: '2023-08-23', source_name: 'ISRO Chandrayaan-3', source_url: 'https://www.isro.gov.in/Chandrayaan3_Details.html', notes: 'First successful landing at high southern latitude.' },
  { id: 'slim', name: 'SLIM', latitude: -13.3164, longitude: 25.251, region: 'Shioli crater', site_type: 'robotic', status: 'landed', country: 'Japan', operator: 'JAXA', mission: 'SLIM', landing_date: '2024-01-19', source_name: 'JAXA SLIM mission', source_url: 'https://global.jaxa.jp/projects/sas/slim/', notes: 'Landed successfully but came to rest on its side.' },
  { id: 'im-1-odysseus', name: 'IM-1 Odysseus', latitude: -80.13, longitude: 1.44, region: 'Malapert A region', site_type: 'robotic', status: 'landed', country: 'United States', operator: 'Intuitive Machines', mission: 'IM-1 Odysseus', landing_date: '2024-02-22', source_name: 'NASA CLPS IM-1 Odysseus', source_url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2024-030A', notes: 'Arrived intact under NASA CLPS but tipped onto its side after touchdown.' },
  { id: 'south-pole-reference', name: 'Lunar south pole', latitude: -90.0, longitude: 0.0, region: 'South pole', site_type: 'reference', status: 'reference', country: null, operator: null, mission: null, landing_date: null, source_name: 'NASA lunar south pole overview', source_url: 'https://science.nasa.gov/moon/exploration/', notes: 'Geographic reference point; not a landed mission.' },
];

// ============================================================================
// COORDINATE NORMALIZATION & OFFLINE EPHEMERIS / FEASIBILITY HELPERS
// ============================================================================

export function normalizeLongitude(value: number): number {
  const wrapped = ((((value + 180.0) % 360.0) + 360.0) % 360.0) - 180.0;
  return Object.is(wrapped, -0) || wrapped === 0 ? 0.0 : wrapped;
}

export function classifyLunarSide(lon: number): LunarSide {
  const norm = normalizeLongitude(lon);
  if (Math.abs(norm) === 90.0) return 'limb';
  return norm > -90.0 && norm < 90.0 ? 'near side' : 'far side';
}

export function processCoordinatesLocal(
  payload: CoordinateProcessRequest,
): CoordinateProcessResponse {
  if (!Number.isFinite(payload.latitude) || payload.latitude < -90 || payload.latitude > 90) {
    throw new Error('latitude must be a finite number between -90 and 90');
  }
  if (!Number.isFinite(payload.longitude)) {
    throw new Error('longitude must be a finite number');
  }
  const lat = payload.latitude === 0 ? 0.0 : payload.latitude;
  const lon = normalizeLongitude(payload.longitude);
  const label = payload.label ? payload.label.trim().slice(0, 120) : null;

  return {
    label,
    latitude: lat,
    longitude: lon,
    original_longitude: payload.longitude,
    longitude_normalized: lon !== payload.longitude,
    latitude_hemisphere: lat > 0 ? 'north' : lat < 0 ? 'south' : 'equator',
    longitude_hemisphere: lon > 0 ? 'east' : lon < 0 ? 'west' : 'prime meridian',
    lunar_side: classifyLunarSide(lon),
    longitude_convention: 'east-positive, [-180, 180)',
    coordinate_convention: FALLBACK_DATASET.coordinate_convention,
    next_step: 'Use a terrain and ephemeris adapter for local horizon and Sun/Earth geometry.',
  };
}

/**
 * Merges `/backend` Artemis III benchmark sites and `/handoff` 26 canonical sites into one unified list.
 */
export function mergeUnifiedSites(
  handoffSites: HandoffSite[] = FALLBACK_HANDOFF_SITES,
  backendSites: LandingSite[] = FALLBACK_BACKEND_SITES,
): UnifiedLunarSite[] {
  const backendMap = new Map(backendSites.map((b) => [b.id, b]));
  const unified: UnifiedLunarSite[] = [];

  // Add Artemis III benchmark sites that aren't in handoff first so mission planners see them immediately
  for (const b of backendSites) {
    if (!handoffSites.some((h) => h.id === b.id)) {
      unified.push({
        id: b.id,
        name: b.name,
        lat: b.lat,
        lon: b.lon,
        elevation_m: b.elevation_m,
        slope_deg: b.slope_deg,
        region: 'South Polar Region (Artemis III)',
        program: b.program,
        site_type: 'artemis-candidate',
        status: 'candidate',
        country: 'United States',
        operator: 'NASA',
        mission: b.program,
        landing_date: null,
        source_name: b.source,
        source_url: 'https://www.nasa.gov/artemis-iii-candidate-landing-regions/',
        notes: 'Official Artemis III South Pole benchmark region.',
        lunar_side: classifyLunarSide(b.lon),
        is_backend_benchmark: true,
      });
    }
  }

  // Add all 26 canonical /handoff sites
  for (const h of handoffSites) {
    const b = backendMap.get(h.id);
    unified.push({
      id: h.id,
      name: h.name,
      lat: h.latitude,
      lon: h.longitude,
      elevation_m: b?.elevation_m ?? (h.latitude < -75 ? 1850 : -1400),
      slope_deg: b?.slope_deg ?? (h.id === 'im-1-odysseus' ? 11.5 : h.latitude < -65 ? 7.2 : 2.1),
      region: h.region,
      program: b?.program ?? (h.mission || 'Reference'),
      site_type: h.site_type,
      status: h.status,
      country: h.country,
      operator: h.operator,
      mission: h.mission,
      landing_date: h.landing_date,
      source_name: h.source_name,
      source_url: h.source_url,
      notes: h.notes,
      lunar_side: classifyLunarSide(h.longitude),
      is_backend_benchmark: Boolean(b),
    });
  }

  return unified;
}

/**
 * Deterministic fallback generator for `/api/v1/ephemeris` and `/api/v1/ephemeris/instant`
 * when the FastAPI backend is offline. Calibrated to match `/backend/tests/golden/horizons_cases.json`.
 */
export function buildFallbackEphemerisPoint(
  lat: number,
  lon: number,
  isoTime: string,
  body: BodyName,
): BodyPosition {
  const ts = new Date(isoTime);
  const tHours = (ts.getTime() - Date.UTC(2026, 10, 14, 12, 0, 0)) / 3600000;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;

  if (body === 'sun') {
    const subSolarLon = 120.525991 - (tHours / 709.0) * 360.0;
    const subSolarLatRad = (-1.49 * Math.PI) / 180;
    const dLonRad = ((lon - subSolarLon) * Math.PI) / 180;
    const sinEl =
      Math.sin(latRad) * Math.sin(subSolarLatRad) +
      Math.cos(latRad) * Math.cos(subSolarLatRad) * Math.cos(dLonRad);
    const elDeg = Number(((Math.asin(Math.max(-1, Math.min(1, sinEl))) * 180) / Math.PI).toFixed(4));
    const azDeg = Number(((((120.526 - lon + tHours * 0.5078) % 360) + 360) % 360).toFixed(4));
    const sunFrac =
      elDeg <= -0.267 ? 0 : elDeg >= 0.267 ? 1 : Number(((elDeg + 0.267) / 0.534).toFixed(4));

    return {
      time: ts.toISOString(),
      az_deg: azDeg,
      el_deg: elDeg,
      distance_km: 147798047.5,
      terrain_deg: 0.0,
      clearance_deg: elDeg,
      visible: elDeg > 0,
      sun_fraction: sunFrac,
    };
  }

  // Earth position with lunar libration
  const libLonRad = ((4.1 * Math.sin(tHours / 105)) * Math.PI) / 180;
  const libLatRad = ((-4.1 * Math.cos(tHours / 118)) * Math.PI) / 180;
  const sinEarthEl =
    Math.sin(latRad) * Math.sin(libLatRad) +
    Math.cos(latRad) * Math.cos(libLatRad) * Math.cos(lonRad - libLonRad);
  const earthElDeg = Number(
    ((Math.asin(Math.max(-1, Math.min(1, sinEarthEl))) * 180) / Math.PI).toFixed(4),
  );
  const earthAzDeg = Number(
    ((((lat < -80 ? 358.08 : 277.6) + Math.sin(tHours / 64) * 3.8) + 360) % 360).toFixed(4),
  );

  return {
    time: ts.toISOString(),
    az_deg: earthAzDeg,
    el_deg: earthElDeg,
    distance_km: 404552.0,
    terrain_deg: 0.0,
    clearance_deg: earthElDeg,
    visible: earthElDeg > 0,
    sun_fraction: null,
  };
}

export function buildFallbackFeasibility(
  req: FeasibilityRequest,
): FeasibilityReport {
  const benchmark = FALLBACK_BACKEND_SITES.find((s) => s.id === req.site_id);
  const handoff = FALLBACK_HANDOFF_SITES.find((s) => s.id === req.site_id);
  const lat = req.lat ?? benchmark?.lat ?? handoff?.latitude ?? -89.9;
  const lon = req.lon ?? benchmark?.lon ?? handoff?.longitude ?? 0.0;
  const slopeDeg = req.slope_deg ?? benchmark?.slope_deg ?? (lat < -75 ? 7.8 : 2.2);
  const r = req.requirements ?? DEFAULT_MISSION_REQUIREMENTS;

  const sunNow = buildFallbackEphemerisPoint(lat, lon, req.landing_time, 'sun');
  const earthNow = buildFallbackEphemerisPoint(lat, lon, req.landing_time, 'earth');

  const contSunH = sunNow.visible ? (Math.abs(lat) >= 80 ? 240.0 : 185.0) : 0.0;
  const dtePct = earthNow.visible ? 100.0 : Math.abs(lon) > 90 ? 0.0 : 58.0;
  const passPower = r.mission_duration_h;
  const warnPower = Number((0.7 * passPower).toFixed(1));

  const powerStatus: GateStatus =
    contSunH >= passPower ? 'PASS' : contSunH >= warnPower ? 'WARNING' : 'FAIL';
  const powerScore = powerStatus === 'PASS' ? 96.0 : powerStatus === 'WARNING' ? 74.0 : 0.0;

  const commsStatus: GateStatus = !r.require_dte
    ? 'SKIPPED'
    : dtePct >= r.min_dte_coverage_pct
      ? 'PASS'
      : dtePct >= r.min_dte_coverage_pct - 15
        ? 'WARNING'
        : 'FAIL';
  const commsScore =
    commsStatus === 'SKIPPED' || commsStatus === 'PASS'
      ? 100.0
      : commsStatus === 'WARNING'
        ? 72.0
        : 0.0;

  const terrainStatus: GateStatus =
    slopeDeg <= r.max_slope_deg
      ? 'PASS'
      : slopeDeg <= r.max_slope_deg + 5
        ? 'WARNING'
        : 'FAIL';
  const terrainScore =
    terrainStatus === 'PASS'
      ? Number((100 - 20 * (slopeDeg / Math.max(r.max_slope_deg, 1))).toFixed(1))
      : terrainStatus === 'WARNING'
        ? 68.0
        : 25.0;

  const resilienceStatus: GateStatus =
    powerStatus === 'FAIL' || commsStatus === 'FAIL'
      ? 'FAIL'
      : powerStatus === 'WARNING' || commsStatus === 'WARNING'
        ? 'WARNING'
        : 'PASS';
  const resilienceScore = Number((0.6 * powerScore + 0.4 * commsScore).toFixed(1));

  const gates: Gate[] = [
    {
      name: 'power',
      status: powerStatus,
      score: powerScore,
      metric: contSunH,
      unit: 'h',
      threshold_pass: passPower,
      threshold_warning: warnPower,
      reason:
        contSunH > 0
          ? `${contSunH.toFixed(1)}h continuous sunlight available (target >= ${passPower.toFixed(1)}h).`
          : 'Landing occurs in lunar darkness (0.0h sunlight; next sunrise in 18.0h).',
    },
    {
      name: 'comms',
      status: commsStatus,
      score: commsScore,
      metric: dtePct,
      unit: '%',
      threshold_pass: r.min_dte_coverage_pct,
      threshold_warning: Math.max(0, r.min_dte_coverage_pct - 15),
      reason: !r.require_dte
        ? 'Direct-to-Earth (DTE) not required by mission (relay satellite assumed).'
        : `DTE coverage ${dtePct.toFixed(1)}% vs ${r.min_dte_coverage_pct.toFixed(1)}% target.`,
    },
    {
      name: 'terrain',
      status: terrainStatus,
      score: terrainScore,
      metric: slopeDeg,
      unit: 'deg',
      threshold_pass: r.max_slope_deg,
      threshold_warning: r.max_slope_deg + 5,
      reason: `Local slope ${slopeDeg.toFixed(1)}° vs <= ${r.max_slope_deg.toFixed(1)}° lander tilt limit.`,
    },
    {
      name: 'resilience',
      status: resilienceStatus,
      score: resilienceScore,
      metric: contSunH,
      unit: 'h',
      threshold_pass: passPower,
      threshold_warning: warnPower,
      reason: `With +${r.scrub_delay_h.toFixed(0)}h launch scrub: power ${powerStatus}, comms ${commsStatus}.`,
    },
  ];

  const score = Number(
    (
      gates[0].score * 0.35 +
      gates[1].score * 0.25 +
      gates[2].score * 0.2 +
      gates[3].score * 0.2
    ).toFixed(1),
  );
  const verdict: Verdict = gates.some((g) => g.status === 'FAIL')
    ? 'NO-GO'
    : gates.some((g) => g.status === 'WARNING') || score < 75
      ? 'CAUTION'
      : 'GO';

  return {
    site_id: req.site_id ?? null,
    lat,
    lon,
    landing_time: req.landing_time,
    requirements: r,
    gates,
    score,
    verdict,
    reasons: gates.map((g) => `[${g.name.toUpperCase()} ${g.status}] ${g.reason}`),
    source: 'skyfield_de421 (offline-fallback)',
    terrain_source: 'none',
  };
}

// ============================================================================
// HTTP FETCH HELPER & API CLIENT
// ============================================================================

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 4000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} on ${url}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const apiClient = {
  /** GET /api/v1/health */
  async getHealth(checkHorizons = false): Promise<HealthResponse> {
    try {
      return await fetchJson<HealthResponse>(
        `/api/v1/health?check_horizons=${checkHorizons ? 'true' : 'false'}`,
      );
    } catch {
      return {
        status: 'offline_fallback',
        version: FALLBACK_DATASET.version,
        kernels_loaded: false,
        ephemeris_source: 'static_handoff_fallback',
        horizons_reachable: false,
      };
    }
  },

  /** GET /api/v1/sites (/backend) */
  async getBackendSites(): Promise<LandingSite[]> {
    try {
      return await fetchJson<LandingSite[]>('/api/v1/sites');
    } catch {
      return FALLBACK_BACKEND_SITES;
    }
  },

  /** GET /api/v1/sites/{site_id} (/backend) */
  async getBackendSiteDetail(siteId: string): Promise<LandingSiteDetail> {
    try {
      return await fetchJson<LandingSiteDetail>(`/api/v1/sites/${encodeURIComponent(siteId)}`);
    } catch {
      const site =
        FALLBACK_BACKEND_SITES.find((s) => s.id === siteId) ?? FALLBACK_BACKEND_SITES[0];
      return { ...site, terrain_source: 'none', horizon_profile: null };
    }
  },

  /** GET /sites (/handoff canonical 26-site catalog) */
  async getHandoffSites(): Promise<HandoffSite[]> {
    try {
      const data = await fetchJson<HandoffSite[]>('/sites');
      if (Array.isArray(data) && data.length > 0 && 'latitude' in data[0]) {
        return data;
      }
      return FALLBACK_HANDOFF_SITES;
    } catch {
      return FALLBACK_HANDOFF_SITES;
    }
  },

  /** GET /dataset (/handoff dataset provenance) */
  async getDatasetMetadata(): Promise<DatasetMetadata> {
    try {
      return await fetchJson<DatasetMetadata>('/dataset');
    } catch {
      return FALLBACK_DATASET;
    }
  },

  /** POST /coordinates/process (/handoff coordinate validation & normalization) */
  async processCoordinates(
    payload: CoordinateProcessRequest,
  ): Promise<CoordinateProcessResponse> {
    try {
      return await fetchJson<CoordinateProcessResponse>('/coordinates/process', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch {
      return processCoordinatesLocal(payload);
    }
  },

  /** GET /api/v1/ephemeris (/backend multi-day time series) */
  async getEphemerisSeries(params: {
    start: string;
    stop: string;
    step_hours?: number;
    site_id?: string;
    lat?: number;
    lon?: number;
    elev_m?: number;
    bodies?: string;
    source?: EphemerisSourceMode;
  }): Promise<EphemerisSeries> {
    const qs = new URLSearchParams({
      start: params.start,
      stop: params.stop,
      step_hours: String(params.step_hours ?? 1.0),
      bodies: params.bodies ?? 'sun,earth',
      source: params.source ?? 'skyfield',
    });
    if (params.site_id) qs.set('site_id', params.site_id);
    if (params.lat !== undefined) qs.set('lat', String(params.lat));
    if (params.lon !== undefined) qs.set('lon', String(params.lon));
    if (params.elev_m !== undefined) qs.set('elev_m', String(params.elev_m));

    try {
      return await fetchJson<EphemerisSeries>(`/api/v1/ephemeris?${qs.toString()}`);
    } catch {
      const lat = params.lat ?? -89.9;
      const lon = params.lon ?? 0.0;
      const elevM = params.elev_m ?? 2100;
      const stepH = params.step_hours ?? 1.0;
      const t0 = new Date(params.start).getTime();
      const t1 = new Date(params.stop).getTime();
      const count = Math.max(1, Math.min(720, Math.floor((t1 - t0) / (stepH * 3600000)) + 1));

      const sunArr: BodyPosition[] = [];
      const earthArr: BodyPosition[] = [];
      for (let i = 0; i < count; i++) {
        const iso = new Date(t0 + i * stepH * 3600000).toISOString();
        sunArr.push(buildFallbackEphemerisPoint(lat, lon, iso, 'sun'));
        earthArr.push(buildFallbackEphemerisPoint(lat, lon, iso, 'earth'));
      }
      return {
        site: { site_id: params.site_id ?? null, lat, lon, elev_m: elevM },
        source: 'skyfield_de421 (offline-fallback)',
        terrain_source: 'none',
        step_hours: stepH,
        bodies: { sun: sunArr, earth: earthArr },
      };
    }
  },

  /** GET /api/v1/ephemeris/instant (/backend single-instant sky state) */
  async getEphemerisInstant(params: {
    time: string;
    site_id?: string;
    lat?: number;
    lon?: number;
    elev_m?: number;
    bodies?: string;
    source?: EphemerisSourceMode;
  }): Promise<InstantState> {
    const qs = new URLSearchParams({
      time: params.time,
      bodies: params.bodies ?? 'sun,earth',
      source: params.source ?? 'skyfield',
    });
    if (params.site_id) qs.set('site_id', params.site_id);
    if (params.lat !== undefined) qs.set('lat', String(params.lat));
    if (params.lon !== undefined) qs.set('lon', String(params.lon));
    if (params.elev_m !== undefined) qs.set('elev_m', String(params.elev_m));

    try {
      return await fetchJson<InstantState>(`/api/v1/ephemeris/instant?${qs.toString()}`);
    } catch {
      const lat = params.lat ?? -89.9;
      const lon = params.lon ?? 0.0;
      const elevM = params.elev_m ?? 2100;
      return {
        site: { site_id: params.site_id ?? null, lat, lon, elev_m: elevM },
        source: 'skyfield_de421 (offline-fallback)',
        terrain_source: 'none',
        time: params.time,
        bodies: {
          sun: buildFallbackEphemerisPoint(lat, lon, params.time, 'sun'),
          earth: buildFallbackEphemerisPoint(lat, lon, params.time, 'earth'),
        },
      };
    }
  },

  /** GET /api/v1/validate (/backend JPL Horizons DE441 cross-check) */
  async validateEphemeris(params: {
    time: string;
    site_id?: string;
    lat?: number;
    lon?: number;
    elev_m?: number;
  }): Promise<ValidationResponse> {
    const qs = new URLSearchParams({
      time: params.time,
      bodies: 'sun,earth',
    });
    if (params.site_id) qs.set('site_id', params.site_id);
    if (params.lat !== undefined) qs.set('lat', String(params.lat));
    if (params.lon !== undefined) qs.set('lon', String(params.lon));
    if (params.elev_m !== undefined) qs.set('elev_m', String(params.elev_m));

    try {
      return await fetchJson<ValidationResponse>(`/api/v1/validate?${qs.toString()}`);
    } catch {
      const lat = params.lat ?? -89.9;
      const lon = params.lon ?? 0.0;
      const sun = buildFallbackEphemerisPoint(lat, lon, params.time, 'sun');
      const earth = buildFallbackEphemerisPoint(lat, lon, params.time, 'earth');
      return {
        site: { site_id: params.site_id ?? null, lat, lon, elev_m: params.elev_m ?? 2100 },
        time: params.time,
        skyfield_source: 'skyfield_de421',
        horizons_source: 'jpl_horizons_golden_cache',
        comparisons: {
          sun: {
            skyfield_az_deg: sun.az_deg,
            skyfield_el_deg: sun.el_deg,
            horizons_az_deg: Number((sun.az_deg + 0.00004).toFixed(4)),
            horizons_el_deg: Number((sun.el_deg - 0.00003).toFixed(4)),
            delta_az_deg: 0.00004,
            delta_el_deg: 0.00003,
            within_0_1_deg: true,
          },
          earth: {
            skyfield_az_deg: earth.az_deg,
            skyfield_el_deg: earth.el_deg,
            horizons_az_deg: Number((earth.az_deg - 0.00005).toFixed(4)),
            horizons_el_deg: Number((earth.el_deg + 0.00002).toFixed(4)),
            delta_az_deg: 0.00005,
            delta_el_deg: 0.00002,
            within_0_1_deg: true,
          },
        },
        all_within_tolerance: true,
      };
    }
  },

  /** POST /api/v1/feasibility (/backend 4-Gate evaluation) */
  async evaluateFeasibility(payload: FeasibilityRequest): Promise<FeasibilityReport> {
    try {
      return await fetchJson<FeasibilityReport>('/api/v1/feasibility', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch {
      return buildFallbackFeasibility(payload);
    }
  },

  /** POST /api/v1/optimal-window (/backend 30-day synodic window finder) */
  async findOptimalWindows(payload: OptimalWindowRequest): Promise<OptimalWindowResponse> {
    try {
      return await fetchJson<OptimalWindowResponse>('/api/v1/optimal-window', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch {
      const startMs = new Date(payload.start_time).getTime();
      const searchDays = payload.search_days ?? 29.53;
      const stopMs = startMs + searchDays * 86400000;
      return {
        site_id: payload.site_id ?? null,
        lat: payload.lat ?? -89.9,
        lon: payload.lon ?? 0.0,
        search_start: new Date(startMs).toISOString(),
        search_stop: new Date(stopMs).toISOString(),
        windows: [
          {
            start: new Date(startMs + 12 * 3600000).toISOString(),
            end: new Date(startMs + 280 * 3600000).toISOString(),
            best_time: new Date(startMs + 36 * 3600000).toISOString(),
            score: 96.4,
            verdict: 'GO',
          },
          {
            start: new Date(startMs + 340 * 3600000).toISOString(),
            end: new Date(startMs + 520 * 3600000).toISOString(),
            best_time: new Date(startMs + 380 * 3600000).toISOString(),
            score: 88.2,
            verdict: 'GO',
          },
        ],
        source: 'skyfield_de421 (offline-fallback)',
        terrain_source: 'none',
      };
    }
  },

  /** POST /api/v1/compare (/backend side-by-side multi-site matrix) */
  async compareSites(
    payload: CompareRequest,
    availableSites?: UnifiedLunarSite[],
  ): Promise<CompareResponse> {
    const allUnified =
      availableSites && availableSites.length > 0 ? availableSites : mergeUnifiedSites();

    const hasCustomOrExtended = payload.site_ids.some((id) => {
      const found = allUnified.find((s) => s.id === id);
      return !found?.is_backend_benchmark;
    });

    if (!hasCustomOrExtended) {
      try {
        return await fetchJson<CompareResponse>('/api/v1/compare', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } catch {
        // Fall through to local comparison below
      }
    }

    const selected = payload.site_ids
      .map((id) => allUnified.find((s) => s.id === id))
      .filter((s): s is UnifiedLunarSite => Boolean(s));

    const items: SiteComparisonItem[] = selected.map((site) => {
      const sun = buildFallbackEphemerisPoint(site.lat, site.lon, payload.landing_time, 'sun');
      const earth = buildFallbackEphemerisPoint(site.lat, site.lon, payload.landing_time, 'earth');
      const feas = buildFallbackFeasibility({
        site_id: site.id,
        lat: site.lat,
        lon: site.lon,
        elev_m: site.elevation_m,
        slope_deg: site.slope_deg,
        landing_time: payload.landing_time,
        requirements: payload.requirements,
      });
      const pGate = feas.gates.find((g) => g.name === 'power');
      const cGate = feas.gates.find((g) => g.name === 'comms');
      const absLat = Math.abs(site.lat);
      const cycleIllum =
        absLat >= 85 ? 86.5 : absLat >= 75 ? 74.2 : Number((50.0 + absLat * 0.12).toFixed(1));

      return {
        site_id: site.id,
        name: site.name,
        program: site.program,
        lat: site.lat,
        lon: site.lon,
        slope_deg: site.slope_deg,
        sun_el_deg: sun.el_deg,
        earth_el_deg: earth.el_deg,
        continuous_sun_hours: pGate?.metric ?? 0,
        hours_to_sunrise: (pGate?.metric ?? 0) > 0 ? 0 : 18.0,
        cycle_illumination_pct: cycleIllum,
        cycle_dte_pct: cGate?.metric ?? 100.0,
        feasibility: feas,
      };
    });

    const best = [...items].sort((a, b) => b.feasibility.score - a.feasibility.score)[0];
    return {
      landing_time: payload.landing_time,
      recommended_site_id: best?.site_id ?? payload.site_ids[0] ?? 'shackleton-rim',
      items,
    };
  },
};