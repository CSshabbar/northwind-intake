"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDaysIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  PhoneCallIcon,
  PhoneIcon,
  RefreshCwIcon,
  SearchIcon,
  StethoscopeIcon,
  UsersIcon,
} from "lucide-react";
import {
  PatientChart,
  avatarTone,
  clinicDateKey,
  endedReasonLabel,
  enumerateClinicDays,
  formatClock,
  formatToday,
  formatWhen,
  initialsFor,
  isFreshChart,
  relativeTime,
  statusLabel,
  todayKey,
  transcriptTurns,
} from "@/components/patient-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDialable, formatPhone } from "@/lib/phone";
import type { Appointment, CallRecord, Patient } from "@/lib/types";
import { isoToUsDate } from "@/lib/validation";
import { cn } from "@/lib/utils";

type LiveInfo = {
  phoneNumber: string | null;
  publicApiUrl: string | null;
  assistantName: string;
};

type Activity = {
  appointments: Appointment[];
  calls: CallRecord[];
};

type DeskSection = "today" | "charts" | "schedule" | "calls";

export function Dashboard({
  initialPatients,
  initialAppointments,
  initialCalls,
  live,
}: {
  initialPatients: Patient[];
  initialAppointments: Appointment[];
  initialCalls: CallRecord[];
  live: LiveInfo;
}) {
  const [patients, setPatients] = useState(initialPatients);
  const [appointments, setAppointments] = useState(initialAppointments);
  const [calls, setCalls] = useState(initialCalls);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<DeskSection>("today");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wide, setWide] = useState(false);

  const selected = patients.find((patient) => patient.patient_id === selectedId) ?? null;
  const scheduled = appointments.filter((item) => item.status === "scheduled");

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const apply = () => setWide(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (wide && !selectedId && patients[0]) {
      setSelectedId(patients[0].patient_id);
    }
  }, [wide, selectedId, patients]);

  async function refresh() {
    setRefreshing(true);
    try {
      const [patientRes, apptRes, callRes] = await Promise.all([
        fetch("/patients"),
        fetch("/appointments"),
        fetch("/calls"),
      ]);
      const patientJson = (await patientRes.json()) as {
        data: Patient[] | null;
        error: { message: string } | null;
      };
      if (!patientRes.ok || !patientJson.data) {
        throw new Error(patientJson.error?.message ?? "Could not load patients");
      }
      setPatients(patientJson.data);
      const apptJson = (await apptRes.json()) as { data: Appointment[] | null };
      const callJson = (await callRes.json()) as { data: CallRecord[] | null };
      if (apptJson.data) setAppointments(apptJson.data);
      if (callJson.data) setCalls(callJson.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh the chart list");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setActivity(null);
      return;
    }
    let cancelled = false;
    setLoadingActivity(true);
    Promise.all([
      fetch(`/patients/${selectedId}/appointments`).then((res) => res.json()),
      fetch(`/patients/${selectedId}/calls`).then((res) => res.json()),
    ])
      .then(([apptJson, callJson]) => {
        if (cancelled) return;
        setActivity({
          appointments: (apptJson.data as Appointment[]) ?? [],
          calls: (callJson.data as CallRecord[]) ?? [],
        });
      })
      .catch(() => {
        if (!cancelled) setActivity({ appointments: [], calls: [] });
      })
      .finally(() => {
        if (!cancelled) setLoadingActivity(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return patients;
    return patients.filter((patient) => {
      const haystack = [
        patient.first_name,
        patient.last_name,
        patient.phone_number,
        formatPhone(patient.phone_number),
        patient.email ?? "",
        patient.city,
        patient.state,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [patients, query]);

  const byId = useMemo(() => {
    return new Map(patients.map((patient) => [patient.patient_id, patient]));
  }, [patients]);

  function startWebCall() {
    window.location.assign("/call");
  }

  function openChart(id: string) {
    setSelectedId(id);
    setSection("charts");
  }

  const nav = [
    { id: "today" as const, label: "Today", icon: LayoutDashboardIcon, hint: "Desk" },
    { id: "charts" as const, label: "Patients", icon: UsersIcon, hint: String(patients.length) },
    { id: "schedule" as const, label: "Schedule", icon: CalendarDaysIcon, hint: String(scheduled.length) },
    { id: "calls" as const, label: "Calls", icon: FileTextIcon, hint: String(calls.length) },
  ];

  return (
    <div className="flex h-svh min-h-0 bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="border-b border-sidebar-border px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
              <StethoscopeIcon className="size-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium tracking-[0.18em] text-sidebar-foreground/60 uppercase">
                Northwind
              </p>
              <p className="font-heading text-lg leading-tight font-semibold">Family Clinic</p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-sidebar-foreground/70">
            Front desk for charts, visits, and the after-hours line.
          </p>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1 font-medium">{item.label}</span>
                <span className="text-[11px] text-sidebar-foreground/55">{item.hint}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <div className="mb-3 flex items-center gap-3 px-1">
            <div className="flex size-9 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold">
              JH
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">Jordan Hale</p>
              <p className="text-[11px] text-sidebar-foreground/60">Front desk · on shift</p>
            </div>
          </div>
          <div className="rounded-xl bg-sidebar-accent p-3">
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
              </span>
              Avery on duty
            </div>
            <p className="mt-2 font-heading text-base tabular-nums">{formatDialable(live.phoneNumber)}</p>
            <p className="mt-1 text-[11px] leading-4 text-sidebar-foreground/65">
              Phone or this app — same Avery, same charts.
            </p>
            <Button
              className="mt-3 w-full bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
              size="sm"
              onClick={startWebCall}
            >
              <PhoneCallIcon />
              Call Avery
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-col gap-3 border-b bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
              Northwind Family Clinic
            </p>
            <h1 className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">
              {section === "today"
                ? "Front desk"
                : section === "charts"
                  ? "Patients"
                  : section === "schedule"
                    ? "Schedule"
                    : "Calls"}
            </h1>
            <p className="text-xs text-muted-foreground">{formatToday()} · Jordan Hale · Front desk</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1.5 text-xs lg:hidden">
              <PhoneIcon className="size-3.5 text-primary" />
              <span className="tabular-nums">{formatDialable(live.phoneNumber)}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              <RefreshCwIcon className={refreshing ? "animate-spin" : ""} />
              Refresh
            </Button>
            <Button size="sm" onClick={startWebCall}>
              <PhoneCallIcon />
              Call Avery
            </Button>
          </div>
        </header>

        <div className="flex gap-1 border-b px-3 py-2 lg:hidden">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.id}
                size="sm"
                variant={section === item.id ? "secondary" : "ghost"}
                className="flex-1"
                onClick={() => setSection(item.id)}
              >
                <Icon />
                {item.label}
              </Button>
            );
          })}
        </div>

        {error ? (
          <div className="mx-4 mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:mx-6">
            {error}
          </div>
        ) : null}

        {section === "today" ? (
          <TodayBoard
            patients={patients}
            appointments={appointments}
            calls={calls}
            live={live}
            onOpen={openChart}
            onCall={startWebCall}
            onSection={setSection}
          />
        ) : null}

        {section === "charts" ? (
          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(280px,380px)_1fr]">
            <section className="flex min-h-0 flex-col border-r bg-card">
              <div className="border-b px-4 py-3">
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search name, phone, city…"
                    className="pl-8"
                    aria-label="Search patients"
                  />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <MiniStat label="Charts" value={String(patients.length)} />
                  <MiniStat label="Visits" value={String(scheduled.length)} />
                  <MiniStat label="Calls" value={String(calls.length)} />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="px-6 py-16 text-center">
                    <p className="font-medium">No matching charts</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {patients.length === 0
                        ? "The roster is empty. Call Avery to register the first patient, then refresh."
                        : "Try a different name, phone, or city."}
                    </p>
                  </div>
                ) : (
                  <ul>
                    {filtered.map((patient) => {
                      const active = patient.patient_id === selectedId;
                      return (
                        <li key={patient.patient_id}>
                          <button
                            type="button"
                            onClick={() => openChart(patient.patient_id)}
                            className={cn(
                              "flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors",
                              active ? "bg-accent" : "hover:bg-muted/60",
                            )}
                          >
                            <div
                              className={cn(
                                "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                                avatarTone(patient.patient_id),
                              )}
                            >
                              {initialsFor(patient)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate font-medium">
                                  {patient.last_name}, {patient.first_name}
                                </p>
                                {isFreshChart(patient.created_at) ? (
                                  <Badge className="h-4 px-1.5 text-[10px]">New</Badge>
                                ) : null}
                              </div>
                              <p className="truncate text-xs text-muted-foreground">
                                {formatPhone(patient.phone_number)} · {patient.city}, {patient.state}
                              </p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                DOB {isoToUsDate(patient.date_of_birth)} · {relativeTime(patient.updated_at)}
                              </p>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            <section className="hidden min-h-0 bg-[linear-gradient(180deg,oklch(0.985_0.01_185),oklch(0.97_0.01_200))] lg:flex">
              {selected ? (
                <PatientChart
                  patient={selected}
                  appointments={activity?.appointments ?? []}
                  calls={activity?.calls ?? []}
                  loading={loadingActivity}
                />
              ) : (
                <EmptyDesk />
              )}
            </section>
          </div>
        ) : null}

        {section === "schedule" ? (
          <ScheduleBoard appointments={appointments} patients={byId} onOpen={openChart} />
        ) : null}

        {section === "calls" ? (
          <CallBoard calls={calls} patients={byId} onOpen={openChart} />
        ) : null}
      </div>

      <Sheet open={!wide && Boolean(selected) && section === "charts"} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side="right" className="h-full w-full gap-0 p-0 data-[side=right]:inset-y-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
          {selected ? (
            <>
              <SheetHeader className="sr-only">
                <SheetTitle>
                  {selected.first_name} {selected.last_name}
                </SheetTitle>
                <SheetDescription>Patient chart</SheetDescription>
              </SheetHeader>
              <PatientChart
                patient={selected}
                appointments={activity?.appointments ?? []}
                calls={activity?.calls ?? []}
                loading={loadingActivity}
              />
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function greeting() {
  const hour = Number(
    new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" }),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function TodayBoard({
  patients,
  appointments,
  calls,
  live,
  onOpen,
  onCall,
  onSection,
}: {
  patients: Patient[];
  appointments: Appointment[];
  calls: CallRecord[];
  live: LiveInfo;
  onOpen: (id: string) => void;
  onCall: () => void;
  onSection: (section: DeskSection) => void;
}) {
  const upcoming = [...appointments]
    .filter((item) => item.status === "scheduled")
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const next = upcoming[0];
  const recentPatients = [...patients].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5);
  const recentCalls = calls.slice(0, 5);
  const byId = new Map(patients.map((patient) => [patient.patient_id, patient]));
  const callsToday = calls.filter((call) => clinicDateKey(call.created_at) === todayKey()).length;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 rounded-3xl border bg-card px-5 py-6 shadow-sm sm:px-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">{formatToday()}</p>
            <h2 className="font-heading mt-1 text-3xl font-semibold tracking-tight">{greeting()}, Jordan</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Avery is covering the intake line at {formatDialable(live.phoneNumber)}. Charts, visits, and transcripts
              land here as soon as a call saves.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" variant="outline" onClick={() => onSection("charts")}>
              Open charts
            </Button>
            <Button size="lg" onClick={onCall}>
              <PhoneCallIcon />
              Call Avery
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <button type="button" onClick={() => onSection("charts")} className="rounded-2xl border bg-card p-4 text-left shadow-sm hover:bg-muted/40">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Patients</p>
            <p className="font-heading mt-1 text-3xl font-semibold tabular-nums">{patients.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">Open charts on the roster</p>
          </button>
          <button type="button" onClick={() => onSection("schedule")} className="rounded-2xl border bg-card p-4 text-left shadow-sm hover:bg-muted/40">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Next visit</p>
            <p className="font-heading mt-1 text-lg font-semibold">
              {next ? formatWhen(next.scheduled_at) : "None yet"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {next ? byId.get(next.patient_id)?.first_name ?? "On the calendar" : "Book from an intake call"}
            </p>
          </button>
          <button type="button" onClick={() => onSection("calls")} className="rounded-2xl border bg-card p-4 text-left shadow-sm hover:bg-muted/40">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Calls today</p>
            <p className="font-heading mt-1 text-3xl font-semibold tabular-nums">{callsToday}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {calls.length === 0 ? "No intake notes yet" : `${calls.length} on file`}
            </p>
          </button>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Intake line</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-medium">
              <span className="size-2 rounded-full bg-emerald-500" />
              Avery on duty
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Desk 8–5 ET · after hours on the phone</p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border bg-card p-4 shadow-sm lg:col-span-1">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-heading text-lg font-semibold">Upcoming visits</h3>
              <Button size="sm" variant="ghost" onClick={() => onSection("schedule")}>
                Calendar
              </Button>
            </div>
            {upcoming.length === 0 ? (
              <p className="rounded-xl border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
                Nothing on the books this week. Avery can add a first visit at the end of a call.
              </p>
            ) : (
              <ul className="space-y-2">
                {upcoming.slice(0, 4).map((appointment) => {
                  const patient = byId.get(appointment.patient_id);
                  return (
                    <li key={appointment.appointment_id}>
                      <button
                        type="button"
                        onClick={() => onOpen(appointment.patient_id)}
                        className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-muted/60"
                      >
                        <div className="w-14 shrink-0 text-right">
                          <p className="text-xs font-medium">{formatClock(appointment.scheduled_at)}</p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {patient ? `${patient.first_name} ${patient.last_name}` : "Patient"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {appointment.reason ?? "Clinic visit"}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-heading text-lg font-semibold">Recent patients</h3>
              <Button size="sm" variant="ghost" onClick={() => onSection("charts")}>
                View all
              </Button>
            </div>
            {recentPatients.length === 0 ? (
              <p className="rounded-xl border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
                The roster is empty. Call Avery to register the first patient.
              </p>
            ) : (
              <ul className="divide-y">
                {recentPatients.map((patient) => (
                  <li key={patient.patient_id}>
                    <button
                      type="button"
                      onClick={() => onOpen(patient.patient_id)}
                      className="flex w-full items-center gap-3 py-3 text-left hover:opacity-80"
                    >
                      <div className={`flex size-9 items-center justify-center rounded-full text-xs font-semibold ${avatarTone(patient.patient_id)}`}>
                        {initialsFor(patient)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {patient.first_name} {patient.last_name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {patient.city}, {patient.state} · {relativeTime(patient.updated_at)}
                        </p>
                      </div>
                      {isFreshChart(patient.created_at) ? <Badge>New</Badge> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-heading text-lg font-semibold">Latest calls</h3>
              <Button size="sm" variant="ghost" onClick={() => onSection("calls")}>
                View all
              </Button>
            </div>
            {recentCalls.length === 0 ? (
              <p className="rounded-xl border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
                No calls yet. Start one with Avery and the notes will land here.
              </p>
            ) : (
              <ul className="space-y-3">
                {recentCalls.map((call) => {
                  const patient = call.patient_id ? byId.get(call.patient_id) : undefined;
                  return (
                    <li key={call.call_id} className="rounded-xl bg-muted/40 px-3 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">
                          {patient ? `${patient.first_name} ${patient.last_name}` : "Intake line"}
                        </p>
                        <p className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(call.created_at)}</p>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-5">{call.summary ?? "Call completed."}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-2 py-2">
      <p className="font-heading text-lg leading-none font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-[10px] tracking-wide text-muted-foreground uppercase">{label}</p>
    </div>
  );
}

function EmptyDesk() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <StethoscopeIcon className="size-6" />
      </div>
      <h2 className="font-heading mt-4 text-xl font-semibold">Select a chart</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Open a patient from the list to see their chart, visits, and what Avery heard.
      </p>
    </div>
  );
}

function ScheduleBoard({
  appointments,
  patients,
  onOpen,
}: {
  appointments: Appointment[];
  patients: Map<string, Patient>;
  onOpen: (id: string) => void;
}) {
  const days = enumerateClinicDays(7);
  const [selectedDay, setSelectedDay] = useState(days[0]?.key ?? todayKey());
  const byDay = new Map<string, Appointment[]>();
  for (const appointment of appointments) {
    const key = clinicDateKey(appointment.scheduled_at);
    const list = byDay.get(key) ?? [];
    list.push(appointment);
    byDay.set(key, list);
  }
  const scheduledCount = appointments.filter((item) => item.status === "scheduled").length;
  const next = [...appointments]
    .filter((item) => item.status === "scheduled")
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
  const nextPatient = next ? patients.get(next.patient_id) : undefined;
  const dayVisits = (byDay.get(selectedDay) ?? []).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const selectedLabel = days.find((day) => day.key === selectedDay)?.label ?? "This day";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">On the books</p>
            <p className="font-heading mt-1 text-2xl font-semibold tabular-nums">{scheduledCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">Upcoming visits</p>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Next in</p>
            <p className="font-heading mt-1 text-lg font-semibold">
              {next ? formatWhen(next.scheduled_at) : "Nothing booked"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {nextPatient ? `${nextPatient.first_name} ${nextPatient.last_name}` : "Avery can add one on the call"}
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Hours</p>
            <p className="font-heading mt-1 text-lg font-semibold">8:00–5:00 ET</p>
            <p className="mt-1 text-xs text-muted-foreground">Avery picks up after the desk closes</p>
          </div>
        </div>

        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-7 sm:overflow-visible">
          {days.map((day, index) => {
            const count = (byDay.get(day.key) ?? []).length;
            const active = day.key === selectedDay;
            return (
              <button
                key={day.key}
                type="button"
                onClick={() => setSelectedDay(day.key)}
                className={cn(
                  "min-w-[4.6rem] rounded-2xl border bg-card px-2 py-3 text-center shadow-sm sm:min-w-0",
                  active ? "border-primary bg-accent" : count > 0 ? "border-primary/30" : "",
                )}
              >
                <p className="text-[10px] font-medium text-muted-foreground uppercase">
                  {index === 0 ? "Today" : day.label.split(" ")[0]}
                </p>
                <p className="mt-1 text-sm font-semibold">{day.label.replace(/^[A-Za-z]+ /, "")}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{count ? `${count} visit${count === 1 ? "" : "s"}` : "Open"}</p>
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          {dayVisits.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center">
              <p className="font-heading text-lg font-semibold">No visits on {selectedLabel}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick another day, or have Avery book a first visit at the end of intake.
              </p>
            </div>
          ) : (
            dayVisits.map((appointment) => {
              const patient = patients.get(appointment.patient_id);
              return (
                <button
                  key={appointment.appointment_id}
                  type="button"
                  onClick={() => onOpen(appointment.patient_id)}
                  className="flex w-full items-start justify-between gap-3 rounded-2xl border bg-card px-4 py-4 text-left shadow-sm hover:bg-muted/40"
                >
                  <div className="flex items-start gap-3">
                    {patient ? (
                      <div className={`mt-0.5 flex size-10 items-center justify-center rounded-full text-xs font-semibold ${avatarTone(patient.patient_id)}`}>
                        {initialsFor(patient)}
                      </div>
                    ) : null}
                    <div>
                      <p className="font-medium">
                        {patient ? `${patient.first_name} ${patient.last_name}` : "Patient"}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {formatClock(appointment.scheduled_at)} · {appointment.reason ?? "Clinic visit"}
                      </p>
                    </div>
                  </div>
                  <Badge>{statusLabel(appointment.status)}</Badge>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function CallBoard({
  calls,
  patients,
  onOpen,
}: {
  calls: CallRecord[];
  patients: Map<string, Patient>;
  onOpen: (id: string) => void;
}) {
  if (calls.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <FileTextIcon className="size-8 text-muted-foreground" />
        <h2 className="font-heading mt-3 text-lg font-semibold">No intake notes yet</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Completed calls appear here after Avery saves a chart. Dial the clinic number or start a browser call to generate one.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto grid max-w-3xl gap-4">
        {calls.map((call) => {
          const patient = call.patient_id ? patients.get(call.patient_id) : undefined;
          const turns = transcriptTurns(call.transcript);
          return (
            <article key={call.call_id} className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex size-10 items-center justify-center rounded-full text-xs font-semibold ${
                      patient ? avatarTone(patient.patient_id) : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {patient ? initialsFor(patient) : "AV"}
                  </div>
                  <div>
                    <p className="font-medium">
                      {patient ? `${patient.first_name} ${patient.last_name}` : "Intake line"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatWhen(call.created_at)}
                      {call.caller_phone ? ` · ${formatPhone(call.caller_phone)}` : ""}
                      {` · ${endedReasonLabel(call.ended_reason)}`}
                    </p>
                  </div>
                </div>
                {patient ? (
                  <Button size="sm" variant="outline" onClick={() => onOpen(patient.patient_id)}>
                    Open chart
                  </Button>
                ) : (
                  <Badge variant="secondary">No chart yet</Badge>
                )}
              </div>
              <p className="mt-3 text-sm leading-6">{call.summary ?? "Call completed."}</p>
              {turns.length > 0 ? (
                <div className="mt-4 space-y-2 rounded-xl bg-muted/40 p-3">
                  {turns.slice(0, 6).map((turn, index) => (
                    <div key={`${call.call_id}-${index}`} className={`flex ${turn.role === "avery" ? "justify-start" : "justify-end"}`}>
                      <p
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-5 ${
                          turn.role === "avery" ? "bg-background" : "bg-primary text-primary-foreground"
                        }`}
                      >
                        {turn.text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
