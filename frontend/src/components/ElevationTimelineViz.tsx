// File: frontend/src/components/ElevationTimelineViz.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Clock,
  FastForward,
  Pause,
  Play,
  RotateCcw,
  Sun,
} from 'lucide-react';
import type {
  BodyPosition,
  EphemerisSeries,
  UnifiedLunarSite,
} from '../types/lunar';

interface ElevationTimelineVizProps {
  site: UnifiedLunarSite;
  series: EphemerisSeries | null;
  currentTimeIso: string;
  windowDays: number;
  onSelectTimeIso: (isoTime: string, interpolatedPoint?: { sun: BodyPosition; earth: BodyPosition }) => void;
  onChangeWindowDays: (days: number) => void;
  onChangeStartEpoch: (isoTime: string) => void;
}

const EMPTY_POSITIONS: BodyPosition[] = [];

/**
 * Linear interpolation between two ephemeris samples
 */
function interpolateBody(a: BodyPosition, b: BodyPosition, t: number): BodyPosition {
  const lerp = (v0: number, v1: number) => v0 + (v1 - v0) * t;
  const dAz = ((b.az_deg - a.az_deg + 540) % 360) - 180;
  const az = (((a.az_deg + dAz * t) % 360) + 360) % 360;
  const el = lerp(a.el_deg, b.el_deg);
  const terr = lerp(a.terrain_deg, b.terrain_deg);
  const clr = el - terr;
  const frac =
    a.sun_fraction !== null && b.sun_fraction !== null
      ? Number(lerp(a.sun_fraction, b.sun_fraction).toFixed(4))
      : null;

  const msA = new Date(a.time).getTime();
  const msB = new Date(b.time).getTime();
  const iso = new Date(msA + (msB - msA) * t).toISOString();

  return {
    time: iso,
    az_deg: Number(az.toFixed(4)),
    el_deg: Number(el.toFixed(4)),
    distance_km: Number(lerp(a.distance_km, b.distance_km).toFixed(1)),
    terrain_deg: Number(terr.toFixed(4)),
    clearance_deg: Number(clr.toFixed(4)),
    visible: clr > 0,
    sun_fraction: frac,
  };
}

export const ElevationTimelineViz: React.FC<ElevationTimelineVizProps> = ({
  site,
  series,
  currentTimeIso,
  windowDays,
  onSelectTimeIso,
  onChangeWindowDays,
  onChangeStartEpoch,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 4 | 12>(4);
  const [scrubProgress, setScrubProgress] = useState<number>(0);

  const progressRef = useRef<number>(0);
  const onSelectRef = useRef(onSelectTimeIso);
  onSelectRef.current = onSelectTimeIso;

  const sunArr = series?.bodies.sun ?? EMPTY_POSITIONS;
  const earthArr = series?.bodies.earth ?? EMPTY_POSITIONS;
  const totalPoints = Math.min(sunArr.length, earthArr.length);

  // Sync slider when site or window resets externally while paused
  useEffect(() => {
    if (totalPoints < 2 || isPlaying) return;
    const t0 = new Date(sunArr[0].time).getTime();
    const t1 = new Date(sunArr[totalPoints - 1].time).getTime();
    const cur = new Date(currentTimeIso).getTime();
    if (t1 > t0) {
      const ratio = Math.max(0, Math.min(1, (cur - t0) / (t1 - t0)));
      progressRef.current = ratio;
      setScrubProgress(ratio);
    }
  }, [series, totalPoints]);

  const applyProgress = (nextProgress: number) => {
    const clamped = Math.max(0, Math.min(1, nextProgress));
    progressRef.current = clamped;
    setScrubProgress(clamped);

    if (totalPoints < 2) return;
    const floatIdx = clamped * (totalPoints - 1);
    const i0 = Math.min(totalPoints - 2, Math.max(0, Math.floor(floatIdx)));
    const frac = floatIdx - i0;

    const sunInterp = interpolateBody(sunArr[i0], sunArr[i0 + 1], frac);
    const earthInterp = interpolateBody(earthArr[i0], earthArr[i0 + 1], frac);
    onSelectRef.current(sunInterp.time, { sun: sunInterp, earth: earthInterp });
  };

  // Smooth, non-blocking animation loop
  useEffect(() => {
    if (!isPlaying || totalPoints < 2) return;

    let rafId = 0;
    let lastTime = performance.now();
    let lastParentSync = 0;

    const tick = (now: number) => {
      const dtSec = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      let next = progressRef.current + dtSec * 0.022 * speedMultiplier;
      if (next >= 1) {
        next = 0;
      }
      progressRef.current = next;
      setScrubProgress(next);

      if (now - lastParentSync >= 32) {
        lastParentSync = now;
        const floatIdx = next * (totalPoints - 1);
        const i0 = Math.min(totalPoints - 2, Math.max(0, Math.floor(floatIdx)));
        const frac = floatIdx - i0;
        const sunInterp = interpolateBody(sunArr[i0], sunArr[i0 + 1], frac);
        const earthInterp = interpolateBody(earthArr[i0], earthArr[i0 + 1], frac);
        onSelectRef.current(sunInterp.time, { sun: sunInterp, earth: earthInterp });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, speedMultiplier, totalPoints, sunArr, earthArr]);

  // SVG Chart Geometry (width=960, height=145, elevation -45° to +90°)
  const svgW = 960;
  const svgH = 145;
  const elMin = -45;
  const elMax = 90;

  const projectPoint = (idx: number, elDeg: number) => {
    const x = totalPoints > 1 ? (idx / (totalPoints - 1)) * svgW : 0;
    const clampedEl = Math.max(elMin, Math.min(elMax, elDeg));
    const y = ((elMax - clampedEl) / (elMax - elMin)) * svgH;
    return { x, y };
  };

  const zeroHorizonY = ((elMax - 0) / (elMax - elMin)) * svgH;

  const sunPolyline = useMemo(() => {
    if (totalPoints === 0) return '';
    return sunArr
      .slice(0, totalPoints)
      .map((pt, i) => {
        const { x, y } = projectPoint(i, pt.el_deg);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [sunArr, totalPoints]);

  const earthPolyline = useMemo(() => {
    if (totalPoints === 0) return '';
    return earthArr
      .slice(0, totalPoints)
      .map((pt, i) => {
        const { x, y } = projectPoint(i, pt.el_deg);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [earthArr, totalPoints]);

  const sunAreaPath = useMemo(() => {
    if (totalPoints < 2) return '';
    const coords = sunArr.slice(0, totalPoints).map((pt, i) => projectPoint(i, Math.max(0, pt.el_deg)));
    const d = [
      `M 0 ${zeroHorizonY.toFixed(1)}`,
      ...coords.map((c) => `L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`),
      `L ${svgW} ${zeroHorizonY.toFixed(1)}`,
      'Z',
    ];
    return d.join(' ');
  }, [sunArr, totalPoints, zeroHorizonY]);

  const currentSample = useMemo(() => {
    if (totalPoints < 2) return null;
    const floatIdx = scrubProgress * (totalPoints - 1);
    const i0 = Math.min(totalPoints - 2, Math.max(0, Math.floor(floatIdx)));
    const frac = floatIdx - i0;
    return {
      sun: interpolateBody(sunArr[i0], sunArr[i0 + 1], frac),
      earth: interpolateBody(earthArr[i0], earthArr[i0 + 1], frac),
    };
  }, [scrubProgress, totalPoints, sunArr, earthArr]);

  const playheadX = scrubProgress * svgW;

  const handleSvgClickOrDrag = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    applyProgress(ratio);
  };

  const datetimeLocalValue = useMemo(() => {
    try {
      const iso = currentSample?.sun.time ?? currentTimeIso;
      return new Date(iso).toISOString().slice(0, 16);
    } catch {
      return '2026-11-15T06:00';
    }
  }, [currentSample, currentTimeIso]);

  const windowStats = useMemo(() => {
    if (totalPoints === 0) return { sunlitPct: 0, dtePct: 0 };
    const sunlitCount = sunArr.filter((p) => p.visible).length;
    const dteCount = earthArr.filter((p) => p.visible).length;
    return {
      sunlitPct: (sunlitCount / totalPoints) * 100,
      dtePct: (dteCount / totalPoints) * 100,
    };
  }, [sunArr, earthArr, totalPoints]);

  const displayTimeIso = currentSample?.sun.time ?? currentTimeIso;

  return (
    <section className="nasa-panel flex flex-col">
      {/* Header & Window Duration Controls */}
      <div className="px-3.5 py-2 bg-[#EAE7E0] border-b border-[#CFCBC2] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 bg-[#141413] text-[#FF4F00] font-mono text-[10px] font-bold tracking-wider">
            MOD-03
          </span>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#141413] m-0">
              TEMPORAL EPHEMERIS SCRUBBER &amp; MULTI-DAY ELEVATION CURVE
            </h2>
            <p className="text-[10px] text-[#57534E] font-mono tabular-nums m-0">
              WINDOW ILLUMINATION: <strong className="text-[#D97706]">{windowStats.sunlitPct.toFixed(1)}%</strong> · DTE COVERAGE:{' '}
              <strong className="text-[#0284C7]">{windowStats.dtePct.toFixed(1)}%</strong> · SAMPLES: {totalPoints}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            {[
              [7, '7D'],
              [14, '14D'],
              [29.53, '29.5D SYNODIC'],
            ].map(([days, label]) => {
              const active = Math.abs(windowDays - Number(days)) < 0.5;
              return (
                <button
                  key={String(days)}
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    onChangeWindowDays(Number(days));
                  }}
                  className={`px-2 py-1 text-[10px] font-mono font-bold tabular-nums border transition cursor-pointer ${
                    active
                      ? 'bg-[#141413] text-[#FF4F00] border-[#141413]'
                      : 'bg-[#F4F3EF] text-[#57534E] border-[#CFCBC2] hover:text-[#141413]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 bg-white px-2 py-0.5 border border-[#CFCBC2]">
            <Calendar className="w-3.5 h-3.5 text-[#FF4F00]" />
            <input
              type="datetime-local"
              value={datetimeLocalValue}
              onChange={(e) => {
                if (e.target.value) {
                  setIsPlaying(false);
                  onChangeStartEpoch(new Date(e.target.value + ':00Z').toISOString());
                }
              }}
              className="bg-transparent text-xs font-mono tabular-nums text-[#141413] focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="p-3 flex flex-col gap-2.5">
        {/* Scrubber Transport Controls & Readout Bar */}
        <div className="nasa-subpanel px-3 py-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[280px]">
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-mono font-bold uppercase tracking-wider border transition cursor-pointer ${
                isPlaying
                  ? 'bg-[#141413] text-[#FF4F00] border-[#141413]'
                  : 'bg-[#FF4F00] text-white border-[#FF4F00] hover:bg-[#E04500]'
              }`}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isPlaying ? 'Pause' : 'Play 3D + Charts'}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                applyProgress(0);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono bg-white text-[#141413] border border-[#CFCBC2] hover:border-[#141413] transition cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>

            <div className="flex items-center gap-1">
              <FastForward className="w-3.5 h-3.5 text-[#78716C] mr-0.5" />
              {([1, 4, 12] as const).map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => setSpeedMultiplier(spd)}
                  className={`px-2 py-0.5 text-[11px] font-mono font-bold tabular-nums border transition cursor-pointer ${
                    speedMultiplier === spd
                      ? 'bg-[#141413] text-[#FF4F00] border-[#141413]'
                      : 'bg-white text-[#57534E] border-[#CFCBC2]'
                  }`}
                >
                  {spd}×
                </button>
              ))}
            </div>

            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={scrubProgress}
              onChange={(e) => {
                setIsPlaying(false);
                applyProgress(Number(e.target.value));
              }}
              className="flex-1 accent-[#FF4F00] cursor-pointer"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono tabular-nums text-[#141413]">
            <span className="inline-flex items-center gap-1 bg-white px-2 py-0.5 border border-[#CFCBC2]">
              <Clock className="w-3 h-3 text-[#FF4F00]" />
              UTC: <strong>{displayTimeIso.slice(0, 19).replace('T', ' ')}Z</strong>
            </span>
            <span className="inline-flex items-center gap-1 text-[#D97706] font-bold">
              <Sun className="w-3.5 h-3.5" />
              SUN: {currentSample ? `${currentSample.sun.el_deg.toFixed(2)}°` : '--'}
            </span>
            <span className="text-[#0284C7] font-bold">
              EARTH: {currentSample ? `${currentSample.earth.el_deg.toFixed(2)}°` : '--'}
            </span>
            <span className="text-[#57534E] hidden sm:inline">
              [{site.name.toUpperCase()}]
            </span>
          </div>
        </div>

        {/* Interactive Multi-Day Elevation Curve SVG */}
        <div className="relative w-full bg-[#FAF9F5] border border-[#CFCBC2] overflow-hidden select-none">
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="w-full h-auto block cursor-ew-resize"
            onClick={handleSvgClickOrDrag}
            onMouseMove={(e) => {
              if (e.buttons === 1) handleSvgClickOrDrag(e);
            }}
          >
            {/* Sub-Horizon Night Zone Shading */}
            <rect
              x={0}
              y={zeroHorizonY}
              width={svgW}
              height={svgH - zeroHorizonY}
              fill="rgba(20, 20, 19, 0.08)"
            />

            {sunAreaPath && <path d={sunAreaPath} fill="rgba(217, 119, 6, 0.14)" />}

            {[-30, 0, 30, 60].map((el) => {
              const { y } = projectPoint(0, el);
              const isHorizon = el === 0;
              return (
                <g key={`tl-el-${el}`}>
                  <line
                    x1={0}
                    y1={y}
                    x2={svgW}
                    y2={y}
                    stroke={isHorizon ? '#15803D' : '#CFCBC2'}
                    strokeWidth={isHorizon ? 1.3 : 0.7}
                    strokeDasharray={isHorizon ? undefined : '4 4'}
                  />
                  <text
                    x={8}
                    y={y - 4}
                    fill={isHorizon ? '#15803D' : '#57534E'}
                    fontSize="9"
                    fontWeight={isHorizon ? 'bold' : 'normal'}
                    fontFamily="monospace"
                  >
                    {isHorizon ? '0° HORIZON (DAY/NIGHT THRESHOLD)' : `${el > 0 ? '+' : ''}${el}° EL`}
                  </text>
                </g>
              );
            })}

            {earthPolyline && (
              <polyline fill="none" stroke="#0284C7" strokeWidth={1.8} points={earthPolyline} />
            )}

            {sunPolyline && (
              <polyline fill="none" stroke="#D97706" strokeWidth={2.2} points={sunPolyline} />
            )}

            {/* Playhead Indicator in NASA International Orange */}
            <line
              x1={playheadX}
              y1={0}
              x2={playheadX}
              y2={svgH}
              stroke="#FF4F00"
              strokeWidth={1.8}
            />

            {currentSample && (() => {
              const sunY = projectPoint(0, currentSample.sun.el_deg).y;
              const earthY = projectPoint(0, currentSample.earth.el_deg).y;
              return (
                <g>
                  <circle cx={playheadX} cy={earthY} r={4.5} fill="#0284C7" stroke="#FFFFFF" strokeWidth={1.4} />
                  <circle cx={playheadX} cy={sunY} r={5} fill="#D97706" stroke="#FFFFFF" strokeWidth={1.4} />
                </g>
              );
            })()}
          </svg>
        </div>
      </div>
    </section>
  );
};
