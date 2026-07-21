import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Parcel, Vertex, Segment, DocumentSettings, MapSymbol, LineVertex } from "../types";
import {
  planeToLatLng,
  latLngToPlane,
  getSegmentMidpoint,
  getSegmentAngle,
  getOutsidePoint,
  calculateCentroid,
  getParallelPolylines,
} from "../utils/gisUtils";
import { SupportedCRS, CRS_DETAILS } from "../utils/projectionManager";
import {
  Layers,
  Globe,
  Grid,
  Maximize,
  Edit2,
  MousePointer,
  Trash2,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Navigation,
  Ruler,
  MapPin,
  RotateCcw,
  Check,
  X,
} from "lucide-react";

interface ParcelMapProps {
  parcel: Parcel;
  additionalParcels?: Parcel[];
  settings: DocumentSettings;
  selectedVertexId: number | null;
  selectedSegmentId: number | null;
  onVertexSelect: (id: number | null) => void;
  onSegmentSelect: (id: number | null) => void;
  onVertexUpdate: (id: number, x: number, y: number) => void;
  onAddVertex: (x: number, y: number, insertAtIndex?: number) => void;
  onDeleteVertex?: (id: number) => void;
  isDrawingMode: boolean;
  setDrawingMode: (val: boolean) => void;
  onUpdateParcel?: (updated: Parcel) => void;
  symbolToPlace?: "cemetery" | "tree" | "well" | "building" | "mosque" | "custom_text" | "palm" | "reed" | "grass" | "transformer" | "olive" | "geodetic" | "spring" | null;
  onPlacedSymbolDone?: () => void;
  symbolPlacementLabel?: string;
  lineToPlace?: "footpath" | "agri_road" | "power_line" | "water_pipe" | "sewer_pipe" | null;
  linePlacementLabel?: string;
  onPlacedLineDone?: () => void;
  customLineSpacing?: number;
  customLineThickness?: number;
  customLineColor?: string;
  customLabelColor?: string;
  customLabelSize?: number;
  lang?: "ar" | "fr" | "en";
}

export const ParcelMap: React.FC<ParcelMapProps> = ({
  parcel,
  additionalParcels = [],
  settings,
  selectedVertexId,
  selectedSegmentId,
  onVertexSelect,
  onSegmentSelect,
  onVertexUpdate,
  onAddVertex,
  onDeleteVertex,
  isDrawingMode,
  setDrawingMode,
  onUpdateParcel,
  symbolToPlace,
  onPlacedSymbolDone,
  symbolPlacementLabel,
  lineToPlace,
  linePlacementLabel,
  onPlacedLineDone,
  customLineSpacing = 4,
  customLineThickness = 2,
  customLineColor = "",
  customLabelColor = "",
  customLabelSize = 9.5,
  lang = "ar",
}) => {
  const l = (ar: string, fr: string, en?: string) => lang === "ar" ? ar : lang === "en" ? (en || fr) : fr;

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const plusMarkerRef = useRef<L.Marker | null>(null);

  const [mapPreset, setMapPreset] = useState<"cad" | "satellite" | "google_sat" | "osm">((() => {
    const saved = localStorage.getItem("live_map_preset");
    if (saved === "cad" || saved === "satellite" || saved === "google_sat" || saved === "osm") {
      return saved as any;
    }
    return "cad";
  })());
  const [isDeleteMode, setDeleteMode] = useState<boolean>(false);
  const [mapReady, setMapReady] = useState<boolean>(false);
  
  // Go To & Measurement tool states
  const [isMeasuring, setIsMeasuring] = useState<boolean>(false);
  const [measurePoints, setMeasurePoints] = useState<L.LatLng[]>([]);
  const [tempMeasureMouse, setTempMeasureMouse] = useState<L.LatLng | null>(null);

  const [isGotoOpen, setIsGotoOpen] = useState<boolean>(false);
  const [gotoType, setGotoType] = useState<"lambert" | "wgs84">("lambert");
  const [gotoX, setGotoX] = useState<string>("");
  const [gotoY, setGotoY] = useState<string>("");
  const [gotoLat, setGotoLat] = useState<string>("");
  const [gotoLng, setGotoLng] = useState<string>("");
  const [gotoMarkerLatLng, setGotoMarkerLatLng] = useState<L.LatLng | null>(null);
  const [gotoError, setGotoError] = useState<string>("");

  const [mouseCoords, setMouseCoords] = useState<{
    lat: number;
    lng: number;
    x: number;
    y: number;
  } | null>(null);
  const [editingSymbol, setEditingSymbol] = useState<MapSymbol | null>(null);

  // Temporary local drawing state for custom polylines/linear features
  const [drawingLineVertices, setDrawingLineVertices] = useState<LineVertex[]>([]);

  useEffect(() => {
    setDrawingLineVertices([]);
  }, [lineToPlace]);


  const layersRef = useRef<{
    tileLayer: L.TileLayer | null;
    polygon: L.Polygon | null;
    additionalPolygons: L.Polygon[];
    vertexMarkers: L.Marker[];
    additionalVertexMarkers: L.Marker[];
    labelMarkers: L.Marker[];
    additionalLabelMarkers: L.Marker[];
    gridLines: L.Polyline[];
    interiorLabelMarker: L.Marker | null;
    symbolMarkers: L.Marker[];
    linearFeatureLayers: L.Layer[];
    drawingLineLayers: L.Layer[];
  }>({
    tileLayer: null,
    polygon: null,
    additionalPolygons: [],
    vertexMarkers: [],
    additionalVertexMarkers: [],
    labelMarkers: [],
    additionalLabelMarkers: [],
    gridLines: [],
    interiorLabelMarker: null,
    symbolMarkers: [],
    linearFeatureLayers: [],
    drawingLineLayers: [],
  });

  const measureLayersRef = useRef<{
    polyline: L.Polyline | null;
    tempPolyline: L.Polyline | null;
    markers: L.Marker[];
  }>({
    polyline: null,
    tempPolyline: null,
    markers: [],
  });

  const gotoLayerRef = useRef<L.Marker | null>(null);

  const activeCRS = (settings.projectionSystem && settings.projectionSystem.startsWith("EPSG:")
    ? settings.projectionSystem
    : "EPSG:26191") as SupportedCRS;

  // Re-orient view to center on parcel and additional adjacent parcels
  const handleRecenter = () => {
    if (!mapRef.current) return;
    const allSelectedVertices = [
      ...parcel.vertices,
      ...(additionalParcels || []).flatMap((p) => p.vertices)
    ];
    if (allSelectedVertices.length === 0) return;
    const latLngs = allSelectedVertices
      .map((v) => planeToLatLng(v.x, v.y, activeCRS))
      .filter((ll) => Array.isArray(ll) && ll.length === 2 && typeof ll[0] === 'number' && !isNaN(ll[0]) && isFinite(ll[0]) && typeof ll[1] === 'number' && !isNaN(ll[1]) && isFinite(ll[1]));
    if (latLngs.length === 0) return;
    const bounds = L.latLngBounds(latLngs);
    if (bounds.isValid()) {
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 19 });
    }
  };

  // Custom Zoom actions
  const handleZoomIn = () => {
    if (mapRef.current) {
      mapRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (mapRef.current) {
      mapRef.current.zoomOut();
    }
  };

  // Initialize Map without standard zoom buttons to prevent overlaps
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialCenter: [number, number] = [33.5731, -7.5898];
    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 17,
      zoomControl: false,
      attributionControl: false,
    });

    mapRef.current = map;
    setMapReady(true);

    // Record map viewport so PrintSheetLayout can use it
    const handleMoveOrZoom = () => {
      const zoom = map.getZoom();
      const center = map.getCenter();
      localStorage.setItem("live_map_zoom", String(zoom));
      localStorage.setItem("live_map_center", JSON.stringify([center.lat, center.lng]));
    };

    map.on("moveend", handleMoveOrZoom);
    map.on("zoomend", handleMoveOrZoom);

    // Run once initially to capture defaults
    handleMoveOrZoom();

    return () => {
      map.off("moveend", handleMoveOrZoom);
      map.off("zoomend", handleMoveOrZoom);
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Automatically fit bounds / zoom when any selected parcel list or their vertices are updated
  const verticesSig = [
    ...parcel.vertices.map((v) => `${v.id}:${v.x}:${v.y}`),
    ...(additionalParcels || []).flatMap((p) => p.vertices.map((v) => `${p.id}:${v.id}:${v.x}:${v.y}`))
  ].join("|");

  useEffect(() => {
    if (mapReady && mapRef.current) {
      handleRecenter();
    }
  }, [mapReady, parcel.id, (additionalParcels || []).length, verticesSig, activeCRS]);

  // Update background tilelayer based on mapPreset selection
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (layersRef.current.tileLayer) {
      map.removeLayer(layersRef.current.tileLayer);
    }
    layersRef.current.tileLayer = null;

    localStorage.setItem("live_map_preset", mapPreset);

    if (mapPreset === "satellite") {
      // Reliable ESRI World Imagery URL
      layersRef.current.tileLayer = L.tileLayer(
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
          attribution: "Esri World Imagery",
        }
      ).addTo(map);
    } else if (mapPreset === "google_sat") {
      // Highly requested and ultra-robust static Google Imagery (Hybrid roads + satellite)
      layersRef.current.tileLayer = L.tileLayer(
        "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
        {
          maxZoom: 20,
          attribution: "© Google Satellite Imagery",
        }
      ).addTo(map);
    } else if (mapPreset === "osm") {
      layersRef.current.tileLayer = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution: "© OpenStreetMap contributors",
        }
      ).addTo(map);
    }
  }, [mapPreset]);

  // Handle map drawing click additions and custom symbol placements
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (lineToPlace) {
        const { x, y } = latLngToPlane(e.latlng.lat, e.latlng.lng, activeCRS);
        setDrawingLineVertices((prev) => [
          ...prev,
          { x: parseFloat(x.toFixed(2)), y: parseFloat(y.toFixed(2)) },
        ]);
        return;
      }

      if (symbolToPlace) {
        const { x, y } = latLngToPlane(e.latlng.lat, e.latlng.lng, activeCRS);
        
        let currentLabel = symbolPlacementLabel || "";
        if (symbolToPlace === "custom_text" && !currentLabel) {
          try {
            const prompted = prompt(
              lang === "ar" ? "أدخل نص الكتابة الحرة:" : "Saisissez le texte libre :",
              ""
            );
            if (prompted !== null && prompted.trim() !== "") {
              currentLabel = prompted;
            } else {
              currentLabel = lang === "ar" ? "كتابة حرة" : "Texte Libre";
            }
          } catch (err) {
            currentLabel = lang === "ar" ? "كتابة حرة" : "Texte Libre";
          }
        }

        const newSymbol = {
          id: "sym_" + Date.now() + "_" + Math.floor(Math.random() * 100000),
          type: symbolToPlace,
          label: currentLabel,
          x: parseFloat(x.toFixed(2)),
          y: parseFloat(y.toFixed(2)),
        };
        const updatedSymbols = [...(parcel.symbols || []), newSymbol];
        if (onUpdateParcel) {
          onUpdateParcel({
            ...parcel,
            symbols: updatedSymbols,
          });
        }
        if (onPlacedSymbolDone) {
          onPlacedSymbolDone();
        }
        return;
      }

      if (!isDrawingMode) return;
      const { x, y } = latLngToPlane(e.latlng.lat, e.latlng.lng, activeCRS);
      
      // Smart insertion index to keep the shape perfectly sequence-ordered without crossing
      let insertIndex = parcel.vertices.length;
      if (parcel.vertices.length >= 3) {
        let minDist = Infinity;
        for (let i = 0; i < parcel.vertices.length; i++) {
          const v1 = parcel.vertices[i];
          const v2 = parcel.vertices[(i + 1) % parcel.vertices.length];
          const dx = v2.x - v1.x;
          const dy = v2.y - v1.y;
          const lenSq = dx * dx + dy * dy;
          let t = 0;
          if (lenSq > 0) {
            t = ((x - v1.x) * dx + (y - v1.y) * dy) / lenSq;
            t = Math.max(0, Math.min(1, t));
          }
          const projX = v1.x + t * dx;
          const projY = v1.y + t * dy;
          const dist = Math.hypot(x - projX, y - projY);
          if (dist < minDist) {
            minDist = dist;
            insertIndex = i + 1;
          }
        }
      }
      onAddVertex(x, y, insertIndex);
    };

    map.on("click", handleMapClick);
    return () => {
      map.off("click", handleMapClick);
    };
  }, [isDrawingMode, onAddVertex, activeCRS, parcel, symbolToPlace, symbolPlacementLabel, onUpdateParcel, onPlacedSymbolDone, lang, lineToPlace, setDrawingLineVertices]);

  // Mutual exclusion of tools
  useEffect(() => {
    if (isMeasuring) {
      if (isDrawingMode) setDrawingMode(false);
      if (isDeleteMode) setDeleteMode(false);
    }
  }, [isMeasuring]);

  useEffect(() => {
    if (isDrawingMode || isDeleteMode) {
      setIsMeasuring(false);
    }
  }, [isDrawingMode, isDeleteMode]);

  // Distance Measurement event listeners
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMeasuring) {
      setMeasurePoints([]);
      setTempMeasureMouse(null);
      return;
    }

    const handleMeasureClick = (e: L.LeafletMouseEvent) => {
      setMeasurePoints((prev) => [...prev, e.latlng]);
    };

    const handleMeasureMouseMove = (e: L.LeafletMouseEvent) => {
      setTempMeasureMouse(e.latlng);
    };

    map.on("click", handleMeasureClick);
    map.on("mousemove", handleMeasureMouseMove);

    return () => {
      map.off("click", handleMeasureClick);
      map.off("mousemove", handleMeasureMouseMove);
    };
  }, [isMeasuring]);

  // Distance Measurement Layer rendering on the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (measureLayersRef.current.polyline) {
      map.removeLayer(measureLayersRef.current.polyline);
      measureLayersRef.current.polyline = null;
    }
    if (measureLayersRef.current.tempPolyline) {
      map.removeLayer(measureLayersRef.current.tempPolyline);
      measureLayersRef.current.tempPolyline = null;
    }
    measureLayersRef.current.markers.forEach((m) => map.removeLayer(m));
    measureLayersRef.current.markers = [];

    const validMeasurePoints = measurePoints.filter(
      (pt) => pt && typeof pt.lat === "number" && !isNaN(pt.lat) && typeof pt.lng === "number" && !isNaN(pt.lng)
    );

    if (!isMeasuring || validMeasurePoints.length === 0) return;

    const poly = L.polyline(validMeasurePoints, {
      color: "#ec4899",
      weight: 3.5,
      dashArray: "6, 12",
      lineJoin: "round",
    }).addTo(map);
    measureLayersRef.current.polyline = poly;

    if (
      tempMeasureMouse &&
      typeof tempMeasureMouse.lat === "number" &&
      !isNaN(tempMeasureMouse.lat) &&
      typeof tempMeasureMouse.lng === "number" &&
      !isNaN(tempMeasureMouse.lng)
    ) {
      const lastPt = validMeasurePoints[validMeasurePoints.length - 1];
      if (lastPt) {
        const tempPoly = L.polyline([lastPt, tempMeasureMouse], {
          color: "#f472b6",
          weight: 2,
          dashArray: "3, 6",
          opacity: 0.8,
        }).addTo(map);
        measureLayersRef.current.tempPolyline = tempPoly;
      }
    }

    let cumulative = 0;
    validMeasurePoints.forEach((pt, index) => {
      let labelText = "";
      if (index === 0) {
        labelText = lang === "ar" ? "البداية" : "Départ";
      } else {
        const segDist = map.distance(validMeasurePoints[index - 1], pt);
        cumulative += segDist;
        labelText = `+${segDist.toFixed(2)}m (${cumulative.toFixed(1)}m)`;
      }

      const marker = L.marker(pt, {
        icon: L.divIcon({
          className: "custom-measure-marker",
          html: `
            <div class="relative flex items-center justify-center">
              <div class="w-3.5 h-3.5 rounded-full bg-pink-500 border-2 border-white shadow-md flex items-center justify-center">
                <div class="w-1.5 h-1.5 bg-slate-950 rounded-full"></div>
              </div>
              <div class="absolute left-5 top-1/2 -translate-y-1/2 bg-slate-900/95 border border-pink-500 text-white font-mono text-[9.5px] font-bold px-2 py-0.5 rounded shadow-lg whitespace-nowrap z-[999] select-none">
                ${labelText}
              </div>
            </div>
          `,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
      }).addTo(map);

      measureLayersRef.current.markers.push(marker);
    });
  }, [isMeasuring, measurePoints, tempMeasureMouse, lang]);

  // Go To Coordinate marker rendering on the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (gotoLayerRef.current) {
      map.removeLayer(gotoLayerRef.current);
      gotoLayerRef.current = null;
    }

    if (gotoMarkerLatLng) {
      const marker = L.marker(gotoMarkerLatLng, {
        icon: L.divIcon({
          className: "custom-goto-marker",
          html: `
            <div class="relative flex items-center justify-center">
              <div class="absolute w-10 h-10 rounded-full bg-amber-500/30 animate-ping"></div>
              <div class="absolute w-5 h-5 rounded-full bg-amber-400/40 animate-pulse"></div>
              <div class="w-4 h-4 rounded-full bg-amber-500 border-2 border-white shadow-2xl flex items-center justify-center z-10">
                <div class="w-1.5 h-1.5 bg-slate-950 rounded-full"></div>
              </div>
              <div class="absolute top-5 bg-slate-900/95 border border-amber-500 text-amber-400 font-mono text-[9px] font-bold px-2 py-0.5 rounded shadow-lg whitespace-nowrap z-[1000] select-none flex items-center gap-1">
                <span class="w-1 h-1 rounded-full bg-amber-400"></span>
                <span>${lang === "ar" ? "الموقع المستهدف" : "Cible"}</span>
              </div>
            </div>
          `,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      }).addTo(map);

      gotoLayerRef.current = marker;
    }
  }, [gotoMarkerLatLng, lang]);

  // Hover Snapping: Shows a "+" button when the cursor is near any polygon segment
  useEffect(() => {
    const map = mapRef.current;
    if (!map || parcel.vertices.length < 3) return;

    const handleMouseMove = (e: L.LeafletMouseEvent) => {
      // Actively show ONLY when in drawing mode (rallies/snapping only when isDrawingMode is true and isDeleteMode is false)
      if (!isDrawingMode || isDeleteMode) {
        if (plusMarkerRef.current) {
          map.removeLayer(plusMarkerRef.current);
          plusMarkerRef.current = null;
        }
        return;
      }

      const mousePt = e.containerPoint;

      // Smart check: If mouse is close to an existing vertex (e.g., within 20px), dismiss "+" marker.
      // This allows the browser pointer to focus on the vertex marker and support dragging.
      let closeToVertex = false;
      for (const vertex of parcel.vertices) {
        const vLatLng = planeToLatLng(vertex.x, vertex.y, activeCRS);
        const vPt = map.latLngToContainerPoint(vLatLng);
        const distToVertex = Math.hypot(mousePt.x - vPt.x, mousePt.y - vPt.y);
        if (distToVertex < 18) {
          closeToVertex = true;
          break;
        }
      }

      if (closeToVertex) {
        if (plusMarkerRef.current) {
          map.removeLayer(plusMarkerRef.current);
          plusMarkerRef.current = null;
        }
        return;
      }

      let minDist = Infinity;
      let closestLatLng: L.LatLng | null = null;
      let closestInsertIndex = -1;

      for (let i = 0; i < parcel.vertices.length; i++) {
        const v1 = parcel.vertices[i];
        const v2 = parcel.vertices[(i + 1) % parcel.vertices.length];

        const ll1 = planeToLatLng(v1.x, v1.y, activeCRS);
        const ll2 = planeToLatLng(v2.x, v2.y, activeCRS);

        const pt1 = map.latLngToContainerPoint(ll1);
        const pt2 = map.latLngToContainerPoint(ll2);

        if (
          isNaN(pt1.x) || isNaN(pt1.y) || !isFinite(pt1.x) || !isFinite(pt1.y) ||
          isNaN(pt2.x) || isNaN(pt2.y) || !isFinite(pt2.x) || !isFinite(pt2.y)
        ) {
          continue;
        }

        const dx = pt2.x - pt1.x;
        const dy = pt2.y - pt1.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0 || isNaN(lenSq)) continue;

        let t = ((mousePt.x - pt1.x) * dx + (mousePt.y - pt1.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        if (isNaN(t)) continue;

        const projX = pt1.x + t * dx;
        const projY = pt1.y + t * dy;

        if (isNaN(projX) || isNaN(projY) || !isFinite(projX) || !isFinite(projY)) {
          continue;
        }

        const dist = Math.hypot(mousePt.x - projX, mousePt.y - projY);
        if (isNaN(dist)) continue;

        if (dist < minDist) {
          const latlng = map.containerPointToLatLng(L.point(projX, projY));
          if (latlng && !isNaN(latlng.lat) && !isNaN(latlng.lng)) {
            minDist = dist;
            closestLatLng = latlng;
            closestInsertIndex = i + 1; // Insert right after the first vertex of the segment
          }
        }
      }

      // 16px snapping distance threshold for a highly precise yet generous feel
      if (minDist < 16 && closestLatLng) {
        const savedLatLng = closestLatLng;
        const savedIndex = closestInsertIndex;

        if (!plusMarkerRef.current) {
          const plusIcon = L.divIcon({
            html: `
              <div class="relative flex items-center justify-center">
                <span class="absolute inline-flex h-7 w-7 animate-ping rounded-full bg-emerald-400 opacity-30"></span>
                <div class="w-6 h-6 rounded-full bg-emerald-500/30 hover:bg-emerald-600/50 border border-white/60 shadow-xl flex items-center justify-center text-white font-black text-sm cursor-pointer select-none transition-transform duration-100 hover:scale-125">
                  +
                </div>
              </div>
            `,
            className: "custom-plus-marker",
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          });

          // Create the marker and register mousedown handler immediately
          const newMarker = L.marker(savedLatLng, { icon: plusIcon }).addTo(map);
          plusMarkerRef.current = newMarker;

          newMarker.on("mousedown", (clickEvent) => {
            if (clickEvent.originalEvent) {
              L.DomEvent.stopPropagation(clickEvent.originalEvent);
            } else {
              L.DomEvent.stopPropagation(clickEvent as any);
            }
            const plane = latLngToPlane(savedLatLng.lat, savedLatLng.lng, activeCRS);
            onAddVertex(plane.x, plane.y, savedIndex);

            if (plusMarkerRef.current) {
              map.removeLayer(plusMarkerRef.current);
              plusMarkerRef.current = null;
            }
          });
        } else {
          plusMarkerRef.current.setLatLng(savedLatLng);
          plusMarkerRef.current.off("mousedown");
          plusMarkerRef.current.on("mousedown", (clickEvent) => {
            if (clickEvent.originalEvent) {
              L.DomEvent.stopPropagation(clickEvent.originalEvent);
            } else {
              L.DomEvent.stopPropagation(clickEvent as any);
            }
            const plane = latLngToPlane(savedLatLng.lat, savedLatLng.lng, activeCRS);
            onAddVertex(plane.x, plane.y, savedIndex);

            if (plusMarkerRef.current) {
              map.removeLayer(plusMarkerRef.current);
              plusMarkerRef.current = null;
            }
          });
        }
      } else {
        if (plusMarkerRef.current) {
          map.removeLayer(plusMarkerRef.current);
          plusMarkerRef.current = null;
        }
      }
    };

    const handleMouseLeave = () => {
      if (plusMarkerRef.current) {
        map.removeLayer(plusMarkerRef.current);
        plusMarkerRef.current = null;
      }
    };

    map.on("mousemove", handleMouseMove);
    map.on("mouseout", handleMouseLeave);

    return () => {
      map.off("mousemove", handleMouseMove);
      map.off("mouseout", handleMouseLeave);
      if (plusMarkerRef.current) {
        map.removeLayer(plusMarkerRef.current);
        plusMarkerRef.current = null;
      }
    };
  }, [parcel, isDrawingMode, isDeleteMode, activeCRS, onAddVertex]);

  // Main layers refresh on state changes (parcel, annotations configuration, selection states)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || parcel.vertices.length === 0) return;

    const centroidPlane = calculateCentroid(parcel.vertices);

    // 1. Clear previous overlays
    if (layersRef.current.polygon) {
      map.removeLayer(layersRef.current.polygon);
    }
    layersRef.current.vertexMarkers.forEach((m) => map.removeLayer(m));
    layersRef.current.labelMarkers.forEach((m) => map.removeLayer(m));
    layersRef.current.gridLines.forEach((gl) => map.removeLayer(gl));

    if (layersRef.current.additionalPolygons) {
      layersRef.current.additionalPolygons.forEach((p) => map.removeLayer(p));
    }
    if (layersRef.current.additionalVertexMarkers) {
      layersRef.current.additionalVertexMarkers.forEach((m) => map.removeLayer(m));
    }
    if (layersRef.current.additionalLabelMarkers) {
      layersRef.current.additionalLabelMarkers.forEach((m) => map.removeLayer(m));
    }

    if (layersRef.current.interiorLabelMarker) {
      map.removeLayer(layersRef.current.interiorLabelMarker);
      layersRef.current.interiorLabelMarker = null;
    }
    if (layersRef.current.symbolMarkers) {
      layersRef.current.symbolMarkers.forEach((m) => map.removeLayer(m));
    }
    if (layersRef.current.linearFeatureLayers) {
      layersRef.current.linearFeatureLayers.forEach((l) => map.removeLayer(l));
    }
    if (layersRef.current.drawingLineLayers) {
      layersRef.current.drawingLineLayers.forEach((l) => map.removeLayer(l));
    }

    layersRef.current.vertexMarkers = [];
    layersRef.current.labelMarkers = [];
    layersRef.current.gridLines = [];
    layersRef.current.additionalPolygons = [];
    layersRef.current.additionalVertexMarkers = [];
    layersRef.current.additionalLabelMarkers = [];
    layersRef.current.symbolMarkers = [];
    layersRef.current.linearFeatureLayers = [];
    layersRef.current.drawingLineLayers = [];

    const isSatellite = mapPreset === "satellite" || mapPreset === "google_sat";
    const isCad = mapPreset === "cad";

    // 2. Render backing technical grid lines if preset is "CAD Mode"
    if (mapPreset === "cad") {
      const allSelectedVertices = [
        ...parcel.vertices,
        ...(additionalParcels || []).flatMap((p) => p.vertices)
      ];
      const latLngsGrid = allSelectedVertices
        .map((v) => planeToLatLng(v.x, v.y, activeCRS))
        .filter((ll) => Array.isArray(ll) && ll.length === 2 && typeof ll[0] === 'number' && !isNaN(ll[0]) && isFinite(ll[0]) && typeof ll[1] === 'number' && !isNaN(ll[1]) && isFinite(ll[1]));
      
      if (latLngsGrid.length > 0) {
        const bounds = L.latLngBounds(latLngsGrid);
        if (bounds.isValid()) {
          const paddedBounds = bounds.pad(0.5);

          const safeGridInterval = Math.max(0.1, Number(settings.gridInterval) || 50);
          const intervalDeg = safeGridInterval / 111120;
          const gridItems: L.Polyline[] = [];

          // Make lines rounded to standard intervals
          const startLat = Math.floor(paddedBounds.getSouth() / intervalDeg) * intervalDeg;
          const endLat = Math.ceil(paddedBounds.getNorth() / intervalDeg) * intervalDeg;
          const startLng = Math.floor(paddedBounds.getWest() / intervalDeg) * intervalDeg;
          const endLng = Math.ceil(paddedBounds.getEast() / intervalDeg) * intervalDeg;

          for (let lat = startLat; lat <= endLat; lat += intervalDeg) {
            const pl = L.polyline([[lat, startLng], [lat, endLng]], {
              color: "#e2e8f0",
              weight: 0.8,
              dashArray: "4, 4",
            }).addTo(map);
            gridItems.push(pl);
          }
          for (let lng = startLng; lng <= endLng; lng += intervalDeg) {
            const pl = L.polyline([[startLat, lng], [endLat, lng]], {
              color: "#e2e8f0",
              weight: 0.8,
              dashArray: "4, 4",
            }).addTo(map);
            gridItems.push(pl);
          }
          layersRef.current.gridLines = gridItems;
        }
      }
    }

    // 3. Render Parcel Polygon boundary with high contrast based on selected background preset
    const latLngs = parcel.vertices
      .map((v) => planeToLatLng(v.x, v.y, activeCRS))
      .filter((ll) => Array.isArray(ll) && ll.length === 2 && typeof ll[0] === 'number' && !isNaN(ll[0]) && isFinite(ll[0]) && typeof ll[1] === 'number' && !isNaN(ll[1]) && isFinite(ll[1]));
    
    if (latLngs.length === 0) return;

    const poly = L.polygon(latLngs, {
      color: isSatellite ? "#f59e0b" : "#ef4444", // High-contrast amber for satellite layers, Red for CAD/Map
      weight: 3.5,
      fillColor: isCad ? "#fef2f2" : isSatellite ? "#f59e0b" : "#3b82f6",
      fillOpacity: isCad ? 0.85 : isSatellite ? 0.12 : 0.2,
    }).addTo(map);
    layersRef.current.polygon = poly;

    // Handle clicking inside the polygon to place symbols/custom text
    poly.on("click", (e: L.LeafletMouseEvent) => {
      if (symbolToPlace) {
        if (e.originalEvent) {
          L.DomEvent.stopPropagation(e.originalEvent);
        } else {
          L.DomEvent.stopPropagation(e as any);
        }
        const { x, y } = latLngToPlane(e.latlng.lat, e.latlng.lng, activeCRS);
        
        let currentLabel = symbolPlacementLabel || "";
        if (symbolToPlace === "custom_text" && !currentLabel) {
          try {
            const prompted = prompt(
              lang === "ar" ? "أدخل نص الكتابة الحرة:" : "Saisissez le texte libre :",
              ""
            );
            if (prompted !== null && prompted.trim() !== "") {
              currentLabel = prompted;
            } else {
              currentLabel = lang === "ar" ? "كتابة حرة" : "Texte Libre";
            }
          } catch (err) {
            currentLabel = lang === "ar" ? "كتابة حرة" : "Texte Libre";
          }
        }

        const newSymbol = {
          id: "sym_" + Date.now() + "_" + Math.floor(Math.random() * 100000),
          type: symbolToPlace,
          label: currentLabel,
          x: parseFloat(x.toFixed(2)),
          y: parseFloat(y.toFixed(2)),
        };
        const updatedSymbols = [...(parcel.symbols || []), newSymbol];
        if (onUpdateParcel) {
          onUpdateParcel({
            ...parcel,
            symbols: updatedSymbols,
          });
        }
        if (onPlacedSymbolDone) {
          onPlacedSymbolDone();
        }
      }
    });

    // 3.5 Render Additional Selected Adjacent Parcels (with beautiful distinct borders & custom colors)
    const addPolys: L.Polygon[] = [];
    const addVertexMks: L.Marker[] = [];
    const addLabelMks: L.Marker[] = [];

    (additionalParcels || []).forEach((ap) => {
      const apLatLngs = ap.vertices
        .map((v) => planeToLatLng(v.x, v.y, activeCRS))
        .filter((ll) => Array.isArray(ll) && ll.length === 2 && typeof ll[0] === 'number' && !isNaN(ll[0]) && isFinite(ll[0]) && typeof ll[1] === 'number' && !isNaN(ll[1]) && isFinite(ll[1]));
      if (apLatLngs.length === 0) return;

      const apPoly = L.polygon(apLatLngs, {
        color: isSatellite ? "#10b981" : "#a855f7", // Emerald for satellite, Purple for CAD
        weight: 3.0,
        fillColor: isCad ? "#faf5ff" : isSatellite ? "#10b981" : "#a855f7",
        fillOpacity: isCad ? 0.65 : isSatellite ? 0.1 : 0.15,
        dashArray: "4, 6",
      }).addTo(map);
      
      // Bind descriptive tooltip to identify the parcel name on hover
      apPoly.bindTooltip(`<b>${ap.name}</b> (${lang === "ar" ? "قطعة مجاورة" : "Parcelle adjacente"})`, {
        direction: "center",
        permanent: false,
        sticky: true
      });

      addPolys.push(apPoly);

      // Render vertex labels for adjacent parcels so all vertices are visible
      const apCentroid = calculateCentroid(ap.vertices);
      ap.vertices.forEach((v) => {
        const vLatLng = planeToLatLng(v.x, v.y, activeCRS);
        const dxAp = v.x - apCentroid.x;
        const dyAp = v.y - apCentroid.y;
        const lenAp = Math.sqrt(dxAp * dxAp + dyAp * dyAp);
        const nx = lenAp > 0 ? dxAp / lenAp : 1;
        const ny = lenAp > 0 ? dyAp / lenAp : 0;
        const tx = (nx * 14).toFixed(1);
        const ty = (-ny * 14).toFixed(1);

        const apVertexIcon = L.divIcon({
          html: `
            <div class="relative flex items-center justify-center select-none shadow-sm" style="pointer-events: none;">
              <div class="w-2.5 h-2.5 rounded-full bg-purple-500/40 ring-1 ring-purple-400/40 border border-white/60 flex items-center justify-center">
                <div class="w-1 h-1 rounded-full bg-white"></div>
              </div>
              <div 
                style="transform: translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)); z-index: 90; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0px 1px 2px rgba(0,0,0,0.85); font-size: ${(settings.vertexFontSize || 8.5) * 1.0}px;"
                class="absolute top-1/2 left-1/2 font-bold font-mono text-purple-200 whitespace-nowrap pointer-events-none tracking-wide"
              >
                ${v.label}
              </div>
            </div>
          `,
          className: "custom-vertex-marker-additional",
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });

        const apMk = L.marker(vLatLng, { icon: apVertexIcon, draggable: false }).addTo(map);
        apMk.bindTooltip(`<b>${ap.name}</b> - ${v.label}<br/>X: ${v.x.toFixed(2)}<br/>Y: ${v.y.toFixed(2)}`, {
          direction: "top",
          offset: [0, -6]
        });
        addVertexMks.push(apMk);
      });

      // Show segment lengths and neighbor labels for the additional parcels if configured
      if (settings.mapLabels !== "Aucun") {
        ap.segments.forEach((seg) => {
          const mid = getSegmentMidpoint(seg.startVertex, seg.endVertex);
          const angle = getSegmentAngle(seg.startVertex, seg.endVertex);
          const mapOffset = settings.labelOffset !== undefined ? (settings.labelOffset * 6 / 7) : 6;
          const outPt = getOutsidePoint(apCentroid, seg.startVertex, seg.endVertex, mapOffset);
          const outLatLng = planeToLatLng(outPt.x, outPt.y, activeCRS);

          const showLength = settings.mapLabels === "Longueurs" || settings.mapLabels === "Longueurs + Voisins";
          const showVoisin = settings.mapLabels === "Voisins" || settings.mapLabels === "Longueurs + Voisins";

          let labelText = "";
          if (showLength) labelText += `${seg.length.toFixed(2)}m`;
          if (showLength && showVoisin && seg.neighbor) labelText += ` | `;
          if (showVoisin && seg.neighbor) labelText += seg.neighbor;

          if (labelText) {
            const apLabelIcon = L.divIcon({
              className: "custom-ap-label-marker",
              html: `
                <div 
                  style="transform: rotate(${-angle}deg); text-shadow: -1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, 0px 1.5px 2px rgba(0,0,0,0.9); font-size: ${(settings.labelFontSize || 7.0) * 1.15}px;"
                  class="text-purple-300 font-semibold whitespace-nowrap pointer-events-none select-none text-center"
                >
                  ${labelText}
                </div>
              `,
              iconSize: [120, 24],
              iconAnchor: [60, 12],
            });
            const apLabelMk = L.marker(outLatLng, { icon: apLabelIcon }).addTo(map);
            addLabelMks.push(apLabelMk);
          }
        });
      }
    });

    layersRef.current.additionalPolygons = addPolys;
    layersRef.current.additionalVertexMarkers = addVertexMks;
    layersRef.current.additionalLabelMarkers = addLabelMks;

    // 4. Render Vertex Circles (Interactive with high frame-rate dragging or immediate click-to-delete)
    parcel.vertices.forEach((v) => {
      const latlng = planeToLatLng(v.x, v.y, activeCRS);
      const isSelected = selectedVertexId === v.id;

      const dotColor = isSelected
        ? "bg-amber-500/30 scale-125 ring-2 ring-amber-400/40"
        : isDeleteMode
          ? "bg-rose-600/30 hover:bg-rose-700/50 hover:scale-135 ring-2 ring-rose-500/40"
          : isSatellite
            ? "bg-emerald-400/30 ring-2 ring-emerald-400/40"
            : "bg-blue-600/30 ring-2 ring-blue-500/40";

      // Calculate outward normal vector from centroid to the vertex to offset the label beautifully
      const dxVal = v.x - centroidPlane.x;
      const dyVal = v.y - centroidPlane.y;
      const lengthVal = Math.sqrt(dxVal * dxVal + dyVal * dyVal);
      const nx = lengthVal > 0 ? dxVal / lengthVal : 1;
      const ny = lengthVal > 0 ? dyVal / lengthVal : 0;

      const tx = (nx * 16).toFixed(1);
      const ty = (-ny * 16).toFixed(1); // Standard web screen is inverted compared to cartesian/UTM plane Y

      // Custom polished CAD precision HTML target marker (no bulky background, offset labels)
      // The background of the dot and label has 70% transparency (30% opacity) for crystal clear viewing of aerial maps
      const vertexIcon = L.divIcon({
        html: `
          <div class="relative flex items-center justify-center select-none" style="pointer-events: none;">
            <!-- Precision Target Dot with 70% transparency (30% opacity) -->
            <div id="vertex-dot-${v.id}" class="w-3.5 h-3.5 rounded-full ${dotColor} border border-white/60 shadow-md flex items-center justify-center transition-all duration-150">
              <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
            </div>
            <!-- Offset Label without background, plain high contrast text with a professional CAD text-shadow/halo -->
            <div 
              style="transform: translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)); z-index: 100; text-shadow: -1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, 0px 2px 3px rgba(0,0,0,0.95); font-size: ${settings.vertexFontSize !== undefined ? settings.vertexFontSize * 1.2 : 10.5}px;"
              class="absolute top-1/2 left-1/2 font-black font-mono text-yellow-300 whitespace-nowrap pointer-events-none tracking-wide"
            >
              ${isDeleteMode ? `✕ ${v.label}` : v.label}
            </div>
          </div>
        `,
        className: "custom-vertex-marker",
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const mk = L.marker(latlng, {
        icon: vertexIcon,
        draggable: !isDeleteMode, // Disable drag during deletion to make clicking instantaneous
      }).addTo(map);

      // Decoupled Dragging implementation: Update the vector polygon on-screen in real-time
      mk.on("drag", (e: L.LeafletEvent) => {
        const marker = e.target as L.Marker;
        const pos = marker.getLatLng();

        const idx = parcel.vertices.findIndex((vertex) => vertex.id === v.id);
        if (idx !== -1 && layersRef.current.polygon) {
          const polyLatLngs = layersRef.current.polygon.getLatLngs() as L.LatLng[];
          let flatLatLngs: L.LatLng[] = [];
          if (Array.isArray(polyLatLngs[0])) {
            flatLatLngs = polyLatLngs[0] as L.LatLng[];
          } else {
            flatLatLngs = polyLatLngs;
          }
          flatLatLngs[idx] = pos;
          layersRef.current.polygon.setLatLngs(flatLatLngs);
        }
      });

      // Commit the updated values on dragend
      mk.on("dragend", (e: L.LeafletEvent) => {
        const marker = e.target as L.Marker;
        const pos = marker.getLatLng();
        const plane = latLngToPlane(pos.lat, pos.lng, activeCRS);
        onVertexUpdate(v.id, plane.x, plane.y);
      });

      mk.on("mousedown", (e) => {
        if (e.originalEvent) {
          L.DomEvent.stopPropagation(e.originalEvent);
        } else {
          L.DomEvent.stopPropagation(e as any);
        }
        if (isDeleteMode && onDeleteVertex) {
          onDeleteVertex(v.id);
        } else {
          onVertexSelect(v.id);
        }
      });

      // Show plane coordinates on tooltip inside standard modes
      if (!isDeleteMode) {
        mk.bindTooltip(`<b>${v.label}</b><br/>X: ${v.x.toFixed(2)}<br/>Y: ${v.y.toFixed(2)}`, {
          direction: "top",
          offset: [0, -10],
        });
      } else {
        mk.bindTooltip(`<b>حذف النقطة ${v.label}</b>`, {
          direction: "top",
          offset: [0, -10],
          className: "bg-rose-950 text-white text-[10px] border border-rose-500 rounded px-1.5 py-0.5"
        });
      }

      layersRef.current.vertexMarkers.push(mk);
    });

    // 5. Render rotated boundary labels (lengths & neighbors)
    const showLengths =
      settings.mapLabels === "Longueurs" || settings.mapLabels === "Longueurs + Voisins";
    const showNeighbors =
      settings.mapLabels === "Voisins" || settings.mapLabels === "Longueurs + Voisins";

    if (showLengths || showNeighbors) {
      parcel.segments.forEach((seg) => {
        const midPointCoords = getSegmentMidpoint(seg.startVertex, seg.endVertex);
        const mapOffset = settings.labelOffset !== undefined ? (settings.labelOffset * 6 / 7) : 6;
        const outsidePt = getOutsidePoint(centroidPlane, seg.startVertex, seg.endVertex, mapOffset);
        const latlngLabel = planeToLatLng(outsidePt.x, outsidePt.y, activeCRS);
        const angle = getSegmentAngle(seg.startVertex, seg.endVertex);
        const isSelected = selectedSegmentId === seg.id;

        const lengthSize = settings.labelFontSize !== undefined ? settings.labelFontSize * 1.4 : 10;
        const neighborSize = settings.labelFontSize !== undefined ? settings.labelFontSize * 1.25 : 9;

        const labelHtml = `
          <div class="flex flex-col items-center justify-center cursor-pointer group transition-transform ${
            isSelected ? "scale-110" : ""
          }" style="transform: rotate(${-angle}deg)">
            ${
              showLengths
                ? `<span style="font-size: ${lengthSize}px" class="px-1.5 py-0.5 rounded font-bold shadow-sm select-none border whitespace-nowrap mb-0.5 ${
                    isSelected
                      ? "bg-amber-500 text-white border-amber-600 scale-110"
                      : "bg-blue-50 text-blue-700 border-blue-200 group-hover:bg-blue-100"
                  }">
                    ${seg.length.toFixed(2)} m
                  </span>`
                : ""
            }
            ${
              showNeighbors && seg.neighbor
                ? `<span style="font-size: ${neighborSize}px" class="px-2 py-0.5 rounded font-medium shadow-sm select-none max-w-[100px] truncate block text-center ${
                    isSelected
                      ? "bg-red-600 text-white font-bold"
                      : "bg-stone-800 text-white font-normal opacity-90 group-hover:opacity-100"
                  }" title="${seg.neighbor.replace(/"/g, '&quot;')}">
                    ${seg.neighbor}
                  </span>`
                : ""
            }
          </div>
        `;

        const labelIcon = L.divIcon({
          html: labelHtml,
          className: "custom-rotated-label",
          iconSize: [120, 40],
          iconAnchor: [60, 20],
        });

        const labelMarker = L.marker(latlngLabel, { icon: labelIcon }).addTo(map);
        labelMarker.on("click", (e) => {
          if (e.originalEvent) {
            L.DomEvent.stopPropagation(e.originalEvent);
          } else {
            L.DomEvent.stopPropagation(e as any);
          }
          onSegmentSelect(seg.id);
        });

        layersRef.current.labelMarkers.push(labelMarker);
      });
    }

    // 5.5 Render Custom Interior Label at Polygon centroid
    if (parcel.interiorLabel) {
      const labelIcon = L.divIcon({
        className: "custom-interior-label",
        html: `
          <div 
            style="text-shadow: -1.5px -1.5px 0 #fff, 1.5px -1.5px 0 #fff, -1.5px 1.5px 0 #fff, 1.5px 1.5px 0 #fff, 0px 2px 3px rgba(0,0,0,0.45); font-size: ${(settings.labelFontSize || 7.0) * 1.5}px;"
            class="text-stone-900 font-black whitespace-nowrap pointer-events-none select-none text-center"
          >
            ${parcel.interiorLabel}
          </div>
        `,
        iconSize: [200, 30],
        iconAnchor: [100, 15],
      });
      const centroidLatLng = planeToLatLng(centroidPlane.x, centroidPlane.y, activeCRS);
      layersRef.current.interiorLabelMarker = L.marker(centroidLatLng, { icon: labelIcon }).addTo(map);
    }

    // 5.6 Render Custom Map Symbols
    (parcel.symbols || []).forEach((sym) => {
      const symLatLng = planeToLatLng(sym.x, sym.y, activeCRS);
      
      const customColor = sym.color || (
        sym.type === "tree" ? "#16a34a" :
        sym.type === "cemetery" ? "#1c1917" :
        sym.type === "well" ? "#2563eb" :
        sym.type === "building" ? "#dc2626" :
        sym.type === "mosque" ? "#d97706" :
        sym.type === "palm" ? "#059669" :
        sym.type === "reed" ? "#854d0e" :
        sym.type === "grass" ? "#16a34a" :
        sym.type === "transformer" ? "#ea580c" :
        sym.type === "olive" ? "#65a30d" :
        sym.type === "geodetic" ? "#dc2626" :
        sym.type === "spring" ? "#0284c7" :
        "#1c1917"
      );
      const customSize = sym.size || 24;
      const customFontSize = sym.fontSize || 12;

      let symbolHtml = "";
      let symbolTitle = "";
      if (sym.type === "tree") {
        symbolHtml = `
          <div class="flex items-center justify-center transition-all duration-200" style="width: ${customSize}px; height: ${customSize}px; color: ${customColor};">
            <svg viewBox="0 0 24 24" style="width: 100%; height: 100%;" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
              <path d="M12 22V13" stroke-width="2.5" />
              <path d="M12 13a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11z" fill="currentColor" fill-opacity="0.25" />
              <circle cx="10" cy="8" r="3.5" stroke="currentColor" fill="currentColor" fill-opacity="0.1" />
              <circle cx="14" cy="8" r="3.5" stroke="currentColor" fill="currentColor" fill-opacity="0.1" />
            </svg>
          </div>
        `;
        symbolTitle = l("شجرة", "Arbre", "Tree");
      } else if (sym.type === "cemetery") {
        symbolHtml = `
          <div class="flex items-center justify-center transition-all duration-200" style="width: ${customSize}px; height: ${customSize}px; color: ${customColor};">
            <svg viewBox="0 0 24 24" style="width: 100%; height: 100%;" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none">
              <!-- Elegant, thin crescent pointing upwards -->
              <path d="M12 5c-2.8 0-5 2.2-5 5s2.2 5 5 5c1.5 0 2.8-.7 3.6-1.7c-2.1 0-4-1.8-4-4.1s1.9-4.1 4-4.1C14.8 5.7 13.5 5 12 5Z" fill="currentColor" stroke="none" />
              
              <!-- Left Grave sign (arch) -->
              <path d="M5 18c0-1.4 .8-2.2 1.8-2.2s1.8 .8 1.8 2.2" />
              <line x1="4.2" y1="18" x2="9.4" y2="18" />
              
              <!-- Right Grave sign (arch) -->
              <path d="M15.4 18c0-1.4 .8-2.2 1.8-2.2s1.8 .8 1.8 2.2" />
              <line x1="14.6" y1="18" x2="19.8" y2="18" />
            </svg>
          </div>
        `;
        symbolTitle = l("مقبرة", "Cimetière", "Cemetery");
      } else if (sym.type === "well") {
        symbolHtml = `
          <div class="flex items-center justify-center transition-all duration-200" style="width: ${customSize}px; height: ${customSize}px; color: ${customColor};">
            <svg viewBox="0 0 24 24" style="width: 100%; height: 100%;" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
              <circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.15" />
              <circle cx="12" cy="12" r="4" fill="currentColor" />
            </svg>
          </div>
        `;
        symbolTitle = l("بئر", "Puits", "Well");
      } else if (sym.type === "building") {
        symbolHtml = `
          <div class="flex items-center justify-center transition-all duration-200" style="width: ${customSize}px; height: ${customSize}px; color: ${customColor};">
            <svg viewBox="0 0 24 24" style="width: 100%; height: 100%;" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
              <path d="M3 21h18" />
              <rect x="5" y="9" width="14" height="12" fill="currentColor" fill-opacity="0.15" />
              <polyline points="3,9 12,3 21,9" />
              <rect x="10" y="15" width="4" height="6" />
            </svg>
          </div>
        `;
        symbolTitle = l("بناء", "Bâtiment / Maison", "Building");
      } else if (sym.type === "mosque") {
        symbolHtml = `
          <div class="flex items-center justify-center transition-all duration-200" style="width: ${customSize}px; height: ${customSize}px; color: ${customColor};">
            <svg viewBox="0 0 24 24" style="width: 100%; height: 100%;" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none">
              <path d="M3 21h18" />
              <path d="M6 21v-4a6 6 0 0 1 12 0v4" fill="currentColor" fill-opacity="0.15" />
              <path d="M12 11V6" stroke-width="2" />
              <path d="M12 5a1.5 1.5 0 1 1-1.2 1.8" stroke-width="1.5" />
              <path d="M10 21v-3a2 2 0 0 1 4 0v3" />
            </svg>
          </div>
        `;
        symbolTitle = l("مسجد", "Mosquée", "Mosque");
      } else if (sym.type === "palm") {
        symbolHtml = `
          <div class="flex items-center justify-center transition-all duration-200" style="width: ${customSize}px; height: ${customSize}px; color: ${customColor};">
            <svg viewBox="0 0 24 24" style="width: 100%; height: 100%;" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
              <path d="M12 22V12" stroke-width="2.5" />
              <path d="M12 12c-2-2-5-1-6 1" />
              <path d="M12 12c2-2 5-1 6 1" />
              <path d="M12 12c-1-3-4-4-6-3" />
              <path d="M12 12c1-3 4-4 6-3" />
              <path d="M12 12c0-4-2-5-3-5" />
              <path d="M12 12c0-4 2-5 3-5" />
            </svg>
          </div>
        `;
        symbolTitle = l("نخيل", "Palmier", "Palm Tree");
      } else if (sym.type === "reed") {
        symbolHtml = `
          <div class="flex items-center justify-center transition-all duration-200" style="width: ${customSize}px; height: ${customSize}px; color: ${customColor};">
            <svg viewBox="0 0 24 24" style="width: 100%; height: 100%;" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
              <path d="M12 22V5" stroke-width="2" />
              <path d="M8 22C8 16 6 12 4 10" />
              <path d="M16 22C16 16 18 12 20 10" />
              <rect x="11" y="2" width="2" height="6" rx="1" fill="currentColor" />
              <circle cx="4" cy="9" r="1" fill="currentColor" />
              <circle cx="20" cy="9" r="1" fill="currentColor" />
            </svg>
          </div>
        `;
        symbolTitle = l("قصب", "Roseau", "Reed");
      } else if (sym.type === "grass") {
        symbolHtml = `
          <div class="flex items-center justify-center transition-all duration-200" style="width: ${customSize}px; height: ${customSize}px; color: ${customColor};">
            <svg viewBox="0 0 24 24" style="width: 100%; height: 100%;" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
              <path d="M12 22C12 14 8 10 5 9" />
              <path d="M12 22C12 11 16 7 20 6" />
              <path d="M12 22C12 15 10 9 7 7" stroke-width="1.8" />
              <path d="M12 22C12 15 14 9 17 7" stroke-width="1.8" />
            </svg>
          </div>
        `;
        symbolTitle = l("أعشاب", "Herbe", "Grass");
      } else if (sym.type === "transformer") {
        symbolHtml = `
          <div class="flex items-center justify-center transition-all duration-200" style="width: ${customSize}px; height: ${customSize}px; color: ${customColor};">
            <svg viewBox="0 0 24 24" style="width: 100%; height: 100%;" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
              <rect x="5" y="7" width="14" height="13" rx="1.5" fill="currentColor" fill-opacity="0.15" />
              <path d="M12 3v4" stroke-width="2" />
              <path d="M8 3h8" />
              <path d="M13 10l-3 3.5h4l-2 3.5" stroke-width="1.8" />
            </svg>
          </div>
        `;
        symbolTitle = l("محول كهربائي", "Transformateur", "Power Transformer");
      } else if (sym.type === "olive") {
        symbolHtml = `
          <div class="flex items-center justify-center transition-all duration-200" style="width: ${customSize}px; height: ${customSize}px; color: ${customColor};">
            <svg viewBox="0 0 24 24" style="width: 100%; height: 100%;" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
              <!-- Trunk -->
              <path d="M12 22c0-3 0.5-4.5 1.5-5.5" stroke-width="2.2" />
              <path d="M12 22c0-3-0.5-4.5-1.5-5.5" stroke-width="2.2" />
              <path d="M12 22v-5.5" stroke-width="2.6" />
              <path d="M10.5 16.5c-1.5-1.5-2-3-1.5-4.5" />
              <path d="M13.5 16.5c1.5-1.5 2-3 1.5-4.5" />
              
              <!-- Leafy Canopies -->
              <circle cx="12" cy="9" r="5" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="1.2" />
              <circle cx="8" cy="11" r="4" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="1.2" />
              <circle cx="16" cy="11" r="4" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="1.2" />
              
              <!-- Little Olive Fruits -->
              <circle cx="10" cy="9" r="1.1" fill="#1c1917" stroke="none" />
              <circle cx="14" cy="10" r="1.1" fill="#1c1917" stroke="none" />
              <circle cx="12" cy="12" r="1.1" fill="#1c1917" stroke="none" />
              <circle cx="8" cy="11" r="1.1" fill="#1c1917" stroke="none" />
              <circle cx="16" cy="11" r="1.1" fill="#1c1917" stroke="none" />
            </svg>
          </div>
        `;
        symbolTitle = l("شجرة زيتون", "Olivier", "Olive Tree");
      } else if (sym.type === "geodetic") {
        symbolHtml = `
          <div class="flex items-center justify-center transition-all duration-200" style="width: ${customSize}px; height: ${customSize}px; color: ${customColor};">
            <svg viewBox="0 0 24 24" style="width: 100%; height: 100%;" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
              <polygon points="12,3 22,20 2,20" fill="currentColor" fill-opacity="0.15" stroke-width="2" />
              <circle cx="12" cy="14" r="2.5" fill="currentColor" />
            </svg>
          </div>
        `;
        symbolTitle = l("نقطة جيوديزية", "Point Géodésique", "Geodetic Point");
      } else if (sym.type === "spring") {
        symbolHtml = `
          <div class="flex items-center justify-center transition-all duration-200" style="width: ${customSize}px; height: ${customSize}px; color: ${customColor};">
            <svg viewBox="0 0 24 24" style="width: 100%; height: 100%;" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
              <path d="M12 3v3M12 21a6 6 0 0 0 6-6c0-4-6-10-6-10S6 11 6 15a6 6 0 0 0 6 6z" fill="currentColor" fill-opacity="0.2" />
              <path d="M9 15c0-1.5 1.5-3 3-3" />
            </svg>
          </div>
        `;
        symbolTitle = l("عين ماء", "Source d'eau", "Water Spring");
      } else if (sym.type === "custom_text") {
        symbolHtml = `
          <div 
            style="text-shadow: -1.5px -1.5px 0 #fff, 1.5px -1.5px 0 #fff, -1.5px 1.5px 0 #fff, 1.5px 1.5px 0 #fff, 0px 0px 4px #fff; font-size: ${customFontSize}px; color: ${customColor};"
            class="font-black whitespace-nowrap text-center select-none"
          >
            ${sym.label || l("كتابة حرة", "Texte Libre", "Custom Text")}
          </div>
        `;
        symbolTitle = l("نص مخصص", "Texte personnalisé", "Custom Text");

      }

      const hasSubtitle = sym.label && sym.type !== "custom_text";
      const fullHtml = `
        <div class="flex flex-col items-center justify-center relative select-none animate-fade-in">
          ${symbolHtml}
          ${hasSubtitle ? `
            <span 
              style="text-shadow: -1.5px -1.5px 0 #fff, 1.5px -1.5px 0 #fff, -1.5px 1.5px 0 #fff, 1.5px 1.5px 0 #fff, 0px 0px 4px #fff; font-size: ${Math.max(8, customFontSize - 2)}px; color: ${customColor};"
              class="font-black mt-1 py-0.2 whitespace-nowrap block text-center max-w-[120px] truncate select-none"
            >
              ${sym.label}
            </span>
          ` : ""}
        </div>
      `;

      const iconSizeVal = sym.type === "custom_text" ? 150 : (customSize + 6);
      const symIcon = L.divIcon({
        html: fullHtml,
        className: "custom-map-symbol-marker",
        iconSize: [iconSizeVal, iconSizeVal],
        iconAnchor: [iconSizeVal / 2, iconSizeVal / 2],
      });

      const symMarker = L.marker(symLatLng, {
        icon: symIcon,
        draggable: true,
      }).addTo(map);

      symMarker.bindTooltip(
        `<b>${symbolTitle}</b>${sym.label ? `<br/><span class="text-xs text-stone-500">${sym.label}</span>` : ""}<br/><span class="text-[9px] text-stone-400 font-mono">X: ${sym.x.toFixed(2)}, Y: ${sym.y.toFixed(2)}</span>`,
        {
          direction: "top",
          offset: [0, -10],
        }
      );

      // Unified action handlers
      let lastTriggered = 0;
      const handleSymbolEdit = () => {
        const now = Date.now();
        if (now - lastTriggered < 300) return;
        lastTriggered = now;
        setEditingSymbol(sym);
      };

      // Bulletproof binding to guarantee events are caught at capture phase & bypass other leaflet/div icon restrictions
      const bindSymbolEvents = () => {
        const el = symMarker.getElement();
        if (!el) return;

        el.style.cursor = "grab";

        // Bind edit action
        const onEdit = (domEvent: Event) => {
          domEvent.stopPropagation();
          domEvent.preventDefault();
          handleSymbolEdit();
        };
        el.addEventListener("mousedown", onEdit, { capture: true });
        el.addEventListener("click", onEdit, { capture: true });
      };

      // Handle element-mounting phase seamlessly
      if (symMarker.getElement()) {
        bindSymbolEvents();
      } else {
        symMarker.on("add", bindSymbolEvents);
      }

      symMarker.on("dragend", (e: L.LeafletEvent) => {
        const marker = e.target as L.Marker;
        const pos = marker.getLatLng();
        const plane = latLngToPlane(pos.lat, pos.lng, activeCRS);
        
        if (onUpdateParcel) {
          const updatedSymbols = (parcel.symbols || []).map((s) => {
            const sId = s.id || `${s.x}_${s.y}_${s.type}`;
            const symId = sym.id || `${sym.x}_${sym.y}_${sym.type}`;
            return sId === symId ? { ...s, x: parseFloat(plane.x.toFixed(2)), y: parseFloat(plane.y.toFixed(2)) } : s;
          });
          onUpdateParcel({
            ...parcel,
            symbols: updatedSymbols,
          });
        }
      });

      layersRef.current.symbolMarkers.push(symMarker);
    });

    // 5.7 Render Custom Linear Features
    (parcel.linearFeatures || []).forEach((lf) => {
      const lineLatLngs = lf.vertices
        .map((v) => planeToLatLng(v.x, v.y, activeCRS))
        .filter((ll) => Array.isArray(ll) && ll.length === 2 && !isNaN(ll[0]) && !isNaN(ll[1]));

      if (lineLatLngs.length < 2) return;

      const group = L.featureGroup();

      if (lf.type === "footpath") {
        // Dash line representation
        const polyline = L.polyline(lineLatLngs, {
          color: lf.color || "#b45309",
          weight: lf.thickness || 3,
          dashArray: "6, 6",
          lineCap: "round",
          lineJoin: "round",
        });
        group.addLayer(polyline);
      } else if (lf.type === "agri_road") {
        // Parallel double line with empty transparent middle space and customizable spacing
        const spacingVal = lf.spacing !== undefined ? lf.spacing : 4;
        const { left, right } = getParallelPolylines(lf.vertices, spacingVal / 2);
        
        const leftLatLngs = left
          .map((v) => planeToLatLng(v.x, v.y, activeCRS))
          .filter((ll) => Array.isArray(ll) && ll.length === 2 && !isNaN(ll[0]) && !isNaN(ll[1]));
          
        const rightLatLngs = right
          .map((v) => planeToLatLng(v.x, v.y, activeCRS))
          .filter((ll) => Array.isArray(ll) && ll.length === 2 && !isNaN(ll[0]) && !isNaN(ll[1]));

        const leftPoly = L.polyline(leftLatLngs, {
          color: lf.color || "#78350f",
          weight: lf.thickness || 2,
          lineCap: "round",
          lineJoin: "round",
        });
        const rightPoly = L.polyline(rightLatLngs, {
          color: lf.color || "#78350f",
          weight: lf.thickness || 2,
          lineCap: "round",
          lineJoin: "round",
        });
        group.addLayer(leftPoly);
        group.addLayer(rightPoly);
      } else if (lf.type === "power_line") {
        // Solid dark grey line with custom professional electrical pole icons at vertices
        const mainLine = L.polyline(lineLatLngs, {
          color: lf.color || "#475569",
          weight: lf.thickness || 1.8,
        });
        group.addLayer(mainLine);

        lineLatLngs.forEach((latlng) => {
          const poleIcon = L.divIcon({
            html: `
              <div class="flex items-center justify-center" style="width: 24px; height: 24px; transform: rotate(0deg);">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <!-- Vertical mast -->
                  <line x1="12" y1="2" x2="12" y2="22" stroke="${lf.color || '#475569'}" stroke-width="2.5" stroke-linecap="round" />
                  <!-- Upper crossbar -->
                  <line x1="4" y1="6" x2="20" y2="6" stroke="${lf.color || '#475569'}" stroke-width="2.5" stroke-linecap="round" />
                  <!-- Lower crossbar -->
                  <line x1="6" y1="12" x2="18" y2="12" stroke="${lf.color || '#475569'}" stroke-width="2" stroke-linecap="round" />
                  <!-- Insulators -->
                  <circle cx="4" cy="6" r="1.5" fill="#ffffff" stroke="${lf.color || '#475569'}" stroke-width="1.2" />
                  <circle cx="20" cy="6" r="1.5" fill="#ffffff" stroke="${lf.color || '#475569'}" stroke-width="1.2" />
                  <circle cx="6" cy="12" r="1.5" fill="#ffffff" stroke="${lf.color || '#475569'}" stroke-width="1" />
                  <circle cx="18" cy="12" r="1.5" fill="#ffffff" stroke="${lf.color || '#475569'}" stroke-width="1" />
                </svg>
              </div>
            `,
            className: "",
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          });
          const poleMarker = L.marker(latlng, { icon: poleIcon, interactive: false });
          group.addLayer(poleMarker);
        });
      } else if (lf.type === "water_pipe") {
        // Blue line with dash-dot style and small blue dots at vertices
        const mainLine = L.polyline(lineLatLngs, {
          color: lf.color || "#0284c7",
          weight: lf.thickness || 2.2,
          dashArray: "12, 4, 3, 4",
        });
        group.addLayer(mainLine);

        lineLatLngs.forEach((latlng) => {
          const c = L.circleMarker(latlng, {
            radius: 3,
            color: lf.color || "#0284c7",
            fillColor: "#0284c7",
            fillOpacity: 1,
            weight: 1,
          });
          group.addLayer(c);
        });
      } else if (lf.type === "sewer_pipe") {
        // Sewer line: reddish brown line with solid reddish brown circles at vertices representing manholes
        const mainLine = L.polyline(lineLatLngs, {
          color: lf.color || "#7c2d12",
          weight: lf.thickness || 2.2,
        });
        group.addLayer(mainLine);

        lineLatLngs.forEach((latlng) => {
          const c = L.circleMarker(latlng, {
            radius: 4,
            color: lf.color || "#7c2d12",
            fillColor: lf.color || "#7c2d12",
            fillOpacity: 1,
            weight: 1,
          });
          group.addLayer(c);
        });
      }

      // Render line label with text shadow and no background
      if (lf.label) {
        const midIdx = Math.floor(lineLatLngs.length / 2);
        const midLatLng = lineLatLngs[midIdx];
        const lblColor = lf.labelColor || lf.color || '#1e293b';
        const lblSize = lf.labelSize || 9.5;
        const labelIcon = L.divIcon({
          className: "bg-transparent border-0 shadow-none",
          html: `
            <div 
              style="text-shadow: -1.5px -1.5px 0 #fff, 1.5px -1.5px 0 #fff, -1.5px 1.5px 0 #fff, 1.5px 1.5px 0 #fff, 0px 0px 4px #fff; font-size: ${lblSize}px; color: ${lblColor}; line-height: 1;"
              class="font-black px-1 py-0.5 whitespace-nowrap block text-center select-none"
            >
              ${lf.label}
            </div>
          `,
          iconSize: [140, 20],
          iconAnchor: [70, 10],
        });
        const labelMarker = L.marker(midLatLng, { icon: labelIcon, interactive: false });
        group.addLayer(labelMarker);
      }

      const lineName = lf.type === "footpath" ? l("طريق رجلية", "Sentier", "Footpath") :
                       lf.type === "agri_road" ? l("طريق فلاحية", "Chemin agricole", "Agricultural Road") :
                       lf.type === "power_line" ? l("خط الكهرباء", "Ligne électrique", "Power Line") :
                       lf.type === "water_pipe" ? l("خط أنبوب الماء", "Conduite d'eau", "Water Pipe") :
                       lf.type === "sewer_pipe" ? l("أنبوب تطهير السائل", "Réseau d'assainissement", "Sewer Pipe") : "";
      
      group.bindTooltip(`<b>${lf.label || lineName}</b>`, { sticky: true });
      group.addTo(map);
      layersRef.current.linearFeatureLayers.push(group);
    });

    // 5.8 Render current drawing line in real-time
    if (lineToPlace && drawingLineVertices.length > 0) {
      const drawingLatLngs = drawingLineVertices
        .map((v) => planeToLatLng(v.x, v.y, activeCRS))
        .filter((ll) => Array.isArray(ll) && ll.length === 2 && !isNaN(ll[0]) && !isNaN(ll[1]));

      const drawGroup = L.featureGroup();

      if (drawingLatLngs.length >= 2) {
        const draftPoly = L.polyline(drawingLatLngs, {
          color: "#059669",
          weight: 3.5,
          dashArray: "6, 6",
        });
        drawGroup.addLayer(draftPoly);
      }

      drawingLatLngs.forEach((latlng, idx) => {
        const drawPtMarker = L.circleMarker(latlng, {
          radius: 5.5,
          color: "#059669",
          fillColor: "#ffffff",
          fillOpacity: 1,
          weight: 2.5,
        });
        drawPtMarker.bindTooltip(`${l(`نقطة ${idx + 1}`, `Point ${idx + 1}`, `Point ${idx + 1}`)}`, { permanent: false });
        drawGroup.addLayer(drawPtMarker);
      });

      drawGroup.addTo(map);
      layersRef.current.drawingLineLayers.push(drawGroup);
    }

    // Auto fit boundaries on initial load or when parcel/additional selection changes so they synchronize perfectly
    const selectionKey = parcel.id + "-" + (additionalParcels || []).map((p) => p.id).join(",");
    const lastSelectionKey = (map as any)._lastSelectionKey;
    if (lastSelectionKey !== selectionKey) {
      map.invalidateSize(); // Forces containment refresh to prevent faulty sizes on layout switches
      const allSelectedVertices = [
        ...parcel.vertices,
        ...(additionalParcels || []).flatMap((p) => p.vertices)
      ];
      const latLngsList = allSelectedVertices
        .map((v) => planeToLatLng(v.x, v.y, activeCRS))
        .filter((ll) => Array.isArray(ll) && ll.length === 2 && typeof ll[0] === 'number' && !isNaN(ll[0]) && isFinite(ll[0]) && typeof ll[1] === 'number' && !isNaN(ll[1]) && isFinite(ll[1]));
      if (latLngsList.length > 0) {
        const boundsList = L.latLngBounds(latLngsList);
        if (boundsList.isValid()) {
          map.flyToBounds(boundsList, { padding: [50, 50], duration: 0.8 });
          (map as any)._lastSelectionKey = selectionKey;
        }
      }
    }
  }, [parcel, additionalParcels, settings, selectedVertexId, selectedSegmentId, mapPreset, activeCRS, isDeleteMode, symbolToPlace, symbolPlacementLabel, onPlacedSymbolDone, lang, onUpdateParcel, lineToPlace, drawingLineVertices]);

  // Active mouse coordinates tracker over Leaflet footprint
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMouseMoveCoords = (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      const plane = latLngToPlane(lat, lng, activeCRS);
      setMouseCoords({
        lat,
        lng,
        x: plane.x,
        y: plane.y,
      });
    };

    const handleMouseOutCoords = () => {
      setMouseCoords(null);
    };

    map.on("mousemove", handleMouseMoveCoords);
    map.on("mouseout", handleMouseOutCoords);

    return () => {
      map.off("mousemove", handleMouseMoveCoords);
      map.off("mouseout", handleMouseOutCoords);
    };
  }, [activeCRS, mapPreset]);

  const getCumulativeDistance = () => {
    if (!mapRef.current || measurePoints.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < measurePoints.length; i++) {
      total += mapRef.current.distance(measurePoints[i - 1], measurePoints[i]);
    }
    return total;
  };

  const handleExecuteGoto = () => {
    setGotoError("");
    const map = mapRef.current;
    if (!map) return;

    if (gotoType === "lambert") {
      const xVal = parseFloat(gotoX);
      const yVal = parseFloat(gotoY);
      if (isNaN(xVal) || isNaN(yVal)) {
        setGotoError(l("الرجاء إدخال أرقام صحيحة لـ X و Y", "Veuillez entrer des coordonnées X et Y valides", "Please enter valid X and Y coordinates"));
        return;
      }

      try {
        const [lat, lng] = planeToLatLng(xVal, yVal, activeCRS);
        if (isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng)) {
          setGotoError(l("فشل تحويل الإحداثيات المسطحة", "Échec de conversion des coordonnées Lambert", "Lambert coordinate conversion failed"));
          return;
        }
        const latlng = L.latLng(lat, lng);
        setGotoMarkerLatLng(latlng);
        map.flyTo(latlng, 19, { animate: true, duration: 1.5 });
      } catch (err) {
        setGotoError(l("خطأ في معالجة الإحداثيات", "Erreur de traitement des coordonnées", "Coordinate processing error"));
      }
    } else {
      const latVal = parseFloat(gotoLat);
      const lngVal = parseFloat(gotoLng);
      if (isNaN(latVal) || isNaN(lngVal)) {
        setGotoError(l("الرجاء إدخال قيم صحيحة لخط العرض والطول", "Veuillez saisir des coordonnées géographiques valides", "Please enter valid latitude and longitude values"));
        return;
      }
      if (latVal < -90 || latVal > 90 || lngVal < -180 || lngVal > 180) {
        setGotoError(l("قيم خطوط العرض والطول خارج النطاق المسموح به", "Valeurs de latitude/longitude hors limites (-90 à 90 / -180 à 180)", "Latitude/Longitude values out of bounds (-90 to 90 / -180 to 180)"));
        return;
      }

      const latlng = L.latLng(latVal, lngVal);
      setGotoMarkerLatLng(latlng);
      map.flyTo(latlng, 19, { animate: true, duration: 1.5 });
    }
  };

  const handleUndoMeasure = () => {
    if (measurePoints.length > 0) {
      setMeasurePoints((prev) => prev.slice(0, -1));
    }
  };

  const handleClearMeasure = () => {
    setMeasurePoints([]);
    setTempMeasureMouse(null);
  };

  const crsDetails = CRS_DETAILS[activeCRS] || { name: activeCRS, arabic: activeCRS };
  const crsLabel = lang === "ar" ? crsDetails.arabic : crsDetails.name;

  return (
    <div className="relative w-full h-full bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-inner group flex flex-col">
      <style>{`
        .leaflet-container {
          background: ${mapPreset === "cad" ? "#ffffff" : "#0d1117"} !important;
          cursor: ${
            isDrawingMode
              ? "crosshair !important"
              : isDeleteMode
                ? "not-allowed !important"
                : "grab"
          } !important;
        }
        .custom-vertex-marker {
          overflow: visible !important;
        }
        .custom-rotated-label {
          overflow: visible !important;
        }
      `}</style>

      {/* Map Element */}
      <div ref={mapContainerRef} className="w-full flex-1 min-h-0 z-10" />

      {/* Unified Professional Dark UI CAD/GIS Control Dashboard (Floating Top-Left) */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-3 max-w-[145px] pointer-events-none">
        
        {/* Navigation & CAD controls panel */}
        <div className="bg-slate-900/95 border border-slate-700/80 rounded-xl p-1.5 shadow-2xl flex flex-col gap-1.5 pointer-events-auto">
          {/* Zoom In / Zoom Out custom buttons */}
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={handleZoomIn}
              className="bg-slate-800 hover:bg-slate-700 text-white p-2 rounded-lg flex items-center justify-center transition hover:scale-105 active:scale-95"
              title="Agrandir (تقريب الخريطة)"
            >
              <ZoomIn className="w-3.5 h-3.5 text-amber-400" />
            </button>
            <button
              onClick={handleZoomOut}
              className="bg-slate-800 hover:bg-slate-700 text-white p-2 rounded-lg flex items-center justify-center transition hover:scale-105 active:scale-95"
              title="Rétrécir (إبعاد الخريطة)"
            >
              <ZoomOut className="w-3.5 h-3.5 text-amber-400" />
            </button>
          </div>

          <hr className="border-slate-800 my-0.5" />

          {/* Recenter / Focus trigger */}
          <button
            onClick={handleRecenter}
            className="bg-slate-800 hover:bg-slate-700 text-white p-2 py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition hover:scale-105 active:scale-95 text-[10px] font-bold"
            title={l("تركيز العرض على العقار", "Centrer sur la parcelle", "Focus on parcel")}
          >
            <Maximize className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{l("تركيز", "Centrer", "Focus")}</span>
          </button>

          {/* Freehand CAD Drawing Mode Toggle */}
          <button
            onClick={() => {
              setDrawingMode(!isDrawingMode);
              if (isDeleteMode) setDeleteMode(false); // Mutually exclusive
            }}
            className={`p-2 rounded-lg flex items-center justify-center gap-1.5 transition text-[10px] font-bold ${
              isDrawingMode
                ? "bg-amber-600 border border-amber-400 text-white animate-pulse"
                : "bg-slate-800 hover:bg-slate-700 text-slate-200"
            }`}
            title={l("وضع رسم حر", "Mode dessin libre", "Freehand draw mode")}
          >
            {isDrawingMode ? (
              <MousePointer className="w-3.5 h-3.5 text-white animate-spin" />
            ) : (
              <Edit2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>{l("رسم حر", "Dessin libre", "Freehand")}</span>
          </button>

          {/* Delete Mode Toggle (New feature) */}
          <button
            onClick={() => {
              setDeleteMode(!isDeleteMode);
              if (isDrawingMode) setDrawingMode(false); // Mutually exclusive
            }}
            className={`p-2 rounded-lg flex items-center justify-center gap-1.5 transition text-[10px] font-bold ${
              isDeleteMode
                ? "bg-rose-600 text-white border border-rose-400"
                : "bg-slate-800 hover:bg-slate-700 text-slate-200"
            }`}
            title={l("تفعيل وضع حذف النقاط", "Activer le mode suppression des sommets", "Enable vertex deletion mode")}
          >
            <Trash2 className={`w-3.5 h-3.5 ${isDeleteMode ? "text-white" : "text-rose-400"}`} />
            <span>{l("حذف النقاط", "Supprimer sommets", "Delete vertices")}</span>
          </button>
        </div>

        {/* Satellite & Streetmap Base Layer select panel */}
        <div className="bg-slate-900/95 border border-slate-700/80 rounded-xl p-1.5 shadow-2xl flex flex-col gap-1 pointer-events-auto">
          <span className="text-[7.5px] font-mono text-slate-400 font-bold tracking-wider px-1 mb-1 block uppercase">
            {l("خلفيات الخريطة", "FONDS DE CARTE", "BASEMAPS")}
          </span>

          <button
            onClick={() => setMapPreset("cad")}
            className={`px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wider transition flex items-center gap-1.5 focus:outline-none ${
              mapPreset === "cad"
                ? "bg-amber-600 text-white font-black"
                : "text-slate-300 hover:bg-slate-800"
            }`}
            title={l("شبكة كاد", "Plan Cadastral", "Cadastral Grid")}
          >
            <Grid className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{l("شبكة CAD", "Grille CAD", "CAD Grid")}</span>
          </button>

          <button
            onClick={() => setMapPreset("satellite")}
            className={`px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wider transition flex items-center gap-1.5 focus:outline-none ${
              mapPreset === "satellite"
                ? "bg-amber-600 text-white font-black"
                : "text-slate-300 hover:bg-slate-800"
            }`}
            title={l("صورة جوية إيسري", "Satellite ESRI", "ESRI Satellite")}
          >
            <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>SAT Esri</span>
          </button>

          <button
            onClick={() => setMapPreset("google_sat")}
            className={`px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wider transition flex items-center gap-1.5 focus:outline-none ${
              mapPreset === "google_sat"
                ? "bg-amber-600 text-white font-black"
                : "text-slate-300 hover:bg-slate-800"
            }`}
            title={l("خرائط جوجل الجوية", "Google Satellite Hybride", "Google Satellite")}
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>SAT Google</span>
          </button>

          <button
            onClick={() => setMapPreset("osm")}
            className={`px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wider transition flex items-center gap-1.5 focus:outline-none ${
              mapPreset === "osm"
                ? "bg-amber-600 text-white font-black"
                : "text-slate-300 hover:bg-slate-800"
            }`}
            title={l("خريطة الشوارع", "OpenStreetMap", "OpenStreetMap")}
          >
            <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>{l("خريطة OSM", "Carte OSM", "OSM Map")}</span>
          </button>
        </div>
      </div>

      {/* Unified Professional Dark UI CAD/GIS Utilities Panel (Floating Top-Right) */}
      <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-3 max-w-[280px] pointer-events-none">
        {/* Toggle buttons row */}
        <div className="flex gap-2 pointer-events-auto">
          {/* Go To Button */}
          <button
            onClick={() => {
              setIsGotoOpen(!isGotoOpen);
              if (isMeasuring) {
                setIsMeasuring(false);
                setMeasurePoints([]);
                setTempMeasureMouse(null);
              }
            }}
            className={`p-2 py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition hover:scale-105 active:scale-95 text-[10px] font-bold border ${
              isGotoOpen
                ? "bg-amber-600 border-amber-400 text-white shadow-lg shadow-amber-500/20"
                : "bg-slate-900/95 border-slate-700/80 text-slate-200 hover:bg-slate-800"
            }`}
            title={l("الانتقال إلى إحداثيات محددة", "Aller aux coordonnées", "Go to coordinates")}
          >
            <Navigation className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{l("الانتقال السريع", "Go To", "Go To")}</span>
          </button>

          {/* Measure Button */}
          <button
            onClick={() => {
              setIsMeasuring(!isMeasuring);
              if (isGotoOpen) setIsGotoOpen(false);
            }}
            className={`p-2 py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition hover:scale-105 active:scale-95 text-[10px] font-bold border ${
              isMeasuring
                ? "bg-pink-600 border-pink-400 text-white shadow-lg shadow-pink-500/20"
                : "bg-slate-900/95 border-slate-700/80 text-slate-200 hover:bg-slate-800"
            }`}
            title={l("قياس المسافات على الخريطة", "Mesurer la distance", "Measure distance")}
          >
            <Ruler className="w-3.5 h-3.5 text-pink-400 shrink-0" />
            <span>{l("قياس المسافة", "Mesure", "Measure")}</span>
          </button>
        </div>

        {/* Go To Panel details */}
        {isGotoOpen && (
          <div className="bg-slate-900/95 border border-slate-700/80 rounded-xl p-3 shadow-2xl space-y-2.5 w-[260px] pointer-events-auto text-slate-100 font-sans">
            <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                {l("تحديد الموقع بالإحداثيات", "Aller aux Coordonnées", "Go to Coordinates")}
              </span>
              <button 
                onClick={() => setIsGotoOpen(false)}
                className="text-slate-400 hover:text-slate-200 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Coordinate system switcher */}
            <div className="grid grid-cols-2 gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800/80">
              <button
                type="button"
                onClick={() => {
                  setGotoType("lambert");
                  setGotoError("");
                }}
                className={`py-1 text-[9px] font-bold rounded-md transition ${
                  gotoType === "lambert"
                    ? "bg-slate-850 text-amber-400 shadow-sm"
                    : "text-slate-400 hover:text-slate-300"
                }`}
              >
                {l("لومبرت (X/Y)", "Lambert (X/Y)", "Lambert (X/Y)")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setGotoType("wgs84");
                  setGotoError("");
                }}
                className={`py-1 text-[9px] font-bold rounded-md transition ${
                  gotoType === "wgs84"
                    ? "bg-slate-850 text-amber-400 shadow-sm"
                    : "text-slate-400 hover:text-slate-300"
                }`}
              >
                {l("جغرافي (Lat/Lng)", "Géographique", "Geographic (Lat/Lng)")}
              </button>
            </div>

            {/* Form Fields */}
            <div className="space-y-2 font-sans">
              {gotoType === "lambert" ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[8px] uppercase tracking-wider font-semibold text-slate-400 font-mono block mb-1">
                      X (Lambert m)
                    </label>
                    <input
                      type="text"
                      value={gotoX}
                      onChange={(e) => setGotoX(e.target.value)}
                      placeholder="362450"
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] uppercase tracking-wider font-semibold text-slate-400 font-mono block mb-1">
                      Y (Lambert m)
                    </label>
                    <input
                      type="text"
                      value={gotoY}
                      onChange={(e) => setGotoY(e.target.value)}
                      placeholder="411830"
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[8px] uppercase tracking-wider font-semibold text-slate-400 font-mono block mb-1">
                      Latitude (°)
                    </label>
                    <input
                      type="text"
                      value={gotoLat}
                      onChange={(e) => setGotoLat(e.target.value)}
                      placeholder="33.5731"
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] uppercase tracking-wider font-semibold text-slate-400 font-mono block mb-1">
                      Longitude (°)
                    </label>
                    <input
                      type="text"
                      value={gotoLng}
                      onChange={(e) => setGotoLng(e.target.value)}
                      placeholder="-7.5898"
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                </div>
              )}

              {gotoError && (
                <div className="bg-rose-950/85 border border-rose-800/80 text-[9px] text-rose-300 p-1.5 rounded font-medium">
                  {gotoError}
                </div>
              )}

              <div className="flex gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={handleExecuteGoto}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-slate-950 font-extrabold text-[10px] py-1.5 rounded transition shadow-md flex items-center justify-center gap-1"
                >
                  <Navigation className="w-3 h-3 fill-slate-950 text-slate-950" />
                  <span>{l("انتقال", "Aller à", "Go to")}</span>
                </button>

                {gotoMarkerLatLng && (
                  <button
                    type="button"
                    onClick={() => {
                      setGotoMarkerLatLng(null);
                      setGotoError("");
                    }}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-1.5 rounded transition"
                    title={l("مسح علامة التحديد", "Effacer le repère", "Clear marker")}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Distance Measurement details */}
        {isMeasuring && (
          <div className="bg-slate-900/95 border border-slate-700/80 rounded-xl p-3 shadow-2xl space-y-2.5 w-[260px] pointer-events-auto text-slate-100 font-sans">
            <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
              <span className="text-[10px] font-bold text-pink-400 uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
                <Ruler className="w-3.5 h-3.5" />
                {l("قياس المسافات", "Mesure de Distance", "Distance Measurement")}
              </span>
              <button 
                onClick={() => {
                  setIsMeasuring(false);
                  setMeasurePoints([]);
                  setTempMeasureMouse(null);
                }}
                className="text-slate-400 hover:text-slate-200 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Instruction block */}
            <div className="bg-slate-950 border border-slate-800/80 p-2 rounded text-[9px] leading-relaxed text-slate-300">
              {measurePoints.length === 0 ? (
                <span className="animate-pulse block text-pink-300">
                  {l(
                    "ℹ️ انقر على أي موقع في الخريطة لوضع أول نقطة قياس.",
                    "ℹ️ Cliquez sur la carte pour placer le premier point.",
                    "ℹ️ Click anywhere on map to place first measurement point."
                  )}
                </span>
              ) : (
                <span>
                  {l(
                    `استمر بالنقر لتمديد القياس. تم تحديد ${measurePoints.length} نقطة.`,
                    `Continuez à cliquer pour mesurer. ${measurePoints.length} points.`,
                    `Keep clicking to extend measurement. ${measurePoints.length} points selected.`
                  )}
                </span>
              )}
            </div>

            {measurePoints.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded border border-slate-800/50">
                  <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">
                    {l("المسافة الإجمالية", "Distance Totale", "Total Distance")}
                  </span>
                  <span className="text-xs font-black text-pink-400 font-mono">
                    {getCumulativeDistance().toFixed(2)} m
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 font-sans">
                  <button
                    type="button"
                    onClick={handleUndoMeasure}
                    disabled={measurePoints.length === 0}
                    className="bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-[9px] font-bold py-1.5 rounded transition flex items-center justify-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{l("تراجع", "Annuler", "Undo")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClearMeasure}
                    disabled={measurePoints.length === 0}
                    className="bg-pink-950 hover:bg-pink-900 border border-pink-800 text-pink-200 text-[9px] font-bold py-1.5 rounded transition flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{l("مسح الكل", "Effacer tout", "Clear All")}</span>
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setIsMeasuring(false);
                setMeasurePoints([]);
                setTempMeasureMouse(null);
              }}
              className="w-full bg-slate-850 hover:bg-slate-800 hover:text-white text-slate-200 text-[9px] font-bold py-1.5 rounded transition flex items-center justify-center gap-1 border border-slate-700/60"
            >
              <Check className="w-3 h-3 text-emerald-400" />
              <span>{l("إنهاء وإغلاق", "Terminer", "Finish & Close")}</span>
            </button>
          </div>
        )}
      </div>

      {/* Floating notifications for various states */}
      {isDrawingMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-amber-500 text-white border border-amber-400 shadow-xl px-4 py-2 rounded-full font-bold text-[11px] flex items-center gap-2 animate-bounce">
          <Edit2 className="w-3.5 h-3.5" />
          <span>{l("وضع الرسم نشط: انقر في أي مكان على الخريطة لإضافة نقاط حدودية", "Mode dessin actif : cliquez n'importe où sur la carte pour ajouter des sommets", "Drawing mode active: click anywhere on map to add vertices")}</span>
          <button
            onClick={() => setDrawingMode(false)}
            className="ml-2 bg-amber-700 hover:bg-amber-800 text-white font-black px-2 py-0.5 rounded text-[10px]"
          >
            {l("إنهاء", "Terminer", "Finish")}
          </button>
        </div>
      )}

      {isDeleteMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-rose-600 text-white border border-rose-500 shadow-xl px-4 py-2 rounded-full font-bold text-[11px] flex items-center gap-2 animate-bounce">
          <Trash2 className="w-3.5 h-3.5 text-white" />
          <span>{l("وضع الحذف نشط: انقر مباشرة فوق أي رأس (Borne) على الخريطة لإزالته نهائياً", "Mode suppression actif : cliquez directement sur une borne pour la supprimer", "Delete mode active: click directly on a borne to remove it")}</span>
          <button
            onClick={() => setDeleteMode(false)}
            className="ml-2 bg-rose-800 hover:bg-rose-900 text-white font-black px-2 py-0.5 rounded text-[10px]"
          >
            {l("إلغاء المعاينة", "Annuler", "Cancel")}
          </button>
        </div>
      )}


      {/* Bottom-Right indicator showing the currently active view preset details */}
      <div className="absolute bottom-16 right-4 z-20 pointer-events-none bg-slate-900/85 border border-slate-700/50 backdrop-blur-md px-3 py-1.5 rounded-lg text-[9px] text-slate-300 font-bold select-none uppercase tracking-widest font-mono flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
        <span>
          {mapPreset === "cad"
            ? "Plan Lambert actif"
            : mapPreset === "satellite"
              ? "Esri Satellite actif"
              : mapPreset === "google_sat"
                ? "Google Hybrid actif"
                : "Plan OSM actif"}
        </span>
      </div>

      {/* High-Precision Mouse Coordinates Display Frame/Footer */}
      <div className="bg-slate-950 border-t border-slate-800 text-slate-300 px-4 py-2 flex flex-col md:flex-row items-center justify-between gap-3 select-none z-20 shrink-0 font-sans shadow-lg">
        {/* Left Side: Mouse location pointer & Coordinates */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-bold text-slate-300">
              {l("إحداثيات مؤشر الماوس الحية:", "Coordonnées de la souris :", "Live Mouse Coordinates:")}
            </span>
          </div>

          {mouseCoords ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono">
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 shadow-sm">
                <span className="text-emerald-400 font-bold text-[10px]">X (Lambert):</span>
                <span className="text-slate-100 font-black tracking-wider">{mouseCoords.x.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                <span className="text-[10px] text-slate-500">m</span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 shadow-sm">
                <span className="text-emerald-400 font-bold text-[10px]">Y (Lambert):</span>
                <span className="text-slate-100 font-black tracking-wider">{mouseCoords.y.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                <span className="text-[10px] text-slate-500">m</span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 shadow-sm text-indigo-300">
                <span className="text-indigo-400 font-bold text-[10px]">Lat:</span>
                <span className="font-semibold">{mouseCoords.lat.toFixed(7)}°</span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 shadow-sm text-indigo-300">
                <span className="text-indigo-400 font-bold text-[10px]">Lng:</span>
                <span className="font-semibold">{mouseCoords.lng.toFixed(7)}°</span>
              </div>
            </div>
          ) : (
            <div className="text-slate-400 font-sans italic text-[11px] select-none py-1 flex items-center gap-2">
              <MousePointer className="w-3.5 h-3.5 text-amber-500 animate-pulse shrink-0" />
              <span>
                {l(
                  "حرّك مؤشر الفأرة (الماوس) فوق الخريطة لعرض الإحداثيات الحية ولومبرت",
                  "Survolez l'image aérienne avec la souris pour afficher les coordonnées",
                  "Hover mouse over map to view live Lambert coordinates"
                )}
              </span>
            </div>
          )}
        </div>

        {/* Right Side: Active Projection reference */}
        <div className="flex items-center gap-2 text-[10.5px] text-slate-400 font-mono self-end md:self-auto bg-slate-900 border border-slate-800 px-3 py-1 rounded shadow-inner select-none transition-all hover:border-slate-700">
          <Globe className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-spin-slow" style={{ animationDuration: "10s" }} />
          <span className="font-bold text-slate-300">
            {l("نظام الإسقاط:", "Projection :", "Projection:")}
          </span>
          <span className="text-amber-300 font-semibold truncate max-w-[200px]" title={crsLabel}>
            {activeCRS} - {crsLabel}
          </span>
        </div>
      </div>

      {/* Modern Interactive CAD/GIS Symbol & Custom Text Editor Modal */}
      {editingSymbol && (
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div 
            className="bg-slate-900 border-2 border-slate-700/80 rounded-2xl p-5 shadow-2xl max-w-sm w-full text-slate-100 flex flex-col gap-4 animate-fade-in relative"
            dir={lang === "ar" ? "rtl" : "ltr"}
            style={{ animationDuration: "0.2s" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚙️</span>
                <h3 className="font-bold text-sm text-amber-400 tracking-wide">
                  {l("تعديل الرمز والكتابة الحرة", "Personnaliser le Symbole / Texte", "Customize Symbol / Custom Text")}
                </h3>
              </div>
              <button 
                onClick={() => setEditingSymbol(null)}
                className="text-slate-400 hover:text-white font-bold text-base transition bg-slate-800 hover:bg-slate-700 w-6 h-6 rounded-full flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Field 1: Custom Label / Text */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                {editingSymbol.type === "custom_text" 
                  ? l("نص الكتابة الحرة:", "Texte libre :", "Custom text:")
                  : l("مسمى توضيحي للرمز (اختياري):", "Étiquette du symbole (optionnel) :", "Symbol label (optional):")}
              </label>
              <input
                type="text"
                value={editingSymbol.label || ""}
                placeholder={editingSymbol.type === "custom_text" ? l("كتابة حرة", "Texte libre", "Custom text") : ""}
                onChange={(e) => {
                  const labelVal = e.target.value;
                  const updatedSym = { ...editingSymbol, label: labelVal };
                  setEditingSymbol(updatedSym);
                  if (onUpdateParcel) {
                    const updatedSymbols = (parcel.symbols || []).map((s) => {
                      const sId = s.id || `${s.x}_${s.y}_${s.type}`;
                      const symId = editingSymbol.id || `${editingSymbol.x}_${editingSymbol.y}_${editingSymbol.type}`;
                      return sId === symId ? updatedSym : s;
                    });
                    onUpdateParcel({
                      ...parcel,
                      symbols: updatedSymbols,
                    });
                  }
                }}
                className="bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500 w-full font-semibold transition"
              />
            </div>

            {/* Field 2: Size Adjuster Buttons */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                {editingSymbol.type === "custom_text"
                  ? (lang === "ar" ? "حجم خط الكتابة الحرة:" : "Taille de la police :")
                  : (lang === "ar" ? "حجم الرمز على الخريطة:" : "Taille du symbole :")}
              </label>
              <div className="flex items-center justify-between bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    const currentVal = editingSymbol.type === "custom_text" ? (editingSymbol.fontSize || 12) : (editingSymbol.size || 24);
                    const minLimit = editingSymbol.type === "custom_text" ? 8 : 10;
                    const newVal = Math.max(minLimit, currentVal - 2);
                    
                    let updatedSym: MapSymbol;
                    if (editingSymbol.type === "custom_text") {
                      updatedSym = { ...editingSymbol, fontSize: newVal };
                    } else {
                      updatedSym = { ...editingSymbol, size: newVal };
                    }
                    setEditingSymbol(updatedSym);
                    if (onUpdateParcel) {
                      const updatedSymbols = (parcel.symbols || []).map((s) => {
                        const sId = s.id || `${s.x}_${s.y}_${s.type}`;
                        const symId = editingSymbol.id || `${editingSymbol.x}_${editingSymbol.y}_${editingSymbol.type}`;
                        if (sId === symId) {
                          if (editingSymbol.type === "custom_text") {
                            return { ...s, fontSize: newVal };
                          } else {
                            return { ...s, size: newVal };
                          }
                        }
                        return s;
                      });
                      onUpdateParcel({
                        ...parcel,
                        symbols: updatedSymbols,
                      });
                    }
                  }}
                  className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 flex items-center justify-center font-bold text-sm transition active:scale-95 cursor-pointer shadow-sm"
                  title={l("تقليص الحجم", "Diminuer la taille", "Decrease size")}
                >
                  ▼
                </button>

                <div className="flex flex-col items-center justify-center">
                  <span className="text-xs font-mono font-black text-amber-400">
                    {editingSymbol.type === "custom_text" ? (editingSymbol.fontSize || 12) : (editingSymbol.size || 24)}
                  </span>
                  <span className="text-[8px] font-bold uppercase tracking-widest text-slate-500 font-sans">
                    Pixels
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const currentVal = editingSymbol.type === "custom_text" ? (editingSymbol.fontSize || 12) : (editingSymbol.size || 24);
                    const maxLimit = editingSymbol.type === "custom_text" ? 72 : 120;
                    const newVal = Math.min(maxLimit, currentVal + 2);
                    
                    let updatedSym: MapSymbol;
                    if (editingSymbol.type === "custom_text") {
                      updatedSym = { ...editingSymbol, fontSize: newVal };
                    } else {
                      updatedSym = { ...editingSymbol, size: newVal };
                    }
                    setEditingSymbol(updatedSym);
                    if (onUpdateParcel) {
                      const updatedSymbols = (parcel.symbols || []).map((s) => {
                        const sId = s.id || `${s.x}_${s.y}_${s.type}`;
                        const symId = editingSymbol.id || `${editingSymbol.x}_${editingSymbol.y}_${editingSymbol.type}`;
                        if (sId === symId) {
                          if (editingSymbol.type === "custom_text") {
                            return { ...s, fontSize: newVal };
                          } else {
                            return { ...s, size: newVal };
                          }
                        }
                        return s;
                      });
                      onUpdateParcel({
                        ...parcel,
                        symbols: updatedSymbols,
                      });
                    }
                  }}
                  className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 flex items-center justify-center font-bold text-sm transition active:scale-95 cursor-pointer shadow-sm"
                  title={l("زيادة الحجم", "Augmenter la taille", "Increase size")}
                >
                  ▲
                </button>
              </div>
            </div>

            {/* Field 3: Color swatches & Picker */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                {l("تخصيص لون الرمز أو النص:", "Couleur du symbole / texte :", "Customize Symbol / Text Color:")}
              </label>
              <div className="flex flex-wrap items-center gap-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                {[
                  "#1c1917", // Dark Charcoal / Black
                  "#2563eb", // Royal Blue
                  "#16a34a", // Forest Green
                  "#dc2626", // Crimson Red
                  "#d97706", // Amber Orange
                  "#9333ea", // Amethyst Purple
                  "#0d9488", // Teal
                  "#ffffff", // Clean White
                ].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      const updatedSym = { ...editingSymbol, color: c };
                      setEditingSymbol(updatedSym);
                      if (onUpdateParcel) {
                        const updatedSymbols = (parcel.symbols || []).map((s) => {
                          const sId = s.id || `${s.x}_${s.y}_${s.type}`;
                          const symId = editingSymbol.id || `${editingSymbol.x}_${editingSymbol.y}_${editingSymbol.type}`;
                          return sId === symId ? { ...s, color: c } : s;
                        });
                        onUpdateParcel({
                          ...parcel,
                          symbols: updatedSymbols,
                        });
                      }
                    }}
                    style={{ backgroundColor: c }}
                    className={`w-6 h-6 rounded-full border-2 transition hover:scale-110 active:scale-95 cursor-pointer ${
                      (editingSymbol.color || (
                        editingSymbol.type === "tree" ? "#16a34a" :
                        editingSymbol.type === "cemetery" ? "#1c1917" :
                        editingSymbol.type === "well" ? "#2563eb" :
                        editingSymbol.type === "building" ? "#dc2626" :
                        editingSymbol.type === "mosque" ? "#d97706" :
                        editingSymbol.type === "palm" ? "#059669" :
                        editingSymbol.type === "reed" ? "#854d0e" :
                        editingSymbol.type === "grass" ? "#16a34a" :
                        editingSymbol.type === "transformer" ? "#ea580c" :
                        editingSymbol.type === "olive" ? "#65a30d" :
                        editingSymbol.type === "geodetic" ? "#dc2626" :
                        editingSymbol.type === "spring" ? "#0284c7" :
                        "#1c1917"
                      )) === c ? "border-amber-400 scale-110 shadow-md shadow-amber-400/20" : "border-slate-800"
                    }`}
                  />
                ))}
                
                {/* Visual Separator */}
                <span className="w-[1px] h-5 bg-slate-800 mx-1"></span>

                {/* Color input picker */}
                <div className="relative flex items-center justify-center w-7 h-7 rounded-lg overflow-hidden border border-slate-700 bg-slate-800 hover:scale-105 active:scale-95 transition cursor-pointer">
                  <input
                    type="color"
                    value={editingSymbol.color || "#2563eb"}
                    onChange={(e) => {
                      const colVal = e.target.value;
                      const updatedSym = { ...editingSymbol, color: colVal };
                      setEditingSymbol(updatedSym);
                      if (onUpdateParcel) {
                        const updatedSymbols = (parcel.symbols || []).map((s) => {
                          const sId = s.id || `${s.x}_${s.y}_${s.type}`;
                          const symId = editingSymbol.id || `${editingSymbol.x}_${editingSymbol.y}_${editingSymbol.type}`;
                          return sId === symId ? { ...s, color: colVal } : s;
                        });
                        onUpdateParcel({
                          ...parcel,
                          symbols: updatedSymbols,
                        });
                      }
                    }}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  />
                  <span className="text-[10px] pointer-events-none">🎨</span>
                </div>
              </div>
            </div>

            {/* Field 4: Bulk apply settings */}
            {(() => {
              const getEditingSymbolTitle = () => {
                if (!editingSymbol) return "";
                const type = editingSymbol.type;
                if (lang === "ar") {
                  return type === "tree" ? "شجرة" :
                         type === "well" ? "بئر" :
                         type === "cemetery" ? "مقبرة" :
                         type === "building" ? "بناء" :
                         type === "mosque" ? "مسجد" :
                         type === "palm" ? "نخيل" :
                         type === "reed" ? "قصب" :
                         type === "grass" ? "أعشاب" :
                         type === "transformer" ? "محول كهربائي" :
                         type === "olive" ? "زيتون" :
                         type === "geodetic" ? "نقطة جيوديزية" :
                         type === "spring" ? "عين ماء" :
                         type === "custom_text" ? "نص مخصص" : "";
                } else if (lang === "en") {
                  return type === "tree" ? "Tree" :
                         type === "well" ? "Well" :
                         type === "cemetery" ? "Cemetery" :
                         type === "building" ? "Building" :
                         type === "mosque" ? "Mosque" :
                         type === "palm" ? "Palm" :
                         type === "reed" ? "Reed" :
                         type === "grass" ? "Grass" :
                         type === "transformer" ? "Transformer" :
                         type === "olive" ? "Olive tree" :
                         type === "geodetic" ? "Geodetic point" :
                         type === "spring" ? "Water spring" :
                         type === "custom_text" ? "Custom text" : "";
                } else {
                  return type === "tree" ? "Arbre" :
                         type === "well" ? "Puits" :
                         type === "cemetery" ? "Cimetière" :
                         type === "building" ? "Bâtiment" :
                         type === "mosque" ? "Mosquée" :
                         type === "palm" ? "Palmier" :
                         type === "reed" ? "Roseau" :
                         type === "grass" ? "Herbes" :
                         type === "transformer" ? "Transfo" :
                         type === "olive" ? "Olivier" :
                         type === "geodetic" ? "Pt Géodésique" :
                         type === "spring" ? "Source d'eau" :
                         type === "custom_text" ? "Texte personnalisé" : "";
                }
              };
              const editingSymbolTitle = getEditingSymbolTitle();
              const sameTypeCount = (parcel.symbols || []).filter(s => s.type === editingSymbol.type).length;

              if (sameTypeCount <= 1) return null;

              return (
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col gap-2 mt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {l("تعديل جماعي لنفس الرمز:", "Modification collective :", "Bulk edit for same symbol:")}
                    </span>
                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] px-1.5 py-0.5 rounded-full font-bold font-mono">
                      {l(`العدد الحالي: ${sameTypeCount}`, `Total : ${sameTypeCount}`, `Current total: ${sameTypeCount}`)}
                    </span>
                  </div>
                  <p className="text-[9.5px] text-slate-400 leading-normal font-sans">
                    {l(
                      "تطبيق اللون والحجم الحاليين على جميع الرموز من هذا النوع دفعة واحدة.",
                      "Appliquer la taille et la couleur actuelles à tous les symboles de ce type.",
                      "Apply current size and color to all symbols of this type at once."
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const targetType = editingSymbol.type;
                      const targetColor = editingSymbol.color;
                      const targetSize = editingSymbol.size;
                      const targetFontSize = editingSymbol.fontSize;
                      
                      if (onUpdateParcel) {
                        const updatedSymbols = (parcel.symbols || []).map((s) => {
                          if (s.type === targetType) {
                            return {
                              ...s,
                              color: targetColor,
                              size: targetSize,
                              fontSize: targetFontSize,
                            };
                          }
                          return s;
                        });
                        onUpdateParcel({
                          ...parcel,
                          symbols: updatedSymbols,
                        });
                      }
                    }}
                    className="w-full bg-slate-800 hover:bg-slate-700 hover:text-amber-400 border border-slate-700 text-slate-200 font-bold py-1.5 rounded-lg text-[10px] transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>👥</span>
                    <span>
                      {l(
                        `تحديث جميع رموز (${editingSymbolTitle})`,
                        `Mettre à jour tous les (${editingSymbolTitle})`,
                        `Update all (${editingSymbolTitle}) symbols`
                      )}
                    </span>
                  </button>
                </div>
              );
            })()}

            {/* Control Actions */}
            <div className="flex flex-col gap-2 mt-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setEditingSymbol(null)}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2.5 rounded-lg text-xs transition active:scale-98 shadow-md shadow-amber-500/10 flex items-center justify-center gap-1.5"
              >
                <span>✓</span>
                <span>{l("حفظ التغييرات وإغلاق", "Terminer et enregistrer", "Save changes and close")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Line Drawing Status & Controls Overlay */}
      {lineToPlace && (
        <div className="absolute bottom-4 right-4 z-20 bg-slate-900/95 border border-emerald-500/50 shadow-2xl rounded-2xl p-3 max-w-[280px] flex flex-col gap-2.5 text-slate-100 pointer-events-auto animate-fade-in">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[11px] font-bold tracking-wide text-slate-200">
              {l("وضع رسم خط/مسار جديد", "Mode tracé de ligne", "New line/path drawing mode")}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[10.5px]">
              <span className="text-slate-400">{l("نوع الخط:", "Type :", "Line type:")}</span>
              <span className="font-bold text-amber-400">
                {lineToPlace === "footpath" ? l("طريق رجلية", "Sentier", "Footpath") :
                 lineToPlace === "agri_road" ? l("طريق فلاحية", "Chemin agricole", "Agricultural Road") :
                 lineToPlace === "power_line" ? l("خط التيار الكهربائي", "Ligne électrique", "Power Line") :
                 lineToPlace === "water_pipe" ? l("خط أنبوب الماء", "Conduite d'eau", "Water Pipe") :
                 lineToPlace === "sewer_pipe" ? l("خط أنبوب تطهير السائل", "Réseau d'assainissement", "Sewer Pipe") : ""}
              </span>
            </div>
            <div className="flex justify-between text-[10.5px]">
              <span className="text-slate-400">{l("عدد النقاط الحالية:", "Points tracés :", "Current points count:")}</span>
              <span className="font-mono font-bold text-emerald-400">{drawingLineVertices.length}</span>
            </div>
            {linePlacementLabel && (
              <div className="flex justify-between text-[10.5px]">
                <span className="text-slate-400">{l("التسمية:", "Étiquette :", "Label:")}</span>
                <span className="font-bold text-slate-300 truncate max-w-[120px]">{linePlacementLabel}</span>
              </div>
            )}
          </div>

          <p className="text-[9.5px] text-slate-400 leading-normal border-t border-slate-800 pt-1.5">
            {l(
              "انقر على الخريطة لوضع النقاط بالتتابع لرسم الخط.",
              "Cliquez sur la carte pour tracer les points de la ligne.",
              "Click on the map to place points sequentially to draw the line."
            )}
          </p>

          <div className="flex flex-col gap-1.5 pt-1">
            <button
              type="button"
              disabled={drawingLineVertices.length < 2}
              onClick={() => {
                if (drawingLineVertices.length < 2) return;
                // Save the line!
                const newLine = {
                  id: "line_" + Date.now() + "_" + Math.floor(Math.random() * 100000),
                  type: lineToPlace,
                  vertices: [...drawingLineVertices],
                  label: linePlacementLabel || undefined,
                  spacing: customLineSpacing,
                  thickness: customLineThickness,
                  color: customLineColor || undefined,
                  labelColor: customLabelColor || undefined,
                  labelSize: customLabelSize || undefined,
                };
                if (onUpdateParcel) {
                  onUpdateParcel({
                    ...parcel,
                    linearFeatures: [...(parcel.linearFeatures || []), newLine],
                  });
                }
                setDrawingLineVertices([]);
                if (onPlacedLineDone) {
                  onPlacedLineDone();
                }
              }}
              className={`w-full py-1.5 px-2.5 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1.5 ${
                drawingLineVertices.length >= 2
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed"
              }`}
            >
              <span>💾</span>
              <span>{l("حفظ وتثبيت الخط", "Sauvegarder la ligne", "Save and fix line")}</span>
            </button>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={drawingLineVertices.length === 0}
                onClick={() => {
                  setDrawingLineVertices((prev) => prev.slice(0, -1));
                }}
                className={`py-1 px-1.5 rounded-lg text-[9.5px] font-bold transition flex items-center justify-center gap-1 ${
                  drawingLineVertices.length > 0
                    ? "bg-slate-800 hover:bg-slate-750 text-amber-400 cursor-pointer"
                    : "bg-slate-800/40 text-slate-600 cursor-not-allowed"
                }`}
              >
                <span>↩️</span>
                <span>{l("تراجع", "Retour", "Undo")}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDrawingLineVertices([]);
                  if (onPlacedLineDone) {
                    onPlacedLineDone();
                  }
                }}
                className="py-1 px-1.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 rounded-lg text-[9.5px] font-bold transition flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>❌</span>
                <span>{l("إلغاء", "Annuler", "Cancel")}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
