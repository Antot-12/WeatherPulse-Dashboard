import type { GeoItem } from "./types";
import type { RGLLayouts } from "./components/GridDashboard";

const SELECTED_KEY = "weatherpulse:selected:v2";
const LAYOUTS_KEY = "weatherpulse:layouts:v3";

export function saveSelectedCity(city: GeoItem | null) {
  if (!city) {
    localStorage.removeItem(SELECTED_KEY);
    return;
  }
  localStorage.setItem(SELECTED_KEY, JSON.stringify(city));
}

export function loadSelectedCity(): GeoItem | null {
  try {
    return JSON.parse(localStorage.getItem(SELECTED_KEY) ?? "null") as GeoItem | null;
  } catch {
    return null;
  }
}

export function saveLayouts(layouts: RGLLayouts) {
  localStorage.setItem(LAYOUTS_KEY, JSON.stringify(layouts));
}

export function loadLayouts(): RGLLayouts | null {
  try {
    return JSON.parse(localStorage.getItem(LAYOUTS_KEY) ?? "null") as RGLLayouts | null;
  } catch {
    return null;
  }
}
