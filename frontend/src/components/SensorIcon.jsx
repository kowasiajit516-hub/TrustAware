import {
  Thermometer,
  Droplets,
  Sun,
  Wind,
  CloudFog,
  Gauge,
  Activity,
  Waves,
  Move,
  Zap,
  Radio,
} from "lucide-react";

/**
 * SensorIcon
 * ------------
 * Picks a Lucide icon that visually matches the sensor's real type,
 * instead of a generic/status icon for every sensor. Falls back to a
 * generic radio-wave icon for CUSTOM or unrecognized types.
 */
const ICON_BY_TYPE = {
  TEMPERATURE: Thermometer,
  HUMIDITY: Droplets,
  LIGHT: Sun,
  GAS: Wind,
  SMOKE: CloudFog,
  PRESSURE: Gauge,
  AIR_QUALITY: Wind,
  SOIL_MOISTURE: Droplets,
  VIBRATION: Activity,
  WATER_LEVEL: Waves,
  MOTION: Move,
  CURRENT: Zap,
  VOLTAGE: Zap,
};

export default function SensorIcon({ type, size = 16, className = "" }) {
  const Icon = ICON_BY_TYPE[type] || Radio;
  return <Icon size={size} className={className} />;
}
