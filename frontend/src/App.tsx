// File: frontend/src/App.tsx
import { useEffect, useState } from 'react';
import { Activity, BookOpen, Radio, ShieldCheck, Sliders, Sun } from 'lucide-react';
import type {
  BodyPosition,
  CompareResponse,
  DatasetMetadata,
  EphemerisSeries,
  FeasibilityReport,
  HandoffSite,
  HorizonProfile,
  InstantState,
  MissionRequirements,
  OptimalWindowResponse,
  UIMode,
  UnifiedLunarSite,
  ValidationResponse,
} from './types/lunar';
import {
  apiClient,
  DEFAULT_MISSION_REQUIREMENTS,
  FALLBACK_DATASET,
  FALLBACK_HANDOFF_SITES,
  mergeUnifiedSites,
} from './services/apiClient';
import { LunarMapPanel } from './components/LunarMapPanel';
import { HorizonSkyViz } from './components/HorizonSkyViz';
import { ElevationTimelineViz } from './components/ElevationTimelineViz';
import { SiteComparisonMatrix } from './components/SiteComparisonMatrix';

export function App() {
  const [uiMode, setUiMode] = useState<UIMode>('planner');
  const [handoffRaw, setHandoffRaw] = useState<HandoffSite[]>(FALLBACK_HANDOFF_SITES);
  const [sites, setSites] = useState<UnifiedLunarSite[]>(() => mergeUnifiedSites());
  const [selectedSite, setSelectedSite] = useState<UnifiedLunarSite>(() => mergeUnifiedSites()[0]);
  const [dataset, setDataset] = useState<DatasetMetadata>(FALLBACK_DATASET);
  const [backendOnline, setBackendOnline] = useState<boolean>(false);

  const [startEpochIso, setStartEpochIso] = useState<string>('2026-11-15T06:00:00Z');
  const [missionTime, setMissionTime] = useState<string>('2026-11-15T06:00:00Z');
  const [windowDays, setWindowDays] = useState<number>(14);
  const [requirements, setRequirements] = useState<MissionRequirements>(DEFAULT_MISSION_REQUIREMENTS);

  const [instant, setInstant] = useState<InstantState | null>(null);
  const [series, setSeries] = useState<EphemerisSeries | null>(null);
  const [horizonProfile, setHorizonProfile] = useState<HorizonProfile | null>(null);
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [feasibility, setFeasibility] = useState<FeasibilityReport | null>(null);
  const [optimalWindows, setOptimalWindows] = useState<OptimalWindowResponse | null>(null);

  const [comparedIds, setComparedIds] = useState<string[]>([
    'shackleton-rim',
    'malapert-massif',
    'nobile-rim-1',
    'apollo-11',
  ]);
  const [comparison, setComparison] = useState<CompareResponse | null>(null);

  // 1. Initial load of catalog & backend health
  useEffect(() => {
    let active = true;
    (async () => {
      const [health, handoffSites, backendSites, ds] = await Promise.all([
        apiClient.getHealth(),
        apiClient.getHandoffSites(),
        apiClient.getBackendSites(),
        apiClient.getDatasetMetadata(),
      ]);
      if (!active) return;
      setHandoffRaw(handoffSites);
      const merged = mergeUnifiedSites(handoffSites, backendSites);
      setSites(merged);
      setSelectedSite(merged[0]);
      setDataset(ds);
      setBackendOnline(health.status === 'ok' || health.kernels_loaded);
    })();
    return () => {
      active = false;
    };
  }, []);

  // 2. Load ephemeris series, instant state, 4-gate feasibility, optimal windows, and JPL validation
  useEffect(() => {
    let active = true;
    const t0Ms = new Date(startEpochIso).getTime();
    const startIso = new Date(t0Ms).toISOString();
    const stopIso = new Date(t0Ms + windowDays * 86400000).toISOString();
    const stepHours = windowDays > 20 ? 3.0 : 2.0;

    (async () => {
      const [inst, ephemSeries, feas, optWin, val, detail] = await Promise.all([
        apiClient.getEphemerisInstant({
          time: startIso,
          site_id: selectedSite.is_backend_benchmark ? selectedSite.id : undefined,
          lat: selectedSite.lat,
          lon: selectedSite.lon,
          elev_m: selectedSite.elevation_m,
        }),
        apiClient.getEphemerisSeries({
          start: startIso,
          stop: stopIso,
          step_hours: stepHours,
          site_id: selectedSite.is_backend_benchmark ? selectedSite.id : undefined,
          lat: selectedSite.lat,
          lon: selectedSite.lon,
          elev_m: selectedSite.elevation_m,
        }),
        apiClient.evaluateFeasibility({
          site_id: selectedSite.is_backend_benchmark ? selectedSite.id : undefined,
          lat: selectedSite.lat,
          lon: selectedSite.lon,
          elev_m: selectedSite.elevation_m,
          slope_deg: selectedSite.slope_deg,
          landing_time: startIso,
          requirements,
        }),
        apiClient.findOptimalWindows({
          site_id: selectedSite.is_backend_benchmark ? selectedSite.id : undefined,
          lat: selectedSite.lat,
          lon: selectedSite.lon,
          elev_m: selectedSite.elevation_m,
          slope_deg: selectedSite.slope_deg,
          start_time: startIso,
          search_days: 29.53,
          step_hours: 2.0,
          top_k: 3,
          requirements,
        }),
        apiClient.validateEphemeris({
          time: startIso,
          site_id: selectedSite.is_backend_benchmark ? selectedSite.id : undefined,
          lat: selectedSite.lat,
          lon: selectedSite.lon,
          elev_m: selectedSite.elevation_m,
        }),
        selectedSite.is_backend_benchmark
          ? apiClient.getBackendSiteDetail(selectedSite.id)
          : Promise.resolve(null),
      ]);

      if (!active) return;
      setInstant(inst);
      setSeries(ephemSeries);
      setFeasibility(feas);
      setOptimalWindows(optWin);
      setValidation(val);
      setHorizonProfile(detail?.horizon_profile ?? null);
    })();

    return () => {
      active = false;
    };
  }, [selectedSite, startEpochIso, windowDays, requirements]);

    // 3. Load multi-site comparison matrix (`POST /api/v1/compare`)
  useEffect(() => {
    let active = true;
    (async () => {
      const res = await apiClient.compareSites(
        {
          site_ids: comparedIds,
          landing_time: startEpochIso,
          requirements,
        },
        sites,
      );
      if (!active) return;
      setComparison(res);
    })();
    return () => {
      active = false;
    };
  }, [comparedIds, startEpochIso, requirements, sites]);

  const handleScrubTime = (
    isoTime: string,
    interpolated?: { sun: BodyPosition; earth: BodyPosition },
  ) => {
    setMissionTime(isoTime);
    if (interpolated) {
      setInstant((prev) => ({
        site: prev?.site ?? {
          site_id: selectedSite.id,
          lat: selectedSite.lat,
          lon: selectedSite.lon,
          elev_m: selectedSite.elevation_m,
        },
        source: prev?.source ?? 'skyfield_de421',
        terrain_source: prev?.terrain_source ?? 'none',
        time: isoTime,
        bodies: {
          sun: interpolated.sun,
          earth: interpolated.earth,
        },
      }));
    }
  };

  const handleToggleCompareSite = (siteId: string) => {
    setComparedIds((prev) => {
      if (prev.includes(siteId)) {
        return prev.length > 2 ? prev.filter((id) => id !== siteId) : prev;
      }
      if (prev.length >= 6) {
        return [...prev.slice(1), siteId];
      }
      return [...prev, siteId];
    });
  };

  const handleExportCatalog = (format: 'json' | 'csv') => {
    const fields: (keyof HandoffSite)[] = [
      'id',
      'name',
      'latitude',
      'longitude',
      'region',
      'site_type',
      'status',
      'country',
      'operator',
      'mission',
      'landing_date',
      'source_name',
      'source_url',
      'notes',
    ];
    let content = '';
    let mime = 'application/json';
    let filename = 'lunar-sites.json';

    if (format === 'json') {
      content = JSON.stringify(handoffRaw, null, 2) + '\n';
    } else {
      mime = 'text/csv;charset=utf-8';
      filename = 'lunar-sites.csv';
      const esc = (v: unknown) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const rows = [
        fields.join(','),
        ...handoffRaw.map((r) => fields.map((f) => esc(r[f])).join(',')),
      ];
      content = rows.join('\r\n') + '\r\n';
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sun = instant?.bodies.sun;
  const earth = instant?.bodies.earth;

  return (
    <div style={{ backgroundColor: '#080B11', minHeight: '100vh' }} className="text-slate-100 flex flex-col">
      {/* Top Aerospace Telemetry Header */}
      <header
        style={{ backgroundColor: '#0F141F', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30"
      >
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
          <div>
            <h1 className="text-sm font-bold tracking-wider uppercase text-slate-100 m-0">
              LUNAR LANDING SITE NAVIGATOR // TELEMETRY CONSOLE
            </h1>
            <p className="text-[11px] text-slate-400 font-mono tabular-nums m-0">
              Catalog v{dataset.version} ({dataset.updated}) · {sites.length} Verified Sites
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          {/* Mission Planner vs Public Explorer Mode Switch */}
          <div className="flex items-center bg-[#080B11] p-0.5 rounded border border-white/[0.08]">
            <button
              type="button"
              onClick={() => setUiMode('planner')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                uiMode === 'planner'
                  ? 'bg-[#0EA5E9]/20 text-[#0EA5E9]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3 h-3" />
              Mission Planner
            </button>
            <button
              type="button"
              onClick={() => setUiMode('explorer')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                uiMode === 'explorer'
                  ? 'bg-[#10B981]/20 text-[#10B981]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-3 h-3" />
              Public Explorer
            </button>
          </div>

          <span
            className={`px-2.5 py-1 rounded border font-mono tabular-nums ${
              backendOnline
                ? 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/30'
                : 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30'
            }`}
          >
            {backendOnline ? '● FASTAPI DE421 ONLINE' : '● HANDOFF FALLBACK MODE'}
          </span>

          <span className="px-2.5 py-1 rounded bg-[#080B11] border border-white/[0.08] text-slate-300 font-mono tabular-nums">
            UTC: {missionTime.slice(0, 19)}Z
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-[1440px] w-full mx-auto p-4 flex flex-col gap-4">
        {/* Top Instant Telemetry Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div style={{ backgroundColor: '#0F141F', border: '1px solid rgba(255,255,255,0.08)' }} className="rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>ACTIVE TARGET SITE</span>
              <Activity className="w-3.5 h-3.5 text-[#0EA5E9]" />
            </div>
            <div className="text-sm font-bold text-slate-100 mt-1 truncate">
              {selectedSite.name}
            </div>
            <div className="text-xs font-mono tabular-nums text-[#0EA5E9] mt-0.5">
              {selectedSite.lat.toFixed(4)}°N, {selectedSite.lon.toFixed(4)}°E · {selectedSite.lunar_side.toUpperCase()}
            </div>
          </div>

          <div style={{ backgroundColor: '#0F141F', border: '1px solid rgba(255,255,255,0.08)' }} className="rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>SOLAR ELEVATION / AZIMUTH</span>
              <Sun className="w-3.5 h-3.5 text-[#F59E0B]" />
            </div>
            <div className="text-base font-bold font-mono tabular-nums text-[#F59E0B] mt-1">
              EL {sun ? `${sun.el_deg.toFixed(2)}°` : '--'} / AZ {sun ? `${sun.az_deg.toFixed(1)}°` : '--'}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5">
              Solar Disc Visible: {sun?.sun_fraction != null ? `${(sun.sun_fraction * 100).toFixed(0)}%` : '--'}
            </div>
          </div>

          <div style={{ backgroundColor: '#0F141F', border: '1px solid rgba(255,255,255,0.08)' }} className="rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>EARTH DTE COMMS VECTOR</span>
              <Radio className="w-3.5 h-3.5 text-[#0EA5E9]" />
            </div>
            <div className="text-base font-bold font-mono tabular-nums text-[#0EA5E9] mt-1">
              EL {earth ? `${earth.el_deg.toFixed(2)}°` : '--'} / AZ {earth ? `${earth.az_deg.toFixed(1)}°` : '--'}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5">
              Direct-to-Earth LOS: {earth?.visible ? 'VISIBLE (LOCKED)' : 'OCCLUDED'}
            </div>
          </div>

          <div style={{ backgroundColor: '#0F141F', border: '1px solid rgba(255,255,255,0.08)' }} className="rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>4-GATE FEASIBILITY VERDICT</span>
              <ShieldCheck className="w-3.5 h-3.5 text-[#10B981]" />
            </div>
            <div
              className="text-base font-bold font-mono tabular-nums mt-1"
              style={{
                color:
                  feasibility?.verdict === 'GO'
                    ? '#10B981'
                    : feasibility?.verdict === 'CAUTION'
                      ? '#F59E0B'
                      : '#EF4444',
              }}
            >
              {feasibility ? `${feasibility.verdict} (${feasibility.score.toFixed(1)}/100)` : 'COMPUTING...'}
            </div>
            <div className="text-[11px] text-slate-400 truncate mt-0.5">
              Slope: <span className="font-mono tabular-nums">{selectedSite.slope_deg.toFixed(1)}°</span> · Elev:{' '}
              <span className="font-mono tabular-nums">{selectedSite.elevation_m}m</span>
            </div>
          </div>
        </div>

        {/* Module 2: 2D Lunar Map */}
        <LunarMapPanel
          sites={sites}
          selectedSite={selectedSite}
          onSelectSite={(site) => setSelectedSite(site)}
          onCustomCoordinateSelect={(customSite) => {
            setSites((prev) => [customSite, ...prev.filter((s) => s.id !== customSite.id)]);
            setSelectedSite(customSite);
            setComparedIds((prev) => {
              if (prev.includes(customSite.id)) return prev;
              return [customSite.id, ...prev].slice(0, 6);
            });
          }}
        />

        {/* Module 3: 360° Horizon Panorama & Polar Sky-Dome */}
        <HorizonSkyViz
          site={selectedSite}
          instant={instant}
          series={series}
          horizonProfile={horizonProfile}
          validation={validation}
          currentTimeIso={missionTime}
        />

        {/* Module 4: Multi-Day Elevation Timeline & Scrubber */}
        <ElevationTimelineViz
          site={selectedSite}
          series={series}
          currentTimeIso={missionTime}
          windowDays={windowDays}
          onSelectTimeIso={handleScrubTime}
          onChangeWindowDays={(days) => setWindowDays(days)}
          onChangeStartEpoch={(iso) => {
            setStartEpochIso(iso);
            setMissionTime(iso);
          }}
        />

        {/* Module 5: KPI Cards, 4-Gate Engine, Optimal Windows & Side-by-Side Comparison Matrix */}
        <SiteComparisonMatrix
          uiMode={uiMode}
          sites={sites}
          selectedSite={selectedSite}
          instant={instant}
          feasibility={feasibility}
          optimalWindows={optimalWindows}
          comparison={comparison}
          comparedIds={comparedIds}
          requirements={requirements}
          onUpdateRequirements={setRequirements}
          onToggleCompareSite={handleToggleCompareSite}
          onSelectSiteById={(siteId) => {
            const found = sites.find((s) => s.id === siteId);
            if (found) setSelectedSite(found);
          }}
          onJumpToTime={(iso) => {
            setStartEpochIso(iso);
            setMissionTime(iso);
          }}
          onExportCatalog={handleExportCatalog}
        />
      </main>
    </div>
  );
}

export default App;