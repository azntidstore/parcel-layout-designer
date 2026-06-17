import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Parcel, Vertex, Segment, DocumentSettings } from "../types";
import {
  planeToLatLng,
  latLngToPlane,
  getSegmentMidpoint,
  getSegmentAngle,
  getOutsidePoint,
  calculateCentroid,
} from "../utils/gisUtils";
import { SupportedCRS } from "../utils/projectionManager";
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
} from "lucide-react";

interface ParcelMapProps {
  parcel: Parcel;
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
}

export const ParcelMap: React.FC<ParcelMapProps> = ({
  parcel,
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
}) => {
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

  const layersRef = useRef<{
    tileLayer: L.TileLayer | null;
    polygon: L.Polygon | null;
    vertexMarkers: L.Marker[];
    labelMarkers: L.Marker[];
    gridLines: L.Polyline[];
  }>({
    tileLayer: null,
    polygon: null,
    vertexMarkers: [],
    labelMarkers: [],
    gridLines: [],
  });

  const activeCRS = (settings.projectionSystem && settings.projectionSystem.startsWith("EPSG:")
    ? settings.projectionSystem
    : "EPSG:26191") as SupportedCRS;

  // Re-orient view to center on parcel
  const handleRecenter = () => {
    if (!mapRef.current || parcel.vertices.length === 0) return;
    const latLngs = parcel.vertices
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
    };
  }, []);

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

  // Handle map drawing click additions
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
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
  }, [isDrawingMode, onAddVertex, activeCRS, parcel.vertices]);

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

        const dx = pt2.x - pt1.x;
        const dy = pt2.y - pt1.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) continue;

        let t = ((mousePt.x - pt1.x) * dx + (mousePt.y - pt1.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));

        const projX = pt1.x + t * dx;
        const projY = pt1.y + t * dy;

        const dist = Math.hypot(mousePt.x - projX, mousePt.y - projY);

        if (dist < minDist) {
          minDist = dist;
          closestLatLng = map.containerPointToLatLng(L.point(projX, projY));
          closestInsertIndex = i + 1; // Insert right after the first vertex of the segment
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
            L.DomEvent.stopPropagation(clickEvent);
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
            L.DomEvent.stopPropagation(clickEvent);
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

    layersRef.current.vertexMarkers = [];
    layersRef.current.labelMarkers = [];
    layersRef.current.gridLines = [];

    // 2. Render backing technical grid lines if preset is "CAD Mode"
    if (mapPreset === "cad") {
      const latLngsGrid = parcel.vertices
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

    const isSatellite = mapPreset === "satellite" || mapPreset === "google_sat";
    const isCad = mapPreset === "cad";

    const poly = L.polygon(latLngs, {
      color: isSatellite ? "#f59e0b" : "#ef4444", // High-contrast amber for satellite layers, Red for CAD/Map
      weight: 3.5,
      fillColor: isCad ? "#fef2f2" : isSatellite ? "#f59e0b" : "#3b82f6",
      fillOpacity: isCad ? 0.85 : isSatellite ? 0.12 : 0.2,
    }).addTo(map);
    layersRef.current.polygon = poly;

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
              style="transform: translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)); z-index: 100; text-shadow: -1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, 0px 2px 3px rgba(0,0,0,0.95);"
              class="absolute top-1/2 left-1/2 text-[10.5px] font-black font-mono text-yellow-300 whitespace-nowrap pointer-events-none tracking-wide"
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
        L.DomEvent.stopPropagation(e);
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
        const outsidePt = getOutsidePoint(centroidPlane, seg.startVertex, seg.endVertex, 6);
        const latlngLabel = planeToLatLng(outsidePt.x, outsidePt.y, activeCRS);
        const angle = getSegmentAngle(seg.startVertex, seg.endVertex);
        const isSelected = selectedSegmentId === seg.id;

        const labelHtml = `
          <div class="flex flex-col items-center justify-center cursor-pointer group transition-transform ${
            isSelected ? "scale-110" : ""
          }" style="transform: rotate(${-angle}deg)">
            ${
              showLengths
                ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold shadow-sm select-none border whitespace-nowrap mb-0.5 ${
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
                ? `<span class="px-2 py-0.5 rounded text-[9px] font-medium shadow-sm select-none max-w-[100px] truncate block text-center ${
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
          L.DomEvent.stopPropagation(e);
          onSegmentSelect(seg.id);
        });

        layersRef.current.labelMarkers.push(labelMarker);
      });
    }

    // Auto fit boundaries on initial load or when parcel changes so they synchronize perfectly
    const lastParcelId = (map as any)._lastParcelId;
    if (lastParcelId !== parcel.id) {
      map.invalidateSize(); // Forces containment refresh to prevent faulty sizes on layout switches
      const latLngsList = parcel.vertices
        .map((v) => planeToLatLng(v.x, v.y, activeCRS))
        .filter((ll) => Array.isArray(ll) && ll.length === 2 && typeof ll[0] === 'number' && !isNaN(ll[0]) && isFinite(ll[0]) && typeof ll[1] === 'number' && !isNaN(ll[1]) && isFinite(ll[1]));
      if (latLngsList.length > 0) {
        const boundsList = L.latLngBounds(latLngsList);
        if (boundsList.isValid()) {
          map.flyToBounds(boundsList, { padding: [50, 50], duration: 0.8 });
          (map as any)._lastParcelId = parcel.id;
        }
      }
    }
  }, [parcel, settings, selectedVertexId, selectedSegmentId, mapPreset, activeCRS, isDeleteMode]);

  return (
    <div className="relative w-full h-full bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-inner group">
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
      <div ref={mapContainerRef} className="w-full h-full z-10" />

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
            title="Centrer sur la parcelle (تركيز العرض على العقار)"
          >
            <Maximize className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>تركيز</span>
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
            title="وضع رسم ورسم إضافي حر"
          >
            {isDrawingMode ? (
              <MousePointer className="w-3.5 h-3.5 text-white animate-spin" />
            ) : (
              <Edit2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>رسم حر</span>
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
            title="تفعيل وضع مسح وحذف النقط"
          >
            <Trash2 className={`w-3.5 h-3.5 ${isDeleteMode ? "text-white" : "text-rose-400"}`} />
            <span>مسح النقط</span>
          </button>
        </div>

        {/* Satellite & Streetmap Base Layer select panel */}
        <div className="bg-slate-900/95 border border-slate-700/80 rounded-xl p-1.5 shadow-2xl flex flex-col gap-1 pointer-events-auto">
          <span className="text-[7.5px] font-mono text-slate-400 font-bold tracking-wider px-1 mb-1 block">
            FONDS DE CARTE
          </span>

          <button
            onClick={() => setMapPreset("cad")}
            className={`px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wider transition flex items-center gap-1.5 focus:outline-none ${
              mapPreset === "cad"
                ? "bg-amber-600 text-white font-black"
                : "text-slate-300 hover:bg-slate-800"
            }`}
            title="Plan Cadastral (شبكة كاد)"
          >
            <Grid className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>شبكة CAD</span>
          </button>

          <button
            onClick={() => setMapPreset("satellite")}
            className={`px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wider transition flex items-center gap-1.5 focus:outline-none ${
              mapPreset === "satellite"
                ? "bg-amber-600 text-white font-black"
                : "text-slate-300 hover:bg-slate-800"
            }`}
            title="Satellite ESRI (صورة جوية إيسري)"
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
            title="Google Satellite Hybrid (صور خرائط جوجل مجسمة مدمجة)"
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
            title="OpenStreetMap Standard (خريطة شوارع)"
          >
            <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>خريطة OSM</span>
          </button>
        </div>
      </div>

      {/* Floating notifications for various states */}
      {isDrawingMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-amber-500 text-white border border-amber-400 shadow-xl px-4 py-2 rounded-full font-bold text-[11px] flex items-center gap-2 animate-bounce">
          <Edit2 className="w-3.5 h-3.5" />
          <span>وضع الرسم نشط: انقر في أي مكان على الخريطة لإضافة نقاط حدودية</span>
          <button
            onClick={() => setDrawingMode(false)}
            className="ml-2 bg-amber-700 hover:bg-amber-800 text-white font-black px-2 py-0.5 rounded text-[10px]"
          >
            إنهاء
          </button>
        </div>
      )}

      {isDeleteMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-rose-600 text-white border border-rose-500 shadow-xl px-4 py-2 rounded-full font-bold text-[11px] flex items-center gap-2 animate-bounce">
          <Trash2 className="w-3.5 h-3.5 text-white" />
          <span>وضع الحذف نشط: انقر مباشرة فوق أي رأس (Borne) على الخريطة لإزالته نهائياً</span>
          <button
            onClick={() => setDeleteMode(false)}
            className="ml-2 bg-rose-800 hover:bg-rose-900 text-white font-black px-2 py-0.5 rounded text-[10px]"
          >
            إلغاء المعاينة
          </button>
        </div>
      )}

      {/* Bottom-Right indicator showing the currently active view preset details */}
      <div className="absolute bottom-4 right-4 z-20 pointer-events-none bg-slate-900/85 border border-slate-700/50 backdrop-blur-md px-3 py-1.5 rounded-lg text-[9px] text-slate-300 font-bold select-none uppercase tracking-widest font-mono flex items-center gap-2">
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
    </div>
  );
};
