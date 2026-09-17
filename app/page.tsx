import { Dashboard } from "@/components/dashboard";
import { listAppointments } from "@/lib/appointments";
import { listCalls } from "@/lib/calls";
import { getLiveConfig } from "@/lib/live";
import { listPatients } from "@/lib/patients";

export const dynamic = "force-dynamic";

export default function Home() {
  const patients = listPatients();
  const appointments = listAppointments();
  const calls = listCalls();
  const live = getLiveConfig();

  return (
    <Dashboard
      initialPatients={patients}
      initialAppointments={appointments}
      initialCalls={calls}
      live={{
        phoneNumber: live.phoneNumber,
        publicApiUrl: live.publicApiUrl,
        assistantName: live.assistantName,
      }}
    />
  );
}
