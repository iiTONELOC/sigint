import { nmToKm } from "@/measurements";

export function formatPressureMb(millibars: number): string {
  return `${millibars} mb`;
}

export function formatBearingDeg(degrees: number): string {
  return `${degrees}°`;
}

export function formatNmKm(nauticalMiles: number): string {
  return `${nauticalMiles} nm (${nmToKm(nauticalMiles)} km)`;
}
