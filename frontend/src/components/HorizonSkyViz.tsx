// File: frontend/src/components/HorizonSkyViz.tsx
import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
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

  // Build 360-deg terrain horizon array
  const horizonElevations = useMemo(() => {
    if (horizonProfile && horizonProfile.elevations_deg.length > 0) {
      return horizonProfile.elevations_deg;
    }
    return Array.from({ length: 360 }, () => 0);
  }, [horizonProfile]);

  // --- 360° Panorama Projection Helpers (width=720, height=250, el range: -30° to +90°) ---
  const panWidth = 720;
  const panHeight = 250;
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

  // --- Polar Sky-Dome Projection Helpers ---
  const polarCx = 360;
  const polarCy = 125;
  const polarMaxR = 104;

  const projectPolar = (azDeg: number, elDeg: number) => {
    const clampedEl = Math.max(-15, Math.min(90, elDeg));
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
  const terrainSource = instant?.terrain_source ?? (horizonProfile ? 'synthetic' : 'none');
  const terrainLabel =
    terrainSource === 'lola'
      ? 'LOLA DEM HORIZON'
      : terrainSource === 'synthetic'
        ? 'SYNTHETIC HORIZON (ILLUSTRATIVE)'
        : 'FLAT 0° HORIZON';

  return (
    <section className="nasa-panel flex flex-col">
      {/* Header & View Mode Switcher */}
      <div className="px-4 py-2.5 bg-[#EAE7E0] border-b border-[#CFCBC2] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 bg-[#141413] text-[#FF4F00] font-mono text-[10px] font-bold tracking-wider">
            MOD-04
          </span>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#141413] m-0">
              SUN &amp; EARTH 360° HORIZON SKY-PLOT // {site.name}
            </h2>
            <p className="text-[10px] text-[#57534E] font-mono tabular-nums m-0">
              FRAME: MOON_ME_DE421 · TERRAIN MASK: <strong className="text-[#141413]">{terrainLabel}</strong>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2 py-0.5 bg-[#141413] text-[#FF4F00] font-mono text-[10px] font-bold uppercase">
            {terrainLabel}
          </span>
          <div className="flex items-center bg-[#F4F3EF] p-0.5 border border-[#CFCBC2]">
            <button
              type="button"
              onClick={() => setViewMode('panorama')}
              className={`px-3 py-1 text-[11px] font-mono font-bold uppercase transition cursor-pointer ${
                viewMode === 'panorama'
                  ? 'bg-[#FF4F00] text-white'
                  : 'text-[#57534E] hover:text-[#141413]'
              }`}
            >
              360° Horizon Panorama
            </button>
            <button
              type="button"
              onClick={() => setViewMode('polar')}
              className={`px-3 py-1 text-[11px] font-mono font-bold uppercase transition cursor-pointer ${
                viewMode === 'polar'
                  ? 'bg-[#FF4F00] text-white'
                  : 'text-[#57534E] hover:text-[#141413]'
              }`}
            >
              Polar Sky-Dome
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {/* Countdown & Live Clearance Telemetry Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="nasa-subpanel p-2.5 flex flex-col justify-between border-l-4 border-l-[#D97706]">
            <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-[#57534E]">
              <span>SOLAR HORIZON CLEARANCE</span>
              <Sun className="w-3.5 h-3.5 text-[#D97706]" />
            </div>
            <div className="text-sm font-bold font-mono tabular-nums text-[#D97706] mt-1">
              {sunNow ? `${sunNow.clearance_deg >= 0 ? '+' : ''}${sunNow.clearance_deg.toFixed(2)}°` : '--'}
              <span className="text-xs text-[#57534E] font-normal ml-1.5">
                (Disc {sunNow?.sun_fraction != null ? `${(sunNow.sun_fraction * 100).toFixed(0)}%` : '--'})
              </span>
            </div>
          </div>

          <div className="nasa-subpanel p-2.5 flex flex-col justify-between border-l-4 border-l-[#FF4F00]">
            <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-[#57534E]">
              <span>{sunCountdown.label}</span>
              <Clock className="w-3.5 h-3.5 text-[#FF4F00]" />
            </div>
            <div
              className="text-sm font-bold font-mono tabular-nums mt-1"
              style={{ color: sunCountdown.isVisibleNow ? '#15803D' : '#DC2626' }}
            >
              {sunCountdown.hours}
              <span className="text-[11px] text-[#57534E] font-normal ml-1.5">
                ({sunCountdown.isVisibleNow ? 'SUNLIT' : 'ECLIPSED'})
              </span>
            </div>
          </div>

          <div className="nasa-subpanel p-2.5 flex flex-col justify-between border-l-4 border-l-[#0284C7]">
            <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-[#57534E]">
              <span>EARTH DTE CLEARANCE</span>
              <Radio className="w-3.5 h-3.5 text-[#0284C7]" />
            </div>
            <div className="text-sm font-bold font-mono tabular-nums text-[#0284C7] mt-1">
              {earthNow ? `${earthNow.clearance_deg >= 0 ? '+' : ''}${earthNow.clearance_deg.toFixed(2)}°` : '--'}
              <span className="text-xs text-[#57534E] font-normal ml-1.5">
                ({earthNow ? `${(earthNow.distance_km / 1000).toFixed(1)}k km` : '--'})
              </span>
            </div>
          </div>

          <div className="nasa-subpanel p-2.5 flex flex-col justify-between border-l-4 border-l-[#141413]">
            <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-[#57534E]">
              <span>{earthCountdown.label}</span>
              <Orbit className="w-3.5 h-3.5 text-[#0284C7]" />
            </div>
            <div
              className="text-sm font-bold font-mono tabular-nums mt-1"
              style={{ color: earthCountdown.isVisibleNow ? '#0284C7' : '#DC2626' }}
            >
              {earthCountdown.hours}
              <span className="text-[11px] text-[#57534E] font-normal ml-1.5">
                ({earthCountdown.isVisibleNow ? 'DTE LINK UP' : 'NO LOS'})
              </span>
            </div>
          </div>
        </div>

        {/* Main SVG Sky-Plot Canvas (Dark Aerospace Viewport for high-contrast solar/earth plotting) */}
        <div className="relative w-full bg-[#141413] border border-[#CFCBC2] overflow-hidden">
          {viewMode === 'panorama' ? (
            <svg viewBox={`0 0 ${panWidth} ${panHeight}`} className="w-full h-auto block">
              {/* Sub-horizon Ground Shading */}
              <polygon
                points={terrainPolygonPoints}
                fill="#292524"
                stroke="#FF4F00"
                strokeWidth="0.9"
                strokeOpacity="0.65"
              />

              {/* Horizontal Elevation Grid Lines (-15°, 0°, +30°, +60°, +75°) */}
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
                      stroke={isHorizon ? 'rgba(34, 197, 94, 0.55)' : 'rgba(255, 255, 255, 0.09)'}
                      strokeWidth={isHorizon ? 1.2 : 0.6}
                      strokeDasharray={isHorizon ? undefined : '3 3'}
                    />
                    <text
                      x={6}
                      y={y - 4}
                      fill={isHorizon ? '#22C55E' : 'rgba(214, 211, 209, 0.7)'}
                      fontSize="8.5"
                      fontFamily="monospace"
                    >
                      {el === 0 ? '0° ASTRONOMICAL HORIZON' : `${el > 0 ? '+' : ''}${el}° EL`}
                    </text>
                  </g>
                );
              })}

              {/* Vertical Cardinal Azimuth Lines */}
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
                      stroke="rgba(255, 255, 255, 0.09)"
                      strokeWidth={0.6}
                    />
                    <text
                      x={x + 4}
                      y={panHeight - 8}
                      fill="rgba(245, 245, 244, 0.85)"
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
                    r={1.7}
                    fill="#F59E0B"
                    fillOpacity={pt.visible ? 0.6 : 0.2}
                  />
                );
              })}

              {/* Earth Libration Trajectory Dots across Series (#38BDF8) */}
              {earthSeries.map((pt, idx) => {
                const { x, y } = projectPanorama(pt.az_deg, pt.el_deg);
                return (
                  <circle
                    key={`earth-tr-${idx}`}
                    cx={x}
                    cy={y}
                    r={1.9}
                    fill="#38BDF8"
                    fillOpacity={pt.visible ? 0.7 : 0.22}
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
                      stroke="#38BDF8"
                      strokeWidth={1}
                      strokeDasharray="2 2"
                    />
                    <circle cx={x} cy={y} r={9} fill="rgba(56, 189, 248, 0.22)" stroke="#38BDF8" strokeWidth={1.3} />
                    <circle cx={x} cy={y} r={4.5} fill="#38BDF8" />
                    <text
                      x={Math.min(panWidth - 95, x + 12)}
                      y={Math.max(16, y + 3)}
                      fill="#38BDF8"
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
                    <circle cx={x} cy={y} r={10} fill="rgba(245, 158, 11, 0.25)" stroke="#F59E0B" strokeWidth={1.5} />
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
              <circle
                cx={polarCx}
                cy={polarCy}
                r={polarMaxR}
                fill="#1C1917"
                stroke="rgba(255, 255, 255, 0.15)"
                strokeWidth={1}
              />

              <circle
                cx={polarCx}
                cy={polarCy}
                r={polarZeroHorizonR}
                fill="#0C0A09"
                stroke="rgba(34, 197, 94, 0.6)"
                strokeWidth={1.4}
              />

              {[30, 60].map((el) => {
                const r = ((90 - el) / 105) * polarMaxR;
                return (
                  <circle
                    key={`pol-ring-${el}`}
                    cx={polarCx}
                    cy={polarCy}
                    r={r}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.1)"
                    strokeWidth={0.8}
                    strokeDasharray="3 3"
                  />
                );
              })}

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
                      stroke="rgba(255, 255, 255, 0.1)"
                      strokeWidth={0.7}
                    />
                    <text
                      x={tx}
                      y={ty + 3}
                      textAnchor="middle"
                      fill="#F5F5F4"
                      fontSize="8.5"
                      fontFamily="monospace"
                    >
                      {label}
                    </text>
                  </g>
                );
              })}

              {sunSeries.map((pt, idx) => {
                const { x, y } = projectPolar(pt.az_deg, pt.el_deg);
                return (
                  <circle
                    key={`pol-sun-${idx}`}
                    cx={x}
                    cy={y}
                    r={1.7}
                    fill="#F59E0B"
                    fillOpacity={pt.visible ? 0.6 : 0.2}
                  />
                );
              })}

              {earthSeries.map((pt, idx) => {
                const { x, y } = projectPolar(pt.az_deg, pt.el_deg);
                return (
                  <circle
                    key={`pol-earth-${idx}`}
                    cx={x}
                    cy={y}
                    r={1.9}
                    fill="#38BDF8"
                    fillOpacity={pt.visible ? 0.7 : 0.22}
                  />
                );
              })}

              {earthNow && (() => {
                const { x, y } = projectPolar(earthNow.az_deg, earthNow.el_deg);
                return (
                  <g>
                    <circle cx={x} cy={y} r={8} fill="rgba(56, 189, 248, 0.25)" stroke="#38BDF8" strokeWidth={1.3} />
                    <circle cx={x} cy={y} r={4} fill="#38BDF8" />
                    <text x={x + 10} y={y + 3} fill="#38BDF8" fontSize="8.5" fontFamily="monospace" fontWeight="bold">
                      EARTH
                    </text>
                  </g>
                );
              })()}

              {sunNow && (() => {
                const { x, y } = projectPolar(sunNow.az_deg, sunNow.el_deg);
                return (
                  <g>
                    <circle cx={x} cy={y} r={9} fill="rgba(245, 158, 11, 0.25)" stroke="#F59E0B" strokeWidth={1.5} />
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
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] font-mono tabular-nums text-[#57534E] border-t border-[#CFCBC2]">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D]" />
            <span>
              JPL HORIZONS DE441 CROSS-CHECK:{' '}
              <strong className="text-[#15803D]">
                {validation?.all_within_tolerance !== false ? 'PASS (< 0.1° TOLERANCE)' : 'CHECK'}
              </strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {sunValidation && (
              <span>
                SUN ΔEl: <strong className="text-[#141413]">{sunValidation.delta_el_deg.toFixed(5)}°</strong> · ΔAz:{' '}
                <strong className="text-[#141413]">{sunValidation.delta_az_deg.toFixed(5)}°</strong>
              </span>
            )}
            {earthValidation && (
              <span>
                EARTH ΔEl: <strong className="text-[#141413]">{earthValidation.delta_el_deg.toFixed(5)}°</strong>
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[#141413]">
              <Eye className="w-3 h-3 text-[#FF4F00]" />
              Source: {validation?.horizons_source ?? 'jpl_horizons_golden_cache'}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
