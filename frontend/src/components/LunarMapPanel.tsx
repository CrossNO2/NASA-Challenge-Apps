// File: frontend/src/components/LunarMapPanel.tsx
import React, { useRef, useState } from 'react';
import {
  Crosshair,
  ExternalLink,
  Globe,
  Layers,
  Search,
} from 'lucide-react';
import type {
  CoordinateProcessResponse,
  UnifiedLunarSite,
} from '../types/lunar';
import { apiClient } from '../services/apiClient';

interface LunarMapPanelProps {
  sites: UnifiedLunarSite[];
  selectedSite: UnifiedLunarSite;
  onSelectSite: (site: UnifiedLunarSite) => void;
  onCustomCoordinateSelect: (site: UnifiedLunarSite, processed: CoordinateProcessResponse) => void;
}

type FilterCategory = 'all' | 'artemis-candidate' | 'crewed' | 'robotic' | 'south-pole';

export const LunarMapPanel: React.FC<LunarMapPanelProps> = ({
  sites,
  selectedSite,
  onSelectSite,
  onCustomCoordinateSelect,
}) => {
  const [filter, setFilter] = useState<FilterCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showTiles, setShowTiles] = useState(true);
  const [tileError, setTileError] = useState(false);

  const customCounterRef = useRef<number>(1);
  const [customLat, setCustomLat] = useState<string>(String(selectedSite.lat));
  const [customLon, setCustomLon] = useState<string>(String(selectedSite.lon));
  const [customLabel, setCustomLabel] = useState<string>('Custom Target 1');
  const [coordResult, setCoordResult] = useState<CoordinateProcessResponse | null>(null);
  const [coordError, setCoordError] = useState<string | null>(null);

  const filteredSites = sites.filter((site) => {
    const matchesSearch =
      site.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      site.region.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (site.mission ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (site.country ?? '').toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (filter === 'all') return true;
    if (filter === 'south-pole') return site.lat <= -65;
    return site.site_type === filter;
  });

  const projectToSvg = (lat: number, lon: number) => {
    const x = ((lon + 180) / 360) * 720;
    const y = ((90 - lat) / 180) * 360;
    return { x, y };
  };

  const handleMapSvgClick = async (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const relY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    const clickedLon = Number((relX * 360 - 180).toFixed(4));
    const clickedLat = Number((90 - relY * 180).toFixed(4));

    const currentIdx = customCounterRef.current;
    const autoLabel = `Custom Target ${currentIdx}`;
    setCustomLat(String(clickedLat));
    setCustomLon(String(clickedLon));
    await runCoordinateProcess(clickedLat, clickedLon, autoLabel, currentIdx);
  };

  const runCoordinateProcess = async (
    latNum: number,
    lonNum: number,
    labelStr: string,
    targetIdx: number,
  ) => {
    setCoordError(null);
    try {
      const processed = await apiClient.processCoordinates({
        latitude: latNum,
        longitude: lonNum,
        label: labelStr,
      });
      setCoordResult(processed);

      const customSite: UnifiedLunarSite = {
        id: `custom-target-${targetIdx}`,
        name: processed.label || `Custom Target ${targetIdx}`,
        lat: processed.latitude,
        lon: processed.longitude,
        elevation_m: processed.latitude < -75 ? 1950 : -1200,
        slope_deg: processed.latitude < -75 ? 8.2 : 3.5,
        region: `${processed.latitude_hemisphere.toUpperCase()} / ${processed.lunar_side.toUpperCase()}`,
        program: 'Custom Coordinate Evaluation',
        site_type: 'custom',
        status: 'custom',
        country: null,
        operator: 'Mission Planner',
        mission: 'Custom Coordinates',
        landing_date: null,
        source_name: 'POST /coordinates/process',
        source_url: 'https://quickmap.lroc.im-ldi.com/',
        notes: processed.next_step,
        lunar_side: processed.lunar_side,
        is_backend_benchmark: false,
      };

      customCounterRef.current = targetIdx + 1;
      setCustomLabel(`Custom Target ${targetIdx + 1}`);
      onCustomCoordinateSelect(customSite, processed);
    } catch (err) {
      setCoordError(err instanceof Error ? err.message : 'Invalid coordinates');
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentIdx = customCounterRef.current;
    const trimmed = customLabel.trim();
    const labelToUse = trimmed || `Custom Target ${currentIdx}`;
    await runCoordinateProcess(Number(customLat), Number(customLon), labelToUse, currentIdx);
  };

  const getMarkerColor = (type: UnifiedLunarSite['site_type']) => {
    switch (type) {
      case 'artemis-candidate':
        return '#F59E0B';
      case 'crewed':
        return '#10B981';
      case 'robotic':
        return '#0EA5E9';
      case 'custom':
        return '#EF4444';
      default:
        return '#F8FAFC';
    }
  };

  const lrocQuickMapUrl = `https://quickmap.lroc.im-ldi.com/?extent=${(selectedSite.lon - 2).toFixed(3)},${(selectedSite.lat - 2).toFixed(3)},${(selectedSite.lon + 2).toFixed(3)},${(selectedSite.lat + 2).toFixed(3)}&proj=10`;
  const moonTrekUrl = `https://trek.nasa.gov/moon/#v=0.1&x=${selectedSite.lon.toFixed(4)}&y=${selectedSite.lat.toFixed(4)}&z=6`;
  const selectedPt = projectToSvg(selectedSite.lat, selectedSite.lon);

  return (
    <section
      style={{ backgroundColor: '#0F141F', border: '1px solid rgba(255,255,255,0.08)' }}
      className="rounded-lg p-4 flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-[#0EA5E9]" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200 m-0">
            2D Selenographic Map &amp; Curated Landing Sites ({sites.length} Total)
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTiles((v) => !v)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-[#080B11] text-slate-300 border border-white/[0.08] hover:border-[#0EA5E9]/50 transition cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-[#0EA5E9]" />
            {showTiles && !tileError ? 'NASA Moon Trek Tiles: ON' : 'Vector Graticule Only'}
          </button>

          <a
            href={lrocQuickMapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-[#080B11] text-[#0EA5E9] border border-[#0EA5E9]/30 hover:bg-[#0EA5E9]/10 transition no-underline"
          >
            <span>LROC QuickMap</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          <a
            href={moonTrekUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-[#080B11] text-[#10B981] border border-[#10B981]/30 hover:bg-[#10B981]/10 transition no-underline"
          >
            <span>NASA Moon Trek</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      <div
        style={{ backgroundColor: '#080B11', border: '1px solid rgba(255,255,255,0.08)' }}
        className="relative w-full aspect-[2/1] rounded overflow-hidden select-none"
      >
        {showTiles && !tileError && (
          <div className="absolute inset-0 grid grid-cols-2 pointer-events-none opacity-65">
            <img
              src="https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/0/0/0.jpg"
              alt="NASA Moon Trek West Hemisphere"
              className="w-full h-full object-cover grayscale contrast-125"
              onError={() => setTileError(true)}
            />
            <img
              src="https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/0/0/1.jpg"
              alt="NASA Moon Trek East Hemisphere"
              className="w-full h-full object-cover grayscale contrast-125"
              onError={() => setTileError(true)}
            />
          </div>
        )}

        <svg
          viewBox="0 0 720 360"
          className="relative z-10 w-full h-full cursor-crosshair block"
          onClick={handleMapSvgClick}
        >
          <rect x="0" y="0" width="180" height="360" fill="#080B11" fillOpacity="0.42" />
          <rect x="540" y="0" width="180" height="360" fill="#080B11" fillOpacity="0.42" />

          {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lon) => {
            const x = ((lon + 180) / 360) * 720;
            const isLimbOrPrime = lon === 0 || Math.abs(lon) === 90;
            return (
              <g key={`lon-${lon}`}>
                <line
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={360}
                  stroke={isLimbOrPrime ? 'rgba(14,165,233,0.28)' : 'rgba(255,255,255,0.07)'}
                  strokeWidth={isLimbOrPrime ? 1 : 0.6}
                  strokeDasharray={Math.abs(lon) === 90 ? '3 3' : undefined}
                />
                <text x={x + 3} y={12} fill="rgba(148,163,184,0.65)" fontSize="8" fontFamily="monospace">
                  {lon > 0 ? `+${lon}°E` : `${lon}°`}
                </text>
              </g>
            );
          })}

          {[-60, -30, 0, 30, 60].map((lat) => {
            const y = ((90 - lat) / 180) * 360;
            const isEquator = lat === 0;
            return (
              <g key={`lat-${lat}`}>
                <line
                  x1={0}
                  y1={y}
                  x2={720}
                  y2={y}
                  stroke={isEquator ? 'rgba(14,165,233,0.28)' : 'rgba(255,255,255,0.07)'}
                  strokeWidth={isEquator ? 1 : 0.6}
                />
                <text x={6} y={y - 3} fill="rgba(148,163,184,0.65)" fontSize="8" fontFamily="monospace">
                  {lat > 0 ? `+${lat}°N` : `${lat}°S`}
                </text>
              </g>
            );
          })}

          <rect
            x="0"
            y={((90 - -80) / 180) * 360}
            width="720"
            height="20"
            fill="rgba(245,158,11,0.12)"
            stroke="rgba(245,158,11,0.35)"
            strokeWidth="0.7"
          />
          <text x="360" y="354" textAnchor="middle" fill="#F59E0B" fontSize="8.5" fontFamily="monospace">
            ARTEMIS III SOUTH POLAR TARGET ZONE (-80°S TO -90°S)
          </text>

          {filteredSites.map((site) => {
            const { x, y } = projectToSvg(site.lat, site.lon);
            const isSelected = site.id === selectedSite.id;
            const color = getMarkerColor(site.site_type);

            return (
              <g
                key={site.id}
                onClick={(ev) => {
                  ev.stopPropagation();
                  onSelectSite(site);
                }}
                className="cursor-pointer"
              >
                {isSelected && (
                  <>
                    <circle
                      cx={x}
                      cy={y}
                      r={11}
                      fill="none"
                      stroke={color}
                      strokeWidth={1.5}
                      strokeDasharray="2 2"
                    />
                    <line x1={x} y1={0} x2={x} y2={360} stroke={color} strokeWidth={0.6} strokeOpacity={0.5} />
                    <line x1={0} y1={y} x2={720} y2={y} stroke={color} strokeWidth={0.6} strokeOpacity={0.5} />
                  </>
                )}
                <circle cx={x} cy={y} r={isSelected ? 5.5 : 3.8} fill={color} stroke="#080B11" strokeWidth={1.2} />
              </g>
            );
          })}

          <g transform={`translate(${Math.min(564, Math.max(12, selectedPt.x + 8))}, ${Math.min(335, Math.max(22, selectedPt.y - 10))})`}>
            <rect
              x="0"
              y="-12"
              width="148"
              height="24"
              rx="3"
              fill="#080B11"
              fillOpacity="0.9"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="0.8"
            />
            <text x="6" y="-1" fill="#F8FAFC" fontSize="8.5" fontWeight="600">
              {selectedSite.name.slice(0, 24)}
            </text>
            <text x="6" y="8" fill="#0EA5E9" fontSize="7.5" fontFamily="monospace">
              {selectedSite.lat.toFixed(2)}°, {selectedSite.lon.toFixed(2)}°
            </text>
          </g>
        </svg>
      </div>

      <form
        onSubmit={handleFormSubmit}
        style={{ backgroundColor: '#080B11', border: '1px solid rgba(255,255,255,0.08)' }}
        className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end p-3 rounded"
      >
        <div className="md:col-span-3">
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
            Custom Latitude [-90°, +90°]
          </label>
          <input
            type="number"
            step="0.0001"
            min="-90"
            max="90"
            value={customLat}
            onChange={(e) => setCustomLat(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded bg-[#0F141F] border border-white/[0.08] text-xs font-mono tabular-nums text-slate-100"
          />
        </div>

        <div className="md:col-span-3">
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
            Longitude (Auto-Wraps [-180°, 180°))
          </label>
          <input
            type="number"
            step="0.0001"
            value={customLon}
            onChange={(e) => setCustomLon(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded bg-[#0F141F] border border-white/[0.08] text-xs font-mono tabular-nums text-slate-100"
          />
        </div>

        <div className="md:col-span-3">
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
            Target Site Label (Auto-Increments)
          </label>
          <input
            type="text"
            maxLength={120}
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded bg-[#0F141F] border border-white/[0.08] text-xs text-slate-100"
          />
        </div>

        <div className="md:col-span-3">
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-[#0EA5E9]/15 text-[#0EA5E9] border border-[#0EA5E9]/40 hover:bg-[#0EA5E9]/25 text-xs font-semibold transition cursor-pointer"
          >
            <Crosshair className="w-3.5 h-3.5" />
            Validate &amp; Point Telemetry
          </button>
        </div>

        {coordError && (
          <div className="md:col-span-12 text-[11px] text-[#EF4444] font-mono">
            [COORDINATE ERROR]: {coordError}
          </div>
        )}

        {coordResult && !coordError && (
          <div className="md:col-span-12 flex flex-wrap items-center gap-4 pt-1 text-[11px] text-slate-300 font-mono tabular-nums border-t border-white/[0.06]">
            <span className="text-[#10B981]">✓ NORMALIZED:</span>
            <span>
              LAT: <strong>{coordResult.latitude.toFixed(4)}°</strong> ({coordResult.latitude_hemisphere})
            </span>
            <span>
              LON: <strong>{coordResult.longitude.toFixed(4)}°</strong> ({coordResult.longitude_hemisphere}
              {coordResult.longitude_normalized ? ` wrapped from ${coordResult.original_longitude}°` : ''})
            </span>
            <span>
              SIDE: <strong className="text-[#0EA5E9] uppercase">{coordResult.lunar_side}</strong>
            </span>
          </div>
        )}
      </form>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['all', 'All Sites'],
                ['artemis-candidate', 'Artemis III South Pole'],
                ['crewed', 'Crewed (Apollo)'],
                ['robotic', 'Robotic Landers'],
                ['south-pole', 'High Southern Lat (≤ -65°)'],
              ] as [FilterCategory, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium border transition cursor-pointer ${
                  filter === key
                    ? 'bg-[#0EA5E9]/15 text-[#0EA5E9] border-[#0EA5E9]/40'
                    : 'bg-[#080B11] text-slate-400 border-white/[0.08] hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="Search mission, crater, agency..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1 rounded bg-[#080B11] border border-white/[0.08] text-xs text-slate-100 placeholder:text-slate-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
          {filteredSites.map((site) => {
            const active = site.id === selectedSite.id;
            return (
              <button
                key={site.id}
                type="button"
                onClick={() => onSelectSite(site)}
                className={`text-left p-2.5 rounded border transition flex flex-col justify-between gap-1 cursor-pointer ${
                  active
                    ? 'bg-[#141B29] border-[#0EA5E9]/60'
                    : 'bg-[#080B11] border-white/[0.08] hover:border-white/[0.18]'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-slate-100 truncate">
                    {site.name}
                  </span>
                  <span
                    className="text-[9px] uppercase px-1.5 py-0.5 rounded font-mono"
                    style={{
                      color: getMarkerColor(site.site_type),
                      backgroundColor: 'rgba(255,255,255,0.04)',
                    }}
                  >
                    {site.site_type === 'artemis-candidate' ? 'ARTEMIS' : site.site_type}
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 truncate">{site.region}</div>

                <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-300 pt-1 border-t border-white/[0.05]">
                  <span>
                    {site.lat >= 0 ? `+${site.lat.toFixed(2)}°N` : `${site.lat.toFixed(2)}°S`}
                  </span>
                  <span>
                    {site.lon >= 0 ? `+${site.lon.toFixed(2)}°E` : `${site.lon.toFixed(2)}°W`}
                  </span>
                  <span className="text-slate-400">{site.landing_date ?? 'CANDIDATE'}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};