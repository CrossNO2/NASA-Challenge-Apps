// File: frontend/src/types/lunar.ts

// ============================================================================
// 1. /handoff CANONICAL SCHEMAS (handoff/lunar_sites/catalog.py & app.py)
// ============================================================================

export type HandoffSiteType = 'crewed' | 'robotic' | 'reference';
export type HandoffSiteStatus = 'landed' | 'reference';
export type LunarSide = 'near side' | 'far side' | 'limb';
export type LatitudeHemisphere = 'north' | 'south' | 'equator';
export type LongitudeHemisphere = 'east' | 'west' | 'prime meridian';

/**
 * 14-field canonical landing-site record from `handoff/data/sites.json`
 * and `GET /sites` or `GET /sites/export.json`
 */
export interface HandoffSite {
  id: string;
  name: string;
  latitude: number; // Degrees, [-90, 90], north-positive
  longitude: number; // Degrees, [-180, 180), east-positive
  region: string;
  site_type: HandoffSiteType;
  status: HandoffSiteStatus;
  country: string | null;
  operator: string | null;
  mission: string | null;
  landing_date: string | null; // ISO YYYY-MM-DD or null for reference
  source_name: string;
  source_url: string;
  notes: string | null;
}

/**
 * Dataset provenance metadata from `handoff/data/dataset.json` and `GET /dataset`
 */
export interface DatasetMetadata {
  version: string;
  updated: string;
  coordinate_convention: string;
  record_count?: number;
}

/**
 * Secondary coordinate verification entry from `handoff/data/cross_check_sources.json`
 */
export interface CrossCheckSource {
  latitude: number;
  longitude: number;
  source_name: string;
  source_url: string;
}

/**
 * Request payload for `POST /coordinates/process`
 */
export interface CoordinateProcessRequest {
  latitude: number;
  longitude: number;
  label?: string;
}

/**
 * Response payload from `POST /coordinates/process`
 */
export interface CoordinateProcessResponse {
  label: string | null;
  latitude: number;
  longitude: number;
  original_longitude: number;
  longitude_normalized: boolean;
  latitude_hemisphere: LatitudeHemisphere;
  longitude_hemisphere: LongitudeHemisphere;
  lunar_side: LunarSide;
  longitude_convention: string;
  coordinate_convention: string;
  next_step: string;
}

// ============================================================================
// 2. /backend FASTAPI SCHEMAS (backend/app/schemas/site.py, ephemeris.py, feasibility.py)
// ============================================================================

export type TerrainSource = 'lola' | 'none';
export type BodyName = 'sun' | 'earth';
export type EphemerisSourceMode = 'skyfield' | 'horizons';
export type GateName = 'power' | 'comms' | 'terrain' | 'resilience';
export type GateStatus = 'PASS' | 'WARNING' | 'FAIL' | 'SKIPPED';
export type Verdict = 'GO' | 'CAUTION' | 'NO-GO';

/**
 * `GET /api/v1/health` response (`backend/app/main.py`)
 */
export interface HealthResponse {
  status: string;
  version: string;
  kernels_loaded: boolean;
  ephemeris_source: string;
  horizons_reachable?: boolean | null;
}

/**
 * 360-degree LOLA horizon elevation profile (`backend/app/schemas/site.py`)
 */
export interface HorizonProfile {
  step_deg: number;
  elevations_deg: number[];
  source: string;
}

/**
 * Candidate / benchmark landing site from `GET /api/v1/sites` (`backend/app/schemas/site.py`)
 */
export interface LandingSite {
  id: string;
  name: string;
  lat: number;
  lon: number;
  elevation_m: number;
  slope_deg: number;
  program: string;
  horizon_profile_file: string | null;
  source: string;
}

/**
 * Detailed site response from `GET /api/v1/sites/{site_id}`
 */
export interface LandingSiteDetail extends LandingSite {
  terrain_source: TerrainSource;
  horizon_profile: HorizonProfile | null;
}

/**
 * Single timestamp topocentric body state (`backend/app/schemas/ephemeris.py`)
 */
export interface BodyPosition {
  time: string; // ISO-8601 UTC
  az_deg: number; // 0 = North, clockwise
  el_deg: number; // Elevation above local astronomical horizon
  distance_km: number;
  terrain_deg: number; // Horizon terrain elevation at az_deg
  clearance_deg: number; // el_deg - terrain_deg
  visible: boolean;
  sun_fraction: number | null; // [0..1] for sun, null for earth
}

export interface SiteRef {
  site_id: string | null;
  lat: number;
  lon: number;
  elev_m: number;
}

/**
 * Time-series ephemeris response from `GET /api/v1/ephemeris`
 */
export interface EphemerisSeries {
  site: SiteRef;
  source: string; // e.g. 'skyfield_de421' or 'jpl_horizons'
  terrain_source: TerrainSource;
  step_hours: number;
  bodies: Record<BodyName, BodyPosition[]>;
}

/**
 * Single-instant sky state from `GET /api/v1/ephemeris/instant`
 */
export interface InstantState {
  site: SiteRef;
  source: string;
  terrain_source: TerrainSource;
  time: string;
  bodies: Record<BodyName, BodyPosition>;
}

/**
 * JPL Horizons vs. Skyfield DE421 validation item (`backend/app/schemas/ephemeris.py`)
 */
export interface ValidationBodyComparison {
  skyfield_az_deg: number;
  skyfield_el_deg: number;
  horizons_az_deg: number;
  horizons_el_deg: number;
  delta_az_deg: number;
  delta_el_deg: number;
  within_0_1_deg: boolean;
}

/**
 * Cross-validation proof from `GET /api/v1/validate`
 */
export interface ValidationResponse {
  site: SiteRef;
  time: string;
  skyfield_source: string;
  horizons_source: string;
  comparisons: Record<BodyName, ValidationBodyComparison>;
  all_within_tolerance: boolean;
}

/**
 * Mission constraints input (`backend/app/schemas/feasibility.py`)
 */
export interface MissionRequirements {
  mission_duration_h: number; // default 120
  min_sun_elevation_deg: number; // default 0.0
  require_dte: boolean; // default true
  min_dte_coverage_pct: number; // default 90
  max_slope_deg: number; // default 10
  scrub_delay_h: number; // default 48
}

/**
 * Single gate evaluation result (`power`, `comms`, `terrain`, `resilience`)
 */
export interface Gate {
  name: GateName;
  status: GateStatus;
  score: number; // [0..100]
  metric: number | null;
  unit: string | null;
  threshold_pass: number | null;
  threshold_warning: number | null;
  reason: string;
}

/**
 * 4-Gate Decision Engine report from `POST /api/v1/feasibility`
 */
export interface FeasibilityReport {
  site_id: string | null;
  lat: number;
  lon: number;
  landing_time: string;
  requirements: MissionRequirements;
  gates: Gate[];
  score: number;
  verdict: Verdict;
  reasons: string[];
  source: string;
  terrain_source: TerrainSource;
}

export interface FeasibilityRequest {
  site_id?: string | null;
  lat?: number | null;
  lon?: number | null;
  elev_m?: number | null;
  slope_deg?: number | null;
  landing_time: string;
  requirements?: MissionRequirements;
}

export interface OptimalWindow {
  start: string;
  end: string;
  best_time: string;
  score: number;
  verdict: Verdict;
}

export interface OptimalWindowRequest {
  site_id?: string | null;
  lat?: number | null;
  lon?: number | null;
  elev_m?: number | null;
  slope_deg?: number | null;
  start_time: string;
  search_days?: number; // default 29.53, max 60
  step_hours?: number; // default 1.0, max 6
  top_k?: number; // default 3, max 10
  requirements?: MissionRequirements;
}

export interface OptimalWindowResponse {
  site_id: string | null;
  lat: number;
  lon: number;
  search_start: string;
  search_stop: string;
  windows: OptimalWindow[];
  source: string;
  terrain_source: TerrainSource;
}

export interface CompareRequest {
  site_ids: string[]; // 2..6 site IDs
  landing_time: string;
  requirements?: MissionRequirements;
}

export interface SiteComparisonItem {
  site_id: string;
  name: string;
  program: string;
  lat: number;
  lon: number;
  slope_deg: number;
  sun_el_deg: number;
  earth_el_deg: number;
  continuous_sun_hours: number;
  hours_to_sunrise: number | null;
  cycle_illumination_pct: number;
  cycle_dte_pct: number;
  feasibility: FeasibilityReport;
}

export interface CompareResponse {
  landing_time: string;
  recommended_site_id: string;
  items: SiteComparisonItem[];
}

// ============================================================================
// 3. FRONTEND UNIFIED SITE MODEL (bridges /handoff + /backend + custom coords)
// ============================================================================

export type UIMode = 'planner' | 'explorer';

export interface UnifiedLunarSite {
  id: string;
  name: string;
  lat: number;
  lon: number;
  elevation_m: number;
  slope_deg: number;
  region: string;
  program: string;
  site_type: HandoffSiteType | 'artemis-candidate' | 'custom';
  status: HandoffSiteStatus | 'candidate' | 'custom';
  country: string | null;
  operator: string | null;
  mission: string | null;
  landing_date: string | null;
  source_name: string;
  source_url: string;
  notes: string | null;
  lunar_side: LunarSide;
  is_backend_benchmark: boolean;
}