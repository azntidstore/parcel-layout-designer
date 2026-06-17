import { Vertex, Parcel } from "../types";
// @ts-ignore
import shp from "shpjs";
import JSZip from "jszip";
// @ts-ignore
import * as XLSX from "xlsx";

export interface ParsedFeature {
  name: string;
  vertices: { x: number; y: number }[]; // loaded coordinates
  isGeographic: boolean; // true if coordinates are dec degrees [Lng, Lat]
  attributes: Record<string, string>;
}

/**
 * Parses raw GeoJSON coordinate arrays into vertices.
 */
function parseCoordinates(coords: any[][]): { vertices: { x: number; y: number }[]; isGeographic: boolean } {
  const vertices: { x: number; y: number }[] = [];
  const outerRing = coords[0];
  if (!outerRing) return { vertices: [], isGeographic: false };

  let looksGeographic = true;

  outerRing.forEach((c: any) => {
    const lng = c[0];
    const lat = c[1];
    if (typeof lng === "number" && typeof lat === "number") {
      vertices.push({ x: lng, y: lat });
      
      // If it's outside geographic bounds, it must be projected meters
      if (Math.abs(lng) > 180 || Math.abs(lat) > 90) {
        looksGeographic = false;
      }
    }
  });

  // Clean winding coordinates (remove closing duplicate if any)
  if (vertices.length > 3) {
    const first = vertices[0];
    const last = vertices[vertices.length - 1];
    if (Math.abs(first.x - last.x) < 0.0001 && Math.abs(first.y - last.y) < 0.0001) {
      vertices.pop();
    }
  }

  return {
    vertices,
    isGeographic: looksGeographic && vertices.length > 0,
  };
}

/**
 * Converts a GeoJSON Feature or FeatureCollection (possibly from shpjs) into our list of ParsedFeatures.
 */
export function convertGeoJSONToParsedFeatures(geojson: any, fallbackName: string = "Parcelle"): ParsedFeature[] {
  const features: ParsedFeature[] = [];

  const handleFeature = (feat: any, index: number) => {
    const geom = feat.geometry;
    if (!geom) return;

    const properties = feat.properties || {};
    const attributes: Record<string, string> = {};
    Object.keys(properties).forEach((k) => {
      attributes[k] = properties[k] !== null && properties[k] !== undefined ? String(properties[k]).trim() : "";
    });

    // Try multiple candidate fields for default Name
    const nameCandidates = ["name", "Nom", "nom", "id", "ID", "TITRE", "titre", "TFX", "tfx", "Name", "NAME", "parcel_id", "parcelle", "ref"];
    let name = "";
    for (const cand of nameCandidates) {
      if (attributes[cand]) {
        name = attributes[cand];
        break;
      }
    }
    if (!name) {
      name = `${fallbackName} ${index + 1}`;
    }

    if (geom.type === "Polygon") {
      const parsed = parseCoordinates(geom.coordinates);
      if (parsed.vertices.length >= 3) {
        features.push({
          name,
          vertices: parsed.vertices,
          isGeographic: parsed.isGeographic,
          attributes,
        });
      }
    } else if (geom.type === "MultiPolygon") {
      geom.coordinates.forEach((polyCoords: any[][], polyIdx: number) => {
        const parsed = parseCoordinates(polyCoords);
        if (parsed.vertices.length >= 3) {
          features.push({
            name: `${name} (Partie ${polyIdx + 1})`,
            vertices: parsed.vertices,
            isGeographic: parsed.isGeographic,
            attributes,
          });
        }
      });
    }
  };

  if (!geojson) return features;

  if (Array.isArray(geojson)) {
    geojson.forEach((layerItem, layerIdx) => {
      const subFeatures = convertGeoJSONToParsedFeatures(layerItem, `${fallbackName}-L${layerIdx + 1}`);
      features.push(...subFeatures);
    });
  } else if (geojson.type === "FeatureCollection" && Array.isArray(geojson.features)) {
    geojson.features.forEach((feat: any, idx: number) => {
      handleFeature(feat, idx);
    });
  } else if (geojson.type === "Feature") {
    handleFeature(geojson, 0);
  } else if (geojson.type === "Polygon") {
    const parsed = parseCoordinates(geojson.coordinates);
    if (parsed.vertices.length >= 3) {
      features.push({
        name: fallbackName,
        vertices: parsed.vertices,
        isGeographic: parsed.isGeographic,
        attributes: {},
      });
    }
  }

  return features;
}

/**
 * Real client-side KML Polygon/LineString parser using standard DOMParser.
 */
export function parseKML(text: string): ParsedFeature[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "text/xml");
  const placemarks = xmlDoc.getElementsByTagName("Placemark");
  const features: ParsedFeature[] = [];

  for (let i = 0; i < placemarks.length; i++) {
    const pm = placemarks[i];
    
    // Get name & attributes
    let name = "";
    const nameNode = pm.getElementsByTagName("name")[0];
    if (nameNode && nameNode.textContent) {
      name = nameNode.textContent.trim();
    }

    const attributes: Record<string, string> = {
      ID: `KML-${i + 1}`,
      Nom: name,
      Source: "KML Import",
    };

    // Parse extended data schemas if any exist
    const dataNodes = pm.getElementsByTagName("SimpleData");
    for (let d = 0; d < dataNodes.length; d++) {
      const dataNode = dataNodes[d];
      const attrName = dataNode.getAttribute("name");
      if (attrName && dataNode.textContent) {
        attributes[attrName] = dataNode.textContent.trim();
      }
    }

    // Now look for ALL <coordinates> nodes within this placemark to support LineString, Polygon, MultiGeometry, etc.
    const coordsNodes = pm.getElementsByTagName("coordinates");
    let geomIdx = 0;
    for (let cIdx = 0; cIdx < coordsNodes.length; cIdx++) {
      const coordsNode = coordsNodes[cIdx];
      if (!coordsNode || !coordsNode.textContent) continue;

      let rawCoords = coordsNode.textContent.trim();
      if (!rawCoords) continue;

      // Handle space variations: Replace spaces around commas first
      rawCoords = rawCoords.replace(/\s*,\s*/g, ",");
      
      // Coordinate sequences in KML are separated by whitespace (spaces, newlines, tabs)
      const coordinatePairs = rawCoords.split(/\s+/);
      const vertices: { x: number; y: number }[] = [];

      coordinatePairs.forEach((pair) => {
        const parts = pair.split(",");
        if (parts.length >= 2) {
          const lng = parseFloat(parts[0]);
          const lat = parseFloat(parts[1]);
          if (!isNaN(lng) && !isNaN(lat)) {
            vertices.push({ x: lng, y: lat });
          }
        }
      });

      // Clean winding coordinates (remove closing duplicate if any)
      if (vertices.length > 3) {
        const first = vertices[0];
        const last = vertices[vertices.length - 1];
        if (Math.abs(first.x - last.x) < 0.0001 && Math.abs(first.y - last.y) < 0.0001) {
          vertices.pop();
        }
      }

      if (vertices.length >= 3) {
        const finalName = name 
          ? (coordsNodes.length > 1 ? `${name} (Geométrie ${geomIdx + 1})` : name) 
          : `Parcelle KML ${features.length + 1}`;
        features.push({
          name: finalName,
          vertices,
          isGeographic: true, // KML always geographic (WGS84)
          attributes: { ...attributes, Nom: finalName },
        });
        geomIdx++;
      }
    }
  }

  // If no Placemarks with coordinates, try searching coordinates globally in case of simpler KML structures
  if (features.length === 0) {
    const coordsNodes = xmlDoc.getElementsByTagName("coordinates");
    for (let cIdx = 0; cIdx < coordsNodes.length; cIdx++) {
      const coordsNode = coordsNodes[cIdx];
      if (!coordsNode || !coordsNode.textContent) continue;
      
      let rawCoords = coordsNode.textContent.trim();
      if (!rawCoords) continue;
      
      rawCoords = rawCoords.replace(/\s*,\s*/g, ",");
      const coordinatePairs = rawCoords.split(/\s+/);
      const vertices: { x: number; y: number }[] = [];
      
      coordinatePairs.forEach((pair) => {
        const parts = pair.split(",");
        if (parts.length >= 2) {
          const lng = parseFloat(parts[0]);
          const lat = parseFloat(parts[1]);
          if (!isNaN(lng) && !isNaN(lat)) {
            vertices.push({ x: lng, y: lat });
          }
        }
      });
      
      if (vertices.length > 3) {
        const first = vertices[0];
        const last = vertices[vertices.length - 1];
        if (Math.abs(first.x - last.x) < 0.0001 && Math.abs(first.y - last.y) < 0.0001) {
          vertices.pop();
        }
      }
      
      if (vertices.length >= 3) {
        features.push({
          name: `Parcelle KML Globale #${features.length + 1}`,
          vertices,
          isGeographic: true,
          attributes: { Source: "KML Direct Coordinates" },
        });
      }
    }
  }

  return features;
}

/**
 * Real client-side DXF LWPOLYLINE/POLYLINE/LINE coordinate extraction parser.
 * Auto-assembles disjoint LINE segments into continuous polygons.
 */
export function parseDXF(text: string): ParsedFeature[] {
  const lines = text.split(/\r?\n/);
  const pairs: { code: number; value: string }[] = [];
  
  let i = 0;
  while (i < lines.length) {
    const codeStr = lines[i].trim();
    if (codeStr === "") {
      i++;
      continue;
    }
    const code = parseInt(codeStr, 10);
    if (isNaN(code)) {
      i++;
      continue;
    }
    const value = lines[i + 1] ? lines[i + 1].trim() : "";
    pairs.push({ code, value });
    i += 2;
  }

  const simplePolylines: { vertices: { x: number; y: number }[]; layer: string; isClosed: boolean }[] = [];
  const rawLines: { p1: { x: number; y: number }; p2: { x: number; y: number }; layer: string }[] = [];

  let currentEntityName: string | null = null;
  let currentLayer = "0";

  // POLYLINE sub-entity parsing state
  const activePolylineVertices: { x: number; y: number }[] = [];
  let activePolylineLayer = "0";
  let activePolylineClosed = false;

  // Transient builders for active LWPOLYLINE and LINE entities
  let currentLWVertices: { x: number; y: number }[] = [];
  let currentLWClosed = false;

  let currentLineStart: { x: number; y: number } | null = null;
  let currentLineEnd: { x: number; y: number } | null = null;

  let vertexX: number = NaN;
  let vertexY: number = NaN;

  const commitPrevious = () => {
    if (currentEntityName === "LWPOLYLINE") {
      if (currentLWVertices.length >= 2) {
        simplePolylines.push({
          vertices: [...currentLWVertices],
          layer: currentLayer,
          isClosed: currentLWClosed,
        });
      }
      currentLWVertices = [];
      currentLWClosed = false;
    } else if (currentEntityName === "LINE") {
      if (currentLineStart && currentLineEnd) {
        rawLines.push({
          p1: { ...currentLineStart },
          p2: { ...currentLineEnd },
          layer: currentLayer,
        });
      }
      currentLineStart = null;
      currentLineEnd = null;
    }
  };

  for (const pair of pairs) {
    const { code, value } = pair;
    const valUpper = value.toUpperCase();

    if (code === 0) {
      commitPrevious();
      currentEntityName = valUpper;

      if (valUpper === "POLYLINE") {
        activePolylineVertices.length = 0;
        activePolylineLayer = currentLayer;
        activePolylineClosed = false;
      } else if (valUpper === "VERTEX") {
        vertexX = NaN;
        vertexY = NaN;
      } else if (valUpper === "SEQEND") {
        if (activePolylineVertices.length >= 2) {
          simplePolylines.push({
            vertices: [...activePolylineVertices],
            layer: activePolylineLayer,
            isClosed: activePolylineClosed,
          });
        }
        activePolylineVertices.length = 0;
      }
    } else {
      if (code === 8) {
        currentLayer = value;
        if (currentEntityName === "POLYLINE") {
          activePolylineLayer = value;
        }
      } else if (code === 70) {
        const flag = parseInt(value, 10);
        if (!isNaN(flag)) {
          if (currentEntityName === "LWPOLYLINE") {
            currentLWClosed = (flag & 1) !== 0;
          } else if (currentEntityName === "POLYLINE") {
            activePolylineClosed = (flag & 1) !== 0;
          }
        }
      }

      // LWPOLYLINE vertex parsing
      if (currentEntityName === "LWPOLYLINE") {
        if (code === 10) {
          currentLWVertices.push({ x: parseFloat(value), y: 0 });
        } else if (code === 20) {
          if (currentLWVertices.length > 0) {
            currentLWVertices[currentLWVertices.length - 1].y = parseFloat(value);
          }
        }
      } 
      // VERTEX processing for older POLYLINE
      else if (currentEntityName === "VERTEX") {
        if (code === 10) {
          vertexX = parseFloat(value);
        } else if (code === 20) {
          vertexY = parseFloat(value);
          if (!isNaN(vertexX) && !isNaN(vertexY)) {
            activePolylineVertices.push({ x: vertexX, y: vertexY });
          }
        }
      } 
      // LINE segment processing
      else if (currentEntityName === "LINE") {
        if (code === 10) {
          if (!currentLineStart) currentLineStart = { x: 0, y: 0 };
          currentLineStart.x = parseFloat(value);
        } else if (code === 20) {
          if (!currentLineStart) currentLineStart = { x: 0, y: 0 };
          currentLineStart.y = parseFloat(value);
        } else if (code === 11) {
          if (!currentLineEnd) currentLineEnd = { x: 0, y: 0 };
          currentLineEnd.x = parseFloat(value);
        } else if (code === 21) {
          if (!currentLineEnd) currentLineEnd = { x: 0, y: 0 };
          currentLineEnd.y = parseFloat(value);
        }
      }
    }
  }

  // Commit last parsed entity
  commitPrevious();

  // Jointure algorithm for loose LINE segments (highly common in surveyor CAD exports)
  // We use an O(N) Spatial Hashing / Hash Grid approach that groups segments by layer,
  // preventing browser tab freeze on large DXF files.
  interface Point { x: number; y: number; }
  const gridSize = 0.1; // 10 cm grid bucket 
  const tolerance = 0.02; // 2 cm matching tolerance
  const toleranceSq = tolerance * tolerance;

  const getGridKeys = (p: Point): string[] => {
    const gx = Math.round(p.x / gridSize);
    const gy = Math.round(p.y / gridSize);
    const keys: string[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        keys.push(`${gx + dx},${gy + dy}`);
      }
    }
    return keys;
  };

  const getPrimaryGridKey = (p: Point): string => {
    return `${Math.round(p.x / gridSize)},${Math.round(p.y / gridSize)}`;
  };

  // Group raw lines by layer
  const linesByLayer: Record<string, typeof rawLines> = {};
  for (const line of rawLines) {
    if (!linesByLayer[line.layer]) {
      linesByLayer[line.layer] = [];
    }
    linesByLayer[line.layer].push(line);
  }

  for (const [layer, layerLines] of Object.entries(linesByLayer)) {
    // Safety guard to avoid parsing astronomical drawings that are not land parcels
    if (layerLines.length > 15000) {
      console.warn(`Calque ${layer} contient trop de lignes libres (${layerLines.length}). Suspension du regroupement automatique.`);
      continue;
    }

    const wrapped = layerLines.map((l, idx) => ({
      id: idx,
      p1: l.p1,
      p2: l.p2,
      used: false,
    }));

    // Build the grid index for both endpoints
    const grid = new Map<string, typeof wrapped>();
    const addToGrid = (p: Point, item: typeof wrapped[0]) => {
      const key = getPrimaryGridKey(p);
      let list = grid.get(key);
      if (!list) {
        list = [];
        grid.set(key, list);
      }
      list.push(item);
    };

    for (const item of wrapped) {
      addToGrid(item.p1, item);
      addToGrid(item.p2, item);
    }

    // Helper to find an unused adjacent segment
    const findAdjacent = (p: Point): { item: typeof wrapped[0]; isP1: boolean } | null => {
      const keys = getGridKeys(p);
      for (const key of keys) {
        const candidates = grid.get(key);
        if (!candidates) continue;
        for (const cand of candidates) {
          if (cand.used) continue;
          
          // Check distance to p1
          const distSq1 = (cand.p1.x - p.x) ** 2 + (cand.p1.y - p.y) ** 2;
          if (distSq1 <= toleranceSq) {
            return { item: cand, isP1: true };
          }
          // Check distance to p2
          const distSq2 = (cand.p2.x - p.x) ** 2 + (cand.p2.y - p.y) ** 2;
          if (distSq2 <= toleranceSq) {
            return { item: cand, isP1: false };
          }
        }
      }
      return null;
    };

    for (const startItem of wrapped) {
      if (startItem.used) continue;

      startItem.used = true;
      const path: Point[] = [startItem.p1, startItem.p2];

      // Grow path from end
      let growing = true;
      while (growing) {
        const endPoint = path[path.length - 1];
        const next = findAdjacent(endPoint);
        if (next) {
          next.item.used = true;
          path.push(next.isP1 ? next.item.p2 : next.item.p1);
        } else {
          growing = false;
        }
      }

      // Grow path from start (prepend)
      growing = true;
      while (growing) {
        const startPoint = path[0];
        const next = findAdjacent(startPoint);
        if (next) {
          next.item.used = true;
          path.unshift(next.isP1 ? next.item.p2 : next.item.p1);
        } else {
          growing = false;
        }
      }

      if (path.length >= 3) {
        const startPoint = path[0];
        const endPoint = path[path.length - 1];
        const isClosed = (startPoint.x - endPoint.x) ** 2 + (startPoint.y - endPoint.y) ** 2 <= toleranceSq;
        simplePolylines.push({
          vertices: path,
          layer,
          isClosed,
        });
      }
    }
  }

  // Convert all gathered polylines to ParsedFeatures
  const features: ParsedFeature[] = [];

  simplePolylines.forEach((poly) => {
    const vertices = [...poly.vertices];

    if (vertices.length > 3) {
      const first = vertices[0];
      const last = vertices[vertices.length - 1];
      if (Math.abs(first.x - last.x) < 0.005 && Math.abs(first.y - last.y) < 0.005) {
        vertices.pop();
      }
    }

    if (vertices.length >= 3) {
      const displayName = poly.layer !== "0" ? poly.layer : "Parcelle DXF";
      features.push({
        name: `${displayName} #${features.length + 1}`,
        vertices,
        isGeographic: false,
        attributes: {
          ID: `DXF-${features.length + 1}`,
          Calque: poly.layer,
          Type: poly.isClosed ? "Contour Fermé" : "Contour Ouvert",
          Métrique: "Projetée locale",
          Points: String(vertices.length),
        }
      });
    }
  });

  return features;
}

/**
 * Flexible client-side GeoJSON Polygon parser supporting multiple features.
 */
export function parseGeoJSON(text: string): ParsedFeature[] {
  const geojson = JSON.parse(text);
  return convertGeoJSONToParsedFeatures(geojson, "Parcelle GeoJSON");
}

/**
 * Real client-side Shapefile parser for zipped shapefiles.
 * Extracts the raw, highly precise coordinate arrays bypassing the inaccurate .prj conversions in shpjs.
 */
export async function parseShapefileZip(buffer: ArrayBuffer): Promise<ParsedFeature[]> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    
    // Find files ending with .shp and .dbf
    const shpFileEntry = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith(".shp"));
    const dbfFileEntry = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith(".dbf"));
    
    if (!shpFileEntry) {
      throw new Error("No .shp file found in ZIP archive.");
    }
    
    const shpBuffer = await shpFileEntry.async("arraybuffer");
    let geojson;
    
    if (dbfFileEntry) {
      const dbfBuffer = await dbfFileEntry.async("arraybuffer");
      // @ts-ignore
      const parsedShp = shp.parseShp(shpBuffer);
      // @ts-ignore
      const parsedDbf = shp.parseDbf(dbfBuffer);
      // @ts-ignore
      geojson = shp.combine([parsedShp, parsedDbf]);
    } else {
      // @ts-ignore
      const parsedShp = shp.parseShp(shpBuffer);
      // @ts-ignore
      geojson = shp.combine([parsedShp, []]);
    }
    
    return convertGeoJSONToParsedFeatures(geojson, "Parcelle SHP");
  } catch (err) {
    console.error("Error in parseShapefileZip:", err);
    // Fallback to default shpjs if manual unzip fails
    try {
      const geojson = await shp(buffer);
      return convertGeoJSONToParsedFeatures(geojson, "Parcelle SHP");
    } catch (fallbackErr) {
      throw err;
    }
  }
}

/**
 * Real client-side Shapefile parser for individual .shp and .dbf files selected together.
 */
export async function parseShapefilePair(shpBuffer: ArrayBuffer, dbfBuffer: ArrayBuffer): Promise<ParsedFeature[]> {
  try {
    // @ts-ignore
    const parsedShp = shp.parseShp(shpBuffer);
    // @ts-ignore
    const parsedDbf = shp.parseDbf(dbfBuffer);
    // @ts-ignore
    const geojson = shp.combine([parsedShp, parsedDbf]);
    return convertGeoJSONToParsedFeatures(geojson, "Parcelle SHP");
  } catch (err) {
    console.error("Error in parseShapefilePair:", err);
    throw err;
  }
}

/**
 * Client-side XML GPX Parser.
 * Auto-extracts `<trkpt>`, `<rtept>` and `<wpt>` coordinates and groups them into polygons.
 */
export function parseGPX(text: string): ParsedFeature[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "text/xml");
  const features: ParsedFeature[] = [];

  // 1. Process Tracks (<trk>)
  const tracks = xmlDoc.getElementsByTagName("trk");
  for (let i = 0; i < tracks.length; i++) {
    const trk = tracks[i];
    let name = "";
    const nameNode = trk.getElementsByTagName("name")[0];
    if (nameNode && nameNode.textContent) {
      name = nameNode.textContent.trim();
    }
    if (!name) {
      name = `Trace GPX N°${i + 1}`;
    }

    const segments = trk.getElementsByTagName("trkseg");
    for (let sIdx = 0; sIdx < segments.length; sIdx++) {
      const seg = segments[sIdx];
      const pts = seg.getElementsByTagName("trkpt");
      const vertices: { x: number; y: number }[] = [];
      
      for (let pIdx = 0; pIdx < pts.length; pIdx++) {
        const pt = pts[pIdx];
        const latAttr = pt.getAttribute("lat");
        const lonAttr = pt.getAttribute("lon");
        if (latAttr && lonAttr) {
          const lat = parseFloat(latAttr);
          const lon = parseFloat(lonAttr);
          if (!isNaN(lat) && !isNaN(lon)) {
            // Geographic standard (x = Longitude, y = Latitude)
            vertices.push({ x: lon, y: lat });
          }
        }
      }

      // Drop closing coordinate if it duplicates the first (standard polygon closing)
      if (vertices.length > 3) {
        const first = vertices[0];
        const last = vertices[vertices.length - 1];
        if (Math.abs(first.x - last.x) < 0.0001 && Math.abs(first.y - last.y) < 0.0001) {
          vertices.pop();
        }
      }

      if (vertices.length >= 3) {
        features.push({
          name: segments.length > 1 ? `${name} (Segment ${sIdx + 1})` : name,
          vertices,
          isGeographic: true,
          attributes: {
            Type: "Trace GPX",
            Points: String(vertices.length),
            Source: "GPX Import",
          }
        });
      }
    }
  }

  // 2. Process Routes (<rte>)
  const routes = xmlDoc.getElementsByTagName("rte");
  for (let rIdx = 0; rIdx < routes.length; rIdx++) {
    const rte = routes[rIdx];
    let name = "";
    const nameNode = rte.getElementsByTagName("name")[0];
    if (nameNode && nameNode.textContent) {
      name = nameNode.textContent.trim();
    }
    if (!name) {
      name = `Route GPX N°${rIdx + 1}`;
    }

    const pts = rte.getElementsByTagName("rtept");
    const vertices: { x: number; y: number }[] = [];
    for (let pIdx = 0; pIdx < pts.length; pIdx++) {
      const pt = pts[pIdx];
      const latAttr = pt.getAttribute("lat");
      const lonAttr = pt.getAttribute("lon");
      if (latAttr && lonAttr) {
        const lat = parseFloat(latAttr);
        const lon = parseFloat(lonAttr);
        if (!isNaN(lat) && !isNaN(lon)) {
          vertices.push({ x: lon, y: lat });
        }
      }
    }

    if (vertices.length > 3) {
      const first = vertices[0];
      const last = vertices[vertices.length - 1];
      if (Math.abs(first.x - last.x) < 0.0001 && Math.abs(first.y - last.y) < 0.0001) {
        vertices.pop();
      }
    }

    if (vertices.length >= 3) {
      features.push({
        name,
        vertices,
        isGeographic: true,
        attributes: {
          Type: "Route GPX",
          Points: String(vertices.length),
          Source: "GPX Import",
        }
      });
    }
  }

  // 3. Process Waypoints Fallback (<wpt>) if no track or route structures exist
  if (features.length === 0) {
    const wpts = xmlDoc.getElementsByTagName("wpt");
    const vertices: { x: number; y: number }[] = [];
    for (let wIdx = 0; wIdx < wpts.length; wIdx++) {
      const wpt = wpts[wIdx];
      const latAttr = wpt.getAttribute("lat");
      const lonAttr = wpt.getAttribute("lon");
      if (latAttr && lonAttr) {
        const lat = parseFloat(latAttr);
        const lon = parseFloat(lonAttr);
        if (!isNaN(lat) && !isNaN(lon)) {
          vertices.push({ x: lon, y: lat });
        }
      }
    }

    if (vertices.length > 3) {
      const first = vertices[0];
      const last = vertices[vertices.length - 1];
      if (Math.abs(first.x - last.x) < 0.0001 && Math.abs(first.y - last.y) < 0.0001) {
        vertices.pop();
      }
    }

    if (vertices.length >= 3) {
      features.push({
        name: "Points GPX Globaux",
        vertices,
        isGeographic: true,
        attributes: {
          Type: "Waypoints GPX",
          Points: String(vertices.length),
          Source: "GPX Import - Waypoints",
        }
      });
    }
  }

  return features;
}

/**
 * Highly intelligent parser for tabular row coordinates.
 * Supports auto-detecting column coordinates (X/Y, N/E, Lat/Lon) and auto-grouping by parcel keys.
 */
export function parseTabularData(rows: any[][], fileName: string): ParsedFeature[] {
  if (rows.length === 0) return [];

  // Filter empty rows
  const cleanRows = rows.filter(
    (row) => row && row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "")
  );
  if (cleanRows.length === 0) return [];

  let headerIndex = -1;
  let xCol = -1;
  let yCol = -1;
  let nameCol = -1;
  let groupCol = -1;

  const xKeywords = [/^(x|east|easting|est|e|coord_x)$/i, /longitude|lon|lng|long/i];
  const yKeywords = [/^(y|north|northing|nord|n|coord_y)$/i, /latitude|lat/i];
  const nameKeywords = [/name|nom|label|id|point|no|pn|index|code|n°/i];
  const groupKeywords = [/parcelle|parcel|group|poly|titre|m_parcelle|mparcelle/i];

  // Search headers within first 5 rows
  for (let r = 0; r < Math.min(cleanRows.length, 5); r++) {
    const row = cleanRows[r];
    let foundX = -1;
    let foundY = -1;
    let foundName = -1;
    let foundGroup = -1;

    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || "").trim().toLowerCase();
      if (!val) continue;

      if (foundX === -1 && xKeywords.some((pattern) => pattern.test(val))) {
        foundX = c;
      } else if (foundY === -1 && yKeywords.some((pattern) => pattern.test(val))) {
        foundY = c;
      } else if (foundName === -1 && nameKeywords.some((pattern) => pattern.test(val))) {
        foundName = c;
      } else if (foundGroup === -1 && groupKeywords.some((pattern) => pattern.test(val))) {
        foundGroup = c;
      }
    }

    if (foundX !== -1 && foundY !== -1) {
      headerIndex = r;
      xCol = foundX;
      yCol = foundY;
      nameCol = foundName;
      groupCol = foundGroup;
      break;
    }
  }

  // Fallback heuristics if no header row found
  if (xCol === -1 || yCol === -1) {
    const sampleRow = cleanRows[headerIndex === -1 ? 0 : headerIndex + 1] || cleanRows[0];
    const numericCols: number[] = [];
    sampleRow.forEach((cell, cIdx) => {
      const sanitized = String(cell || "").trim().replace(",", ".");
      const num = parseFloat(sanitized);
      if (!isNaN(num) && sanitized.length > 0) {
        numericCols.push(cIdx);
      }
    });

    if (numericCols.length >= 2) {
      xCol = numericCols[0];
      yCol = numericCols[1];
      if (xCol > 0) {
        nameCol = 0;
      }
    } else {
      xCol = 0;
      yCol = 1;
    }
    if (headerIndex === -1) {
      headerIndex = -1; // No header row, data starts at index 0
    }
  }

  const dataRowsStart = headerIndex + 1;
  
  interface PointWithAttrs {
    x: number;
    y: number;
    group: string;
    name: string;
    attrs: Record<string, string>;
  }

  const rawPoints: PointWithAttrs[] = [];

  for (let r = dataRowsStart; r < cleanRows.length; r++) {
    const row = cleanRows[r];
    if (!row || row.length <= Math.max(xCol, yCol)) continue;

    const xValStr = String(row[xCol] || "").trim().replace(",", ".");
    const yValStr = String(row[yCol] || "").trim().replace(",", ".");

    const x = parseFloat(xValStr);
    const y = parseFloat(yValStr);

    if (isNaN(x) || isNaN(y)) {
      continue; 
    }

    let groupVal = "";
    if (groupCol !== -1 && groupCol < row.length && row[groupCol] !== undefined) {
      groupVal = String(row[groupCol]).trim();
    }
    if (!groupVal) {
      groupVal = `Parcelle Tabulaire - ${fileName.replace(/\.[^/.]+$/, "")}`;
    }

    let pointName = "";
    if (nameCol !== -1 && nameCol < row.length && row[nameCol] !== undefined) {
      pointName = String(row[nameCol]).trim();
    }
    if (!pointName) {
      pointName = `Point ${r - dataRowsStart + 1}`;
    }

    const attrs: Record<string, string> = {};
    row.forEach((cell, cIdx) => {
      const colHeader = (headerIndex !== -1 && headerIndex < cleanRows.length && cleanRows[headerIndex][cIdx] !== undefined)
        ? String(cleanRows[headerIndex][cIdx]).trim()
        : `Col_${cIdx + 1}`;
      attrs[colHeader] = cell !== null && cell !== undefined ? String(cell).trim() : "";
    });

    rawPoints.push({
      x,
      y,
      group: groupVal,
      name: pointName,
      attrs,
    });
  }

  if (rawPoints.length === 0) return [];

  // Group into separate polygon features
  const groups: Record<string, typeof rawPoints> = {};
  rawPoints.forEach((pt) => {
    if (!groups[pt.group]) {
      groups[pt.group] = [];
    }
    groups[pt.group].push(pt);
  });

  const features: ParsedFeature[] = [];

  Object.entries(groups).forEach(([groupName, pts]) => {
    const vertices = pts.map((pt) => ({ x: pt.x, y: pt.y }));

    let looksGeographic = true;
    for (const v of vertices) {
      if (Math.abs(v.x) > 180 || Math.abs(v.y) > 90) {
        looksGeographic = false;
        break;
      }
    }

    // Clean closing point duplicates if exist
    if (vertices.length > 3) {
      const first = vertices[0];
      const last = vertices[vertices.length - 1];
      if (Math.abs(first.x - last.x) < 0.005 && Math.abs(first.y - last.y) < 0.005) {
        vertices.pop();
      }
    }

    if (vertices.length >= 3) {
      features.push({
        name: groupName,
        vertices,
        isGeographic: looksGeographic,
        attributes: {
          Format: "Import Tabulaire (Tableau de points)",
          "Métrique": looksGeographic ? "Degrés Géographiques (WGS84)" : "Projection Lambert Locale",
          "Points": String(vertices.length),
          "Calque": "Import",
        }
      });
    }
  });

  return features;
}

/**
 * Client-side CSV text parser.
 */
export function parseCSV(text: string, fileName: string): ParsedFeature[] {
  const lines = text.split(/\r?\n/);
  const rows: any[][] = [];
  
  lines.forEach((line) => {
    if (!line.trim()) return;

    // Smart delimiter detection
    let delimiter = ",";
    if (line.includes("\t")) {
      delimiter = "\t";
    } else if (line.includes(";")) {
      delimiter = ";";
    }

    // Process cells with quotation marks support
    const row: string[] = [];
    let insideQuotes = false;
    let cell = "";
    
    for (let cIdx = 0; cIdx < line.length; cIdx++) {
      const char = line[cIdx];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === delimiter && !insideQuotes) {
        row.push(cell.trim());
        cell = "";
      } else {
        cell += char;
      }
    }
    row.push(cell.trim());
    rows.push(row);
  });

  return parseTabularData(rows, fileName);
}

/**
 * Client-side binary Excel reader using SheetJS.
 */
export function parseExcel(buffer: ArrayBuffer, fileName: string): ParsedFeature[] {
  const data = new Uint8Array(buffer);
  const workbook = XLSX.read(data, { type: "array" });
  if (workbook.SheetNames.length === 0) return [];

  // Read all rows from the active sheet
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

  return parseTabularData(rows, fileName);
}
