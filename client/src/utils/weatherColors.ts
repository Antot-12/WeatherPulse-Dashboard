// Temperature color coding based on value
export function getTempColor(temp: number): string {
  if (temp < -10) return '#1E40AF';  // very cold - deep blue
  if (temp < 0) return '#3B82F6';    // cold - blue
  if (temp < 10) return '#22D3EE';   // cool - cyan
  if (temp < 20) return '#4ADE80';   // comfortable - green
  if (temp < 28) return '#FCD34D';   // warm - yellow
  if (temp < 35) return '#FB923C';   // hot - orange
  return '#EF4444';                   // very hot - red
}

// Get temperature gradient for backgrounds
export function getTempGradient(temp: number): string {
  const color = getTempColor(temp);
  return `linear-gradient(135deg, ${color}15 0%, ${color}05 100%)`;
}

// Get text description for temperature
export function getTempDescription(temp: number): string {
  if (temp < -10) return 'Extremely cold';
  if (temp < 0) return 'Freezing';
  if (temp < 10) return 'Cold';
  if (temp < 15) return 'Cool';
  if (temp < 20) return 'Mild';
  if (temp < 25) return 'Pleasant';
  if (temp < 30) return 'Warm';
  if (temp < 35) return 'Hot';
  return 'Extremely hot';
}

// Humidity color coding
export function getHumidityColor(humidity: number): string {
  if (humidity < 30) return '#FACC15';  // dry - yellow
  if (humidity < 50) return '#4ADE80';  // comfortable - green
  if (humidity < 70) return '#22D3EE';  // moderate - cyan
  return '#3B82F6';                      // humid - blue
}

// Wind speed color coding (m/s)
export function getWindColor(speed: number): string {
  if (speed < 2) return '#4ADE80';    // calm - green
  if (speed < 5) return '#22D3EE';    // light - cyan
  if (speed < 10) return '#FCD34D';   // moderate - yellow
  if (speed < 15) return '#FB923C';   // strong - orange
  return '#EF4444';                    // storm - red
}

// Get wind description
export function getWindDescription(speed: number): string {
  if (speed < 0.5) return 'Calm';
  if (speed < 2) return 'Light air';
  if (speed < 4) return 'Light breeze';
  if (speed < 6) return 'Gentle breeze';
  if (speed < 8) return 'Moderate breeze';
  if (speed < 11) return 'Fresh breeze';
  if (speed < 14) return 'Strong breeze';
  if (speed < 17) return 'High wind';
  if (speed < 21) return 'Gale';
  if (speed < 25) return 'Strong gale';
  return 'Storm';
}

// AQI (Air Quality Index) color coding
export function getAqiColor(aqi: number): string {
  if (aqi <= 50) return '#4ADE80';    // good - green
  if (aqi <= 100) return '#FCD34D';   // moderate - yellow
  if (aqi <= 150) return '#FB923C';   // unhealthy for sensitive - orange
  if (aqi <= 200) return '#EF4444';   // unhealthy - red
  if (aqi <= 300) return '#A855F7';   // very unhealthy - purple
  return '#7F1D1D';                    // hazardous - dark red
}

// UV Index color coding
export function getUvColor(uvi: number): string {
  if (uvi < 3) return '#4ADE80';      // low - green
  if (uvi < 6) return '#FCD34D';      // moderate - yellow
  if (uvi < 8) return '#FB923C';      // high - orange
  if (uvi < 11) return '#EF4444';     // very high - red
  return '#A855F7';                    // extreme - purple
}
