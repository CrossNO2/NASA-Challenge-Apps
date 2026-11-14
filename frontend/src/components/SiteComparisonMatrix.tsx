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
  Layers,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sun,
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
  if (verdict === 'GO') return '#10B981';
  if (verdict === 'CAUTION') return '#F59E0B';
  return '#EF4444';
}

function getGateColor(status: GateStatus): string {
  if (status === 'PASS') return '#10B981';
  if (status === 'WARNING') return '#F59E0B';
  if (status === 'SKIPPED') return '#0EA5E9';
  return '#EF4444';
}

export const SiteComparisonMatrix: React.FC<SiteComparisonMatrixProps> = ({
  uiMode,
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

  // Compute solar array power efficiency based on sun_fraction and grazing incidence angle
  const solarEfficiencyPct = React.useMemo(() => {
    if (!sun || !sun.visible || sun.el_deg <= 0) return 0.0;
    const discFrac = sun.sun_fraction ?? 1.0;
    // Vertical mast solar arrays at lunar poles capture grazing sunlight effectively
    const angularFactor = Math.min(1.0, 0.65 + 0.35 * Math.sin((Math.min(90, sun.el_deg * 3) * Math.PI) / 180));
    return Number((discFrac * angularFactor * 100).toFixed(1));
  }, [sun]);

  const powerGate = feasibility?.gates.find((g) => g.name === 'power');
  const commsGate = feasibility?.gates.find((g) => g.name === 'comms');

  return (
    <div className="flex flex-col gap-4">
      {/* Public Explorer Educational Banner (Shown when Public Explorer mode is active) */}
      {uiMode === 'explorer' && (
        <section
          style={{ backgroundColor: '#0F141F', border: '1px solid rgba(14,165,233,0.35)' }}
          className="rounded-lg p-4 flex flex-col gap-2"
        >
          <div className="flex items-center gap-2 text-[#0EA5E9]">
            <BookOpen className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-wider m-0">
              Public Explorer Guide // How Lunar Landing Feasibility Works
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-300 leading-relaxed pt-1">
            <div style={{ backgroundColor: '#080B11', border: '1px solid rgba(255,255,255,0.08)' }} className="p-3 rounded">
              <strong className="text-[#F59E0B] block mb-1">1. Why the Lunar South Pole? (Solar Power)</strong>
              Unlike equatorial sites (like Apollo 11) that endure 14 Earth days of freezing darkness (-170°C), high mountain rims near the South Pole (-85°S to -90°S) receive grazing sunlight for over 85% of the lunar month.
            </div>
            <div style={{ backgroundColor: '#080B11', border: '1px solid rgba(255,255,255,0.08)' }} className="p-3 rounded">
              <strong className="text-[#0EA5E9] block mb-1">2. Direct-to-Earth (DTE) Radio Comms</strong>
              Because the Moon is tidally locked, Earth hangs high overhead at Apollo 11 (+64° EL), hovers near the horizon at the South Pole (±6° libration), and is completely hidden on the Far Side (requiring a relay satellite like Queqiao).
            </div>
            <div style={{ backgroundColor: '#080B11', border: '1px solid rgba(255,255,255,0.08)' }} className="p-3 rounded">
              <strong className="text-[#10B981] block mb-1">3. The 4-Gate Decision Engine</strong>
              Every candidate landing window must pass 4 safety gates: <strong>Power</strong> (continuous sunlight), <strong>Comms</strong> (Earth line-of-sight), <strong>Terrain</strong> (lander tilt limit ≤10°), and <strong>Resilience</strong> (surviving a +48h launch scrub delay).
            </div>
          </div>
        </section>
      )}

      {/* Detailed KPI & 4-Gate Inspector Section */}
      <section
        style={{ backgroundColor: '#0F141F', border: '1px solid rgba(255,255,255,0.08)' }}
        className="rounded-lg p-4 flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#10B981]" />
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200 m-0">
                4-Gate Feasibility Engine &amp; Solar/Comms KPIs // {selectedSite.name}
              </h2>
              <p className="text-[11px] text-slate-400 font-mono tabular-nums m-0">
                Program: {selectedSite.program} · Source: {selectedSite.source_name}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={selectedSite.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] bg-[#080B11] text-[#0EA5E9] border border-white/[0.08] hover:border-[#0EA5E9]/40 no-underline"
            >
              <span>Official Citation</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <button
              type="button"
              onClick={() => onExportCatalog('json')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] bg-[#080B11] text-slate-300 border border-white/[0.08] hover:text-white cursor-pointer"
            >
              <Download className="w-3 h-3 text-[#10B981]" />
              Export JSON
            </button>
            <button
              type="button"
              onClick={() => onExportCatalog('csv')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] bg-[#080B11] text-slate-300 border border-white/[0.08] hover:text-white cursor-pointer"
            >
              <Download className="w-3 h-3 text-[#0EA5E9]" />
              Export CSV
            </button>
          </div>
        </div>

        {/* 4 Detailed KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div style={{ backgroundColor: '#080B11', border: '1px solid rgba(255,255,255,0.08)' }} className="p-3 rounded flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
              <span>SOLAR ARRAY EFFICIENCY</span>
              <BatteryCharging className="w-3.5 h-3.5 text-[#F59E0B]" />
            </div>
            <div className="text-lg font-bold font-mono tabular-nums text-[#F59E0B] mt-1">
              {solarEfficiencyPct.toFixed(1)}%
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-1">
              Sun EL: {sun ? `${sun.el_deg.toFixed(2)}°` : '--'} · Cont. Sun: {powerGate?.metric ?? 0}h
            </div>
          </div>

          <div style={{ backgroundColor: '#080B11', border: '1px solid rgba(255,255,255,0.08)' }} className="p-3 rounded flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
              <span>EARTH DTE VISIBILITY</span>
              <Radio className="w-3.5 h-3.5 text-[#0EA5E9]" />
            </div>
            <div className="text-lg font-bold font-mono tabular-nums text-[#0EA5E9] mt-1">
              {commsGate?.metric != null ? `${commsGate.metric.toFixed(1)}%` : earth?.visible ? '100.0%' : '0.0%'}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-1">
              Earth EL: {earth ? `${earth.el_deg.toFixed(2)}°` : '--'} · { selectedSite.lunar_side.toUpperCase() }
            </div>
          </div>

          <div style={{ backgroundColor: '#080B11', border: '1px solid rgba(255,255,255,0.08)' }} className="p-3 rounded flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
              <span>TERRAIN SLOPE &amp; ELEVATION</span>
              <Compass className="w-3.5 h-3.5 text-slate-300" />
            </div>
            <div
              className="text-lg font-bold font-mono tabular-nums mt-1"
              style={{
                color:
                  selectedSite.slope_deg <= requirements.max_slope_deg
                    ? '#10B981'
                    : selectedSite.slope_deg <= requirements.max_slope_deg + 5
                      ? '#F59E0B'
                      : '#EF4444',
              }}
            >
              {selectedSite.slope_deg.toFixed(1)}° SLOPE
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-1">
              Max Limit: ≤{requirements.max_slope_deg.toFixed(1)}° · Elev: {selectedSite.elevation_m}m
            </div>
          </div>

          <div style={{ backgroundColor: '#080B11', border: '1px solid rgba(255,255,255,0.08)' }} className="p-3 rounded flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
              <span>COMPOSITE VIABILITY STATUS</span>
              <Award className="w-3.5 h-3.5 text-[#10B981]" />
            </div>
            <div
              className="text-lg font-bold font-mono tabular-nums mt-1"
              style={{ color: getVerdictColor(feasibility?.verdict) }}
            >
              {feasibility ? `${feasibility.verdict} (${feasibility.score.toFixed(1)} / 100)` : '--'}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-1">
              +{requirements.scrub_delay_h}h Launch Scrub Tested
            </div>
          </div>
        </div>

        {/* Mission Planner Requirements Controls (Visible in Mission Planner Mode) */}
        {uiMode === 'planner' && (
          <div
            style={{ backgroundColor: '#080B11', border: '1px solid rgba(255,255,255,0.08)' }}
            className="p-3 rounded grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-center"
          >
            <div className="flex items-center gap-2 lg:col-span-1">
              <Sliders className="w-4 h-4 text-[#0EA5E9]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                Mission Constraints
              </span>
            </div>

            <div>
              <label className="block text-[10px] uppercase text-slate-400 font-mono tabular-nums">
                Surface Duration: <strong className="text-slate-100">{requirements.mission_duration_h}h</strong>
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
                className="w-full accent-[#F59E0B] cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase text-slate-400 font-mono tabular-nums">
                Max Lander Slope: <strong className="text-slate-100">{requirements.max_slope_deg}°</strong>
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
                className="w-full accent-[#10B981] cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase text-slate-400 font-mono tabular-nums">
                Scrub Delay Margin: <strong className="text-slate-100">+{requirements.scrub_delay_h}h</strong>
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
                className="w-full accent-[#0EA5E9] cursor-pointer"
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
                className={`px-3 py-1.5 rounded text-xs font-mono border transition cursor-pointer ${
                  requirements.require_dte
                    ? 'bg-[#0EA5E9]/15 text-[#0EA5E9] border-[#0EA5E9]/40'
                    : 'bg-[#10B981]/15 text-[#10B981] border-[#10B981]/40'
                }`}
              >
                {requirements.require_dte ? 'Comms: Direct-to-Earth Required' : 'Comms: Relay Satellite Assumed'}
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
                  style={{ backgroundColor: '#080B11', border: '1px solid rgba(255,255,255,0.08)' }}
                  className="p-3 rounded flex flex-col justify-between gap-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      GATE: {gate.name}
                    </span>
                    <span
                      className="text-[10px] font-mono tabular-nums font-bold px-2 py-0.5 rounded"
                      style={{ color, backgroundColor: 'rgba(255,255,255,0.05)' }}
                    >
                      {gate.status} ({gate.score.toFixed(0)}%)
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-1.5 bg-[#0F141F] rounded overflow-hidden">
                    <div
                      className="h-full transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(4, gate.score))}%`, backgroundColor: color }}
                    />
                  </div>

                  <p className="text-[11px] text-slate-300 leading-snug m-0">{gate.reason}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Top Optimal 30-Day Synodic Landing Windows (`POST /api/v1/optimal-window`) */}
        {optimalWindows && optimalWindows.windows.length > 0 && (
          <div
            style={{ backgroundColor: '#080B11', border: '1px solid rgba(255,255,255,0.08)' }}
            className="p-3 rounded flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#10B981] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                30-Day Optimal Synodic Landing Windows (POST /api/v1/optimal-window)
              </span>
              <span className="text-[10px] font-mono tabular-nums text-slate-400">
                Click any window to jump timeline to Best Touchdown UTC
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
                    className="text-left p-2.5 rounded bg-[#0F141F] border border-white/[0.08] hover:border-[#10B981]/50 transition flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-100 font-mono tabular-nums">
                        Window #{idx + 1}: {win.best_time.slice(0, 16).replace('T', ' ')}Z
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono tabular-nums mt-0.5">
                        Span: {win.start.slice(5, 10)} → {win.end.slice(5, 10)} UTC
                      </div>
                    </div>
                    <span
                      className="px-2 py-1 rounded text-xs font-mono tabular-nums font-bold"
                      style={{ color: vColor, backgroundColor: 'rgba(255,255,255,0.04)' }}
                    >
                      {win.verdict} {win.score.toFixed(1)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Side-by-Side Multi-Site Comparison Matrix (`POST /api/v1/compare`) */}
      <section
        style={{ backgroundColor: '#0F141F', border: '1px solid rgba(255,255,255,0.08)' }}
        className="rounded-lg p-4 flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#0EA5E9]" />
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200 m-0">
                Side-by-Side Multi-Site Comparison Matrix (POST /api/v1/compare)
              </h2>
              <p className="text-[11px] text-slate-400 font-mono tabular-nums m-0">
                Select 2 to 6 sites below to compare across one full lunar synodic cycle (709h)
              </p>
            </div>
          </div>

          {comparison && (
            <div className="px-2.5 py-1 rounded bg-[#10B981]/15 border border-[#10B981]/40 text-xs font-mono tabular-nums text-[#10B981]">
              ★ RECOMMENDED TARGET:{' '}
              <strong>
                {comparison.items.find((i) => i.site_id === comparison.recommended_site_id)?.name ??
                  comparison.recommended_site_id}
              </strong>
            </div>
          )}
        </div>

        {/* Quick Site Toggle Pills for Comparison Matrix */}
        <div className="flex flex-wrap items-center gap-1.5">
          {sites.slice(0, 12).map((s) => {
            const isChecked = comparedIds.includes(s.id);
            return (
              <button
                key={`cmp-pill-${s.id}`}
                type="button"
                onClick={() => onToggleCompareSite(s.id)}
                className={`px-2.5 py-1 rounded text-[11px] font-mono border transition cursor-pointer ${
                  isChecked
                    ? 'bg-[#0EA5E9]/20 text-[#0EA5E9] border-[#0EA5E9]/50'
                    : 'bg-[#080B11] text-slate-400 border-white/[0.08] hover:text-slate-200'
                }`}
              >
                {isChecked ? '✓ ' : '+ '}
                {s.name}
              </button>
            );
          })}
        </div>

        {/* Responsive Side-by-Side Comparison Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
            <thead>
              <tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-wider text-slate-400 bg-[#080B11]">
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
                    className={`border-b border-white/[0.06] cursor-pointer transition ${
                      isCurrent ? 'bg-[#141B29]' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-sans">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-100">{item.name}</span>
                        {isRecommended && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40">
                            ★ BEST
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400">{item.program}</div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {item.lat.toFixed(2)}°, {item.lon.toFixed(2)}°
                    </td>
                    <td className="py-2.5 px-3 text-[#F59E0B]">
                      {item.sun_el_deg >= 0 ? `+${item.sun_el_deg.toFixed(2)}°` : `${item.sun_el_deg.toFixed(2)}°`}
                    </td>
                    <td className="py-2.5 px-3 text-[#0EA5E9]">
                      {item.earth_el_deg >= 0 ? `+${item.earth_el_deg.toFixed(2)}°` : `${item.earth_el_deg.toFixed(2)}°`}
                    </td>
                    <td className="py-2.5 px-3 text-slate-200">{item.continuous_sun_hours.toFixed(1)}h</td>
                    <td className="py-2.5 px-3 text-[#F59E0B]">{item.cycle_illumination_pct.toFixed(1)}%</td>
                    <td className="py-2.5 px-3 text-[#0EA5E9]">{item.cycle_dte_pct.toFixed(1)}%</td>
                    <td
                      className="py-2.5 px-3"
                      style={{
                        color:
                          item.slope_deg <= requirements.max_slope_deg
                            ? '#10B981'
                            : item.slope_deg <= requirements.max_slope_deg + 5
                              ? '#F59E0B'
                              : '#EF4444',
                      }}
                    >
                      {item.slope_deg.toFixed(1)}°
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-100">
                      {item.feasibility.score.toFixed(1)} / 100
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold"
                        style={{ color: vColor, backgroundColor: 'rgba(255,255,255,0.05)' }}
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
      </section>

      {/* Mandatory NASA Provenance & Space Apps Disclaimer Footer */}
      <footer
        style={{ backgroundColor: '#0F141F', border: '1px solid rgba(255,255,255,0.08)' }}
        className="rounded-lg p-4 text-[11px] text-slate-400 flex flex-col gap-2"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-slate-300 font-semibold">
          <span className="inline-flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-[#F59E0B]" />
            NASA DATA PROVENANCE &amp; SCIENTIFIC DISCLAIMER
          </span>
          <span className="font-mono tabular-nums text-[10px] text-slate-400">
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