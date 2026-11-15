// File: frontend/src/components/LunarMapPanel.tsx
import React, { useRef, useState } from 'react';
import {
  Crosshair,
  ExternalLink,
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
        return '#FF4F00';
      case 'crewed':
        return '#15803D';
      case 'robotic':
        return '#0284C7';
      case 'custom':
        return '#DC2626';
      default:
        return '#D97706';
    }
  };

  const lrocQuickMapUrl = `https://quickmap.lroc.im-ldi.com/?extent=${(selectedSite.lon - 2).toFixed(3)},${(selectedSite.lat - 2).toFixed(3)},${(selectedSite.lon + 2).toFixed(3)},${(selectedSite.lat + 2).toFixed(3)}&proj=10`;
  const moonTrekUrl = `https://trek.nasa.gov/moon/#v=0.1&x=${selectedSite.lon.toFixed(4)}&y=${selectedSite.lat.toFixed(4)}&z=6`;
  const selectedPt = projectToSvg(selectedSite.lat, selectedSite.lon);

  return (
    <section className="nasa-panel flex flex-col justify-between h-full">
      {/* Top Industrial Titanium Module Header */}
      <div className="px-3.5 py-2.5 bg-[#EAE7E0] border-b border-[#CFCBC2] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 bg-[#141413] text-[#FF4F00] font-mono text-[10px] font-bold tracking-wider">
            MOD-02
          </span>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#141413] m-0">
              2D SELENOGRAPHIC MAP &amp; CATALOG ({sites.length})
            </h2>
            <p className="text-[10px] font-mono text-[#57534E] m-0">
              EQUIRECTANGULAR [-180°..+180°] · CLICK MAP TO TARGET
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowTiles((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono font-semibold bg-[#F4F3EF] text-[#141413] border border-[#CFCBC2] hover:border-[#FF4F00] transition cursor-pointer"
          >
            <Layers className="w-3 h-3 text-[#FF4F00]" />
            {showTiles && !tileError ? 'WAC TILES: ON' : 'GRATICULE ONLY'}
          </button>

          <a
            href={lrocQuickMapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono font-semibold bg-[#F4F3EF] text-[#0284C7] border border-[#CFCBC2] hover:border-[#0284C7] transition no-underline"
          >
            <span>LROC</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>

          <a
            href={moonTrekUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono font-semibold bg-[#F4F3EF] text-[#15803D] border border-[#CFCBC2] hover:border-[#15803D] transition no-underline"
          >
            <span>MOON TREK</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>

      <div className="p-3 flex flex-col gap-2.5 flex-1 justify-between">
        {/* 2D Selenographic Map Viewport */}
        <div className="relative w-full aspect-[2/1] bg-[#141413] border border-[#CFCBC2] overflow-hidden select-none">
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
            {/* Far-Side Limb Shading */}
            <rect x="0" y="0" width="180" height="360" fill="#0B0C0E" fillOpacity="0.45" />
            <rect x="540" y="0" width="180" height="360" fill="#0B0C0E" fillOpacity="0.45" />

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
                    stroke={isLimbOrPrime ? 'rgba(255,79,0,0.42)' : 'rgba(255,255,255,0.12)'}
                    strokeWidth={isLimbOrPrime ? 1 : 0.6}
                    strokeDasharray={Math.abs(lon) === 90 ? '3 3' : undefined}
                  />
                  <text x={x + 3} y={12} fill="rgba(231,229,228,0.75)" fontSize="8.5" fontFamily="monospace">
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
                    stroke={isEquator ? 'rgba(255,79,0,0.42)' : 'rgba(255,255,255,0.12)'}
                    strokeWidth={isEquator ? 1 : 0.6}
                  />
                  <text x={6} y={y - 3} fill="rgba(231,229,228,0.75)" fontSize="8.5" fontFamily="monospace">
                    {lat > 0 ? `+${lat}°N` : `${lat}°S`}
                  </text>
                </g>
              );
            })}

            {/* Artemis III South Polar Target Zone (-80°S to -90°S) */}
            <rect
              x="0"
              y={((90 - -80) / 180) * 360}
              width="720"
              height="20"
              fill="rgba(255,79,0,0.18)"
              stroke="rgba(255,79,0,0.65)"
              strokeWidth="0.9"
            />
            <text x="360" y="354" textAnchor="middle" fill="#FF4F00" fontSize="9" fontWeight="bold" fontFamily="monospace">
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
                        r={12}
                        fill="none"
                        stroke="#FF4F00"
                        strokeWidth={1.8}
                        strokeDasharray="3 2"
                      />
                      <line x1={x} y1={0} x2={x} y2={360} stroke="#FF4F00" strokeWidth={0.8} strokeOpacity={0.65} />
                      <line x1={0} y1={y} x2={720} y2={y} stroke="#FF4F00" strokeWidth={0.8} strokeOpacity={0.65} />
                    </>
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected ? 6 : 4.2}
                    fill={isSelected ? '#FF4F00' : color}
                    stroke="#FFFFFF"
                    strokeWidth={1.3}
                  />
                </g>
              );
            })}

            <g
              transform={`translate(${Math.min(555, Math.max(12, selectedPt.x + 10))}, ${Math.min(
                332,
                Math.max(24, selectedPt.y - 10),
              )})`}
            >
              <rect
                x="0"
                y="-13"
                width="156"
                height="26"
                fill="#141413"
                fillOpacity="0.92"
                stroke="#FF4F00"
                strokeWidth="1"
              />
              <text x="6" y="-2" fill="#FFFFFF" fontSize="8.5" fontWeight="700">
                {selectedSite.name.slice(0, 23)}
              </text>
              <text x="6" y="8" fill="#FF4F00" fontSize="8" fontFamily="monospace">
                {selectedSite.lat.toFixed(2)}°, {selectedSite.lon.toFixed(2)}°
              </text>
            </g>
          </svg>
        </div>

        {/* Custom Coordinate Input Form (`POST /coordinates/process`) */}
        <form
          onSubmit={handleFormSubmit}
          className="nasa-subpanel p-2.5 grid grid-cols-2 sm:grid-cols-12 gap-2 items-end"
        >
          <div className="col-span-1 sm:col-span-3">
            <label className="block text-[9px] font-mono font-semibold uppercase tracking-wider text-[#57534E] mb-0.5">
              LAT [-90°..+90°]
            </label>
            <input
              type="number"
              step="0.0001"
              min="-90"
              max="90"
              value={customLat}
              onChange={(e) => setCustomLat(e.target.value)}
              className="w-full px-2 py-1 bg-white border border-[#CFCBC2] text-xs font-mono tabular-nums text-[#141413] focus:outline-none focus:border-[#FF4F00]"
            />
          </div>

          <div className="col-span-1 sm:col-span-3">
            <label className="block text-[9px] font-mono font-semibold uppercase tracking-wider text-[#57534E] mb-0.5">
              LON [-180°..+180°)
            </label>
            <input
              type="number"
              step="0.0001"
              value={customLon}
              onChange={(e) => setCustomLon(e.target.value)}
              className="w-full px-2 py-1 bg-white border border-[#CFCBC2] text-xs font-mono tabular-nums text-[#141413] focus:outline-none focus:border-[#FF4F00]"
            />
          </div>

          <div className="col-span-2 sm:col-span-3">
            <label className="block text-[9px] font-mono font-semibold uppercase tracking-wider text-[#57534E] mb-0.5">
              TARGET LABEL
            </label>
            <input
              type="text"
              maxLength={120}
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              className="w-full px-2 py-1 bg-white border border-[#CFCBC2] text-xs text-[#141413] focus:outline-none focus:border-[#FF4F00]"
            />
          </div>

          <div className="col-span-2 sm:col-span-3">
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-[#FF4F00] hover:bg-[#E04500] text-white text-[11px] font-mono font-bold uppercase tracking-wider transition cursor-pointer border border-[#141413]/20"
            >
              <Crosshair className="w-3 h-3" />
              Point Target
            </button>
          </div>

          {coordError && (
            <div className="col-span-2 sm:col-span-12 text-[10px] text-[#DC2626] font-mono font-semibold">
              [COORDINATE ERROR]: {coordError}
            </div>
          )}

          {coordResult && !coordError && (
            <div className="col-span-2 sm:col-span-12 flex flex-wrap items-center gap-3 pt-1 text-[10px] text-[#57534E] font-mono tabular-nums border-t border-[#CFCBC2]">
              <span className="text-[#15803D] font-bold">✓ NORMALIZED:</span>
              <span>
                LAT <strong className="text-[#141413]">{coordResult.latitude.toFixed(4)}°</strong>
              </span>
              <span>
                LON <strong className="text-[#141413]">{coordResult.longitude.toFixed(4)}°</strong>
                {coordResult.longitude_normalized ? ` (wrapped from ${coordResult.original_longitude}°)` : ''}
              </span>
              <span>
                SIDE <strong className="text-[#FF4F00] uppercase">{coordResult.lunar_side}</strong>
              </span>
            </div>
          )}
        </form>

        {/* Category Filter Pills & Search + Scrollable Site List */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  ['all', 'ALL'],
                  ['artemis-candidate', 'ARTEMIS III'],
                  ['crewed', 'APOLLO'],
                  ['robotic', 'ROBOTIC'],
                  ['south-pole', '≤ -65°S'],
                ] as [FilterCategory, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`px-2 py-0.5 text-[10px] font-mono font-semibold border transition cursor-pointer ${
                    filter === key
                      ? 'bg-[#141413] text-[#FF4F00] border-[#141413]'
                      : 'bg-[#FAF9F5] text-[#57534E] border-[#CFCBC2] hover:text-[#141413]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relative flex-1 min-w-[140px]">
              <Search className="w-3 h-3 text-[#78716C] absolute left-2 top-1.5" />
              <input
                type="text"
                placeholder="Search site, crater, mission..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-6 pr-2 py-0.5 bg-white border border-[#CFCBC2] text-[11px] text-[#141413] placeholder:text-[#78716C] focus:outline-none focus:border-[#FF4F00]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[168px] overflow-y-auto pr-1">
            {filteredSites.map((site) => {
              const active = site.id === selectedSite.id;
              const badgeColor = getMarkerColor(site.site_type);
              return (
                <button
                  key={site.id}
                  type="button"
                  onClick={() => onSelectSite(site)}
                  className={`text-left p-2 border transition flex flex-col justify-between gap-0.5 cursor-pointer ${
                    active
                      ? 'bg-[#FFF7ED] border-[#FF4F00] border-l-4'
                      : 'bg-[#FAF9F5] border-[#CFCBC2] hover:bg-white hover:border-[#78716C]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-[#141413] truncate">
                      {site.name}
                    </span>
                    <span
                      className="text-[9px] uppercase px-1.5 py-0.2 font-mono font-bold border"
                      style={{
                        color: badgeColor,
                        borderColor: badgeColor,
                        backgroundColor: '#FFFFFF',
                      }}
                    >
                      {site.site_type === 'artemis-candidate' ? 'ARTEMIS' : site.site_type}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-[#57534E] pt-0.5">
                    <span>
                      {site.lat >= 0 ? `+${site.lat.toFixed(2)}°N` : `${site.lat.toFixed(2)}°S`},{' '}
                      {site.lon >= 0 ? `+${site.lon.toFixed(2)}°E` : `${site.lon.toFixed(2)}°W`}
                    </span>
                    <span className="text-[#78716C] truncate max-w-[95px]">
                      {site.landing_date ?? 'CANDIDATE'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
