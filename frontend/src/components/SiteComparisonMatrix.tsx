// File: frontend/src/components/SiteComparisonMatrix.tsx
import React from 'react';
import {
  AlertTriangle,
  Award,
  BatteryCharging,
  BookOpen,
  CheckCircle2,
  Compass,
  Download,
  ExternalLink,
  Radio,
  ShieldAlert,
  Sliders,
  Sparkles,
  XCircle,
} from 'lucide-react';
import type {
  CompareResponse,
  FeasibilityReport,
  GateStatus,
  InstantState,
  MissionRequirements,
  OptimalWindowResponse,
  UIMode,
  UnifiedLunarSite,
  Verdict,
} from '../types/lunar';

interface SiteComparisonMatrixProps {
  uiMode: UIMode;
  viewSection?: 'all' | 'feasibility' | 'comparison';
  sites: UnifiedLunarSite[];
  selectedSite: UnifiedLunarSite;
  instant: InstantState | null;
  feasibility: FeasibilityReport | null;
  optimalWindows: OptimalWindowResponse | null;
  comparison: CompareResponse | null;
  comparedIds: string[];
  requirements: MissionRequirements;
  onUpdateRequirements: (next: MissionRequirements) => void;
  onToggleCompareSite: (siteId: string) => void;
  onSelectSiteById: (siteId: string) => void;
  onJumpToTime: (isoTime: string) => void;
  onExportCatalog: (format: 'json' | 'csv') => void;
}

function getVerdictColor(verdict: Verdict | undefined): string {
  if (verdict === 'GO') return '#15803D';
  if (verdict === 'CAUTION') return '#B45309';
  return '#DC2626';
}

function getGateColor(status: GateStatus): string {
  if (status === 'PASS') return '#15803D';
  if (status === 'WARNING') return '#D97706';
  if (status === 'SKIPPED') return '#0284C7';
  return '#DC2626';
}

export const SiteComparisonMatrix: React.FC<SiteComparisonMatrixProps> = ({
  uiMode,
  viewSection = 'all',
  sites,
  selectedSite,
  instant,
  feasibility,
  optimalWindows,
  comparison,
  comparedIds,
  requirements,
  onUpdateRequirements,
  onToggleCompareSite,
  onSelectSiteById,
  onJumpToTime,
  onExportCatalog,
}) => {
  const sun = instant?.bodies.sun;
  const earth = instant?.bodies.earth;

  const solarEfficiencyPct = React.useMemo(() => {
    if (!sun || !sun.visible || sun.el_deg <= 0) return 0.0;
    const discFrac = sun.sun_fraction ?? 1.0;
    const angularFactor = Math.min(1.0, 0.65 + 0.35 * Math.sin((Math.min(90, sun.el_deg * 3) * Math.PI) / 180));
    return Number((discFrac * angularFactor * 100).toFixed(1));
  }, [sun]);

  const powerGate = feasibility?.gates.find((g) => g.name === 'power');
  const commsGate = feasibility?.gates.find((g) => g.name === 'comms');

  const showFeasibility = viewSection === 'all' || viewSection === 'feasibility';
  const showComparison = viewSection === 'all' || viewSection === 'comparison';

  return (
    <div className="flex flex-col gap-4">
      {/* Public Explorer Educational Banner */}
      {uiMode === 'explorer' && (
        <section className="nasa-panel border-l-4 border-l-[#FF4F00] p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[#FF4F00]">
            <BookOpen className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-wider m-0 text-[#141413]">
              PUBLIC EXPLORER BRIEFING // HOW LUNAR LANDING FEASIBILITY WORKS
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-[#57534E] leading-relaxed pt-1">
            <div className="nasa-subpanel p-3">
              <strong className="text-[#D97706] block mb-1 uppercase font-mono">
                1. Why the Lunar South Pole? (Solar Power)
              </strong>
              Unlike equatorial sites (like Apollo 11) that endure 14 Earth days of freezing darkness (-170°C), high mountain rims near the South Pole (-85°S to -90°S) receive grazing sunlight for over 85% of the lunar month.
            </div>
            <div className="nasa-subpanel p-3">
              <strong className="text-[#0284C7] block mb-1 uppercase font-mono">
                2. Direct-to-Earth (DTE) Radio Comms
              </strong>
              Because the Moon is tidally locked, Earth hangs high overhead at Apollo 11 (+64° EL), hovers near the horizon at the South Pole (±6° libration), and is completely hidden on the Far Side (requiring a relay satellite like Queqiao).
            </div>
            <div className="nasa-subpanel p-3">
              <strong className="text-[#15803D] block mb-1 uppercase font-mono">
                3. The 4-Gate Decision Engine
              </strong>
              Every candidate landing window must pass 4 safety gates: <strong>Power</strong> (continuous sunlight), <strong>Comms</strong> (Earth line-of-sight), <strong>Terrain</strong> (lander tilt limit ≤10°), and <strong>Resilience</strong> (surviving a +48h launch scrub delay).
            </div>
          </div>
        </section>
      )}

      {/* Detailed KPI & 4-Gate Inspector Section */}
      {showFeasibility && (
        <section className="nasa-panel flex flex-col">
          <div className="px-4 py-2.5 bg-[#EAE7E0] border-b border-[#CFCBC2] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-[#141413] text-[#FF4F00] font-mono text-[10px] font-bold tracking-wider">
                MOD-05
              </span>
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#141413] m-0">
                  4-GATE FEASIBILITY ENGINE &amp; OPTIMAL SYNODIC WINDOWS // {selectedSite.name}
                </h2>
                <p className="text-[10px] text-[#57534E] font-mono tabular-nums m-0">
                  PROGRAM: {selectedSite.program.toUpperCase()} · SOURCE: {selectedSite.source_name} · TERRAIN:{' '}
                  <strong className="text-[#141413]">
                    {feasibility?.terrain_source === 'lola'
                      ? 'LOLA DEM'
                      : feasibility?.terrain_source === 'synthetic'
                        ? 'SYNTHETIC (ILLUSTRATIVE)'
                        : 'FLAT 0°'}
                  </strong>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <a
                href={selectedSite.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono font-bold uppercase bg-white text-[#141413] border border-[#CFCBC2] hover:border-[#FF4F00] no-underline"
              >
                <span>Official Citation</span>
                <ExternalLink className="w-3 h-3 text-[#FF4F00]" />
              </a>
              <button
                type="button"
                onClick={() => onExportCatalog('json')}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono font-bold uppercase bg-white text-[#141413] border border-[#CFCBC2] hover:border-[#15803D] cursor-pointer"
              >
                <Download className="w-3 h-3 text-[#15803D]" />
                JSON
              </button>
              <button
                type="button"
                onClick={() => onExportCatalog('csv')}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono font-bold uppercase bg-white text-[#141413] border border-[#CFCBC2] hover:border-[#0284C7] cursor-pointer"
              >
                <Download className="w-3 h-3 text-[#0284C7]" />
                CSV
              </button>
            </div>
          </div>

          <div className="p-4 flex flex-col gap-4">
            {/* 4 Detailed KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="nasa-subpanel p-3 flex flex-col justify-between border-l-4 border-l-[#D97706]">
                <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-[#57534E]">
                  <span>SOLAR ARRAY EFFICIENCY</span>
                  <BatteryCharging className="w-3.5 h-3.5 text-[#D97706]" />
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-[#D97706] mt-1">
                  {solarEfficiencyPct.toFixed(1)}%
                </div>
                <div className="text-[11px] font-mono tabular-nums text-[#57534E] mt-1">
                  Sun EL: {sun ? `${sun.el_deg.toFixed(2)}°` : '--'} · Cont. Sun: {powerGate?.metric ?? 0}h
                </div>
              </div>

              <div className="nasa-subpanel p-3 flex flex-col justify-between border-l-4 border-l-[#0284C7]">
                <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-[#57534E]">
                  <span>EARTH DTE VISIBILITY</span>
                  <Radio className="w-3.5 h-3.5 text-[#0284C7]" />
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-[#0284C7] mt-1">
                  {commsGate?.metric != null ? `${commsGate.metric.toFixed(1)}%` : earth?.visible ? '100.0%' : '0.0%'}
                </div>
                <div className="text-[11px] font-mono tabular-nums text-[#57534E] mt-1">
                  Earth EL: {earth ? `${earth.el_deg.toFixed(2)}°` : '--'} · {selectedSite.lunar_side.toUpperCase()}
                </div>
              </div>

              <div className="nasa-subpanel p-3 flex flex-col justify-between border-l-4 border-l-[#141413]">
                <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-[#57534E]">
                  <span>TERRAIN SLOPE &amp; ELEVATION</span>
                  <Compass className="w-3.5 h-3.5 text-[#141413]" />
                </div>
                <div
                  className="text-lg font-bold font-mono tabular-nums mt-1"
                  style={{
                    color:
                      selectedSite.slope_deg <= requirements.max_slope_deg
                        ? '#15803D'
                        : selectedSite.slope_deg <= requirements.max_slope_deg + 5
                          ? '#B45309'
                          : '#DC2626',
                  }}
                >
                  {selectedSite.slope_deg.toFixed(1)}° SLOPE
                </div>
                <div className="text-[11px] font-mono tabular-nums text-[#57534E] mt-1">
                  Max Limit: ≤{requirements.max_slope_deg.toFixed(1)}° · Elev: {selectedSite.elevation_m}m
                </div>
              </div>

              <div className="nasa-subpanel p-3 flex flex-col justify-between border-l-4 border-l-[#FF4F00]">
                <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-[#57534E]">
                  <span>COMPOSITE VIABILITY STATUS</span>
                  <Award className="w-3.5 h-3.5 text-[#FF4F00]" />
                </div>
                <div
                  className="text-lg font-bold font-mono tabular-nums mt-1"
                  style={{ color: getVerdictColor(feasibility?.verdict) }}
                >
                  {feasibility ? `${feasibility.verdict} (${feasibility.score.toFixed(1)} / 100)` : '--'}
                </div>
                <div className="text-[11px] font-mono tabular-nums text-[#57534E] mt-1">
                  +{requirements.scrub_delay_h}h Launch Scrub Tested
                </div>
              </div>
            </div>

            {/* Mission Planner Requirements Controls */}
            {uiMode === 'planner' && (
              <div className="nasa-subpanel p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-center">
                <div className="flex items-center gap-2 lg:col-span-1">
                  <Sliders className="w-4 h-4 text-[#FF4F00]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#141413]">
                    Mission Constraints
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-[#57534E] font-mono tabular-nums">
                    Surface Duration: <strong className="text-[#141413]">{requirements.mission_duration_h}h</strong>
                  </label>
                  <input
                    type="range"
                    min={24}
                    max={336}
                    step={24}
                    value={requirements.mission_duration_h}
                    onChange={(e) =>
                      onUpdateRequirements({
                        ...requirements,
                        mission_duration_h: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[#FF4F00] cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-[#57534E] font-mono tabular-nums">
                    Max Lander Slope: <strong className="text-[#141413]">{requirements.max_slope_deg}°</strong>
                  </label>
                  <input
                    type="range"
                    min={5}
                    max={20}
                    step={0.5}
                    value={requirements.max_slope_deg}
                    onChange={(e) =>
                      onUpdateRequirements({
                        ...requirements,
                        max_slope_deg: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[#FF4F00] cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-[#57534E] font-mono tabular-nums">
                    Scrub Delay Margin: <strong className="text-[#141413]">+{requirements.scrub_delay_h}h</strong>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={96}
                    step={12}
                    value={requirements.scrub_delay_h}
                    onChange={(e) =>
                      onUpdateRequirements({
                        ...requirements,
                        scrub_delay_h: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[#FF4F00] cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateRequirements({
                        ...requirements,
                        require_dte: !requirements.require_dte,
                      })
                    }
                    className={`px-3 py-1.5 text-[11px] font-mono font-bold uppercase border transition cursor-pointer ${
                      requirements.require_dte
                        ? 'bg-[#141413] text-[#FF4F00] border-[#141413]'
                        : 'bg-white text-[#15803D] border-[#15803D]'
                    }`}
                  >
                    {requirements.require_dte ? 'Comms: Direct-to-Earth Req.' : 'Comms: Relay Satellite OK'}
                  </button>
                </div>
              </div>
            )}

            {/* 4-Gate Breakdown Cards */}
            {feasibility && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {feasibility.gates.map((gate) => {
                  const color = getGateColor(gate.status);
                  return (
                    <div
                      key={gate.name}
                      className="nasa-subpanel p-3 flex flex-col justify-between gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#141413]">
                          GATE: {gate.name}
                        </span>
                        <span
                          className="text-[10px] font-mono tabular-nums font-bold px-2 py-0.5 border bg-white"
                          style={{ color, borderColor: color }}
                        >
                          {gate.status} ({gate.score.toFixed(0)}%)
                        </span>
                      </div>

                      <div className="w-full h-2 bg-[#EAE7E0] overflow-hidden border border-[#CFCBC2]">
                        <div
                          className="h-full transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(4, gate.score))}%`, backgroundColor: color }}
                        />
                      </div>

                      <p className="text-[11px] text-[#57534E] leading-snug m-0">{gate.reason}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Top Optimal 30-Day Synodic Landing Windows (`POST /api/v1/optimal-window`) */}
            {optimalWindows && optimalWindows.windows.length > 0 && (
              <div className="nasa-subpanel p-3 flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#141413] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#FF4F00]" />
                    30-DAY OPTIMAL SYNODIC LANDING WINDOWS (POST /api/v1/optimal-window)
                  </span>
                  <span className="text-[10px] font-mono tabular-nums text-[#57534E]">
                    Click any window to jump 3D Terminator &amp; Timeline to Best Touchdown UTC
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {optimalWindows.windows.map((win, idx) => {
                    const vColor = getVerdictColor(win.verdict);
                    return (
                      <button
                        key={`opt-win-${idx}`}
                        type="button"
                        onClick={() => onJumpToTime(win.best_time)}
                        className="text-left p-2.5 bg-white border border-[#CFCBC2] hover:border-[#FF4F00] transition flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <div>
                          <div className="text-xs font-bold text-[#141413] font-mono tabular-nums">
                            Window #{idx + 1}: {win.best_time.slice(0, 16).replace('T', ' ')}Z
                          </div>
                          <div className="text-[10px] text-[#57534E] font-mono tabular-nums mt-0.5">
                            Span: {win.start.slice(5, 10)} → {win.end.slice(5, 10)} UTC
                          </div>
                        </div>
                        <span
                          className="px-2 py-1 text-xs font-mono tabular-nums font-bold border bg-[#FAF9F5]"
                          style={{ color: vColor, borderColor: vColor }}
                        >
                          {win.verdict} {win.score.toFixed(1)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Side-by-Side Multi-Site Comparison Matrix (`POST /api/v1/compare`) */}
      {showComparison && (
        <section className="nasa-panel flex flex-col">
          <div className="px-4 py-2.5 bg-[#EAE7E0] border-b border-[#CFCBC2] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-[#141413] text-[#FF4F00] font-mono text-[10px] font-bold tracking-wider">
                MOD-06
              </span>
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#141413] m-0">
                  SIDE-BY-SIDE MULTI-SITE COMPARISON MATRIX (POST /api/v1/compare)
                </h2>
                <p className="text-[10px] text-[#57534E] font-mono tabular-nums m-0">
                  SELECT 2 TO 6 SITES BELOW TO COMPARE ACROSS ONE FULL LUNAR SYNODIC CYCLE (709H)
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {comparison && (
                <div className="px-2.5 py-1 bg-[#141413] text-[#FF4F00] text-xs font-mono tabular-nums">
                  ★ RECOMMENDED TARGET:{' '}
                  <strong className="text-white">
                    {comparison.items.find((i) => i.site_id === comparison.recommended_site_id)?.name ??
                      comparison.recommended_site_id}
                  </strong>
                </div>
              )}

              <button
                type="button"
                onClick={() => onExportCatalog('json')}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono font-bold uppercase bg-white text-[#141413] border border-[#CFCBC2] hover:border-[#FF4F00] cursor-pointer"
              >
                <Download className="w-3 h-3 text-[#FF4F00]" />
                Export JSON
              </button>
              <button
                type="button"
                onClick={() => onExportCatalog('csv')}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono font-bold uppercase bg-white text-[#141413] border border-[#CFCBC2] hover:border-[#0284C7] cursor-pointer"
              >
                <Download className="w-3 h-3 text-[#0284C7]" />
                Export CSV
              </button>
            </div>
          </div>

          <div className="p-4 flex flex-col gap-3">
            {/* Quick Site Toggle Pills for Comparison Matrix */}
            <div className="flex flex-wrap items-center gap-1.5">
              {sites.slice(0, 12).map((s) => {
                const isChecked = comparedIds.includes(s.id);
                return (
                  <button
                    key={`cmp-pill-${s.id}`}
                    type="button"
                    onClick={() => onToggleCompareSite(s.id)}
                    className={`px-2.5 py-1 text-[11px] font-mono font-semibold border transition cursor-pointer ${
                      isChecked
                        ? 'bg-[#141413] text-[#FF4F00] border-[#141413]'
                        : 'bg-[#FAF9F5] text-[#57534E] border-[#CFCBC2] hover:text-[#141413]'
                    }`}
                  >
                    {isChecked ? '✓ ' : '+ '}
                    {s.name}
                  </button>
                );
              })}
            </div>

            {/* Responsive Side-by-Side Comparison Table */}
            <div className="overflow-x-auto border border-[#CFCBC2]">
              <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                <thead>
                  <tr className="border-b border-[#CFCBC2] text-[10px] uppercase tracking-wider text-[#141413] bg-[#EAE7E0]">
                    <th className="py-2.5 px-3">Candidate / Historical Site</th>
                    <th className="py-2.5 px-3">Coordinates</th>
                    <th className="py-2.5 px-3">Sun EL</th>
                    <th className="py-2.5 px-3">Earth EL</th>
                    <th className="py-2.5 px-3">Cont. Sun</th>
                    <th className="py-2.5 px-3">Cycle Illum.</th>
                    <th className="py-2.5 px-3">Cycle DTE</th>
                    <th className="py-2.5 px-3">Slope</th>
                    <th className="py-2.5 px-3">4-Gate Score</th>
                    <th className="py-2.5 px-3">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {(comparison?.items ?? []).map((item) => {
                    const isRecommended = item.site_id === comparison?.recommended_site_id;
                    const isCurrent = item.site_id === selectedSite.id;
                    const vColor = getVerdictColor(item.feasibility.verdict);

                    return (
                      <tr
                        key={item.site_id}
                        onClick={() => onSelectSiteById(item.site_id)}
                        className={`border-b border-[#CFCBC2] cursor-pointer transition ${
                          isCurrent ? 'bg-[#FFF7ED]' : 'bg-white hover:bg-[#FAF9F5]'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-sans">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#141413]">{item.name}</span>
                            {isRecommended && (
                              <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-[#141413] text-[#FF4F00]">
                                ★ BEST
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-[#57534E]">{item.program}</div>
                        </td>
                        <td className="py-2.5 px-3 text-[#57534E]">
                          {item.lat.toFixed(2)}°, {item.lon.toFixed(2)}°
                        </td>
                        <td className="py-2.5 px-3 text-[#D97706] font-bold">
                          {item.sun_el_deg >= 0 ? `+${item.sun_el_deg.toFixed(2)}°` : `${item.sun_el_deg.toFixed(2)}°`}
                        </td>
                        <td className="py-2.5 px-3 text-[#0284C7] font-bold">
                          {item.earth_el_deg >= 0 ? `+${item.earth_el_deg.toFixed(2)}°` : `${item.earth_el_deg.toFixed(2)}°`}
                        </td>
                        <td className="py-2.5 px-3 text-[#141413]">{item.continuous_sun_hours.toFixed(1)}h</td>
                        <td className="py-2.5 px-3 text-[#D97706]">{item.cycle_illumination_pct.toFixed(1)}%</td>
                        <td className="py-2.5 px-3 text-[#0284C7]">{item.cycle_dte_pct.toFixed(1)}%</td>
                        <td
                          className="py-2.5 px-3 font-bold"
                          style={{
                            color:
                              item.slope_deg <= requirements.max_slope_deg
                                ? '#15803D'
                                : item.slope_deg <= requirements.max_slope_deg + 5
                                  ? '#B45309'
                                  : '#DC2626',
                          }}
                        >
                          {item.slope_deg.toFixed(1)}°
                        </td>
                        <td className="py-2.5 px-3 font-bold text-[#141413]">
                          {item.feasibility.score.toFixed(1)} / 100
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold border bg-[#FAF9F5]"
                            style={{ color: vColor, borderColor: vColor }}
                          >
                            {item.feasibility.verdict === 'GO' ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : item.feasibility.verdict === 'CAUTION' ? (
                              <AlertTriangle className="w-3 h-3" />
                            ) : (
                              <XCircle className="w-3 h-3" />
                            )}
                            {item.feasibility.verdict}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Mandatory NASA Provenance & Space Apps Disclaimer Footer */}
      <footer className="nasa-panel p-4 text-[11px] text-[#57534E] flex flex-col gap-2 bg-[#FAF9F5]">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[#141413] font-bold">
          <span className="inline-flex items-center gap-1.5 uppercase tracking-wider">
            <ShieldAlert className="w-3.5 h-3.5 text-[#FF4F00]" />
            NASA DATA PROVENANCE &amp; SCIENTIFIC DISCLAIMER
          </span>
          <span className="font-mono tabular-nums text-[10px] text-[#57534E]">
            SPICE DE421 · JPL HORIZONS DE441 · LOLA LDEM · MOON TREK WMTS · LROC QUICKMAP
          </span>
        </div>
        <p className="m-0 leading-relaxed">
          <strong>Disclaimer:</strong> Lunar Landing Site Navigator is an independent engineering &amp; educational visualization system developed for the <strong>NASA Space Apps Challenge</strong>. Ephemeris calculations are grounded in authentic NASA NAIF SPICE kernels (<code>de421.bsp</code>, <code>MOON_ME_DE421</code>), cross-validated against the <strong>NASA JPL Horizons API</strong> (<code>&lt; 0.0001°</code> angular agreement), and paired with curated NASA NSSDC, CLPS, LOLA, and LROC QuickMap landing-site records. This application is for mission-concept analysis and public education only and is not an official NASA flight-certified operational navigation system.
        </p>
      </footer>
    </div>
  );
};
