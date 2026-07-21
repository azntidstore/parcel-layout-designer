export interface Vertex {
  id: number;
  label: string;
  x: number; // Raw plane coordinate X in meters
  y: number; // Raw plane coordinate Y in meters
}

export interface Segment {
  id: number;
  startLabel: string;
  endLabel: string;
  startVertex: Vertex;
  endVertex: Vertex;
  length: number; // Calculated length in meters
  neighbor: string; // The neighbor's name/title
}

export interface MapSymbol {
  id: string;
  type: "cemetery" | "tree" | "well" | "building" | "mosque" | "custom_text" | "palm" | "reed" | "grass" | "transformer" | "olive" | "geodetic" | "spring";
  label?: string; // Custom descriptive text/notes
  x: number; // Raw plane coordinate X in meters
  y: number; // Raw plane coordinate Y in meters
  size?: number; // Size of symbol icon/wrapper
  fontSize?: number; // Size of custom text or subtitle text
  color?: string; // Custom hex color for styling
}

export interface Parcel {
  id: string;
  name: string;
  vertices: Vertex[];
  segments: Segment[];
  area: number; // m²
  perimeter: number; // meters
  attributes?: Record<string, string>; // Described attributes table from GIS shapefiles/KML
  interiorLabel?: string; // Custom text centered or placed inside the parcel
  symbols?: MapSymbol[]; // Custom topological icons/symbols
  linearFeatures?: LinearFeature[]; // Custom polyline topological features (roads, pipes, power lines)
}

export interface LineVertex {
  x: number;
  y: number;
}

export interface LinearFeature {
  id: string;
  type: "footpath" | "agri_road" | "power_line" | "water_pipe" | "sewer_pipe";
  vertices: LineVertex[];
  label?: string; // Custom text label along or for the line
  color?: string; // Custom styling color
  thickness?: number; // Custom line width/thickness
  spacing?: number; // Custom spacing between parallel lines (for agri_road etc)
  labelSize?: number; // Custom font size for the label
  labelColor?: string; // Custom color for the label
}

export interface DocumentSettings {
  ministryFr: string;
  ministryAr: string;
  planTitle: string;
  author: string;
  service: string;
  date: string;
  logoUrl: string;
  gridInterval: number; // in meters
  northArrowSize: number; // in mm
  pageFormat: "A4" | "A3" | "A2" | "A1" | "A0";
  mapLabels: "Aucun" | "Longueurs" | "Voisins" | "Longueurs + Voisins";
  projectionSystem: string; // Coordinate Reference System Name (CRS)
  scaleMode?: "auto" | "100" | "250" | "500" | "1000" | "2500" | "5000" | "custom";
  customScale?: number;
  dossierNumber: string;
  vertexPrefixType?: "P" | "B" | "Custom" | "None";
  customPrefix?: string;
  vertexFontSize?: number;
  labelFontSize?: number;
  labelOffset?: number;
  legendEnabled?: boolean;
  legendTitleAr?: string;
  legendTitleFr?: string;
  legendPosition?: "bottom-left" | "bottom-right" | "top-right" | "top-left";
  legendShowBoundary?: boolean;
  legendBoundaryLabelAr?: string;
  legendBoundaryLabelFr?: string;
  legendShowSymbols?: boolean;
  legendShowLines?: boolean;
  legendItemLabels?: Record<string, string>;
  legendItemVisibility?: Record<string, boolean>;
}
