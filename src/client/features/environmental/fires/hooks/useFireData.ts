import {
  useProviderData,
  type ProviderDataSource,
  type ResolveDataSource,
} from "@/features/base/useProviderData";
import { fireProvider } from "../data/provider";

export type FireDataSource = ProviderDataSource;

const resolveFireSource: ResolveDataSource = (data, snapshot) => {
  if (snapshot.error) {
    if (data.length > 0) return "cached";
    const is503 = snapshot.error.message.includes("503");
    return is503 ? "unavailable" : "error";
  }
  return data.length > 0 ? "live" : "unavailable";
};

export function useFireData(pollInterval: number = 600_000) {
  return useProviderData(fireProvider, pollInterval, resolveFireSource);
}
