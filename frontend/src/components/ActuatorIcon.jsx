import { Fan, Lightbulb, Bell, Droplets, Zap, Cog, Sun, Waves, RotateCw, Cpu } from "lucide-react";

/**
 * ActuatorIcon
 * -------------
 * Picks a Lucide icon that visually matches the actuator's real type,
 * instead of one generic icon for every actuator. Falls back to a
 * generic chip icon for CUSTOM or unrecognized types.
 */
const ICON_BY_TYPE = {
  FAN: Fan,
  LED: Lightbulb,
  BUZZER: Bell,
  PUMP: Droplets,
  RELAY: Zap,
  MOTOR: Cog,
  LIGHT: Sun,
  VALVE: Waves,
  SERVO: RotateCw,
};

export default function ActuatorIcon({ type, size = 16, className = "" }) {
  const Icon = ICON_BY_TYPE[type] || Cpu;
  return <Icon size={size} className={className} />;
}
