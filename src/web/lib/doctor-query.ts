import { HEADERS } from "@/lib/subsonic";
import type { DoctorReport } from "../../shared/doctor";

export const doctorQuery = {
  queryKey: ["doctor"],
  queryFn: async (): Promise<DoctorReport> => {
    const response = await fetch("/api/doctor", { headers: HEADERS });
    if (!response.ok) throw new Error(`doctor: ${response.status}`);
    return (await response.json()) as DoctorReport;
  },
  staleTime: 60_000,
};
