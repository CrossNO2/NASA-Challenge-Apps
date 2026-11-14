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
  TrendingUp,
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

  // Refs prevent React StrictMode cascading state-updater freezes
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

  // Helper to update both local playhead and parent state outside any state updater
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

      // Sync parent state at ~30Hz outside updater so React never chokes
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

  // SVG Chart Geometry (width=720, height=210, elevation -45° to +90°)
  const svgW = 720;
  const svgH = 210;
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
    <section
      style={{ backgroundColor: '#0F141F', border: '1px solid rgba(255,255,255,0.08)' }}
      className="rounded-lg p-4 flex flex-col gap-4"
    >
      {/* Header & Window Duration Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#10B981]" />
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200 m-0">
              Multi-Day Sun &amp; Earth Elevation Timeline // Temporal Scrubber
            </h2>
            <p className="text-[11px] text-slate-400 font-mono tabular-nums m-0">
              Window Illumination: <span className="text-[#F59E0B]">{windowStats.sunlitPct.toFixed(1)}%</span> · DTE Coverage:{' '}
              <span className="text-[#0EA5E9]">{windowStats.dtePct.toFixed(1)}%</span> · Samples: {totalPoints}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            {[
              [7, '7D Window'],
              [14, '14D Window'],
              [29.53, '29.5D Synodic'],
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
                  className={`px-2.5 py-1 rounded text-[11px] font-mono tabular-nums border transition cursor-pointer ${
                    active
                      ? 'bg-[#10B981]/15 text-[#10B981] border-[#10B981]/40'
                      : 'bg-[#080B11] text-slate-400 border-white/[0.08] hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 bg-[#080B11] px-2.5 py-1 rounded border border-white/[0.08]">
            <Calendar className="w-3.5 h-3.5 text-[#0EA5E9]" />
            <input
              type="datetime-local"
              value={datetimeLocalValue}
              onChange={(e) => {
                if (e.target.value) {
                  setIsPlaying(false);
                  onChangeStartEpoch(new Date(e.target.value + ':00Z').toISOString());
                }
              }}
              className="bg-transparent text-xs font-mono tabular-nums text-slate-100 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Interactive Multi-Day Elevation Curve SVG */}
      <div
        style={{ backgroundColor: '#080B11', border: '1px solid rgba(255,255,255,0.08)' }}
        className="relative w-full rounded overflow-hidden select-none"
      >
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="w-full h-auto block cursor-ew-resize"
          onClick={handleSvgClickOrDrag}
          onMouseMove={(e) => {
            if (e.buttons === 1) handleSvgClickOrDrag(e);
          }}
        >
          <rect
            x={0}
            y={zeroHorizonY}
            width={svgW}
            height={svgH - zeroHorizonY}
            fill="rgba(15, 20, 31, 0.78)"
          />

          {sunAreaPath && <path d={sunAreaPath} fill="rgba(245, 158, 11, 0.1)" />}

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
                  stroke={isHorizon ? 'rgba(16, 185, 129, 0.5)' : 'rgba(255, 255, 255, 0.07)'}
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
                  {isHorizon ? '0° HORIZON (DAY/NIGHT THRESHOLD)' : `${el > 0 ? '+' : ''}${el}° EL`}
                </text>
              </g>
            );
          })}

          {earthPolyline && (
            <polyline fill="none" stroke="#0EA5E9" strokeWidth={1.8} points={earthPolyline} />
          )}

          {sunPolyline && (
            <polyline fill="none" stroke="#F59E0B" strokeWidth={2.2} points={sunPolyline} />
          )}

          <line
            x1={playheadX}
            y1={0}
            x2={playheadX}
            y2={svgH}
            stroke="#F8FAFC"
            strokeWidth={1.3}
          />

          {currentSample && (() => {
            const sunY = projectPoint(0, currentSample.sun.el_deg).y;
            const earthY = projectPoint(0, currentSample.earth.el_deg).y;
            return (
              <g>
                <circle cx={playheadX} cy={earthY} r={4.5} fill="#0EA5E9" stroke="#080B11" strokeWidth={1.2} />
                <circle cx={playheadX} cy={sunY} r={5} fill="#F59E0B" stroke="#080B11" strokeWidth={1.2} />
              </g>
            );
          })()}
        </svg>
      </div>

      {/* Scrubber Transport Controls & Readout Bar */}
      <div
        style={{ backgroundColor: '#080B11', border: '1px solid rgba(255,255,255,0.08)' }}
        className="p-3 rounded flex flex-col gap-3"
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-semibold border transition cursor-pointer ${
              isPlaying
                ? 'bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/50'
                : 'bg-[#10B981]/20 text-[#10B981] border-[#10B981]/50'
            }`}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isPlaying ? 'Pause' : 'Start'}
          </button>

          <button
            type="button"
            onClick={() => {
              setIsPlaying(false);
              applyProgress(0);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs bg-[#0F141F] text-slate-300 border border-white/[0.08] hover:text-white transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>

          <div className="flex items-center gap-1">
            <FastForward className="w-3.5 h-3.5 text-slate-400 mr-1" />
            {([1, 4, 12] as const).map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => setSpeedMultiplier(spd)}
                className={`px-2 py-1 rounded text-[11px] font-mono tabular-nums border transition cursor-pointer ${
                  speedMultiplier === spd
                    ? 'bg-[#0EA5E9]/20 text-[#0EA5E9] border-[#0EA5E9]/40'
                    : 'bg-[#0F141F] text-slate-400 border-white/[0.08]'
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
            className="flex-1 accent-[#0EA5E9] cursor-pointer"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums text-slate-300 pt-2 border-t border-white/[0.06]">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#10B981]" />
            SCRUB UTC: <strong className="text-slate-100">{displayTimeIso.slice(0, 19)}Z</strong>
          </span>

          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1 text-[#F59E0B]">
              <Sun className="w-3.5 h-3.5" />
              SUN EL: <strong>{currentSample ? `${currentSample.sun.el_deg.toFixed(2)}°` : '--'}</strong> · AZ:{' '}
              <strong>{currentSample ? `${currentSample.sun.az_deg.toFixed(1)}°` : '--'}</strong>
            </span>
            <span className="text-[#0EA5E9]">
              EARTH EL: <strong>{currentSample ? `${currentSample.earth.el_deg.toFixed(2)}°` : '--'}</strong> · AZ:{' '}
              <strong>{currentSample ? `${currentSample.earth.az_deg.toFixed(1)}°` : '--'}</strong>
            </span>
            <span className="text-slate-400">
              SITE: {site.name.toUpperCase()}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};