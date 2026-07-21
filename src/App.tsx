/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from "react";
import { Vertex, Segment, Parcel, DocumentSettings } from "./types";
import { sampleParcels } from "./data/sampleParcels";
import { ParcelMap } from "./components/ParcelMap";
import { PrintSheetLayout } from "./components/PrintSheetLayout";
import { AboutPage } from "./components/AboutPage";
import {
  parseDXF,
  parseGeoJSON,
  convertGeoJSONToParsedFeatures,
  ParsedFeature,
  parseCSV,
  parseExcel,
  parseGeoPackage,
  parseShapefileZip,
  parseShapefilePair,
} from "./utils/fileParsers";
import { translations, getLocalizedParcelName } from "./utils/translations";
import {
  calculatePolygonArea,
  calculatePolygonPerimeter,
  buildSegmentsAndStats,
  formatAreaHac,
  latLngToPlane,
} from "./utils/gisUtils";
import {
  SupportedCRS,
  transformCRS,
  CRS_DETAILS,
  detectCRSFromPrj,
  detectMoroccanLambertZone,
} from "./utils/projectionManager";
import {
  Compass,
  Layers,
  Settings,
  Table,
  PlusCircle,
  Trash2,
  FileDown,
  Upload,
  RefreshCw,
  FolderOpen,
  MapPin,
  CheckCircle,
  HelpCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Milestone,
} from "lucide-react";

export default function App() {
  // Global Workspace States
  const [parcels, setParcels] = useState<Parcel[]>(() => {
    try {
      const saved = localStorage.getItem("cadastral_parcels");
      const loaded = saved ? JSON.parse(saved) : sampleParcels;
      
      const defaultParcel = sampleParcels.find(p => p.id === "parcelle-par-defaut");
      if (Array.isArray(loaded)) {
        const index = loaded.findIndex((p: any) => p.id === "parcelle-par-defaut");
        if (index !== -1) {
          // Force update the default parcel so the new neighbor names and coordinates are applied immediately
          if (defaultParcel) {
            loaded[index] = defaultParcel;
          }
        } else {
          if (defaultParcel) {
            loaded.unshift(defaultParcel);
          }
        }
      }
      return loaded;
    } catch (_) {
      return sampleParcels;
    }
  });

  const [selectedParcelId, setSelectedParcelId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("cadastral_selected_parcel_id");
      // Change the default start-up selected parcel to our new default parcel
      if (!saved || saved === "titre-almarj") {
        return "parcelle-par-defaut";
      }
      return saved;
    } catch (_) {
      return "parcelle-par-defaut";
    }
  });

  const [selectedParcelIds, setSelectedParcelIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("cadastral_selected_parcel_ids");
      const parsed = saved ? JSON.parse(saved) : [];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
      const initialActive = localStorage.getItem("cadastral_selected_parcel_id") || "parcelle-par-defaut";
      return [initialActive];
    } catch (_) {
      return ["parcelle-par-defaut"];
    }
  });

  const [viewMode, setViewMode] = useState<"map_editor" | "print_preview" | "about">("map_editor");
  const [printLayoutType, setPrintLayoutType] = useState<"type1" | "type2">("type1");

  const [lang, setLang] = useState<"ar" | "fr" | "en">(() => {
    try {
      const saved = localStorage.getItem("cadastral_language");
      return (saved as "ar" | "fr" | "en") || "ar";
    } catch (_) {
      return "ar";
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem("cadastral_language", lang);
    } catch (_) {}
  }, [lang]);

  const t = translations[lang];

  const [selectedVertexId, setSelectedVertexId] = useState<number | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null);
  const [isDrawingMode, setDrawingMode] = useState<boolean>(false);
  const [showParcelManagement, setShowParcelManagement] = useState<boolean>(false);

  // Non-blocking state-based confirmation states for deletes (to work reliably inside sandboxed iframes)
  const [pendingDeleteParcelId, setPendingDeleteParcelId] = useState<string | null>(null);
  const [pendingDeleteSymbolIndex, setPendingDeleteSymbolIndex] = useState<number | null>(null);
  const [pendingDeleteAllSymbols, setPendingDeleteAllSymbols] = useState<boolean>(false);

  // Custom topological symbols & text placement state
  const [symbolToPlace, setSymbolToPlace] = useState<"cemetery" | "tree" | "well" | "building" | "mosque" | "custom_text" | "palm" | "reed" | "grass" | "transformer" | "olive" | "geodetic" | "spring" | null>(null);
  const [symbolPlacementLabel, setSymbolPlacementLabel] = useState<string>("");
  const [localSymbolLabel, setLocalSymbolLabel] = useState<string>("");
  const [enableSymbolLabel, setEnableSymbolLabel] = useState<boolean>(true);

  // Custom linear features placement state
  const [lineToPlace, setLineToPlace] = useState<"footpath" | "agri_road" | "power_line" | "water_pipe" | "sewer_pipe" | null>(null);
  const [linePlacementLabel, setLinePlacementLabel] = useState<string>("");
  const [localLineLabel, setLocalLineLabel] = useState<string>("");
  const [enableLineLabel, setEnableLineLabel] = useState<boolean>(true);
  const [customLineSpacing, setCustomLineSpacing] = useState<number>(4);
  const [customLineThickness, setCustomLineThickness] = useState<number>(2);
  const [customLineColor, setCustomLineColor] = useState<string>("");
  const [customLabelColor, setCustomLabelColor] = useState<string>("");
  const [customLabelSize, setCustomLabelSize] = useState<number>(9.5);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);

  // States for dynamic unified file imports (Source coordinates + Column naming + Parcel list)
  const [importNotification, setImportNotification] = useState<{
    fileName: string;
    count: number;
    show: boolean;
    parcelIds: string[];
    rawFeatures: ParsedFeature[];
    sourceCRS: SupportedCRS;
    format: string;
  } | null>(null);

  // Dynamic tabular attribute naming mapping state
  const [selectedAttributeKey, setSelectedAttributeKey] = useState<string>("");

  // Search query for filtering large list of imported parcels
  const [importSearchQuery, setImportSearchQuery] = useState<string>("");

  // Search query for filtering placed symbols list in the active parcel
  const [symbolSearchQuery, setSymbolSearchQuery] = useState<string>("");

  // Clean reset of selected columns when switcher triggers
  React.useEffect(() => {
    setSelectedAttributeKey("");
  }, [selectedParcelId]);

  // Moroccan Cadastre Template Settings
  const [settings, setSettings] = useState<DocumentSettings>(() => {
    const defaultSettings: DocumentSettings = {
      ministryFr: "Royaume du Maroc\nMinistère des Habous et des Affaires Islamiques\nService de Conservations des Biens",
      ministryAr: "المملكة المغربية\nوزارة الأوقاف والشؤون الإسلامية\nمصلحة المحافظة على الأملاك",
      planTitle: "PLAN PARCELLAIRE",
      author: "",
      service: "Service de Conservation Foncière (Casablanca)",
      date: new Date().toLocaleDateString("fr-FR"),
      logoUrl: "", // Default vector badge renders if empty
      gridInterval: 50,
      northArrowSize: 12,
      pageFormat: "A4",
      mapLabels: "Longueurs + Voisins",
      projectionSystem: "EPSG:26191",
      scaleMode: "auto",
      customScale: 500,
      dossierNumber: "2026/...",
      vertexPrefixType: "P",
      customPrefix: "",
      vertexFontSize: 8.5,
      labelFontSize: 7.0,
      labelOffset: 7.0,
      legendEnabled: true,
      legendTitleAr: "مفتاح الخريطة",
      legendTitleFr: "LÉGENDE",
      legendPosition: "bottom-left",
      legendShowBoundary: true,
      legendBoundaryLabelAr: "حدود القطعة",
      legendBoundaryLabelFr: "Limite de parcelle",
      legendShowSymbols: true,
      legendShowLines: true,
      legendItemLabels: {},
      legendItemVisibility: {},
    };
    try {
      const saved = localStorage.getItem("cadastral_settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        const savedParcelId = localStorage.getItem("cadastral_selected_parcel_id");
        if (!savedParcelId || savedParcelId === "parcelle-par-defaut") {
          parsed.projectionSystem = "EPSG:26191";
        }
        if (!parsed.dossierNumber) {
          parsed.dossierNumber = "2026/...";
        }
        if (!parsed.vertexPrefixType) {
          parsed.vertexPrefixType = "P";
        }
        if (parsed.customPrefix === undefined) {
          parsed.customPrefix = "";
        }
        if (parsed.vertexFontSize === undefined) {
          parsed.vertexFontSize = 8.5;
        }
        if (parsed.labelFontSize === undefined) {
          parsed.labelFontSize = 7.0;
        }
        if (parsed.labelOffset === undefined) {
          parsed.labelOffset = 7.0;
        }
        if (parsed.legendEnabled === undefined) {
          parsed.legendEnabled = true;
        }
        if (parsed.legendTitleAr === undefined) {
          parsed.legendTitleAr = "مفتاح الخريطة";
        }
        if (parsed.legendTitleFr === undefined) {
          parsed.legendTitleFr = "LÉGENDE";
        }
        if (parsed.legendPosition === undefined) {
          parsed.legendPosition = "bottom-left";
        }
        if (parsed.legendShowBoundary === undefined) {
          parsed.legendShowBoundary = true;
        }
        if (parsed.legendBoundaryLabelAr === undefined) {
          parsed.legendBoundaryLabelAr = "حدود القطعة";
        }
        if (parsed.legendBoundaryLabelFr === undefined) {
          parsed.legendBoundaryLabelFr = "Limite de parcelle";
        }
        if (parsed.legendShowSymbols === undefined) {
          parsed.legendShowSymbols = true;
        }
        if (parsed.legendShowLines === undefined) {
          parsed.legendShowLines = true;
        }
        if (parsed.legendItemLabels === undefined) {
          parsed.legendItemLabels = {};
        }
        if (parsed.legendItemVisibility === undefined) {
          parsed.legendItemVisibility = {};
        }
        return parsed;
      }
      return defaultSettings;
    } catch (_) {
      return defaultSettings;
    }
  });

  const getFormattedLabel = (idx: number, type = settings.vertexPrefixType, custom = settings.customPrefix) => {
    const pType = type || "P";
    if (pType === "None") return `${idx + 1}`;
    if (pType === "B") return `B${idx + 1}`;
    if (pType === "Custom") return `${(custom || "").trim()}${idx + 1}`;
    return `P${idx + 1}`;
  };

  const updateVertexLabels = (
    prefixType: "P" | "B" | "Custom" | "None",
    customPrefixStr: string
  ) => {
    setParcels((prevParcels) =>
      prevParcels.map((p) => {
        const updatedVertices = p.vertices.map((v, idx) => ({
          ...v,
          label: getFormattedLabel(idx, prefixType, customPrefixStr),
        }));

        const existingNeighbors: Record<number, string> = {};
        p.segments.forEach((s) => {
          existingNeighbors[s.id] = s.neighbor;
        });

        return {
          ...p,
          vertices: updatedVertices,
          segments: buildSegmentsAndStats(updatedVertices, existingNeighbors),
        };
      })
    );
  };

  // Persist State to LocalStorage for cross-tab multi-view synching
  React.useEffect(() => {
    try {
      localStorage.setItem("cadastral_parcels", JSON.stringify(parcels));
    } catch (_) {}
  }, [parcels]);

  React.useEffect(() => {
    try {
      localStorage.setItem("cadastral_selected_parcel_id", selectedParcelId);
    } catch (_) {}
  }, [selectedParcelId]);

  React.useEffect(() => {
    try {
      localStorage.setItem("cadastral_settings", JSON.stringify(settings));
    } catch (_) {}
  }, [settings]);

  const handleWorkspaceCRSChange = (newCRS: SupportedCRS) => {
    const oldCRS = (settings.projectionSystem && settings.projectionSystem.startsWith("EPSG:")
      ? settings.projectionSystem
      : "EPSG:26191") as SupportedCRS;
    
    if (oldCRS === newCRS) return;

    // Reproject coordinates of all existing parcels in memory!
    setParcels((prevParcels) =>
      prevParcels.map((p) => {
        const reprojectedVertices = p.vertices.map((v) => {
          const transformed = transformCRS({ x: v.x, y: v.y }, oldCRS, newCRS);
          return {
            ...v,
            x: parseFloat(transformed.x.toFixed(2)),
            y: parseFloat(transformed.y.toFixed(2)),
          };
        });

        const existingNeighbors: Record<number, string> = {};
        p.segments.forEach((s) => {
          existingNeighbors[s.id] = s.neighbor;
        });

        return {
          ...p,
          vertices: reprojectedVertices,
          segments: buildSegmentsAndStats(reprojectedVertices, existingNeighbors),
          area: calculatePolygonArea(reprojectedVertices),
          perimeter: calculatePolygonPerimeter(reprojectedVertices),
        };
      })
    );

    setSettings((prev) => ({
      ...prev,
      projectionSystem: newCRS,
    }));
  };

  const handleUpdateImportCRS = (newSourceCRS: SupportedCRS) => {
    if (!importNotification) return;

    const oldCRS = (settings.projectionSystem && settings.projectionSystem.startsWith("EPSG:")
      ? settings.projectionSystem
      : "EPSG:26191") as SupportedCRS;

    // Update coordinates of all corresponding parcels in place!
    setParcels((prevParcels) => {
      return prevParcels.map((p) => {
        const idxInImport = importNotification.parcelIds.indexOf(p.id);
        if (idxInImport === -1) {
          // This is NOT part of the current import; we must transform its coordinates to keep it aligned with the new workspace CRS
          const reprojectedVertices = p.vertices.map((v) => {
            const transformed = transformCRS({ x: v.x, y: v.y }, oldCRS, newSourceCRS);
            return {
              id: v.id,
              label: v.label,
              x: parseFloat(transformed.x.toFixed(2)),
              y: parseFloat(transformed.y.toFixed(2)),
            };
          });
          return {
            ...p,
            vertices: reprojectedVertices,
            segments: buildSegmentsAndStats(reprojectedVertices),
            area: calculatePolygonArea(reprojectedVertices),
            perimeter: calculatePolygonPerimeter(reprojectedVertices),
          };
        }

        const rawFeat = importNotification.rawFeatures[idxInImport];
        if (!rawFeat) return p;

        // Project coordinates correctly based on whether raw features are using geographic degrees or raw file meters
        const projectedVerts: Vertex[] = rawFeat.vertices.map((v, vIdx) => {
          const rawSystem = rawFeat.isGeographic ? "EPSG:4326" : newSourceCRS;
          const transformed = transformCRS({ x: v.x, y: v.y }, rawSystem, newSourceCRS);
          return {
            id: vIdx + 1,
            label: getFormattedLabel(vIdx),
            x: parseFloat(transformed.x.toFixed(2)),
            y: parseFloat(transformed.y.toFixed(2)),
          };
        });

        const existingNeighbors: Record<number, string> = {};
        p.segments.forEach((s) => {
          existingNeighbors[s.id] = s.neighbor;
        });

        return {
          ...p,
          vertices: projectedVerts,
          segments: buildSegmentsAndStats(projectedVerts, existingNeighbors),
          area: calculatePolygonArea(projectedVerts),
          perimeter: calculatePolygonPerimeter(projectedVerts),
        };
      });
    });

    // Keep workspace projection system synchronized with the imported file's SRS
    setSettings((prev) => ({
      ...prev,
      projectionSystem: newSourceCRS,
    }));

    // Update local state in importNotification
    setImportNotification((prev) => prev ? { ...prev, sourceCRS: newSourceCRS } : null);
  };

  const handleUpdateNamingKey = (key: string) => {
    setSelectedAttributeKey(key);
    if (!importNotification) return;

    setParcels((prev) =>
      prev.map((p) => {
        const idxInImport = importNotification.parcelIds.indexOf(p.id);
        if (idxInImport === -1) return p;

        const rawFeat = importNotification.rawFeatures[idxInImport];
        if (rawFeat && rawFeat.attributes && rawFeat.attributes[key]) {
          const val = String(rawFeat.attributes[key]).trim();
          if (val) {
            return {
              ...p,
              name: val,
            };
          }
        }
        return p;
      })
    );
  };

  // Reference hooks & Form parameters
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newVertices, setNewVertices] = useState<Record<string, { x: string; y: string }>>({});

  // Retrieve active parcel details
  const activeParcel = parcels.find((p) => p.id === selectedParcelId) || parcels[0];

  const additionalParcels = parcels.filter(
    (p) => selectedParcelIds.includes(p.id) && p.id !== selectedParcelId
  );

  const toggleParcelMultiSelect = (pId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedParcelIds((prev) => {
      let updated: string[];
      if (prev.includes(pId)) {
        if (pId === selectedParcelId) {
          const remaining = prev.filter((id) => id !== pId);
          if (remaining.length > 0) {
            setSelectedParcelId(remaining[0]);
            updated = remaining;
          } else {
            return prev;
          }
        } else {
          updated = prev.filter((id) => id !== pId);
        }
      } else {
        updated = [...prev, pId];
      }
      return updated;
    });
  };

  const selectPrimaryParcel = (pId: string) => {
    setSelectedParcelId(pId);
    setSelectedParcelIds([pId]);
  };

  React.useEffect(() => {
    try {
      localStorage.setItem("cadastral_selected_parcel_ids", JSON.stringify(selectedParcelIds));
    } catch (_) {}
  }, [selectedParcelIds]);

  // Sync state helpers when coordinates or vertices change
  const handleVertexUpdate = (id: number, updatedX: number, updatedY: number, targetParcelId: string = selectedParcelId) => {
    setParcels((prevParcels) =>
      prevParcels.map((p) => {
        if (p.id !== targetParcelId) return p;

        // Map and update target vertex point coordinates
        const updatedVertices = p.vertices.map((v) =>
          v.id === id ? { ...v, x: parseFloat(updatedX.toFixed(2)), y: parseFloat(updatedY.toFixed(2)) } : v
        );

        // Retrieve existing neighbor names to persist them across rebuilds
        const existingNeighbors: Record<number, string> = {};
        p.segments.forEach((s) => {
          existingNeighbors[s.id] = s.neighbor;
        });

        const newSegments = buildSegmentsAndStats(updatedVertices, existingNeighbors);
        const newArea = calculatePolygonArea(updatedVertices);
        const newPerimeter = calculatePolygonPerimeter(updatedVertices);

        return {
          ...p,
          vertices: updatedVertices,
          segments: newSegments,
          area: newArea,
          perimeter: newPerimeter,
        };
      })
    );
  };

  // Persists edited neighbor credentials immediately into App state
  const handleNeighborUpdate = (segmentId: number, nameText: string, targetParcelId: string = selectedParcelId) => {
    setParcels((prevParcels) =>
      prevParcels.map((p) => {
        if (p.id !== targetParcelId) return p;
        const updatedSegments = p.segments.map((s) =>
          s.id === segmentId ? { ...s, neighbor: nameText } : s
        );
        return {
          ...p,
          segments: updatedSegments,
        };
      })
    );
  };

  // Add vertex logic utilized by both Form and Draggable events
  const handleAddVertex = (x: number, y: number, insertAtIndex?: number, targetParcelId: string = selectedParcelId) => {
    setParcels((prevParcels) =>
      prevParcels.map((p) => {
        if (p.id !== targetParcelId) return p;

        const nextId = p.vertices.length > 0 ? Math.max(...p.vertices.map((v) => v.id)) + 1 : 1;
        const newVert: Vertex = {
          id: nextId,
          label: getFormattedLabel(p.vertices.length),
          x: parseFloat(x.toFixed(2)),
          y: parseFloat(y.toFixed(2)),
        };

        const updatedVertices = [...p.vertices];
        if (typeof insertAtIndex === "number") {
          updatedVertices.splice(insertAtIndex, 0, newVert);
        } else {
          updatedVertices.push(newVert);
        }

        // Re-index all vertices so names remain sequential (P1, P2...) if points are inserted/deleted
        const reindexedVertices = updatedVertices.map((v, idx) => ({
          ...v,
          id: idx + 1,
          label: getFormattedLabel(idx),
        }));

        const existingNeighbors: Record<number, string> = {};
        p.segments.forEach((s) => {
          existingNeighbors[s.id] = s.neighbor;
        });

        return {
          ...p,
          vertices: reindexedVertices,
          segments: buildSegmentsAndStats(reindexedVertices, existingNeighbors),
          area: calculatePolygonArea(reindexedVertices),
          perimeter: calculatePolygonPerimeter(reindexedVertices),
        };
      })
    );
  };

  // Deletes target vertex and triggers re-calculations
  const handleDeleteVertex = (vertexId: number, targetParcelId: string = selectedParcelId) => {
    const targetParcel = parcels.find(p => p.id === targetParcelId) || activeParcel;
    if (targetParcel.vertices.length <= 3) {
      alert("Une parcelle doit comporter au moins 3 points d'angle pour délimiter une surface !");
      return;
    }

    setParcels((prevParcels) =>
      prevParcels.map((p) => {
        if (p.id !== targetParcelId) return p;

        // Skip target point and re-index vertex labels for consistency
        const filteredVertices = p.vertices
          .filter((v) => v.id !== vertexId)
          .map((v, idx) => ({
            ...v,
            label: getFormattedLabel(idx),
            id: idx + 1,
          }));

        // Adjust layout segment mapping
        const existingNeighbors: Record<number, string> = {};
        p.segments.forEach((s) => {
          existingNeighbors[s.id] = s.neighbor;
        });

        return {
          ...p,
          vertices: filteredVertices,
          segments: buildSegmentsAndStats(filteredVertices, existingNeighbors),
          area: calculatePolygonArea(filteredVertices),
          perimeter: calculatePolygonPerimeter(filteredVertices),
        };
      })
    );
    setSelectedVertexId(null);
  };

  // Universal importer for multiple formats: GeoJSON, DXF, KML, CSV, and EXCEL
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const files: File[] = Array.from(fileList);

    // SECURITY: Input validation & Size checking (Max 15MB per file to prevent Browser crash / DoS)
    const MAX_FILE_SIZE_MB = 15;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
    const SUPPORTED_EXTENSIONS = [
      ".geojson", ".json", ".csv", ".xls", ".xlsx", ".dxf", ".gpkg", ".zip", ".shp", ".dbf", ".gpx", ".kml"
    ];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        alert(
          lang === "ar"
            ? `⚠️ حجم الملف "${file.name}" كبير جداً. الحد الأقصى المسموح به هو ${MAX_FILE_SIZE_MB} ميغابايت.`
            : `⚠️ Le fichier "${file.name}" est trop volumineux. La limite maximale autorisée est de ${MAX_FILE_SIZE_MB} Mo.`
        );
        return;
      }

      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        alert(
          lang === "ar"
            ? `⚠️ صيغة الملف غير مدعومة لـ "${file.name}".`
            : `⚠️ Le format du fichier "${file.name}" n'est pas pris en charge.`
        );
        return;
      }
    }

    const processFeatures = (
      features: ParsedFeature[],
      formatName: string,
      originFileName: string,
      explicitCRS?: SupportedCRS
    ) => {
      if (features.length === 0) {
        alert("Aucune entité géométrique fermée (Polygone ou Polyligne) n'a été détectée dans ce fichier.");
        return;
      }

      const isGeographic = features.some((f) => f.isGeographic);
      let finalSourceCRS: SupportedCRS = "EPSG:26191";

      if (explicitCRS) {
        finalSourceCRS = explicitCRS;
      } else if (isGeographic) {
        finalSourceCRS = "EPSG:4326";
      } else {
        // Run smart geographic zone auto-detection based on the coordinate center point (centroid)
        let sumX = 0, sumY = 0, count = 0;
        features.forEach((feat) => {
          feat.vertices.forEach((v) => {
            sumX += v.x;
            sumY += v.y;
            count++;
          });
        });
        if (count > 0) {
          const avgX = sumX / count;
          const avgY = sumY / count;
          finalSourceCRS = detectMoroccanLambertZone(avgX, avgY);
        }
      }

      const oldCRS = (settings.projectionSystem && settings.projectionSystem.startsWith("EPSG:")
        ? settings.projectionSystem
        : "EPSG:26191") as SupportedCRS;

      if (oldCRS !== finalSourceCRS) {
        // Reproject any existing parcels to the new system so they stay in spatial alignment under the new workspace CRS
        setParcels((prevParcels) =>
          prevParcels.map((p) => {
            const reprojectedVertices = p.vertices.map((v) => {
              const transformed = transformCRS({ x: v.x, y: v.y }, oldCRS, finalSourceCRS);
              return {
                id: v.id,
                label: v.label,
                x: parseFloat(transformed.x.toFixed(2)),
                y: parseFloat(transformed.y.toFixed(2)),
              };
            });
            return {
              ...p,
              vertices: reprojectedVertices,
              segments: buildSegmentsAndStats(reprojectedVertices),
              area: calculatePolygonArea(reprojectedVertices),
              perimeter: calculatePolygonPerimeter(reprojectedVertices),
            };
          })
        );

        setSettings((prev) => ({
          ...prev,
          projectionSystem: finalSourceCRS,
        }));
      }

      const newParcels: Parcel[] = features.map((feat, idx) => {
        const id = `uploaded-${Date.now()}-${idx}`;
        const projectedVerts: Vertex[] = feat.vertices.map((v, vIdx) => {
          // Project coordinates correctly based on whether raw features are using WGS84 degrees or are in native metres
          const rawSystem = feat.isGeographic ? "EPSG:4326" : finalSourceCRS;
          const transformed = transformCRS({ x: v.x, y: v.y }, rawSystem, finalSourceCRS);
          return {
            id: vIdx + 1,
            label: getFormattedLabel(vIdx),
            x: parseFloat(transformed.x.toFixed(2)),
            y: parseFloat(transformed.y.toFixed(2)),
          };
        });

        const name = feat.name || `قطعة أرضية ${idx + 1}`;

        return {
          id,
          name,
          vertices: projectedVerts,
          segments: buildSegmentsAndStats(projectedVerts),
          area: calculatePolygonArea(projectedVerts),
          perimeter: calculatePolygonPerimeter(projectedVerts),
          attributes: feat.attributes || {
            ID: `FEAT-${idx + 1}`,
            Nom: name,
            Source: formatName,
          }
        };
      });

      setParcels((prev) => [...prev, ...newParcels]);
      setSelectedParcelId(newParcels[0].id);
      setSelectedParcelIds([newParcels[0].id]);
      setSelectedAttributeKey(""); // Reset column mapping selection
      setImportSearchQuery(""); // Reset search query on new import

      setImportNotification({
        fileName: originFileName,
        count: newParcels.length,
        show: true,
        parcelIds: newParcels.map((p) => p.id),
        rawFeatures: features,
        sourceCRS: finalSourceCRS,
        format: formatName,
      });
    };

    try {
      const shpFile = files.find(f => f.name.toLowerCase().endsWith(".shp"));
      const dbfFile = files.find(f => f.name.toLowerCase().endsWith(".dbf"));
      const zipFile = files.find(f => f.name.toLowerCase().endsWith(".zip"));

      // Scenario A: Zipped Shapefile / ZIP containing map files
      if (zipFile) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const buffer = event.target?.result as ArrayBuffer;
            const parsed = await parseShapefileZip(buffer);
            processFeatures(parsed, "Zipped Shapefile (.zip)", zipFile.name);
          } catch (err) {
            console.error(err);
            alert("Erreur: Impossible d'analyser le fichier ZIP.");
          }
        };
        reader.readAsArrayBuffer(zipFile);
        return;
      }

      // Scenario B: Individual .shp + .dbf selected together
      if (shpFile && dbfFile) {
        const shpReader = new FileReader();
        shpReader.onload = (shpEvent) => {
          const shpBuffer = shpEvent.target?.result as ArrayBuffer;
          const dbfReader = new FileReader();
          dbfReader.onload = async (dbfEvent) => {
            const dbfBuffer = dbfEvent.target?.result as ArrayBuffer;
            try {
              const parsed = await parseShapefilePair(shpBuffer, dbfBuffer);
              processFeatures(parsed, "Shapefile (.shp + .dbf)", shpFile.name);
            } catch (err) {
              console.error(err);
              alert("Erreur: Impossible d'analyser la paire de fichiers Shapefile (.shp + .dbf).");
            }
          };
          dbfReader.readAsArrayBuffer(dbfFile);
        };
        shpReader.readAsArrayBuffer(shpFile);
        return;
      }

      // Scenario E: Other individual files
      const primaryFile = files[0];
      if (primaryFile) {
        const extension = primaryFile.name.substring(primaryFile.name.lastIndexOf(".")).toLowerCase();
        const reader = new FileReader();

        if (extension === ".xlsx" || extension === ".xls") {
          reader.onload = (event) => {
            try {
              const buffer = event.target?.result as ArrayBuffer;
              const parsed = parseExcel(buffer, primaryFile.name);
              processFeatures(parsed, extension === ".xlsx" ? "Excel (.xlsx)" : "Excel (.xls)", primaryFile.name);
            } catch (err) {
              console.error(err);
              alert("Erreur: Impossible de lire ou analyser ce fichier Excel.");
            }
          };
          reader.readAsArrayBuffer(primaryFile);
          return;
        }

        if (extension === ".gpkg") {
          reader.onload = (event) => {
            try {
              const buffer = event.target?.result as ArrayBuffer;
              const parsed = parseGeoPackage(buffer);
              processFeatures(parsed, "GeoPackage (.gpkg)", primaryFile.name);
            } catch (err) {
              console.error(err);
              alert("Erreur: Impossible de lire ou analyser ce fichier GeoPackage.");
            }
          };
          reader.readAsArrayBuffer(primaryFile);
          return;
        }

        reader.onload = (event) => {
          const content = event.target?.result as string;
          try {
            if (extension === ".csv") {
              const parsed = parseCSV(content, primaryFile.name);
              processFeatures(parsed, "CSV", primaryFile.name);
            } else if (extension === ".dxf") {
              const parsed = parseDXF(content);
              processFeatures(parsed, "DXF", primaryFile.name);
            } else {
              const parsed = parseGeoJSON(content);

              let geojsonCRS: SupportedCRS | undefined;
              try {
                const rawObj = JSON.parse(content);
                if (rawObj.crs?.properties?.name) {
                  const crsName = String(rawObj.crs.properties.name);
                  if (crsName.includes("26191")) geojsonCRS = "EPSG:26191";
                  else if (crsName.includes("26192")) geojsonCRS = "EPSG:26192";
                  else if (crsName.includes("26193")) geojsonCRS = "EPSG:26193";
                  else if (crsName.includes("26194")) geojsonCRS = "EPSG:26194";
                  else if (crsName.includes("4326")) geojsonCRS = "EPSG:4326";
                }
              } catch (_) {}

              processFeatures(parsed, "GeoJSON", primaryFile.name, geojsonCRS);
            }
          } catch (err) {
            alert("Une erreur de lecture ou d'analyse s'est produite lors du décodage de ce fichier.");
          }
        };
        reader.readAsText(primaryFile);
      }
    } catch (err) {
      console.error(err);
      alert("Une erreur inattendue s'est produite lors de l'importation.");
    }
  };

  // Instantiates a fresh blank square parcel centered in the workspace
  const handleAddNewBlankParcel = () => {
    const freshId = `parcelle-${Date.now()}`;
    const newVertices: Vertex[] = [
      { id: 1, label: "P1", x: 360050.0, y: 410050.0 },
      { id: 2, label: "P2", x: 360150.0, y: 410050.0 },
      { id: 3, label: "P3", x: 360150.0, y: 410150.0 },
      { id: 4, label: "P4", x: 360050.0, y: 410150.0 },
    ];
    const newParcel: Parcel = {
      id: freshId,
      name: `Projet de délimitation N° ${parcels.length + 1}`,
      vertices: newVertices,
      segments: buildSegmentsAndStats(newVertices),
      area: calculatePolygonArea(newVertices),
      perimeter: calculatePolygonPerimeter(newVertices),
    };
    setParcels((prev) => [...prev, newParcel]);
    setSelectedParcelId(freshId);
    setSelectedParcelIds([freshId]);
    setDrawingMode(true);
  };

  // Logo file selection reader to render image inside Page 1 Layout header
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setSettings((prev) => ({ ...prev, logoUrl: event.target!.result as string }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-900 text-slate-100 font-sans">
      {/* ======================================================== */}
      {/* 1. APP TOP BAR HEADER (Hidden from print layout) */}
      {/* ======================================================== */}
      <header className="bg-emerald-950 border-b border-emerald-800 px-6 py-4 flex flex-col md:flex-row gap-4 items-center justify-between shadow-lg sticky top-0 z-50 print:hidden leading-none">
        {/* Title */}
        <div className="flex items-center gap-3 animate-fade-in">
          <div className="bg-amber-500 text-slate-900 p-2 rounded-xl shadow-md">
            <Compass className="w-6 h-6 animate-spin-slow" />
          </div>
          <div>
            <h1 className="text-md font-extrabold tracking-widest text-[#f3f4f6] flex items-center gap-2">
              {t.appTitle}
              <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-sm uppercase font-mono tracking-widest font-black leading-none">
                {t.version}
              </span>
            </h1>
            <p className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider mt-1 leading-none">
              {t.appSubtitle}
            </p>
          </div>
        </div>

        {/* Global Selectors */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Language Switcher */}
          <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setLang("ar")}
              className={`px-3 py-1 text-[11px] rounded transition-all font-bold ${
                lang === "ar"
                  ? "bg-emerald-600 text-white shadow-md font-sans"
                  : "text-slate-400 hover:text-slate-200 font-sans"
              }`}
            >
              العربية
            </button>
            <button
              onClick={() => setLang("fr")}
              className={`px-3 py-1 text-[11px] rounded transition-all font-bold ${
                lang === "fr"
                  ? "bg-emerald-600 text-white shadow-md font-sans"
                  : "text-slate-400 hover:text-slate-200 font-sans"
              }`}
            >
              Français
            </button>
            <button
              onClick={() => setLang("en")}
              className={`px-3 py-1 text-[11px] rounded transition-all font-bold ${
                lang === "en"
                  ? "bg-emerald-600 text-white shadow-md font-sans"
                  : "text-slate-400 hover:text-slate-200 font-sans"
              }`}
            >
              English
            </button>
          </div>

          {/* Active target parcel dropdown */}
          <div className="flex items-center gap-2 bg-slate-800/80 rounded-xl px-3 py-2 border border-slate-700 w-full md:w-48 text-stone-100 md:w-auto">
            <Layers className="w-4 h-4 text-emerald-400" />
            <select
              value={selectedParcelId}
              onChange={(e) => setSelectedParcelId(e.target.value)}
              className="bg-transparent text-xs font-bold focus:outline-none w-full text-slate-200"
            >
              {parcels.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-800 text-slate-100">
                  {getLocalizedParcelName(p, lang)}
                </option>
              ))}
            </select>
          </div>

          {/* Create new plan button */}
          <button
            onClick={handleAddNewBlankParcel}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-800 hover:bg-emerald-700 border border-emerald-600 rounded-xl text-xs font-semibold transition"
            title={t.newPlanBtn}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>{t.newPlanBtn}</span>
          </button>

          {/* Mode toggle */}
          <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setViewMode("map_editor")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                viewMode === "map_editor"
                  ? "bg-amber-600 text-white shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>{t.editMapBtn}</span>
            </button>
            <button
              onClick={() => {
                setViewMode("print_preview");
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                viewMode === "print_preview"
                  ? "bg-amber-600 text-white shadow-md animate-none"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{t.printBtn}</span>
            </button>
            <button
              onClick={() => setViewMode("about")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                viewMode === "about"
                  ? "bg-amber-600 text-white shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>{lang === "ar" ? "حول البرنامج" : "À Propos"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ======================================================== */}
      {/* 2. MAIN VIEW SWITCHER */}
      {/* ======================================================== */}
      {viewMode === "print_preview" ? (
        <PrintSheetLayout
          parcel={activeParcel}
          additionalParcels={additionalParcels}
          settings={settings}
          onBackToEditor={() => setViewMode("map_editor")}
          initialLayoutType={printLayoutType}
          lang={lang}
        />
      ) : viewMode === "about" ? (
        <AboutPage
          lang={lang}
          onBack={() => setViewMode("map_editor")}
        />
      ) : (
        /* workspace view (editor) */
        <main className="flex-1 grid grid-cols-12 print:hidden leading-none select-none">
          {/* ======================================================== */}
          {/* A. LEFT SIDEBAR: Template Configuration Parameters */}
          {/* ======================================================== */}
          <aside className="col-span-12 xl:col-span-3 bg-slate-800/90 border-r border-slate-700 p-5 flex flex-col gap-6 overflow-y-auto max-h-[calc(100vh-80px)]">
            {/* Expanded Multi-Format Importer box */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700 flex flex-col gap-3">
              <h2 className="text-xs font-extrabold text-amber-400 uppercase tracking-widest flex items-center gap-2">
                <FolderOpen className="w-4 h-4" />
                <span>Importation Données</span>
              </h2>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Importation de levés topographiques multi-formats :
                <span className="block mt-1 text-[9.5px] font-mono text-emerald-400 font-bold">
                  • DXF • GEOPACKAGE (.gpkg) • GeoJSON • CSV • EXCEL (.xlsx/.xls) • SHAPEFILE (.zip/.shp)
                </span>
              </p>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-emerald-600/50 hover:bg-emerald-950/20 rounded-lg p-3.5 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 group"
              >
                <Upload className="w-5 h-5 text-slate-500 group-hover:text-emerald-500 transition" />
                <span className="text-[10.5px] font-medium text-slate-300">Choisir un fichier d'arpentage</span>
                <span className="text-[8px] text-slate-500 font-mono">Glisser DXF, CSV, EXCEL, GPKG, GeoJSON, SHP, DBF, ou ZIP</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".geojson,.json,.csv,.xls,.xlsx,.dxf,.gpkg,.zip,.shp,.dbf"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {/* Unified Import Session Control Card */}
              {importNotification && importNotification.show && (
                <div className="bg-emerald-950/85 border border-emerald-500/40 rounded-lg p-3 text-xs flex flex-col gap-2.5 mt-2 leading-none font-sans">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold justify-between">
                    <div className="flex items-center gap-1.5 font-sans">
                      <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                      <span>{lang === "ar" ? "معالجة ومطابقة بيانات الرفع" : "Rapprochement & Traitement des Données"}</span>
                    </div>
                    <button 
                      onClick={() => setImportNotification(null)}
                      className="text-stone-400 hover:text-stone-200 text-[10px] font-mono px-1"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="text-[10px] text-slate-300 leading-normal border-b border-emerald-900/50 pb-2 font-sans">
                    {t.importFile} <span className="font-mono text-amber-400 block truncate font-semibold">{importNotification.fileName}</span>
                    {t.importType} <span className="text-emerald-400 font-bold">{importNotification.format || "Autre"}</span>
                  </div>

                  {/* 1. COORDINATE SYSTEM OF FILE SECTION */}
                  <div className="bg-slate-950/70 p-2 rounded border border-slate-850 flex flex-col gap-1.5 leading-relaxed font-sans">
                    <span className="text-[9.5px] text-amber-500 font-bold font-sans">
                      {t.importSourceCrs}
                    </span>
                    <select
                      value={importNotification.sourceCRS || "EPSG:26191"}
                      onChange={(e) => handleUpdateImportCRS(e.target.value as SupportedCRS)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none cursor-pointer font-sans"
                    >
                      {Object.entries(CRS_DETAILS).map(([crs, details]) => (
                        <option key={crs} value={crs} className="font-sans">
                          {crs} - {lang === "ar" ? details.arabic : details.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 2. CHOOSE ATTRIBUTE KEY FOR NAMING */}
                  {(() => {
                    const importedParcels = parcels.filter(p => importNotification.parcelIds.includes(p.id));
                    const firstImported = importedParcels[0];
                    const attributeKeys = firstImported && firstImported.attributes
                      ? Object.keys(firstImported.attributes).filter(k => k !== "Source")
                      : [];

                    if (attributeKeys.length === 0) return null;

                    return (
                      <div className="bg-slate-950/70 border border-slate-850 p-2 rounded flex flex-col gap-1.5 leading-relaxed font-sans">
                        <label className="text-[9.5px] text-amber-500 block font-bold">
                          {t.importAdoptName}
                        </label>
                        <select
                          value={selectedAttributeKey}
                          onChange={(e) => handleUpdateNamingKey(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-[10px] text-slate-200 focus:outline-none cursor-pointer"
                        >
                          <option value="">{t.importChooseColumn}</option>
                          {attributeKeys.map(k => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })()}

                  {/* 3. LIST OF PROPERTIES */}
                  <div className="border-t border-slate-800/80 pt-2 flex flex-col gap-1.5 mt-0.5">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[9.5px] text-emerald-400 font-bold block font-sans animate-pulse">
                        {lang === "ar" ? "لائحة الأملاك المكونة للملــــف :" : "Liste des parcelles composant le dossier :"}
                      </span>
                      {importNotification.parcelIds.length > 5 && (
                        <span className="text-[8.5px] font-mono text-slate-400 font-bold bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800/60">
                          {importNotification.parcelIds.length} {lang === "ar" ? "مضلعات" : "polygones"}
                        </span>
                      )}
                    </div>

                    {/* Highly interactive search & filter tool */}
                    <div className="relative">
                      <input
                        type="text"
                        placeholder={lang === "ar" ? "🔍 ابحث باسم أو رقم الملك أو القمم..." : "🔍 Rechercher par nom, attribut..."}
                        value={importSearchQuery}
                        onChange={(e) => setImportSearchQuery(e.target.value)}
                        className={`w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all font-sans ${
                          lang === "ar" ? "text-right" : "text-left"
                        }`}
                      />
                      {importSearchQuery && (
                        <button
                          onClick={() => setImportSearchQuery("")}
                          className={`absolute text-slate-500 hover:text-slate-300 transition text-[10px] px-1 font-sans top-1/2 -translate-y-1/2 ${
                            lang === "ar" ? "left-2.5" : "right-2.5"
                          }`}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* List of properties filtered */}
                    <div className="max-h-40 overflow-y-auto flex flex-col gap-1 pr-1 font-sans bg-slate-950/60 p-1.5 rounded border border-slate-850">
                      {(() => {
                        const filteredIds = importNotification.parcelIds.filter((pId) => {
                          const matchP = parcels.find((p) => p.id === pId);
                          if (!matchP) return false;
                          if (!importSearchQuery.trim()) return true;
                          const q = importSearchQuery.toLowerCase();
                          const matchesName = matchP.name.toLowerCase().includes(q);
                          const matchesAttrs = matchP.attributes && Object.values(matchP.attributes).some(
                            (val) => String(val).toLowerCase().includes(q)
                          );
                          const matchesSymbols = matchP.symbols && matchP.symbols.some((sym) => {
                            const label = (sym.label || "").toLowerCase();
                            const type = (sym.type || "").toLowerCase();
                            const arTypes = 
                              type === "tree" ? "شجرة" :
                              type === "well" ? "بئر" :
                              type === "cemetery" ? "مقبرة" :
                              type === "building" ? "بناء" :
                              type === "mosque" ? "مسجد" :
                              type === "palm" ? "نخيل نخلة" :
                              type === "reed" ? "قصب" :
                              type === "grass" ? "أعشاب عشب" :
                              type === "transformer" ? "محول كهربائي" :
                              type === "olive" ? "زيتون" :
                              type === "geodetic" ? "نقطة جيوديزية جيوديزي جيوفيزيائية جيوفيزيائي" :
                              type === "spring" ? "عين ماء" : "نص حر كتابة حرة";
                            return label.includes(q) || type.includes(q) || arTypes.includes(q);
                          });
                          return matchesName || matchesAttrs || matchesSymbols;
                        });

                        if (filteredIds.length === 0) {
                          return (
                            <div className="text-center py-4 text-slate-500 text-[10.5px] font-sans">
                              {lang === "ar" ? "⚠️ لا توجد نتائج مطابقة لبحثك" : "⚠️ Aucun résultat correspondant"}
                            </div>
                          );
                        }

                        return (
                          <>
                            {importSearchQuery.trim() && (
                              <div className="text-[8.5px] text-amber-400 font-mono mb-1 border-b border-slate-800 pb-1 flex justify-between px-1">
                                <span>{lang === "ar" ? "نتائج البحث :" : "Résultats :"}</span>
                                <span>
                                  {filteredIds.length} / {importNotification.parcelIds.length}
                                </span>
                              </div>
                            )}
                            {filteredIds.map((pId) => {
                              const matchP = parcels.find(p => p.id === pId);
                              if (!matchP) return null;
                              const isActive = selectedParcelId === pId;
                              const isMultiSelected = selectedParcelIds.includes(pId);
                              return (
                                <div
                                  key={pId}
                                  className={`w-full rounded transition flex items-center gap-2 p-1.5 border ${
                                    isActive 
                                      ? "bg-emerald-600/10 text-emerald-300 border-emerald-500/40 font-bold" 
                                      : isMultiSelected
                                      ? "bg-purple-950/20 text-purple-300 border-purple-500/30"
                                      : "bg-slate-900/60 hover:bg-slate-800 text-slate-300 border-slate-800/40"
                                  }`}
                                >
                                  {/* Custom Checkbox button to toggle multi-selection for joint viewing */}
                                  <button
                                    onClick={(e) => toggleParcelMultiSelect(pId, e)}
                                    title={lang === "ar" ? "تحديد للمعاينة والطباعة المشتركة" : "Sélectionner pour aperçu et impression conjoint"}
                                    className={`flex items-center justify-center w-5 h-5 rounded border transition-all shrink-0 ${
                                      isMultiSelected
                                        ? "bg-purple-600 border-purple-400 text-white"
                                        : "border-slate-700 hover:border-slate-500 bg-slate-950"
                                    }`}
                                  >
                                    {isMultiSelected && <Check className="w-3.5 h-3.5" />}
                                  </button>

                                  {/* Main selection trigger button to set as primary active parcel */}
                                  <button
                                    onClick={() => selectPrimaryParcel(pId)}
                                    title={lang === "ar" ? "تعديل وتحديد رئيسي" : "Éditer et définir comme principal"}
                                    className={`flex-1 flex items-start justify-between min-h-[26px] py-0.5 px-1 focus:outline-none ${
                                      lang === "ar" ? "flex-row-reverse text-right" : "flex-row text-left"
                                    }`}
                                  >
                                    <span className={`font-semibold text-[10.5px] break-words whitespace-normal flex-1 leading-snug ${lang === "ar" ? "text-right" : "text-left"}`}>
                                      {matchP.name}
                                    </span>
                                    <span className="text-[8.5px] font-mono opacity-80 shrink-0 font-bold bg-slate-950/40 px-1.5 py-0.5 rounded text-emerald-400 ml-2 font-sans">
                                      {lang === "ar" ? `${matchP.vertices.length} قمم` : `${matchP.vertices.length} Bornes`}
                                    </span>
                                  </button>
                                </div>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* General Parcel Management Card (Accessible at all times) */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/60 flex flex-col gap-3">
              <button
                onClick={() => setShowParcelManagement(!showParcelManagement)}
                className="w-full flex items-center justify-between text-xs font-extrabold text-amber-400 uppercase tracking-widest cursor-pointer focus:outline-none"
              >
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <span>{lang === "ar" ? "إدارة وتحديد القطع الأرضية" : "Gestion des Parcelles"}</span>
                </div>
                <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700 flex items-center gap-1 font-sans">
                  {showParcelManagement 
                    ? (lang === "ar" ? "إخفاء" : "Masquer") 
                    : (lang === "ar" ? "عرض" : "Afficher")
                  }
                  {showParcelManagement ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </span>
              </button>
              
              {showParcelManagement && (
                <div className="flex flex-col gap-3 mt-1">
                  <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                    {lang === "ar" 
                      ? "اختر القطع للمعاينة والطباعة المشتركة، أو حدد القطعة الرئيسية لتعديل حدودها ونقاطها." 
                      : "Cochez pour afficher et imprimer ensemble, ou cliquez sur le nom pour définir la parcelle principale à éditer."
                    }
                  </p>
                  
                  <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
                    {parcels.map((p) => {
                      const isActive = selectedParcelId === p.id;
                      const isMultiSelected = selectedParcelIds.includes(p.id);
                      return (
                        <div
                          key={p.id}
                          className={`w-full rounded-lg transition flex items-center gap-2 p-2 border ${
                            isActive 
                              ? "bg-emerald-600/10 text-emerald-300 border-emerald-500/40 font-bold" 
                              : isMultiSelected
                              ? "bg-purple-950/20 text-purple-300 border-purple-500/30"
                              : "bg-slate-900/60 hover:bg-slate-800 text-slate-300 border-slate-800/40"
                          }`}
                        >
                          {/* Checkbox for multi-selection */}
                          <button
                            onClick={(e) => toggleParcelMultiSelect(p.id, e)}
                            title={lang === "ar" ? "تحديد للمعاينة والطباعة المشتركة" : "Sélectionner pour aperçu et impression conjoint"}
                            className={`flex items-center justify-center w-5 h-5 rounded border transition-all shrink-0 cursor-pointer ${
                              isMultiSelected
                                ? "bg-purple-600 border-purple-400 text-white"
                                : "border-slate-700 hover:border-slate-500 bg-slate-950"
                            }`}
                          >
                            {isMultiSelected && <Check className="w-3.5 h-3.5" />}
                          </button>

                          {/* Main name selector */}
                          <button
                            onClick={() => selectPrimaryParcel(p.id)}
                            title={lang === "ar" ? "تعديل وتحديد رئيسي" : "Éditer et définir comme principal"}
                            className={`flex-1 flex items-center justify-between min-h-[26px] py-0.5 px-1 focus:outline-none cursor-pointer ${
                              lang === "ar" ? "flex-row-reverse text-right" : "flex-row text-left"
                            }`}
                          >
                            <span className="font-semibold text-[10.5px] truncate max-w-[120px]">
                              {getLocalizedParcelName(p, lang)}
                            </span>
                            <span className="text-[8.5px] font-mono opacity-80 shrink-0 font-bold bg-slate-950/40 px-1.5 py-0.5 rounded text-emerald-400">
                              {p.vertices.length} قمم
                            </span>
                          </button>

                          {/* Trash can to delete completely */}
                          {pendingDeleteParcelId === p.id ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setParcels(prev => prev.filter(item => item.id !== p.id));
                                  setSelectedParcelIds(prev => prev.filter(id => id !== p.id));
                                  if (selectedParcelId === p.id) {
                                    const remainingAll = parcels.filter(item => item.id !== p.id);
                                    setSelectedParcelId(remainingAll[0].id);
                                  }
                                  setPendingDeleteParcelId(null);
                                }}
                                className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-[9.5px] px-1.5 py-0.5 rounded transition cursor-pointer animate-pulse"
                              >
                                {lang === "ar" ? "تأكيد" : "Confirmer"}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPendingDeleteParcelId(null);
                                }}
                                className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9.5px] px-1.5 py-0.5 rounded transition cursor-pointer"
                              >
                                {lang === "ar" ? "إلغاء" : "Annuler"}
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (parcels.length <= 1) {
                                  alert(lang === "ar" ? "⚠️ يجب إبقاء قطعة أرضية واحدة على الأقل في المشروع !" : "⚠️ Vous devez garder au moins une parcelle dans le projet !");
                                  return;
                                }
                                setPendingDeleteParcelId(p.id);
                              }}
                              className="text-slate-500 hover:text-rose-400 p-1 rounded transition shrink-0 cursor-pointer"
                              title={lang === "ar" ? "حذف هذه القطعة نهائياً" : "Supprimer cette parcelle définitivement"}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Custom Symbols and Labels Placement Card */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/60 flex flex-col gap-3">
              <h2 className="text-xs font-extrabold text-amber-400 uppercase tracking-widest flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-400" />
                <span>{lang === "ar" ? "الرموز والكتابة الجيوفيزيائية" : "Symboles & Étiquettes"}</span>
              </h2>
              <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                {lang === "ar"
                  ? "أدخل اسماً أو مسمى في الحقل أسفله ثم اختر الرمز المطلوب وضعه على قطعة الأرض بالخريطة الحية."
                  : "Saisissez un texte, puis choisissez un symbole ci-dessous pour le placer d'un simple clic sur la carte."
                }
              </p>

              {/* Text Input for custom label */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[9.5px] text-slate-400 block font-sans">
                    {lang === "ar" ? "الكتابة أو المسمى المصاحب للرمز :" : "Texte ou étiquette d'accompagnement :"}
                  </label>
                  <label className="flex items-center gap-1 text-[9.5px] text-emerald-400 font-bold cursor-pointer font-sans select-none">
                    <input
                      type="checkbox"
                      checked={enableSymbolLabel}
                      onChange={(e) => {
                        setEnableSymbolLabel(e.target.checked);
                        setSymbolPlacementLabel(e.target.checked ? localSymbolLabel : "");
                      }}
                      className="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-0 focus:ring-offset-0 w-3 h-3 cursor-pointer"
                    />
                    <span>{lang === "ar" ? "تفعيل التسمية" : "Activer l'étiquette"}</span>
                  </label>
                </div>
                <input
                  type="text"
                  disabled={!enableSymbolLabel}
                  placeholder={lang === "ar" ? "مثال: بئر، شجرة زيتون، المحتويات..." : "Ex: Puits, Olivier, Les contenances..."}
                  value={localSymbolLabel}
                  onChange={(e) => {
                    setLocalSymbolLabel(e.target.value);
                    if (symbolToPlace && enableSymbolLabel) {
                      setSymbolPlacementLabel(e.target.value);
                    }
                  }}
                  className={`w-full bg-slate-950 border rounded px-2.5 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans transition-all ${
                    enableSymbolLabel ? "border-slate-700 opacity-100" : "border-slate-800/40 opacity-40 cursor-not-allowed"
                  }`}
                />
              </div>

              {/* Grid of Symbol Choices */}
              <div className="grid grid-cols-3 gap-1.5 mt-1">
                {[
                  { type: "tree", labelAr: "🌳 شجرة", labelFr: "🌳 Arbre" },
                  { type: "well", labelAr: "🕳️ بئر", labelFr: "🕳️ Puits" },
                  { type: "cemetery", labelAr: "🌙 مقبرة", labelFr: "🌙 Cimetière" },
                  { type: "building", labelAr: "🏠 بناء", labelFr: "🏠 Bâtiment" },
                  { type: "mosque", labelAr: "🕌 مسجد", labelFr: "🕌 Mosquée" },
                  { type: "palm", labelAr: "🌴 نخيل", labelFr: "🌴 Palmier" },
                  { type: "reed", labelAr: "🌾 قصب", labelFr: "🌾 Roseau" },
                  { type: "grass", labelAr: "🌱 أعشاب", labelFr: "🌱 Herbes" },
                  { type: "transformer", labelAr: "⚡ محول كهربائي", labelFr: "⚡ Transfo" },
                  { type: "olive", labelAr: "🫒 زيتون", labelFr: "🫒 Olivier" },
                  { type: "geodetic", labelAr: "🔺 نقطة جيوديزية", labelFr: "🔺 Pt Géodésique" },
                  { type: "spring", labelAr: "💧 عين ماء", labelFr: "💧 Source d'eau" },
                  { type: "custom_text", labelAr: "📝 نص حر", labelFr: "📝 Texte Libre" },
                ].map((item) => {
                  const isSelected = symbolToPlace === item.type;
                  return (
                    <button
                      key={item.type}
                      onClick={() => {
                        if (isSelected) {
                          setSymbolToPlace(null);
                          setSymbolPlacementLabel("");
                        } else {
                          setSymbolToPlace(item.type as any);
                          setLineToPlace(null); // Clear line placement mode
                          setDrawingMode(false); // Clear polygon drawing mode
                          
                          // Determine the default translation
                          const defaultArName = 
                            item.type === "tree" ? "شجرة" :
                            item.type === "well" ? "بئر" :
                            item.type === "cemetery" ? "مقبرة" :
                            item.type === "building" ? "بناء" :
                            item.type === "mosque" ? "مسجد" :
                            item.type === "palm" ? "نخيل" :
                            item.type === "reed" ? "قصب" :
                            item.type === "grass" ? "أعشاب" :
                            item.type === "transformer" ? "محول كهربائي" :
                            item.type === "olive" ? "زيتون" :
                            item.type === "geodetic" ? "نقطة جيوديزية" :
                            item.type === "spring" ? "عين ماء" : 
                            item.type === "custom_text" ? "كتابة حرة" : "";
                            
                          const defaultFrName = 
                            item.type === "tree" ? "Arbre" :
                            item.type === "well" ? "Puits" :
                            item.type === "cemetery" ? "Cimetière" :
                            item.type === "building" ? "Bâtiment" :
                            item.type === "mosque" ? "Mosquée" :
                            item.type === "palm" ? "Palmier" :
                            item.type === "reed" ? "Roseau" :
                            item.type === "grass" ? "Herbes" :
                            item.type === "transformer" ? "Transfo" :
                            item.type === "olive" ? "Olivier" :
                            item.type === "geodetic" ? "Pt Géodésique" :
                            item.type === "spring" ? "Source d'eau" :
                            item.type === "custom_text" ? "Texte Libre" : "";

                          const newDefaultName = lang === "ar" ? defaultArName : defaultFrName;

                          // Auto-populate input text if empty or contains a previous default label
                          if (!localSymbolLabel.trim() || [
                            "شجرة", "Arbre",
                            "بئر", "Puits",
                            "مقبرة", "Cimetière",
                            "بناء", "Bâtiment",
                            "مسجد", "Mosquée",
                            "نخيل", "Palmier",
                            "قصب", "Roseau",
                            "أعشاب", "Herbes",
                            "محول كهربائي", "Transfo",
                            "زيتون", "Olivier",
                            "نقطة جيوديزية", "Pt Géodésique",
                            "عين ماء", "Source d'eau",
                            "كتابة حرة", "Texte Libre", "Texte libre"
                          ].includes(localSymbolLabel)) {
                            setLocalSymbolLabel(newDefaultName);
                            setSymbolPlacementLabel(enableSymbolLabel ? newDefaultName : "");
                          } else {
                            setSymbolPlacementLabel(enableSymbolLabel ? localSymbolLabel : "");
                          }
                        }
                      }}
                      className={`py-2 px-1 text-[10px] rounded border transition flex flex-col items-center justify-center gap-1 font-bold font-sans cursor-pointer ${
                        isSelected
                          ? "bg-emerald-600 border-emerald-400 text-white animate-pulse"
                          : "bg-slate-950/70 border-slate-800 hover:bg-slate-850 hover:border-slate-700 text-slate-300"
                      }`}
                    >
                      <span className="text-[10px]">
                        {lang === "ar" ? item.labelAr : item.labelFr}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Placement Active Instruction */}
              {symbolToPlace && (
                <div className="mt-1.5 p-2 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-300 font-sans text-center leading-relaxed animate-pulse">
                  {lang === "ar"
                    ? `🎯 انقر الآن في أي مكان داخل مضلع الخريطة لوضع الرمز المصاحب بـ: "${symbolPlacementLabel || 'بدون مسمى'}"`
                    : `🎯 Cliquez sur la carte pour déposer le symbole avec l'étiquette : "${symbolPlacementLabel || 'Aucune'}"`
                  }
                  <button
                    onClick={() => {
                      setSymbolToPlace(null);
                      setSymbolPlacementLabel("");
                    }}
                    className="block text-[9px] text-red-400 hover:text-red-300 underline mt-1 mx-auto cursor-pointer"
                  >
                    {lang === "ar" ? "إلغاء وضع الرمز" : "Annuler le placement"}
                  </button>
                </div>
              )}

              {/* Placed symbols manager for current parcel */}
              {activeParcel.symbols && activeParcel.symbols.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9.5px] font-bold text-slate-400 uppercase font-sans">
                      {lang === "ar" ? "الرموز المدرجة بالقطعة الحالية :" : "Symboles placés sur la parcelle :"}
                    </span>
                    {pendingDeleteAllSymbols ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setParcels(prev => prev.map(p => p.id === activeParcel.id ? { ...p, symbols: [] } : p));
                            setPendingDeleteAllSymbols(false);
                          }}
                          className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-[9px] px-1.5 py-0.5 rounded transition cursor-pointer animate-pulse"
                        >
                          {lang === "ar" ? "تأكيد" : "Confirmer"}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setPendingDeleteAllSymbols(false);
                          }}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9px] px-1.5 py-0.5 rounded transition cursor-pointer"
                        >
                          {lang === "ar" ? "إلغاء" : "Annuler"}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setPendingDeleteAllSymbols(true);
                        }}
                        className="text-[9px] text-rose-400 hover:text-rose-300 underline font-semibold flex items-center gap-1 cursor-pointer"
                        title={lang === "ar" ? "حذف جميع الرموز دفعة واحدة" : "Supprimer tous les symboles d'un coup"}
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                        <span>{lang === "ar" ? "حذف الكل" : "Tout supprimer"}</span>
                      </button>
                    )}
                  </div>

                  {/* Compact Search for placed symbols */}
                  <div className="mb-2 relative">
                    <input
                      type="text"
                      placeholder={lang === "ar" ? "🔍 ابحث في الرموز المضافة..." : "🔍 Filtrer les symboles..."}
                      value={symbolSearchQuery}
                      onChange={(e) => setSymbolSearchQuery(e.target.value)}
                      className={`w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-[10px] text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans ${
                        lang === "ar" ? "text-right" : "text-left"
                      }`}
                    />
                    {symbolSearchQuery && (
                      <button
                        onClick={() => setSymbolSearchQuery("")}
                        className={`absolute text-slate-500 hover:text-slate-300 transition text-[9px] px-1 font-sans top-1/2 -translate-y-1/2 ${
                          lang === "ar" ? "left-2" : "right-2"
                        }`}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 max-h-44 overflow-y-auto pr-1">
                    {(() => {
                      const filteredList = activeParcel.symbols
                        .map((sym, idx) => ({ sym, idx }))
                        .filter(({ sym }) => {
                          if (!symbolSearchQuery.trim()) return true;
                          const q = symbolSearchQuery.toLowerCase();
                          const label = (sym.label || "").toLowerCase();
                          const type = (sym.type || "").toLowerCase();
                          const arTypes = 
                            type === "tree" ? "شجرة" :
                            type === "cemetery" ? "مقبرة" :
                            type === "well" ? "بئر" :
                            type === "building" ? "بناء" :
                            type === "mosque" ? "مسجد" :
                            type === "palm" ? "نخيل نخلة" :
                            type === "reed" ? "قصب" :
                            type === "grass" ? "أعشاب عشب" :
                            type === "transformer" ? "محول كهربائي" :
                            type === "olive" ? "زيتون" :
                            type === "geodetic" ? "نقطة جيوديزية جيوديزي جيوفيزيائية جيوفيزيائي" :
                            type === "spring" ? "عين ماء" : "نص حر كتابة حرة";
                          return label.includes(q) || type.includes(q) || arTypes.includes(q);
                        });

                      if (filteredList.length === 0) {
                        return (
                          <div className="text-center py-4 text-slate-500 text-[10px] font-sans">
                            {lang === "ar" ? "⚠️ لا توجد رموز مطابقة" : "⚠️ Aucun symbole correspondant"}
                          </div>
                        );
                      }

                      return filteredList.map(({ sym, idx }) => {
                        const type = sym.type || "custom_text";
                        const label = 
                          type === "tree" ? (lang === "ar" ? "شجرة" : "Arbre") :
                          type === "cemetery" ? (lang === "ar" ? "مقبرة" : "Cimetière") :
                          type === "well" ? (lang === "ar" ? "بئر" : "Puits") :
                          type === "building" ? (lang === "ar" ? "بناء" : "Bâtiment") :
                          type === "mosque" ? (lang === "ar" ? "مسجد" : "Mosquée") :
                          type === "palm" ? (lang === "ar" ? "نخيل" : "Palmier") :
                          type === "reed" ? (lang === "ar" ? "قصب" : "Roseau") :
                          type === "grass" ? (lang === "ar" ? "أعشاب" : "Herbe") :
                          type === "transformer" ? (lang === "ar" ? "محول كهربائي" : "Transformateur") :
                          type === "olive" ? (lang === "ar" ? "زيتون" : "Olivier") :
                          type === "geodetic" ? (lang === "ar" ? "نقطة جيوديزية" : "Point Géodésique") :
                          type === "spring" ? (lang === "ar" ? "عين ماء" : "Source d'eau") :
                          (lang === "ar" ? "كتابة حرة" : "Texte libre");

                        const emoji = 
                          type === "tree" ? "🌳" :
                          type === "cemetery" ? "🌙" :
                          type === "well" ? "🕳️" :
                          type === "building" ? "🏠" :
                          type === "mosque" ? "🕌" :
                          type === "palm" ? "🌴" :
                          type === "reed" ? "🌾" :
                          type === "grass" ? "🌱" :
                          type === "transformer" ? "⚡" :
                          type === "olive" ? "𫛳" :
                          type === "geodetic" ? "🔺" :
                          type === "spring" ? "💧" :
                          "📝";

                        const displayLabel = sym.label ? `${label} (${sym.label})` : `${label} #${idx + 1}`;

                        return (
                          <div key={sym.id || `${sym.x}_${sym.y}_${idx}`} className="flex items-center justify-between bg-slate-950/60 p-1.5 rounded text-[10.5px] font-sans hover:bg-slate-900 transition gap-2 border border-slate-900/40">
                            <span className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                              <span className="text-[12px] shrink-0">{emoji}</span>
                              <span className="truncate text-slate-200 block text-right leading-tight min-w-0">
                                <span className="font-bold text-slate-100 block truncate">{displayLabel}</span>
                                <span className="text-[8px] text-slate-500 font-mono block">X: {sym.x.toFixed(1)}, Y: {sym.y.toFixed(1)}</span>
                              </span>
                            </span>
                            {pendingDeleteSymbolIndex === idx ? (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    const updatedSymbols = activeParcel.symbols!.filter((_, i) => i !== idx);
                                    setParcels(prev => prev.map(p => p.id === activeParcel.id ? { ...p, symbols: updatedSymbols } : p));
                                    setPendingDeleteSymbolIndex(null);
                                  }}
                                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-[9px] px-1.5 py-0.5 rounded transition cursor-pointer animate-pulse"
                                >
                                  {lang === "ar" ? "تأكيد" : "Confirmer"}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setPendingDeleteSymbolIndex(null);
                                  }}
                                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9px] px-1 py-0.5 rounded transition cursor-pointer"
                                >
                                  {lang === "ar" ? "إلغاء" : "Annuler"}
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setPendingDeleteSymbolIndex(idx);
                                }}
                                className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-rose-500/10 transition shrink-0 cursor-pointer"
                                title={lang === "ar" ? "حذف هذا الرمز" : "Supprimer ce symbole"}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Custom Linear Features (Paths, Pipes, Lines) Card */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/60 flex flex-col gap-3 animate-fade-in">
              <h2 className="text-xs font-extrabold text-amber-400 uppercase tracking-widest flex items-center gap-2">
                <Milestone className="w-4 h-4 text-emerald-400" />
                <span>{lang === "ar" ? "رسم الخطوط والمسارات الطوبوغرافية" : "Tracé de Lignes & Voies"}</span>
              </h2>
              <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                {lang === "ar"
                  ? "أدخل اسماً أو مسمى في الحقل أسفله، اختر نوع الخط، ثم اضغط على الخريطة لتحديد مساره نقطة بنقطة."
                  : "Saisissez un nom, choisissez un type de ligne, puis cliquez sur la carte pour dessiner le tracé point par point."
                }
              </p>

              {/* Text Input for custom label */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[9.5px] text-slate-400 block font-sans">
                    {lang === "ar" ? "المسمى أو التسمية المصاحبة للخط :" : "Nom ou étiquette de la ligne :"}
                  </label>
                  <label className="flex items-center gap-1 text-[9.5px] text-emerald-400 font-bold cursor-pointer font-sans select-none">
                    <input
                      type="checkbox"
                      checked={enableLineLabel}
                      onChange={(e) => {
                        setEnableLineLabel(e.target.checked);
                        setLinePlacementLabel(e.target.checked ? localLineLabel : "");
                      }}
                      className="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-0 focus:ring-offset-0 w-3 h-3 cursor-pointer"
                    />
                    <span>{lang === "ar" ? "تفعيل التسمية" : "Activer l'étiquette"}</span>
                  </label>
                </div>
                <input
                  type="text"
                  disabled={!enableLineLabel}
                  placeholder={lang === "ar" ? "مثال: طريق فلاحية، طريق رجلية، أنبوب..." : "Ex: Chemin agricole, Sentier, Conduite..."}
                  value={localLineLabel}
                  onChange={(e) => {
                    setLocalLineLabel(e.target.value);
                    if (lineToPlace && enableLineLabel) {
                      setLinePlacementLabel(e.target.value);
                    }
                  }}
                  className={`w-full bg-slate-950 border rounded px-2.5 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans transition-all ${
                    enableLineLabel ? "border-slate-700 opacity-100" : "border-slate-800/40 opacity-40 cursor-not-allowed"
                  }`}
                />
              </div>

              {/* Grid of Line Choices */}
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                {[
                  { type: "footpath", labelAr: "🚶 طريق رجلية (متقطع)", labelFr: "🚶 Sentier (pointillé)" },
                  { type: "agri_road", labelAr: "🚜 طريق فلاحية (مزدوج)", labelFr: "🚜 Chemin agricole" },
                  { type: "power_line", labelAr: "⚡ خط تيار كهربائي", labelFr: "⚡ Ligne électrique" },
                  { type: "water_pipe", labelAr: "💧 خط أنبوب ماء", labelFr: "💧 Conduite d'eau" },
                  { type: "sewer_pipe", labelAr: "🚽 أنبوب تطهير سائل", labelFr: "🚽 Réseau assainissement" },
                ].map((item) => {
                  const isSelected = lineToPlace === item.type;
                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setLineToPlace(null);
                          setLinePlacementLabel("");
                        } else {
                          setLineToPlace(item.type as any);
                          setSymbolToPlace(null); // Clear symbol placement mode
                          setDrawingMode(false); // Clear polygon drawing mode

                          // Determine default colors & size
                          const defaultColor = 
                            item.type === "footpath" ? "#b45309" :
                            item.type === "agri_road" ? "#78350f" :
                            item.type === "power_line" ? "#475569" :
                            item.type === "water_pipe" ? "#0284c7" :
                            item.type === "sewer_pipe" ? "#7c2d12" : "#1e293b";
                          setCustomLineColor(defaultColor);
                          setCustomLabelColor(defaultColor);
                          setCustomLabelSize(9.5);

                          // Determine default translation
                          const defaultArName = 
                            item.type === "footpath" ? "طريق رجلية" :
                            item.type === "agri_road" ? "طريق فلاحية" :
                            item.type === "power_line" ? "خط تيار كهربائي" :
                            item.type === "water_pipe" ? "أنبوب ماء صالح للشرب" :
                            item.type === "sewer_pipe" ? "أنبوب تطهير السائل" : "";
                          
                          const defaultFrName = 
                            item.type === "footpath" ? "Sentier" :
                            item.type === "agri_road" ? "Chemin agricole" :
                            item.type === "power_line" ? "Ligne électrique" :
                            item.type === "water_pipe" ? "Conduite d'eau potable" :
                            item.type === "sewer_pipe" ? "Réseau d'assainissement" : "";

                          const newDefaultName = lang === "ar" ? defaultArName : defaultFrName;

                          if (!localLineLabel.trim() || [
                            "طريق رجلية", "Sentier",
                            "طريق فلاحية", "Chemin agricole",
                            "خط تيار كهربائي", "Ligne électrique",
                            "أنبوب ماء صالح للشرب", "Conduite d'eau potable",
                            "أنبوب تطهير السائل", "Réseau d'assainissement"
                          ].includes(localLineLabel)) {
                            setLocalLineLabel(newDefaultName);
                            setLinePlacementLabel(enableLineLabel ? newDefaultName : "");
                          } else {
                            setLinePlacementLabel(enableLineLabel ? localLineLabel : "");
                          }
                        }
                      }}
                      className={`py-2.5 px-2 text-[10px] rounded border transition flex flex-col items-center justify-center gap-1.5 font-bold font-sans cursor-pointer ${
                        isSelected
                          ? "bg-emerald-600 border-emerald-400 text-white animate-pulse"
                          : "bg-slate-950/70 border-slate-800 hover:bg-slate-850 hover:border-slate-700 text-slate-300"
                      }`}
                    >
                      <span className="text-[10px] text-center">
                        {lang === "ar" ? item.labelAr : item.labelFr}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Line properties sliders for new line drawing */}
              {lineToPlace && (
                <div className="bg-slate-950/40 p-2.5 rounded border border-slate-800/80 flex flex-col gap-2 mt-1 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-emerald-400 font-sans font-bold">
                      {lang === "ar" ? "🛠️ خصائص وتنسيق الخط الجديد :" : "🛠️ Propriétés de la ligne :"}
                    </span>
                  </div>

                  {/* Line Color Input */}
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-[9.5px] text-slate-400 font-sans whitespace-nowrap">
                      {lang === "ar" ? "لون الخط :" : "Couleur de la ligne :"}
                    </label>
                    <div className="flex items-center gap-2 w-2/3">
                      <input
                        type="color"
                        value={customLineColor}
                        onChange={(e) => setCustomLineColor(e.target.value)}
                        className="w-8 h-5 rounded cursor-pointer border border-slate-700 bg-transparent p-0"
                      />
                      <span className="text-[9.5px] font-mono text-emerald-400 font-bold">
                        {customLineColor}
                      </span>
                    </div>
                  </div>

                  {/* Thickness Input */}
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-[9.5px] text-slate-400 font-sans whitespace-nowrap">
                      {lang === "ar" ? "سمك الخط (بكسل) :" : "Épaisseur (px) :"}
                    </label>
                    <div className="flex items-center gap-2 w-2/3">
                      <input
                        type="range"
                        min="0.5"
                        max="6"
                        step="0.5"
                        value={customLineThickness}
                        onChange={(e) => setCustomLineThickness(parseFloat(e.target.value))}
                        className="w-full accent-emerald-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                      />
                      <span className="text-[9.5px] font-mono text-emerald-400 font-bold shrink-0 min-w-[20px] text-right">
                        {customLineThickness}
                      </span>
                    </div>
                  </div>

                  {/* Spacing Input (Only for agri_road) */}
                  {lineToPlace === "agri_road" && (
                    <div className="flex items-center justify-between gap-3 transition-all">
                      <label className="text-[9.5px] text-slate-400 font-sans whitespace-nowrap">
                        {lang === "ar" ? "المسافة بين الخطين (متر) :" : "Écartement (m) :"}
                      </label>
                      <div className="flex items-center gap-2 w-2/3">
                        <input
                          type="range"
                          min="1"
                          max="15"
                          step="0.5"
                          value={customLineSpacing}
                          onChange={(e) => setCustomLineSpacing(parseFloat(e.target.value))}
                          className="w-full accent-emerald-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                        />
                        <span className="text-[9.5px] font-mono text-emerald-400 font-bold shrink-0 min-w-[20px] text-right">
                          {customLineSpacing}m
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Label Styling for New Line */}
                  {enableLineLabel && (
                    <>
                      {/* Label Color picker */}
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-[9.5px] text-slate-400 font-sans whitespace-nowrap">
                          {lang === "ar" ? "لون التسمية :" : "Couleur du texte :"}
                        </label>
                        <div className="flex items-center gap-2 w-2/3">
                          <input
                            type="color"
                            value={customLabelColor}
                            onChange={(e) => setCustomLabelColor(e.target.value)}
                            className="w-8 h-5 rounded cursor-pointer border border-slate-700 bg-transparent p-0"
                          />
                          <span className="text-[9.5px] font-mono text-emerald-400 font-bold">
                            {customLabelColor}
                          </span>
                        </div>
                      </div>

                      {/* Label Font Size slider */}
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-[9.5px] text-slate-400 font-sans whitespace-nowrap">
                          {lang === "ar" ? "حجم التسمية (بكسل) :" : "Taille du texte (px) :"}
                        </label>
                        <div className="flex items-center gap-2 w-2/3">
                          <input
                            type="range"
                            min="6"
                            max="18"
                            step="0.5"
                            value={customLabelSize}
                            onChange={(e) => setCustomLabelSize(parseFloat(e.target.value))}
                            className="w-full accent-emerald-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                          />
                          <span className="text-[9.5px] font-mono text-emerald-400 font-bold shrink-0 min-w-[20px] text-right">
                            {customLabelSize}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Active instructions info */}
              {lineToPlace && (
                <div className="mt-1.5 p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[10px] text-emerald-300 font-sans text-center leading-relaxed animate-pulse">
                  {lang === "ar"
                    ? `🎯 انقر الآن على الخريطة لوضع نقاط الخط بالتتابع: "${linePlacementLabel || 'بدون تسمية'}"`
                    : `🎯 Cliquez sur la carte pour définir les sommets successifs de la ligne : "${linePlacementLabel || 'Sans nom'}"`
                  }
                  <button
                    onClick={() => {
                      setLineToPlace(null);
                      setLinePlacementLabel("");
                    }}
                    className="block text-[9px] text-red-400 hover:text-red-300 underline mt-1 mx-auto cursor-pointer"
                  >
                    {lang === "ar" ? "إلغاء وضع رسم الخط" : "Annuler le tracé"}
                  </button>
                </div>
              )}

              {/* List of placed linear features for current parcel with delete capabilities */}
              {activeParcel.linearFeatures && activeParcel.linearFeatures.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9.5px] font-bold text-slate-400 uppercase font-sans">
                      {lang === "ar" ? "الخطوط المدرجة بالقطعة الحالية :" : "Lignes et tracés placés :"}
                    </span>
                    <button
                      onClick={() => {
                        setParcels(prev => prev.map(p => p.id === activeParcel.id ? { ...p, linearFeatures: [] } : p));
                      }}
                      className="text-[9px] text-rose-400 hover:text-rose-300 underline font-semibold flex items-center gap-1 cursor-pointer"
                      title={lang === "ar" ? "حذف جميع مسارات الخطوط دفعة واحدة" : "Supprimer toutes les lignes"}
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                      <span>{lang === "ar" ? "حذف الكل" : "Tout supprimer"}</span>
                    </button>
                  </div>

                  <div className="flex flex-col gap-1 max-h-[500px] overflow-y-auto pr-1 pb-4">
                    {activeParcel.linearFeatures.map((lf, idx) => {
                      const label = 
                        lf.type === "footpath" ? (lang === "ar" ? "طريق رجلية" : "Sentier") :
                        lf.type === "agri_road" ? (lang === "ar" ? "طريق فلاحية" : "Chemin agricole") :
                        lf.type === "power_line" ? (lang === "ar" ? "خط تيار كهربائي" : "Ligne électrique") :
                        lf.type === "water_pipe" ? (lang === "ar" ? "أنبوب ماء صالح للشرب" : "Conduite d'eau") :
                        (lang === "ar" ? "أنبوب تطهير السائل" : "Réseau d'assainissement");

                      const emoji = 
                        lf.type === "footpath" ? "🚶" :
                        lf.type === "agri_road" ? "🚜" :
                        lf.type === "power_line" ? "⚡" :
                        lf.type === "water_pipe" ? "💧" : "🚽";

                      const displayLabel = lf.label ? `${label} (${lf.label})` : `${label} #${idx + 1}`;
                      const isEditing = editingLineId === lf.id;

                      return (
                        <div key={lf.id || `${lf.type}_${idx}`} className="flex flex-col bg-slate-950/60 rounded text-[10.5px] font-sans border border-slate-900/40 overflow-hidden">
                          <div className="flex items-center justify-between p-1.5 hover:bg-slate-900 transition gap-2">
                            <span className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                              <span className="text-[12px] shrink-0">{emoji}</span>
                              <span className="truncate text-slate-200 block text-right leading-tight min-w-0">
                                <span className="font-bold text-slate-100 block truncate">{displayLabel}</span>
                                <span className="text-[8px] text-slate-500 font-mono block">
                                  {lang === "ar" ? `نقاط المسار: ${lf.vertices.length}` : `Sommets: ${lf.vertices.length}`}
                                </span>
                              </span>
                            </span>
                            
                            <div className="flex items-center gap-1 shrink-0">
                              {/* Edit Line Properties Toggle button */}
                              <button
                                onClick={() => setEditingLineId(isEditing ? null : lf.id)}
                                className={`p-1 rounded transition cursor-pointer ${
                                  isEditing ? "text-emerald-400 bg-emerald-500/10" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                                }`}
                                title={lang === "ar" ? "تعديل خصائص وتنسيق الخط" : "Modifier les propriétés de la ligne"}
                              >
                                <Settings className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete button */}
                              <button
                                onClick={() => {
                                  const updated = activeParcel.linearFeatures!.filter((_, i) => i !== idx);
                                  setParcels(prev => prev.map(p => p.id === activeParcel.id ? { ...p, linearFeatures: updated } : p));
                                  if (isEditing) setEditingLineId(null);
                                }}
                                className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-rose-500/10 transition shrink-0 cursor-pointer"
                                title={lang === "ar" ? "حذف هذا الخط" : "Supprimer cette ligne"}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Dynamic Property Editing Panel */}
                          {isEditing && (() => {
                            const defaultColor = lf.type === "footpath" ? "#b45309" :
                                                 lf.type === "agri_road" ? "#78350f" :
                                                 lf.type === "power_line" ? "#475569" :
                                                 lf.type === "water_pipe" ? "#0284c7" :
                                                 lf.type === "sewer_pipe" ? "#7c2d12" :
                                                 "#1e293b";
                            return (
                              <div className="bg-slate-950 p-2 border-t border-slate-900/40 flex flex-col gap-2 animate-fade-in">
                                {/* Line Color Picker */}
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[9px] text-slate-400 font-sans">
                                    {lang === "ar" ? "لون الخط :" : "Couleur de la ligne :"}
                                  </span>
                                  <div className="flex items-center gap-1.5 w-[65%]">
                                    <input
                                      type="color"
                                      value={lf.color || defaultColor}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setParcels(prev => prev.map(p => p.id === activeParcel.id ? {
                                          ...p,
                                          linearFeatures: p.linearFeatures?.map(item => item.id === lf.id ? { ...item, color: val } : item)
                                        } : p));
                                      }}
                                      className="w-8 h-5 rounded cursor-pointer border border-slate-700 bg-transparent p-0"
                                    />
                                    <span className="text-[9px] font-mono text-emerald-400 font-bold">
                                      {lf.color || defaultColor}
                                    </span>
                                  </div>
                                </div>

                                {/* Thickness Slider */}
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[9px] text-slate-400 font-sans">
                                    {lang === "ar" ? "سمك الخط (بكسل) :" : "Épaisseur (px) :"}
                                  </span>
                                  <div className="flex items-center gap-1.5 w-[65%]">
                                    <input
                                      type="range"
                                      min="0.5"
                                      max="6"
                                      step="0.5"
                                      value={lf.thickness !== undefined ? lf.thickness : 2}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        setParcels(prev => prev.map(p => p.id === activeParcel.id ? {
                                          ...p,
                                          linearFeatures: p.linearFeatures?.map(item => item.id === lf.id ? { ...item, thickness: val } : item)
                                        } : p));
                                      }}
                                      className="w-full accent-emerald-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                                    />
                                    <span className="text-[9px] font-mono text-emerald-400 font-bold w-[15px] text-right shrink-0">
                                      {lf.thickness !== undefined ? lf.thickness : 2}
                                    </span>
                                  </div>
                                </div>

                                {/* Spacing Slider (Only for agri_road) */}
                                {lf.type === "agri_road" && (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[9px] text-slate-400 font-sans">
                                      {lang === "ar" ? "المسافة بين الخطين :" : "Écartement (m) :"}
                                    </span>
                                    <div className="flex items-center gap-1.5 w-[65%]">
                                      <input
                                        type="range"
                                        min="1"
                                        max="15"
                                        step="0.5"
                                        value={lf.spacing !== undefined ? lf.spacing : 4}
                                        onChange={(e) => {
                                          const val = parseFloat(e.target.value);
                                          setParcels(prev => prev.map(p => p.id === activeParcel.id ? {
                                            ...p,
                                            linearFeatures: p.linearFeatures?.map(item => item.id === lf.id ? { ...item, spacing: val } : item)
                                          } : p));
                                        }}
                                        className="w-full accent-emerald-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                                      />
                                      <span className="text-[9px] font-mono text-emerald-400 font-bold w-[25px] text-right shrink-0">
                                        {lf.spacing !== undefined ? lf.spacing : 4}m
                                      </span>
                                    </div>
                                  </div>
                                )}

                                {/* Label Styling Controls (only if lf.label exists) */}
                                {lf.label && (
                                  <>
                                    {/* Label Text Color picker */}
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-[9px] text-slate-400 font-sans">
                                        {lang === "ar" ? "لون التسمية :" : "Couleur du texte :"}
                                      </span>
                                      <div className="flex items-center gap-1.5 w-[65%]">
                                        <input
                                          type="color"
                                          value={lf.labelColor || lf.color || defaultColor}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setParcels(prev => prev.map(p => p.id === activeParcel.id ? {
                                              ...p,
                                              linearFeatures: p.linearFeatures?.map(item => item.id === lf.id ? { ...item, labelColor: val } : item)
                                            } : p));
                                          }}
                                          className="w-8 h-5 rounded cursor-pointer border border-slate-700 bg-transparent p-0"
                                        />
                                        <span className="text-[9px] font-mono text-emerald-400 font-bold">
                                          {lf.labelColor || lf.color || defaultColor}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Label Size Slider */}
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-[9px] text-slate-400 font-sans">
                                        {lang === "ar" ? "حجم التسمية (بكسل) :" : "Taille du texte (px) :"}
                                      </span>
                                      <div className="flex items-center gap-1.5 w-[65%]">
                                        <input
                                          type="range"
                                          min="6"
                                          max="18"
                                          step="0.5"
                                          value={lf.labelSize !== undefined ? lf.labelSize : 9.5}
                                          onChange={(e) => {
                                            const val = parseFloat(e.target.value);
                                            setParcels(prev => prev.map(p => p.id === activeParcel.id ? {
                                              ...p,
                                              linearFeatures: p.linearFeatures?.map(item => item.id === lf.id ? { ...item, labelSize: val } : item)
                                            } : p));
                                          }}
                                          className="w-full accent-emerald-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                                        />
                                        <span className="text-[9px] font-mono text-emerald-400 font-bold w-[25px] text-right shrink-0">
                                          {lf.labelSize !== undefined ? lf.labelSize : 9.5}
                                        </span>
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Document Print layout customizer panel */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 border-b border-slate-700 pb-2">
                <Settings className="w-4 h-4 text-emerald-400" />
                <h2 className="text-xs font-extrabold text-[#f3f4f6] uppercase tracking-widest leading-none font-sans">
                  {lang === "ar" ? "إعدادات المخطط والطباعة" : "Paramètres de Levée & Impression"}
                </h2>
              </div>

              {/* Form Grid */}
              <div className="grid grid-cols-1 gap-3.5 text-xs text-slate-300 font-sans">
                {/* Plan Document Title */}
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                    {lang === "ar" ? "العنوان الرئيسي للوثيقة" : "Titre Principal du Document"}
                  </label>
                  <input
                    type="text"
                    value={settings.planTitle}
                    onChange={(e) => setSettings({ ...settings, planTitle: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 font-bold text-slate-200 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[11px]"
                  />
                </div>

                {/* Column / Attribute Selector for Name */}
                {activeParcel.attributes && Object.keys(activeParcel.attributes).length > 0 && (
                  <div className="bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20 flex flex-col gap-1.5">
                    <label className="text-[10px] text-amber-400 uppercase tracking-wider block font-bold leading-normal">
                      {t.adoptNameFromTableBtn}
                    </label>
                    <select
                      value={selectedAttributeKey}
                      onChange={(e) => {
                        const key = e.target.value;
                        setSelectedAttributeKey(key);
                        if (key && activeParcel.attributes && activeParcel.attributes[key]) {
                          const attrVal = activeParcel.attributes[key];
                          setParcels(prev => prev.map(p => p.id === activeParcel.id ? { ...p, name: attrVal } : p));
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-slate-200 focus:ring-1 focus:ring-emerald-500 focus:outline-none font-sans"
                    >
                      <option value="">{t.importChooseColumn}</option>
                      {Object.keys(activeParcel.attributes).map((attrKey) => (
                        <option key={attrKey} value={attrKey}>
                          {attrKey} ({activeParcel.attributes![attrKey]})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Active Parcel Name Text Input (Editable) */}
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                    {t.parcelNameLabel}
                  </label>
                  <input
                    type="text"
                    value={getLocalizedParcelName(activeParcel, lang)}
                    onChange={(e) => {
                      const newName = e.target.value;
                      setParcels(prev => prev.map(p => p.id === activeParcel.id ? { ...p, name: newName } : p));
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 font-bold text-slate-200 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[11px]"
                  />
                </div>

                {/* Submitting Ministry French Text */}
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                    {lang === "ar" ? "الإصدار الإداري (الفرنسية)" : "Administration émettrice (Français)"}
                  </label>
                  <textarea
                    rows={3}
                    value={settings.ministryFr}
                    onChange={(e) => setSettings({ ...settings, ministryFr: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 font-sans text-slate-300 text-[10.5px] leading-relaxed focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Submitting Ministry Arabic Text */}
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                    {lang === "ar" ? "الإصدار الإداري (العربية)" : "Administration émettrice (Arabe)"}
                  </label>
                  <textarea
                    rows={3}
                    dir="rtl"
                    value={settings.ministryAr}
                    onChange={(e) => setSettings({ ...settings, ministryAr: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 font-sans text-slate-300 text-[11px] leading-relaxed focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Dossier N° / Service block */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                      {lang === "ar" ? "رقم الملف" : "Dossier N°"}
                    </label>
                    <input
                      type="text"
                      value={settings.dossierNumber}
                      onChange={(e) => setSettings({ ...settings, dossierNumber: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                      {lang === "ar" ? "مصلحة المسح" : "Service Topo"}
                    </label>
                    <input
                      type="text"
                      value={settings.service}
                      onChange={(e) => setSettings({ ...settings, service: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[10.5px]"
                    />
                  </div>
                </div>

                {/* Date Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                      {lang === "ar" ? "تاريخ المخطط" : "Date du Plan"}
                    </label>
                    <input
                      type="text"
                      value={settings.date}
                      onChange={(e) => setSettings({ ...settings, date: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                      {lang === "ar" ? "النظام الإحداثي" : "projection CRS"}
                    </label>
                    <select
                      value={settings.projectionSystem}
                      onChange={(e) => handleWorkspaceCRSChange(e.target.value as SupportedCRS)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[10px] text-slate-200"
                    >
                      {Object.entries(CRS_DETAILS).map(([crs, details]) => (
                        <option key={crs} value={crs}>
                          {crs} ({lang === "ar" ? details.arabic : details.name})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Grid Interval block & Compass size */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono_ tracking-normal">
                      {lang === "ar" ? "تباعد شبكة الإحداثيات (م)" : "Espacement Grille (m)"}
                    </label>
                    <input
                      type="number"
                      value={settings.gridInterval || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") {
                          setSettings({ ...settings, gridInterval: "" as any });
                        } else {
                          setSettings({ ...settings, gridInterval: parseFloat(val) || 0 });
                        }
                      }}
                      onBlur={() => {
                        if (!settings.gridInterval || settings.gridInterval < 0.1) {
                          setSettings({ ...settings, gridInterval: 50 });
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                      {lang === "ar" ? "تعليقات ومسميات" : "Annotations Carte"}
                    </label>
                    <select
                      value={settings.mapLabels}
                      onChange={(e: any) => setSettings({ ...settings, mapLabels: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[10.5px]"
                    >
                      <option value="Aucun">{lang === "ar" ? "اخفاء كل المسميات" : "Aucun"}</option>
                      <option value="Longueurs">{lang === "ar" ? "المسافات فقط" : "Longueurs"}</option>
                      <option value="Voisins">{lang === "ar" ? "أسماء المجاورين فقط" : "Voisins"}</option>
                      <option value="Longueurs + Voisins">{lang === "ar" ? "المسافات والمجاورين معاً" : "Longueurs + Voisins"}</option>
                    </select>
                  </div>
                </div>

                {/* Échelle Numérique Choice & Custom Scale Input */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                      {lang === "ar" ? "المقياس الإفتراضي" : "Échelle Numérique"}
                    </label>
                    <select
                      value={settings.scaleMode || "auto"}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          scaleMode: e.target.value as any,
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[10.5px]"
                    >
                      <option value="auto">{lang === "ar" ? "تلقائي" : "Auto-optimisé"}</option>
                      <option value="100">1 / 100</option>
                      <option value="250">1 / 250</option>
                      <option value="500">1 / 500</option>
                      <option value="1000">1 / 1000</option>
                      <option value="2500">1 / 2500</option>
                      <option value="5000">1 / 5000</option>
                      <option value="custom">{lang === "ar" ? "تعديل يدوي" : "Saisie Manuelle"}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                      {lang === "ar" ? "مقياس مخصص" : "Échelle Personnalisée"}
                    </label>
                    <input
                      type="number"
                      disabled={settings.scaleMode !== "custom"}
                      value={settings.scaleMode === "custom" ? (settings.customScale || "") : ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") {
                          setSettings({ ...settings, customScale: "" as any });
                        } else {
                          setSettings({ ...settings, customScale: parseInt(val) || 0 });
                        }
                      }}
                      onBlur={() => {
                        if (!settings.customScale || settings.customScale < 5) {
                          setSettings({ ...settings, customScale: 500 });
                        }
                      }}
                      placeholder="Ex: 500"
                      className="w-full bg-slate-900 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[10.5px]"
                    />
                  </div>
                </div>

                {/* Point Label Prefix Configuration */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                      {lang === "ar" ? "تسمية نقط الحدود" : "Préfixe des Sommets"}
                    </label>
                    <select
                      value={settings.vertexPrefixType || "P"}
                      onChange={(e) => {
                        const newType = e.target.value as "P" | "B" | "Custom" | "None";
                        setSettings((prev) => ({ ...prev, vertexPrefixType: newType }));
                        updateVertexLabels(newType, settings.customPrefix || "");
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[10.5px]"
                    >
                      <option value="P">{lang === "ar" ? "الحرف P (افتراضي)" : "P (Par défaut)"}</option>
                      <option value="B">{lang === "ar" ? "الحرف B (بورن)" : "B (Borne)"}</option>
                      <option value="None">{lang === "ar" ? "بدون حرف (أرقام فقط)" : "Sans lettre (Chiffres seuls)"}</option>
                      <option value="Custom">{lang === "ar" ? "بادئة مخصصة..." : "Personnalisé..."}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                      {lang === "ar" ? "بادئة مخصصة" : "Préfixe Perso."}
                    </label>
                    <input
                      type="text"
                      maxLength={10}
                      disabled={settings.vertexPrefixType !== "Custom"}
                      value={settings.customPrefix || ""}
                      onChange={(e) => {
                        const newVal = e.target.value;
                        setSettings((prev) => ({ ...prev, customPrefix: newVal }));
                        updateVertexLabels(settings.vertexPrefixType || "Custom", newVal);
                      }}
                      placeholder="Ex: T"
                      className="w-full bg-slate-900 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[10.5px]"
                    />
                  </div>
                </div>

                {/* Visual Label & Font Customization Controls */}
                <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/60 space-y-2.5">
                  <span className="text-[9.5px] font-bold text-emerald-400 uppercase tracking-wider block border-b border-slate-800 pb-1">
                    {lang === "ar" ? "تخصيص أبعاد وحجم الكتابة" : "Taille & Position des Textes"}
                  </span>
                  
                  {/* Vertex Font Size */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] text-slate-400 uppercase font-mono">
                        {lang === "ar" ? "حجم خط النقط (القمم)" : "Police des Sommets"}
                      </label>
                      <span className="text-[10px] text-amber-400 font-mono font-bold">
                        {settings.vertexFontSize || 8.5}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={4}
                      max={18}
                      step={0.5}
                      value={settings.vertexFontSize !== undefined ? settings.vertexFontSize : 8.5}
                      onChange={(e) => {
                        setSettings((prev) => ({ ...prev, vertexFontSize: parseFloat(e.target.value) }));
                      }}
                      className="w-full accent-emerald-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Label Font Size */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] text-slate-400 uppercase font-mono">
                        {lang === "ar" ? "حجم خط التسميات والتعليقات" : "Police des Étiquettes"}
                      </label>
                      <span className="text-[10px] text-amber-400 font-mono font-bold">
                        {settings.labelFontSize || 7.0}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={4}
                      max={18}
                      step={0.5}
                      value={settings.labelFontSize !== undefined ? settings.labelFontSize : 7.0}
                      onChange={(e) => {
                        setSettings((prev) => ({ ...prev, labelFontSize: parseFloat(e.target.value) }));
                      }}
                      className="w-full accent-emerald-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Label Offset */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] text-slate-400 uppercase font-mono">
                        {lang === "ar" ? "المسافة بين التسميات والضلع" : "Distance aux Limites"}
                      </label>
                      <span className="text-[10px] text-amber-400 font-mono font-bold">
                        {settings.labelOffset !== undefined ? settings.labelOffset : 7.0}m
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={30}
                      step={0.5}
                      value={settings.labelOffset !== undefined ? settings.labelOffset : 7.0}
                      onChange={(e) => {
                        setSettings((prev) => ({ ...prev, labelOffset: parseFloat(e.target.value) }));
                      }}
                      className="w-full accent-emerald-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                {/* CONFIGURATION DE LA LÉGENDE */}
                <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/60 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                    <span className="text-[9.5px] font-bold text-emerald-400 uppercase tracking-wider block">
                      {lang === "ar" ? "تخصيص مفتاح الخريطة" : "Légende de la Carte"}
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.legendEnabled !== false}
                        onChange={(e) => {
                          setSettings(prev => ({ ...prev, legendEnabled: e.target.checked }));
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-7 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>

                  {settings.legendEnabled !== false && (
                    <div className="space-y-2.5 animate-fade-in text-slate-300">
                      {/* Titles */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] text-slate-400 block mb-0.5 font-mono">
                            {lang === "ar" ? "العنوان بالعربية" : "Titre (Arabe)"}
                          </label>
                          <input
                            type="text"
                            value={settings.legendTitleAr || ""}
                            onChange={(e) => setSettings(prev => ({ ...prev, legendTitleAr: e.target.value }))}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-[10px] focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-slate-400 block mb-0.5 font-mono">
                            {lang === "ar" ? "العنوان بالفرنسية" : "Titre (Français)"}
                          </label>
                          <input
                            type="text"
                            value={settings.legendTitleFr || ""}
                            onChange={(e) => setSettings(prev => ({ ...prev, legendTitleFr: e.target.value }))}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-[10px] focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Position */}
                      <div>
                        <label className="text-[9px] text-slate-400 block mb-0.5 font-mono">
                          {lang === "ar" ? "موضع المفتاح" : "Position de la légende"}
                        </label>
                        <select
                          value={settings.legendPosition || "bottom-left"}
                          onChange={(e) => setSettings(prev => ({ ...prev, legendPosition: e.target.value as any }))}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-[10px] focus:ring-1 focus:ring-emerald-500 focus:outline-none text-slate-200"
                        >
                          <option value="bottom-left">{lang === "ar" ? "أسفل اليسار" : "En bas à gauche"}</option>
                          <option value="bottom-right">{lang === "ar" ? "أسفل اليمين" : "En bas à droite"}</option>
                          <option value="top-left">{lang === "ar" ? "أعلى اليسار" : "En haut à gauche"}</option>
                          <option value="top-right">{lang === "ar" ? "أعلى اليمين" : "En haut à droite"}</option>
                        </select>
                      </div>

                      {/* Toggle Boundary */}
                      <div className="border-t border-slate-800 pt-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9.5px] font-bold text-slate-400">
                            {lang === "ar" ? "حدود القطعة الأرضية" : "Limite de la parcelle"}
                          </span>
                          <input
                            type="checkbox"
                            checked={settings.legendShowBoundary !== false}
                            onChange={(e) => setSettings(prev => ({ ...prev, legendShowBoundary: e.target.checked }))}
                            className="accent-emerald-500 rounded"
                          />
                        </div>
                        {settings.legendShowBoundary !== false && (
                          <div className="grid grid-cols-2 gap-2 pl-2">
                            <div>
                              <input
                                type="text"
                                placeholder="العربية"
                                value={settings.legendBoundaryLabelAr || ""}
                                onChange={(e) => setSettings(prev => ({ ...prev, legendBoundaryLabelAr: e.target.value }))}
                                className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-[9.5px] focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <input
                                type="text"
                                placeholder="Français"
                                value={settings.legendBoundaryLabelFr || ""}
                                onChange={(e) => setSettings(prev => ({ ...prev, legendBoundaryLabelFr: e.target.value }))}
                                className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-[9.5px] focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Dynamic Linear Features list */}
                      {activeParcel.linearFeatures && activeParcel.linearFeatures.length > 0 && (
                        <div className="border-t border-slate-800 pt-2 space-y-2">
                          <span className="text-[9.5px] font-bold text-slate-400 block">
                            {lang === "ar" ? "تنسيق مسميات الخطوط المكتشفة :" : "Étiquettes des lignes détectées :"}
                          </span>
                          {Array.from(new Set(activeParcel.linearFeatures.map(lf => lf.type))).map(type => {
                            const defaultFr = 
                              type === "footpath" ? "Sentier" :
                              type === "agri_road" ? "Chemin agricole" :
                              type === "power_line" ? "Ligne électrique" :
                              type === "water_pipe" ? "Conduite d'eau" : "Réseau d'assainissement";
                            const defaultAr = 
                              type === "footpath" ? "طريق رجلية" :
                              type === "agri_road" ? "طريق فلاحية" :
                              type === "power_line" ? "خط تيار كهربائي" :
                              type === "water_pipe" ? "أنبوب ماء صالح للشرب" : "أنبوب تطهير السائل";

                            const isVisible = settings.legendItemVisibility?.[type] !== false;
                            const customLabel = settings.legendItemLabels?.[type] || `${defaultFr} / ${defaultAr}`;

                            return (
                              <div key={type} className="bg-slate-950/40 p-1.5 rounded border border-slate-800/80 space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] font-mono text-emerald-400">
                                    {type === "footpath" ? "🚶" : type === "agri_road" ? "🚜" : type === "power_line" ? "⚡" : type === "water_pipe" ? "💧" : "🚽"} {type}
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={isVisible}
                                    onChange={(e) => {
                                      const newVis = { ...(settings.legendItemVisibility || {}), [type as string]: e.target.checked };
                                      setSettings(prev => ({ ...prev, legendItemVisibility: newVis }));
                                    }}
                                    className="accent-emerald-500 rounded"
                                  />
                                </div>
                                {isVisible && (
                                  <input
                                    type="text"
                                    value={customLabel}
                                    onChange={(e) => {
                                      const newLabels = { ...(settings.legendItemLabels || {}), [type as string]: e.target.value };
                                      setSettings(prev => ({ ...prev, legendItemLabels: newLabels }));
                                    }}
                                    className="w-full bg-slate-950 border border-slate-850 rounded px-1.5 py-0.5 text-[9px] focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Dynamic Symbol Features list */}
                      {activeParcel.symbols && activeParcel.symbols.filter(s => s.type !== "custom_text").length > 0 && (
                        <div className="border-t border-slate-800 pt-2 space-y-2">
                          <span className="text-[9.5px] font-bold text-slate-400 block">
                            {lang === "ar" ? "تنسيق مسميات الرموز المكتشفة :" : "Étiquettes des symboles détectés :"}
                          </span>
                          {Array.from(new Set(activeParcel.symbols.filter(s => s.type !== "custom_text").map(s => s.type))).map(type => {
                            const defaultFr = 
                              type === "tree" ? "Arbre" :
                              type === "well" ? "Puits" :
                              type === "building" ? "Bâtiment" :
                              type === "mosque" ? "Mosquée" :
                              type === "palm" ? "Palmier" :
                              type === "reed" ? "Roseau" :
                              type === "grass" ? "Herbe" :
                              type === "transformer" ? "Transformateur" :
                              type === "olive" ? "Olivier" :
                              type === "geodetic" ? "Borne" :
                              type === "spring" ? "Source" : "Symbole";
                            const defaultAr = 
                              type === "tree" ? "شجرة" :
                              type === "well" ? "بئر" :
                              type === "building" ? "بناية" :
                              type === "mosque" ? "مسجد" :
                              type === "palm" ? "نخلة" :
                              type === "reed" ? "قصب" :
                              type === "grass" ? "عشب" :
                              type === "transformer" ? "محول كهربائي" :
                              type === "olive" ? "زيتون" :
                              type === "geodetic" ? "نقطة جيوديسية" :
                              type === "spring" ? "عين ماء" : "رمز";

                            const isVisible = settings.legendItemVisibility?.[type] !== false;
                            const customLabel = settings.legendItemLabels?.[type] || `${defaultFr} / ${defaultAr}`;

                            return (
                              <div key={type} className="bg-slate-950/40 p-1.5 rounded border border-slate-800/80 space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] font-mono text-amber-400">
                                    {type === "tree" ? "🌳" : type === "well" ? "🕳️" : type === "building" ? "🏠" : type === "mosque" ? "🕌" : type === "palm" ? "🌴" : "📍"} {type}
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={isVisible}
                                    onChange={(e) => {
                                      const newVis = { ...(settings.legendItemVisibility || {}), [type as string]: e.target.checked };
                                      setSettings(prev => ({ ...prev, legendItemVisibility: newVis }));
                                    }}
                                    className="accent-emerald-500 rounded"
                                  />
                                </div>
                                {isVisible && (
                                  <input
                                    type="text"
                                    value={customLabel}
                                    onChange={(e) => {
                                      const newLabels = { ...(settings.legendItemLabels || {}), [type as string]: e.target.value };
                                      setSettings(prev => ({ ...prev, legendItemLabels: newLabels }));
                                    }}
                                    className="w-full bg-slate-950 border border-slate-850 rounded px-1.5 py-0.5 text-[9px] focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                    </div>
                  )}
                </div>

                {/* Custom Logo Upload */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">
                      {lang === "ar" ? "تخصيص شعار الإدارة" : "Logo d'En-tête Personnalisé"}
                    </label>
                    {settings.logoUrl && (
                      <button
                        onClick={() => setSettings((prev) => ({ ...prev, logoUrl: "" }))}
                        className="text-[9px] text-amber-500 hover:text-amber-400 underline cursor-pointer"
                      >
                        {lang === "ar" ? "إعادة للشعار الافتراضي" : "Réinitialiser"}
                      </button>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg text-[10px] px-2 py-1 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </aside>

          {/* ======================================================== */}
          {/* B. CENTER & RIGHT WORKSPACE PANELS */}
          {/* ======================================================== */}
          <section className="col-span-12 xl:col-span-9 p-6 flex flex-col gap-6 overflow-y-auto max-h-[calc(100vh-80px)] bg-slate-900">
            {/* State widgets and stats readout */}
            <div className="bg-slate-800/80 p-4 rounded-xl border border-emerald-500/20 backdrop-blur-xs flex flex-wrap gap-4 items-center justify-between shadow-md">
              <div className="flex items-center gap-3 font-sans">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-505/30 flex items-center justify-center text-emerald-400 font-bold">
                  {activeParcel.vertices.length}
                </div>
                <div>
                  <span className="text-[10px] text-stone-400 uppercase tracking-widest font-sans">
                    {lang === "ar" ? "المنطقة الفعالة النشطة" : "Propriété active"}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <h3 className="text-sm font-bold text-slate-100">{getLocalizedParcelName(activeParcel, lang)}</h3>
                  </div>
                </div>
              </div>

              {/* Surface Stats readout */}
              <div className="flex flex-wrap gap-6 text-xs font-mono">
                <div className="bg-slate-900/40 px-3.5 py-2 rounded-lg border border-slate-700/60 text-right">
                  <span className="text-[8px] text-stone-400 uppercase tracking-widest block mb-0.5 font-sans">
                    {lang === "ar" ? "المساحة الإجمالية (م²)" : "Surface Globale (m²)"}
                  </span>
                  <span className="text-sm font-bold text-emerald-400">
                    {activeParcel.area.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} m²
                  </span>
                </div>
                <div className="bg-slate-900/40 px-3.5 py-2 rounded-lg border border-slate-700/60">
                  <span className="text-[8px] text-stone-400 uppercase tracking-widest block mb-0.5 font-sans">
                    {lang === "ar" ? "المساحة الفلاحية (هـ - آ - ج)" : "Contenance (ha - a - ca)"}
                  </span>
                  <span className="text-xs font-semibold text-amber-500 hover:text-amber-400 leading-tight">
                    {lang === "ar" ? formatAreaHac(activeParcel.area).ar : formatAreaHac(activeParcel.area).fr}
                  </span>
                </div>
                <div className="bg-slate-900/40 px-3.5 py-2 rounded-lg border border-slate-700/60 text-right">
                  <span className="text-[8px] text-stone-400 uppercase tracking-widest block mb-0.5 font-sans">
                    {lang === "ar" ? "محيط الحدود (م)" : "Périmètre Borne (m)"}
                  </span>
                  <span className="text-sm font-bold text-emerald-400">
                    {activeParcel.perimeter.toFixed(2)} m
                  </span>
                </div>
              </div>
            </div>

            {/* UPPER PANE: Professional Live Layout & Map Vector Canvas */}
            <div className="flex flex-col gap-2 bg-slate-800/40 p-3 rounded-2xl border border-slate-705/50 shadow-sm animate-fade-in">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <span className="text-xs font-bold text-slate-100 flex items-center gap-2 uppercase tracking-wider font-sans">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  {lang === "ar" ? "أداة المعاينة الحية التفاعلية والتحرير الجغرافي ذو الدقة العالية" : "Outil de Diagnostic Map et Édition Vectorielle en Temps Réel"}
                </span>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  {lang === "ar" ? "شاشة التشخيص والتحليل الهندسي" : "ÉCRAN DE DIAGNOSTIC ET CRÉATION CAO"}
                </span>
              </div>
              <p className="text-[10.5px] text-slate-400 px-1 leading-normal font-sans">
                {t.helpBody}
              </p>
              <div className="h-[650px] rounded-xl overflow-hidden shadow-2xl border border-slate-750 bg-slate-950 relative">
                <ParcelMap
                  parcel={activeParcel}
                  additionalParcels={additionalParcels}
                  settings={settings}
                  selectedVertexId={selectedVertexId}
                  selectedSegmentId={selectedSegmentId}
                  onVertexSelect={setSelectedVertexId}
                  onSegmentSelect={setSelectedSegmentId}
                  onVertexUpdate={handleVertexUpdate}
                  onAddVertex={handleAddVertex}
                  onDeleteVertex={handleDeleteVertex}
                  isDrawingMode={isDrawingMode}
                  setDrawingMode={setDrawingMode}
                  symbolToPlace={symbolToPlace}
                  symbolPlacementLabel={symbolPlacementLabel}
                  onPlacedSymbolDone={() => {
                    // Keep the symbol placement tool active for continuous multiple placements as requested by user.
                  }}
                  lineToPlace={lineToPlace}
                  linePlacementLabel={linePlacementLabel}
                  onPlacedLineDone={() => {
                    setLineToPlace(null);
                    setLinePlacementLabel("");
                  }}
                  customLineSpacing={customLineSpacing}
                  customLineThickness={customLineThickness}
                  customLineColor={customLineColor}
                  customLabelColor={customLabelColor}
                  customLabelSize={customLabelSize}
                  lang={lang}
                  onUpdateParcel={(updatedParcel) => {
                    setParcels((prev) => prev.map((p) => p.id === updatedParcel.id ? updatedParcel : p));
                  }}
                />
              </div>
            </div>

            {/* Low Pane: Dual Tables Layout Grid */}
            <div className="flex flex-col gap-8">
              {[activeParcel, ...additionalParcels].map((p) => {
                const isPrimary = p.id === selectedParcelId;
                const pNewVertex = newVertices[p.id] || { x: "", y: "" };
                
                return (
                  <div key={`tables-group-${p.id}`} className="flex flex-col gap-3 bg-slate-850/20 p-4 rounded-2xl border border-slate-800/80">
                    {/* Parcel Table Section Title */}
                    <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                      <div className="flex items-center gap-2 font-sans">
                        <span className={`w-2.5 h-2.5 rounded-full ${isPrimary ? 'bg-emerald-500' : 'bg-purple-500'}`}></span>
                        <h4 className="text-sm font-bold text-slate-200">
                          {lang === "ar" 
                            ? `جداول القياسات والحدود لـ: ${getLocalizedParcelName(p, lang)} ${isPrimary ? "(الرئيسية)" : "(مضافة)"}`
                            : lang === "en"
                            ? `Measurement & boundary tables for: ${getLocalizedParcelName(p, lang)} ${isPrimary ? "(Primary)" : "(Added)"}`
                            : `Mesures et limites de : ${getLocalizedParcelName(p, lang)} ${isPrimary ? "(Principale)" : "(Jointe)"}`
                          }
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2.5 py-0.5 rounded border border-slate-800/60 font-sans">
                        {p.vertices.length} {lang === "ar" ? "قمم" : "Sommets"} | {p.area.toFixed(2)} m²
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                      {/* Table Left: Point details & X-Y Lambert Metris */}
                      <div className="bg-slate-800/60 border border-slate-700/60 p-5 rounded-xl flex flex-col gap-4">
                        <div className="flex items-center justify-between border-b border-slate-700 pb-2.5">
                          <div className="flex items-center gap-2">
                            <Table className="w-4 h-4 text-amber-400" />
                            <h3 className="text-[12px] font-bold text-slate-100 uppercase tracking-wider font-sans">
                              {t.verticesTableTitle}
                            </h3>
                          </div>
                          <span className="text-[9px] font-mono text-slate-500 uppercase">{lang === "ar" ? "سحب وإفلات متزامن" : "Interactive Drag Sync"}</span>
                        </div>

                        <div className="overflow-x-auto max-h-[220px]">
                          <table className="w-full text-left bg-slate-900 p-1.5 rounded border border-slate-800/80 font-mono text-xs">
                            <thead>
                              <tr className="bg-slate-850/50 text-slate-400 border-b border-slate-700 font-sans">
                                <th className="px-3 py-2 text-center">{t.thVertexName}</th>
                                <th className="px-3 py-2 text-right">{lang === "ar" ? "إحداثي لومبرت X (م)" : "Raw X (m)"}</th>
                                <th className="px-3 py-2 text-right">{lang === "ar" ? "إحداثي لومبرت Y (م)" : "Raw Y (m)"}</th>
                                <th className="px-3 py-2 text-center">{lang === "ar" ? "حذف" : "Retirer"}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                              {p.vertices.map((v) => {
                                const isHighlight = selectedVertexId === v.id;
                                return (
                                  <tr
                                    key={v.id}
                                    className={`transition-colors whitespace-nowrap ${
                                      isHighlight ? "bg-red-950/45 text-[#fff]" : "hover:bg-slate-800/30 text-slate-300"
                                    }`}
                                    onMouseEnter={() => setSelectedVertexId(v.id)}
                                    onMouseLeave={() => setSelectedVertexId(null)}
                                  >
                                    <td className="px-3 py-2 text-center font-bold text-amber-400">{v.label}</td>
                                    <td className="px-3 py-2">
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={v.x}
                                        onChange={(e) => handleVertexUpdate(v.id, parseFloat(e.target.value) || 0, v.y, p.id)}
                                        className="bg-slate-950 border border-slate-700/50 hover:border-slate-600 focus:border-emerald-500 focus:outline-none w-full text-right px-2 py-1.5 rounded text-xs font-bold font-mono text-slate-200"
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={v.y}
                                        onChange={(e) => handleVertexUpdate(v.id, v.x, parseFloat(e.target.value) || 0, p.id)}
                                        className="bg-slate-950 border border-slate-700/50 hover:border-slate-600 focus:border-emerald-500 focus:outline-none w-full text-right px-2 py-1.5 rounded text-xs font-bold font-mono text-slate-200"
                                      />
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <button
                                        onClick={() => handleDeleteVertex(v.id, p.id)}
                                        className="text-slate-500 hover:text-red-400 p-1 rounded-md transition"
                                        title={lang === "ar" ? "حذف نقطة الحدود هذه" : "Supprimer ce point de borne d'angle"}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Add vertex inline submit bar */}
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const xVal = parseFloat(pNewVertex.x);
                            const yVal = parseFloat(pNewVertex.y);
                            if (isNaN(xVal) || isNaN(yVal)) {
                              alert("Veuillez saisir des coordonnées numériques valides.");
                              return;
                            }
                            handleAddVertex(xVal, yVal, undefined, p.id);
                            setNewVertices(prev => ({
                              ...prev,
                              [p.id]: { x: "", y: "" }
                            }));
                          }}
                          className="mt-2 grid grid-cols-12 gap-2 border-t border-slate-700/40 pt-3"
                        >
                          <label className="col-span-12 text-[9px] text-slate-400 uppercase tracking-wider font-sans">
                            {lang === "ar" ? "إضافة نقطة زاوية جديدة للمضلع :" : "Ajouter Sommet aux Bornes existantes :"}
                          </label>
                          <div className="col-span-5">
                            <input
                              type="number"
                              step="0.01"
                              required
                              placeholder={lang === "ar" ? "الإحداثي X" : "Coordonnée X"}
                              value={pNewVertex.x}
                              onChange={(e) => setNewVertices(prev => ({
                                ...prev,
                                [p.id]: { ...pNewVertex, x: e.target.value }
                              }))}
                              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 w-full text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>
                          <div className="col-span-5">
                            <input
                              type="number"
                              step="0.01"
                              required
                              placeholder={lang === "ar" ? "الإحداثي Y" : "Coordonnée Y"}
                              value={pNewVertex.y}
                              onChange={(e) => setNewVertices(prev => ({
                                ...prev,
                                [p.id]: { ...pNewVertex, y: e.target.value }
                              }))}
                              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 w-full text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>
                          <button
                            type="submit"
                            className="col-span-2 bg-emerald-800 hover:bg-emerald-700 rounded text-white flex items-center justify-center transition"
                            title={t.addVertexBtn}
                          >
                            <PlusCircle className="w-4 h-4" />
                          </button>
                        </form>
                      </div>

                      {/* Table Right: Segment ranges & Neighbor titles Alignment */}
                      <div className="bg-slate-800/60 border border-slate-700/60 p-5 rounded-xl flex flex-col gap-4">
                        <div className="flex items-center justify-between border-b border-slate-700 pb-2.5">
                          <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-emerald-400" />
                            <h3 className="text-[12px] font-bold text-slate-100 uppercase tracking-wider font-sans">
                              {t.alignmentsTableTitle}
                            </h3>
                          </div>
                          <span className="text-[9px] font-mono text-slate-500 uppercase">{lang === "ar" ? "ملصقات الخريطة المطبوعة" : "Printed Map Labels"}</span>
                        </div>

                        <div className="overflow-y-auto max-h-[290px]">
                          <table className="w-full text-left bg-slate-900 p-1.5 rounded border border-slate-800/80 text-xs">
                            <thead>
                              <tr className="bg-slate-850/50 text-slate-400 border-b border-slate-700 leading-none font-sans">
                                <th className="px-3 py-2 font-mono">{t.thSegment}</th>
                                <th className="px-3 py-2 text-right font-mono">{lang === "ar" ? "المسافة (م)" : "Distance (m)"}</th>
                                <th className="px-3 py-2 font-sans text-right">{lang === "ar" ? "خطوط الحدود / المجاورون" : "Limite de Voisinage / Voisin"}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50 text-xs text-slate-300">
                              {p.segments.map((s) => {
                                const isHighlight = selectedSegmentId === s.id;
                                return (
                                  <tr
                                    key={s.id}
                                    className={`transition-colors whitespace-nowrap ${
                                      isHighlight ? "bg-red-950/45 text-[#fff]" : "hover:bg-slate-800/30 text-slate-300"
                                    }`}
                                    onMouseEnter={() => setSelectedSegmentId(s.id)}
                                    onMouseLeave={() => setSelectedSegmentId(null)}
                                  >
                                    <td className="px-3 py-2 font-bold font-mono text-amber-400 whitespace-nowrap">
                                      {s.startLabel} - {s.endLabel}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono font-bold whitespace-nowrap">
                                      {s.length.toFixed(2)} m
                                    </td>
                                    <td className="px-3 py-2">
                                      <input
                                        type="text"
                                        value={s.neighbor}
                                        placeholder={t.placeholderVoisin}
                                        onChange={(e) => handleNeighborUpdate(s.id, e.target.value, p.id)}
                                        className="bg-slate-950 border border-slate-700/50 hover:border-slate-600 focus:border-emerald-500 focus:outline-none w-full text-left px-2 py-1.5 rounded text-xs font-semibold font-sans text-slate-200"
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Technical warning block */}
                        {isPrimary && (
                          <div className="bg-emerald-950/30 rounded-lg p-3 ring-1 ring-emerald-500/10 text-emerald-400 text-[10px] leading-relaxed select-none font-sans">
                            {lang === "ar" ? (
                              <span>💡 <b>معلومة ذكية :</b> يمكنك أيضاً سحب وإزاحة أي نقطة حدود حمراء مباشرة على الخريطة ! وسيتم إعادة حساب المسافات والمساحة الإجمالية تلقائياً في نفس اللحظة.</span>
                            ) : (
                              <span>💡 <b>Astuce pro :</b> Vous pouvez également faire glisser n'importe quelle borne d'angle directement sur le canevas de carte ci-dessus ! Les distances et la surface se recalculeront instantanément.</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

