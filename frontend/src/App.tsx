// File: frontend/src/App.tsx
import { useEffect, useState } from 'react';
import {
  Activity,
  BookOpen,
  Compass,
  Layers,
  LayoutGrid,
  Radio,
  ShieldCheck,
  Sliders,
  Sun,
} from 'lucide-react';
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
import { Lunar3DViewport } from './components/Lunar3DViewport';
import { LunarMapPanel } from './components/LunarMapPanel';
import { HorizonSkyViz } from './components/HorizonSkyViz';
import { ElevationTimelineViz } from './components/ElevationTimelineViz';
import { SiteComparisonMatrix } from './components/SiteComparisonMatrix';

type WorkbenchTab = 'horizon' | 'feasibility' | 'comparison' | 'all';

export function App() {
  const [uiMode, setUiMode] = useState<UIMode>('planner');
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('horizon');

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

  const verdictBorderColor =
    feasibility?.verdict === 'GO'
      ? '#15803D'
      : feasibility?.verdict === 'CAUTION'
        ? '#B45309'
        : '#DC2626';

  return (
    <div className="nasa-chassis-grid min-h-screen text-[#141413] flex flex-col">
      {/* 1. Carbon Matte Command Header (#141413) with NASA International Orange (#FF4F00) Callouts */}
      <header className="bg-[#141413] text-[#F4F3EF] border-b-2 border-[#FF4F00] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="px-2 py-1 bg-[#FF4F00] text-white font-mono text-xs font-bold tracking-wider">
            [ITIS] MYTHOS
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wider uppercase text-[#F4F3EF] m-0">
              LUNAR LANDING SITE NAVIGATOR // JPL FLIGHT DECK v2.0
            </h1>
            <p className="text-[10px] text-stone-400 font-mono tabular-nums m-0">
              CATALOG v{dataset.version} ({dataset.updated}) · {sites.length} VERIFIED LANDING &amp; CANDIDATE SITES
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          {/* Mission Planner vs Public Explorer Mode Switch */}
          <div className="flex items-center bg-[#262624] p-0.5 border border-stone-700">
            <button
              type="button"
              onClick={() => setUiMode('planner')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono font-bold uppercase transition cursor-pointer ${
                uiMode === 'planner'
                  ? 'bg-[#FF4F00] text-white'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              <Sliders className="w-3 h-3" />
              Mission Planner
            </button>
            <button
              type="button"
              onClick={() => setUiMode('explorer')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono font-bold uppercase transition cursor-pointer ${
                uiMode === 'explorer'
                  ? 'bg-[#FF4F00] text-white'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              <BookOpen className="w-3 h-3" />
              Public Explorer
            </button>
          </div>

          <span
            className={`px-2.5 py-1 border font-mono text-[11px] font-bold tabular-nums ${
              backendOnline && validation
                ? 'bg-[#15803D]/20 text-[#4ADE80] border-[#15803D]'
                : 'bg-[#DC2626]/20 text-[#FCA5A5] border-[#DC2626]'
            }`}
          >
            {backendOnline && validation
              ? '● JPL HORIZONS DE421/441 VALIDATED'
              : '● LOCAL APPROXIMATE EPHEMERIS (BACKEND OFFLINE)'}
          </span>

          <span className="px-2.5 py-1 bg-[#262624] border border-stone-700 text-[#F4F3EF] font-mono text-[11px] tabular-nums">
            UTC: <strong className="text-[#FF4F00]">{missionTime.slice(0, 19).replace('T', ' ')}Z</strong>
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-[1440px] w-full mx-auto p-3 sm:p-4 flex flex-col gap-3.5">
        {/* 2. 4-Card Industrial Telemetry Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="nasa-panel p-3 border-l-4 border-l-[#FF4F00]">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#57534E] flex items-center justify-between">
              <span>01 // ACTIVE TARGET SITE</span>
              <Activity className="w-3.5 h-3.5 text-[#FF4F00]" />
            </div>
            <div className="text-sm font-bold text-[#141413] mt-1 truncate">
              {selectedSite.name}
            </div>
            <div className="text-xs font-mono tabular-nums text-[#FF4F00] font-semibold mt-0.5">
              {selectedSite.lat.toFixed(4)}°N, {selectedSite.lon.toFixed(4)}°E · {selectedSite.lunar_side.toUpperCase()}
            </div>
          </div>

          <div className="nasa-panel p-3 border-l-4 border-l-[#D97706]">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#57534E] flex items-center justify-between">
              <span>02 // SOLAR ELEVATION &amp; AZIMUTH</span>
              <Sun className="w-3.5 h-3.5 text-[#D97706]" />
            </div>
            <div className="text-base font-bold font-mono tabular-nums text-[#D97706] mt-1">
              EL {sun ? `${sun.el_deg.toFixed(2)}°` : '--'} / AZ {sun ? `${sun.az_deg.toFixed(1)}°` : '--'}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-[#57534E] mt-0.5">
              Solar Disc Visible: <strong>{sun?.sun_fraction != null ? `${(sun.sun_fraction * 100).toFixed(0)}%` : '--'}</strong>
            </div>
          </div>

          <div className="nasa-panel p-3 border-l-4 border-l-[#0284C7]">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#57534E] flex items-center justify-between">
              <span>03 // EARTH DTE COMMS VECTOR</span>
              <Radio className="w-3.5 h-3.5 text-[#0284C7]" />
            </div>
            <div className="text-base font-bold font-mono tabular-nums text-[#0284C7] mt-1">
              EL {earth ? `${earth.el_deg.toFixed(2)}°` : '--'} / AZ {earth ? `${earth.az_deg.toFixed(1)}°` : '--'}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-[#57534E] mt-0.5">
              Direct-to-Earth LOS: <strong>{earth?.visible ? 'VISIBLE (LOCKED)' : 'OCCLUDED'}</strong>
            </div>
          </div>

          <div
            className="nasa-panel p-3 border-l-4"
            style={{ borderLeftColor: verdictBorderColor }}
          >
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#57534E] flex items-center justify-between">
              <span>04 // 4-GATE FEASIBILITY VERDICT</span>
              <ShieldCheck className="w-3.5 h-3.5" style={{ color: verdictBorderColor }} />
            </div>
            <div
              className="text-base font-bold font-mono tabular-nums mt-1"
              style={{ color: verdictBorderColor }}
            >
              {feasibility ? `${feasibility.verdict} (${feasibility.score.toFixed(1)}/100)` : 'COMPUTING...'}
            </div>
            <div className="text-[11px] text-[#57534E] truncate mt-0.5">
              Slope: <strong className="font-mono tabular-nums text-[#141413]">{selectedSite.slope_deg.toFixed(1)}°</strong> · Terrain:{' '}
              <strong className="font-mono tabular-nums text-[#141413]">
                {feasibility?.terrain_source === 'lola'
                  ? 'LOLA DEM'
                  : feasibility?.terrain_source === 'synthetic' || horizonProfile
                    ? 'SYNTHETIC (ILLUSTRATIVE)'
                    : 'FLAT 0°'}
              </strong>
            </div>
          </div>
        </div>

        {/* 3. Primary Spatial Stage (2-Column Split on Desktop: 7 Cols 3D WebGL Engine + 5 Cols 2D Selenographic Map) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
          <div className="lg:col-span-7 flex flex-col">
            <Lunar3DViewport
              sites={sites}
              selectedSite={selectedSite}
              instant={instant}
              series={series}
              horizonProfile={horizonProfile}
              currentTimeIso={missionTime}
              maxSlopeDeg={requirements.max_slope_deg}
              onSelectSite={(site) => setSelectedSite(site)}
            />
          </div>

          <div className="lg:col-span-5 flex flex-col">
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
          </div>
        </div>

        {/* 4. Always-Visible Mission Timeline & Temporal Scrubber */}
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

        {/* 5. Tabbed Analytical Workbench */}
        <div className="flex flex-col gap-3">
          <div className="bg-[#141413] p-1 border border-[#141413] flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  ['horizon', 'TAB 01 // 360° HORIZON & POLAR SKY-PLOT', Compass],
                  ['feasibility', 'TAB 02 // 4-GATE DECISION ENGINE & OPTIMAL WINDOWS', ShieldCheck],
                  ['comparison', 'TAB 03 // MULTI-SITE COMPARISON MATRIX & EXPORT', Layers],
                  ['all', 'TAB 04 // ALL-IN-ONE PRESENTATION VIEW', LayoutGrid],
                ] as const
              ).map(([tabKey, label, Icon]) => {
                const isActive = activeTab === tabKey;
                return (
                  <button
                    key={tabKey}
                    type="button"
                    onClick={() => setActiveTab(tabKey)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-wider transition cursor-pointer ${
                      isActive
                        ? 'bg-[#FF4F00] text-white'
                        : 'bg-transparent text-stone-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>

            <span className="px-2.5 text-[10px] font-mono text-stone-400 hidden xl:inline">
              ANALYTICAL WORKBENCH // SELECT MODULE VIEW
            </span>
          </div>

          {(activeTab === 'horizon' || activeTab === 'all') && (
            <HorizonSkyViz
              site={selectedSite}
              instant={instant}
              series={series}
              horizonProfile={horizonProfile}
              validation={validation}
              currentTimeIso={missionTime}
            />
          )}

          {activeTab !== 'horizon' && (
            <SiteComparisonMatrix
              uiMode={uiMode}
              viewSection={activeTab === 'all' ? 'all' : activeTab}
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
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
