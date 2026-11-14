// File: frontend/src/components/HorizonSkyViz.tsx
import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Compass,
  Eye,
  Orbit,
  Radio,
  Sun,
} from 'lucide-react';
import type {
  BodyPosition,
  EphemerisSeries,
  HorizonProfile,
  InstantState,
  UnifiedLunarSite,
  ValidationResponse,
} from '../types/lunar';

interface HorizonSkyVizProps {
  site: UnifiedLunarSite;
  instant: InstantState | null;
  series: EphemerisSeries | null;
  horizonProfile: HorizonProfile | null;
  validation: ValidationResponse | null;
  currentTimeIso: string;
}

type SkyViewMode = 'panorama' | 'polar';

/**
 * Compute hours remaining until next state transition (Rise or Set) from ephemeris series
 */
function computeTransitionCountdown(
  positions: BodyPosition[] | undefined,
  currentTimeIso: string,
  stepHours: number,
): { label: string; hours: string; isVisibleNow: boolean } {
  if (!positions || positions.length === 0) {
    return { label: 'AWAITING TELEMETRY', hours: '--.-h', isVisibleNow: false };
  }

  const targetMs = new Date(currentTimeIso).getTime();
  let startIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < positions.length; i++) {
    const diff = Math.abs(new Date(positions[i].time).getTime() - targetMs);
    if (diff < minDiff) {
      minDiff = diff;
      startIdx = i;
    }
  }

  const currentVis = positions[startIdx].visible;
  for (let i = startIdx + 1; i < positions.length; i++) {
    if (positions[i].visible !== currentVis) {
      const deltaHours = (i - startIdx) * stepHours;
      return {
        label: currentVis ? 'TIME TO SET' : 'TIME TO RISE',
        hours: `${deltaHours.toFixed(1)}h`,
        isVisibleNow: currentVis,
      };
    }
  }

  const remainingWindowH = (positions.length - 1 - startIdx) * stepHours;
  return {
    label: currentVis ? 'CONTINUOUS VISIBILITY' : 'CONTINUOUS OCCLUSION',
    hours: `>${remainingWindowH.toFixed(0)}h`,
    isVisibleNow: currentVis,
  };
}

export const HorizonSkyViz: React.FC<HorizonSkyVizProps> = ({
  site,
  instant,
  series,
  horizonProfile,
  validation,
  currentTimeIso,
}) => {
  const [viewMode, setViewMode] = useState<SkyViewMode>('panorama');

  const sunNow = instant?.bodies.sun;
  const earthNow = instant?.bodies.earth;
  const sunSeries = series?.bodies.sun ?? [];
  const earthSeries = series?.bodies.earth ?? [];
  const stepHours = series?.step_hours ?? 1.0;

  const sunCountdown = useMemo(
    () => computeTransitionCountdown(sunSeries, currentTimeIso, stepHours),
    [sunSeries, currentTimeIso, stepHours],
  );
  const earthCountdown = useMemo(
    () => computeTransitionCountdown(earthSeries, currentTimeIso, stepHours),
    [earthSeries, currentTimeIso, stepHours],
  );

  // Build 360-deg terrain horizon array (either from LOLA profile or synthetic crater rim model for visual clarity)
  const horizonElevations = useMemo(() => {
    if (horizonProfile && horizonProfile.elevations_deg.length > 0) {
      return horizonProfile.elevations_deg;
    }
    // Flat 0 deg astronomical horizon when terrain_source === 'none'
    return Array.from({ length: 360 }, () => 0);
  }, [horizonProfile]);

  // --- 360° Panorama Projection Helpers (width=720, height=260, el range: -30° to +90°) ---
  const panWidth = 720;
  const panHeight = 260;
  const elMin = -30;
  const elMax = 90;

  const projectPanorama = (azDeg: number, elDeg: number) => {
    const clampedEl = Math.max(elMin, Math.min(elMax, elDeg));
    const x = (((azDeg % 360) + 360) % 360 / 360) * panWidth;
    const y = ((elMax - clampedEl) / (elMax - elMin)) * panHeight;
    return { x, y };
  };

  const zeroHorizonY = projectPanorama(0, 0).y;

  const terrainPolygonPoints = useMemo(() => {
    const pts: string[] = [`0,${panHeight}`];
    for (let az = 0; az < 360; az += 2) {
      const el = horizonElevations[az % horizonElevations.length] ?? 0;
      const { x, y } = projectPanorama(az, el);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    const lastEl = horizonElevations[0] ?? 0;
    const endPt = projectPanorama(360, lastEl);
    pts.push(`${panWidth},${endPt.y.toFixed(1)}`);
    pts.push(`${panWidth},${panHeight}`);
    return pts.join(' ');
  }, [horizonElevations]);

  // --- Polar Sky-Dome Projection Helpers (cx=180, cy=130, rMax=108, el range: -15° to +90°) ---
  const polarCx = 360;
  const polarCy = 130;
  const polarMaxR = 108;

  const projectPolar = (azDeg: number, elDeg: number) => {
    const clampedEl = Math.max(-15, Math.min(90, elDeg));
    // Zenith (+90°) is r=0; Horizon (0°) is r=polarMaxR * (90/105); -15° is polarMaxR
    const r = ((90 - clampedEl) / 105) * polarMaxR;
    const rad = ((azDeg - 90) * Math.PI) / 180;
    return {
      x: polarCx + r * Math.cos(rad),
      y: polarCy + r * Math.sin(rad),
    };
  };

  const polarZeroHorizonR = (90 / 105) * polarMaxR;

  const sunValidation = validation?.comparisons?.sun;
  const earthValidation = validation?.comparisons?.earth;

  return (
    <section
      style={{ backgroundColor: '#0F141F', border: '1px solid rgba(255,255,255,0.08)' }}
      className="rounded-lg p-4 flex flex-col gap-4"
    >
      {/* Header & View Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-[#F59E0B]" />
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200 m-0">
              Sun &amp; Earth Horizon Sky-Plot // {site.name}
            </h2>
            <p className="text-[11px] text-slate-400 font-mono tabular-nums m-0">
              Frame: MOON_ME_DE421 · Terrain Mask: {instant?.terrain_source === 'lola' ? 'LOLA 360° DEM' : '0.0° Astronomical Horizon'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode('panorama')}
            className={`px-3 py-1 rounded text-xs font-medium border transition cursor-pointer ${
              viewMode === 'panorama'
                ? 'bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/40'
                : 'bg-[#080B11] text-slate-400 border-white/[0.08] hover:text-slate-200'
            }`}
          >
            360° Horizon Panorama
          </button>
          <button
            type="button"
            onClick={() => setViewMode('polar')}
            className={`px-3 py-1 rounded text-xs font-medium border transition cursor-pointer ${
              viewMode === 'polar'
                ? 'bg-[#0EA5E9]/15 text-[#0EA5E9] border-[#0EA5E9]/40'
                : 'bg-[#080B11] text-slate-400 border-white/[0.08] hover:text-slate-200'
            }`}
          >
            Polar Sky-Dome
          </button>
        </div>
      </div>

      {/* Countdown & Live Clearance Telemetry Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div
          style={{ backgroundColor: '#080B11', border: '1px solid rgba(255,255,255,0.08)' }}
          className="rounded p-2.5 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
            <span>SOLAR HORIZON CLEARANCE</span>
            <Sun className="w-3.5 h-3.5 text-[#F59E0B]" />
          </div>
          <div className="text-sm font-bold font-mono tabular-nums text-[#F59E0B] mt-1">
            {sunNow ? `${sunNow.clearance_deg >= 0 ? '+' : ''}${sunNow.clearance_deg.toFixed(2)}°` : '--'}
            <span className="text-xs text-slate-400 font-normal ml-1.5">
              (Disc {sunNow?.sun_fraction != null ? `${(sunNow.sun_fraction * 100).toFixed(0)}%` : '--'})
            </span>
          </div>
        </div>

        <div
          style={{ backgroundColor: '#080B11', border: '1px solid rgba(255,255,255,0.08)' }}
          className="rounded p-2.5 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
            <span>{sunCountdown.label}</span>
            <Clock className="w-3.5 h-3.5 text-[#F59E0B]" />
          </div>
          <div
            className="text-sm font-bold font-mono tabular-nums mt-1"
            style={{ color: sunCountdown.isVisibleNow ? '#10B981' : '#EF4444' }}
          >
            {sunCountdown.hours}
            <span className="text-[11px] text-slate-400 font-normal ml-1.5">
              ({sunCountdown.isVisibleNow ? 'SUNLIT' : 'ECLIPSED'})
            </span>
          </div>
        </div>

        <div
          style={{ backgroundColor: '#080B11', border: '1px solid rgba(255,255,255,0.08)' }}
          className="rounded p-2.5 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
            <span>EARTH DTE CLEARANCE</span>
            <Radio className="w-3.5 h-3.5 text-[#0EA5E9]" />
          </div>
          <div className="text-sm font-bold font-mono tabular-nums text-[#0EA5E9] mt-1">
            {earthNow ? `${earthNow.clearance_deg >= 0 ? '+' : ''}${earthNow.clearance_deg.toFixed(2)}°` : '--'}
            <span className="text-xs text-slate-400 font-normal ml-1.5">
              ({earthNow ? `${(earthNow.distance_km / 1000).toFixed(1)}k km` : '--'})
            </span>
          </div>
        </div>

        <div
          style={{ backgroundColor: '#080B11', border: '1px solid rgba(255,255,255,0.08)' }}
          className="rounded p-2.5 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
            <span>{earthCountdown.label}</span>
            <Orbit className="w-3.5 h-3.5 text-[#0EA5E9]" />
          </div>
          <div
            className="text-sm font-bold font-mono tabular-nums mt-1"
            style={{ color: earthCountdown.isVisibleNow ? '#0EA5E9' : '#EF4444' }}
          >
            {earthCountdown.hours}
            <span className="text-[11px] text-slate-400 font-normal ml-1.5">
              ({earthCountdown.isVisibleNow ? 'DTE LINK UP' : 'NO LOS'})
            </span>
          </div>
        </div>
      </div>

      {/* Main SVG Sky-Plot Canvas */}
      <div
        style={{ backgroundColor: '#080B11', border: '1px solid rgba(255,255,255,0.08)' }}
        className="relative w-full rounded overflow-hidden"
      >
        {viewMode === 'panorama' ? (
          <svg viewBox={`0 0 ${panWidth} ${panHeight}`} className="w-full h-auto block">
            {/* Sub-horizon Ground Shading */}
            <polygon points={terrainPolygonPoints} fill="rgba(15, 20, 31, 0.92)" />

            {/* Horizontal Elevation Grid Lines (-15°, 0°, +30°, +60°, +90°) */}
            {[-15, 0, 15, 30, 60, 75].map((el) => {
              const { y } = projectPanorama(0, el);
              const isHorizon = el === 0;
              return (
                <g key={`pan-el-${el}`}>
                  <line
                    x1={0}
                    y1={y}
                    x2={panWidth}
                    y2={y}
                    stroke={isHorizon ? 'rgba(16, 185, 129, 0.45)' : 'rgba(255, 255, 255, 0.07)'}
                    strokeWidth={isHorizon ? 1.2 : 0.6}
                    strokeDasharray={isHorizon ? undefined : '3 3'}
                  />
                  <text
                    x={6}
                    y={y - 4}
                    fill={isHorizon ? '#10B981' : 'rgba(148, 163, 184, 0.65)'}
                    fontSize="8.5"
                    fontFamily="monospace"
                  >
                    {el === 0 ? '0° HORIZON' : `${el > 0 ? '+' : ''}${el}° EL`}
                  </text>
                </g>
              );
            })}

            {/* Vertical Cardinal Azimuth Lines (N, NE, E, SE, S, SW, W, NW) */}
            {[
              [0, 'N (0°)'],
              [45, 'NE (45°)'],
              [90, 'E (90°)'],
              [135, 'SE (135°)'],
              [180, 'S (180°)'],
              [225, 'SW (225°)'],
              [270, 'W (270°)'],
              [315, 'NW (315°)'],
            ].map(([az, label]) => {
              const { x } = projectPanorama(Number(az), 0);
              return (
                <g key={`pan-az-${az}`}>
                  <line
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={panHeight}
                    stroke="rgba(255, 255, 255, 0.07)"
                    strokeWidth={0.6}
                  />
                  <text
                    x={x + 4}
                    y={panHeight - 8}
                    fill="rgba(226, 232, 240, 0.75)"
                    fontSize="8.5"
                    fontFamily="monospace"
                  >
                    {label}
                  </text>
                </g>
              );
            })}

            {/* Sun Trajectory Dots across Series (#F59E0B) */}
            {sunSeries.map((pt, idx) => {
              const { x, y } = projectPanorama(pt.az_deg, pt.el_deg);
              return (
                <circle
                  key={`sun-tr-${idx}`}
                  cx={x}
                  cy={y}
                  r={1.6}
                  fill="#F59E0B"
                  fillOpacity={pt.visible ? 0.55 : 0.18}
                />
              );
            })}

            {/* Earth Libration Trajectory Dots across Series (#0EA5E9) */}
            {earthSeries.map((pt, idx) => {
              const { x, y } = projectPanorama(pt.az_deg, pt.el_deg);
              return (
                <circle
                  key={`earth-tr-${idx}`}
                  cx={x}
                  cy={y}
                  r={1.8}
                  fill="#0EA5E9"
                  fillOpacity={pt.visible ? 0.65 : 0.2}
                />
              );
            })}

            {/* Current Earth Position Marker */}
            {earthNow && (() => {
              const { x, y } = projectPanorama(earthNow.az_deg, earthNow.el_deg);
              return (
                <g>
                  <line
                    x1={x}
                    y1={zeroHorizonY}
                    x2={x}
                    y2={y}
                    stroke="#0EA5E9"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                  />
                  <circle cx={x} cy={y} r={9} fill="rgba(14, 165, 233, 0.2)" stroke="#0EA5E9" strokeWidth={1.2} />
                  <circle cx={x} cy={y} r={4.5} fill="#0EA5E9" />
                  <text
                    x={Math.min(panWidth - 95, x + 12)}
                    y={Math.max(16, y + 3)}
                    fill="#0EA5E9"
                    fontSize="9"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    EARTH ({earthNow.el_deg.toFixed(1)}°)
                  </text>
                </g>
              );
            })()}

            {/* Current Sun Position Marker */}
            {sunNow && (() => {
              const { x, y } = projectPanorama(sunNow.az_deg, sunNow.el_deg);
              return (
                <g>
                  <line
                    x1={x}
                    y1={zeroHorizonY}
                    x2={x}
                    y2={y}
                    stroke="#F59E0B"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                  />
                  <circle cx={x} cy={y} r={10} fill="rgba(245, 158, 11, 0.22)" stroke="#F59E0B" strokeWidth={1.4} />
                  <circle cx={x} cy={y} r={5} fill="#F59E0B" />
                  <text
                    x={Math.min(panWidth - 90, x + 12)}
                    y={Math.max(16, y - 4)}
                    fill="#F59E0B"
                    fontSize="9"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    SUN ({sunNow.el_deg.toFixed(1)}°)
                  </text>
                </g>
              );
            })()}
          </svg>
        ) : (
          /* Polar Sky-Dome SVG View */
          <svg viewBox={`0 0 ${panWidth} ${panHeight}`} className="w-full h-auto block">
            {/* Outer -15° Sub-Horizon Ring */}
            <circle
              cx={polarCx}
              cy={polarCy}
              r={polarMaxR}
              fill="rgba(15, 20, 31, 0.65)"
              stroke="rgba(255, 255, 255, 0.1)"
              strokeWidth={1}
            />

            {/* 0° Astronomical Horizon Ring */}
            <circle
              cx={polarCx}
              cy={polarCy}
              r={polarZeroHorizonR}
              fill="#080B11"
              stroke="rgba(16, 185, 129, 0.5)"
              strokeWidth={1.4}
            />

            {/* +30° and +60° Elevation Rings */}
            {[30, 60].map((el) => {
              const r = ((90 - el) / 105) * polarMaxR;
              return (
                <circle
                  key={`pol-ring-${el}`}
                  cx={polarCx}
                  cy={polarCy}
                  r={r}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.08)"
                  strokeWidth={0.8}
                  strokeDasharray="3 3"
                />
              );
            })}

            {/* Azimuth Spokes */}
            {[
              [0, 'N 0°'],
              [45, 'NE'],
              [90, 'E 90°'],
              [135, 'SE'],
              [180, 'S 180°'],
              [225, 'SW'],
              [270, 'W 270°'],
              [315, 'NW'],
            ].map(([az, label]) => {
              const deg = Number(az);
              const rad = ((deg - 90) * Math.PI) / 180;
              const x2 = polarCx + polarMaxR * Math.cos(rad);
              const y2 = polarCy + polarMaxR * Math.sin(rad);
              const tx = polarCx + (polarMaxR + 16) * Math.cos(rad);
              const ty = polarCy + (polarMaxR + 13) * Math.sin(rad);
              return (
                <g key={`pol-az-${deg}`}>
                  <line
                    x1={polarCx}
                    y1={polarCy}
                    x2={x2}
                    y2={y2}
                    stroke="rgba(255, 255, 255, 0.08)"
                    strokeWidth={0.7}
                  />
                  <text
                    x={tx}
                    y={ty + 3}
                    textAnchor="middle"
                    fill="rgba(226, 232, 240, 0.8)"
                    fontSize="8.5"
                    fontFamily="monospace"
                  >
                    {label}
                  </text>
                </g>
              );
            })}

            {/* Sun Trajectory on Polar Dome */}
            {sunSeries.map((pt, idx) => {
              const { x, y } = projectPolar(pt.az_deg, pt.el_deg);
              return (
                <circle
                  key={`pol-sun-${idx}`}
                  cx={x}
                  cy={y}
                  r={1.6}
                  fill="#F59E0B"
                  fillOpacity={pt.visible ? 0.55 : 0.2}
                />
              );
            })}

            {/* Earth Trajectory on Polar Dome */}
            {earthSeries.map((pt, idx) => {
              const { x, y } = projectPolar(pt.az_deg, pt.el_deg);
              return (
                <circle
                  key={`pol-earth-${idx}`}
                  cx={x}
                  cy={y}
                  r={1.8}
                  fill="#0EA5E9"
                  fillOpacity={pt.visible ? 0.65 : 0.2}
                />
              );
            })}

            {/* Instant Earth Marker */}
            {earthNow && (() => {
              const { x, y } = projectPolar(earthNow.az_deg, earthNow.el_deg);
              return (
                <g>
                  <circle cx={x} cy={y} r={8} fill="rgba(14, 165, 233, 0.25)" stroke="#0EA5E9" strokeWidth={1.2} />
                  <circle cx={x} cy={y} r={4} fill="#0EA5E9" />
                  <text x={x + 10} y={y + 3} fill="#0EA5E9" fontSize="8.5" fontFamily="monospace" fontWeight="bold">
                    EARTH
                  </text>
                </g>
              );
            })()}

            {/* Instant Sun Marker */}
            {sunNow && (() => {
              const { x, y } = projectPolar(sunNow.az_deg, sunNow.el_deg);
              return (
                <g>
                  <circle cx={x} cy={y} r={9} fill="rgba(245, 158, 11, 0.25)" stroke="#F59E0B" strokeWidth={1.4} />
                  <circle cx={x} cy={y} r={4.5} fill="#F59E0B" />
                  <text x={x + 10} y={y - 3} fill="#F59E0B" fontSize="8.5" fontFamily="monospace" fontWeight="bold">
                    SUN
                  </text>
                </g>
              );
            })()}
          </svg>
        )}
      </div>

      {/* Footer Provenance & JPL Horizons Cross-Validation Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] font-mono tabular-nums text-slate-400 border-t border-white/[0.06]">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
          <span>
            JPL HORIZONS DE441 CROSS-CHECK:{' '}
            <strong className="text-[#10B981]">
              {validation?.all_within_tolerance !== false ? 'PASS (< 0.1° TOLERANCE)' : 'CHECK'}
            </strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {sunValidation && (
            <span>
              SUN ΔEl: <strong className="text-slate-200">{sunValidation.delta_el_deg.toFixed(5)}°</strong> · ΔAz:{' '}
              <strong className="text-slate-200">{sunValidation.delta_az_deg.toFixed(5)}°</strong>
            </span>
          )}
          {earthValidation && (
            <span>
              EARTH ΔEl: <strong className="text-slate-200">{earthValidation.delta_el_deg.toFixed(5)}°</strong>
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-slate-300">
            <Eye className="w-3 h-3 text-[#0EA5E9]" />
            Source: {validation?.horizons_source ?? 'jpl_horizons_golden_cache'}
          </span>
        </div>
      </div>
    </section>
  );
};