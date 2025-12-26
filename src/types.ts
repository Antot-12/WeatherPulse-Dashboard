export type GeoItem = {
  name: string;
  lat: number;
  lon: number;
  country: string;
  state?: string;
};

export type ForecastPoint = {
  dt: number;
  date: Date;

  temp: number;
  humidity: number;
  wind: number;

  gust?: number | null;

  pop?: number | null;
  rain3h?: number | null;
  snow3h?: number | null;
};

export type CurrentWeather = {
  dt?: number;

  main: {
    temp: number;
    feels_like?: number;
    humidity: number;
    pressure?: number;
  };

  visibility?: number;

  clouds?: { all?: number };

  wind: {
    speed: number;
    gust?: number;
  };

  sys?: {
    sunrise?: number;
    sunset?: number;
    country?: string;
  };

  rain?: { "1h"?: number; "3h"?: number };
  snow?: { "1h"?: number; "3h"?: number };
};

export type AirQuality = {
  aqi: number | null;
};

export type OneCallUV = {
  uvi: number | null;
};

export type IncidentItem = {
  ts: number;
  path: string;
  status: number;
  message: string;
};

export type AlertRule =
    | { id: string; enabled: boolean; name: string; type: "wind_gt"; threshold: number }
    | { id: string; enabled: boolean; name: string; type: "temp_lt"; threshold: number }
    | { id: string; enabled: boolean; name: string; type: "pop_gt"; threshold: number };

export type AlertEvent = {
  id: string;
  ts: number;
  cityLabel: string;
  ruleId: string;
  message: string;
  valueText: string;
};
