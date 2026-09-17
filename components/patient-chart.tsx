"use client";

import {
  CalendarDaysIcon,
  FileTextIcon,
  MapPinIcon,
  PhoneIcon,
  UserRoundIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatPhone } from "@/lib/phone";
import type { Appointment, CallRecord, Patient } from "@/lib/types";
import { isoToUsDate } from "@/lib/validation";

export function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

export function formatToday() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

export function initialsFor(patient: Pick<Patient, "first_name" | "last_name">) {
  return `${patient.first_name[0] ?? ""}${patient.last_name[0] ?? ""}`.toUpperCase();
}

export function ageFromIso(iso: string) {
  const born = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const hadBirthday =
    now.getMonth() > born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() >= born.getDate());
  if (!hadBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

export function isFreshChart(iso: string) {
  return Date.now() - new Date(iso).getTime() < 2 * 60 * 60 * 1000;
}

export function clinicDateKey(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export function enumerateClinicDays(count = 14) {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.now() + index * 86_400_000);
    return { key: key.format(date), label: label.format(date) };
  });
}

export function avatarTone(seed: string) {
  const tones = [
    "bg-teal-700 text-white",
    "bg-cyan-800 text-white",
    "bg-emerald-800 text-white",
    "bg-slate-700 text-white",
    "bg-sky-800 text-white",
  ];
  let hash = 0;
  for (const char of seed) hash = (hash + char.charCodeAt(0) * 17) % tones.length;
  return tones[hash] ?? tones[0];
}

export function relativeTime(iso: string) {
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(delta / 60_000);
  if (Number.isNaN(minutes)) return "";
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatWhen(iso);
}

export function statusLabel(status: Appointment["status"]) {
  if (status === "scheduled") return "Scheduled";
  if (status === "cancelled") return "Cancelled";
  return "Completed";
}

export function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

export function endedReasonLabel(reason: string | null) {
  if (!reason) return "Completed";
  if (/customer|hang/i.test(reason)) return "Caller hung up";
  if (/assistant|ended-call/i.test(reason)) return "Avery wrapped up";
  if (/silence/i.test(reason)) return "Went quiet";
  if (/error|fail|pipeline/i.test(reason)) return "Line dropped";
  return "Completed";
}

export function todayKey() {
  return clinicDateKey(new Date().toISOString());
}

export function transcriptTurns(raw: string | null | undefined): { role: "avery" | "you"; text: string }[] {
  if (!raw?.trim()) return [];
  const turns: { role: "avery" | "you"; text: string }[] = [];
  for (const line of raw.split("\n")) {
    const match = /^(AI|Avery|bot|assistant|User|You|user)\s*[:\-]\s*(.*)$/i.exec(line.trim());
    if (!match) continue;
    const role = /user|you/i.test(match[1]) ? "you" : "avery";
    const text = match[2].trim();
    if (!text) continue;
    const last = turns.at(-1);
    if (last && last.role === role) last.text = `${last.text} ${text}`;
    else turns.push({ role, text });
  }
  return turns;
}

export function PatientChart({
  patient,
  appointments,
  calls,
  loading,
}: {
  patient: Patient;
  appointments: Appointment[];
  calls: CallRecord[];
  loading: boolean;
}) {
  const age = ageFromIso(patient.date_of_birth);
  const upcoming = appointments.filter((item) => item.status === "scheduled");

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="border-b bg-card px-5 py-5 sm:px-6">
        <div className="flex items-start gap-4">
          <div
            className={`flex size-14 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold ${avatarTone(patient.patient_id)}`}
          >
            {initialsFor(patient)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-2xl font-semibold tracking-tight">
                {patient.first_name} {patient.last_name}
              </h2>
              {isFreshChart(patient.created_at) ? (
                <Badge>New today</Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {isoToUsDate(patient.date_of_birth)}
              {age !== null ? ` · ${age} years` : ""} · {patient.sex}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              On the roster {relativeTime(patient.created_at)} · last updated {relativeTime(patient.updated_at)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="secondary">{patient.preferred_language ?? "English"}</Badge>
              <Badge variant="outline">
                {patient.insurance_provider ? patient.insurance_provider : "Self-pay / not on file"}
              </Badge>
              {upcoming.length > 0 ? (
                <Badge variant="outline">Next visit {formatWhen(upcoming[0].scheduled_at)}</Badge>
              ) : (
                <Badge variant="outline">No visit on the books</Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Fact
            icon={<PhoneIcon className="size-3.5" />}
            label="Phone"
            value={formatPhone(patient.phone_number)}
          />
          <Fact icon={<UserRoundIcon className="size-3.5" />} label="Email" value={patient.email ?? "Not on file"} />
          <Fact
            icon={<MapPinIcon className="size-3.5" />}
            label="Home"
            value={[patient.address_line_1, patient.city, patient.state].filter(Boolean).join(", ")}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section>
            <SectionLabel>Demographics</SectionLabel>
            <dl className="space-y-3">
              <Field label="Address">
                {[
                  patient.address_line_1,
                  patient.address_line_2,
                  `${patient.city}, ${patient.state} ${patient.zip_code}`,
                ]
                  .filter(Boolean)
                  .join("\n")}
              </Field>
              <Field label="Preferred language">{patient.preferred_language ?? "English"}</Field>
              <Field label="Sex">{patient.sex}</Field>
            </dl>
          </section>
          <section>
            <SectionLabel>Coverage & emergency</SectionLabel>
            <dl className="space-y-3">
              <Field label="Insurance">{patient.insurance_provider ?? "Not on file"}</Field>
              <Field label="Member ID">{patient.insurance_member_id ?? "—"}</Field>
              <Field label="Emergency contact">
                {patient.emergency_contact_name
                  ? `${patient.emergency_contact_name} · ${
                      patient.emergency_contact_phone
                        ? formatPhone(patient.emergency_contact_phone)
                        : "no phone"
                    }`
                  : "Not on file"}
              </Field>
            </dl>
          </section>
        </div>

        <Separator className="my-6" />

        <div className="grid gap-6 lg:grid-cols-2">
          <section>
            <SectionLabel icon={<CalendarDaysIcon className="size-3.5" />}>
              Visits
            </SectionLabel>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading visits…</p>
            ) : upcoming.length === 0 && appointments.length === 0 ? (
              <EmptyNote>No appointments on this chart yet. Avery can book a first visit during intake.</EmptyNote>
            ) : (
              <div className="space-y-2">
                {appointments.map((appointment) => (
                  <Card key={appointment.appointment_id} size="sm" className="shadow-none">
                    <CardHeader>
                      <CardTitle>{formatWhen(appointment.scheduled_at)}</CardTitle>
                      <CardDescription>
                        {appointment.reason ?? "Clinic visit"} · {statusLabel(appointment.status)}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}
          </section>
          <section>
            <SectionLabel icon={<FileTextIcon className="size-3.5" />}>
              Intake calls
            </SectionLabel>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading transcripts…</p>
            ) : calls.length === 0 ? (
              <EmptyNote>No intake notes on this chart yet. They show up after Avery finishes a call.</EmptyNote>
            ) : (
              <div className="space-y-3">
                {calls.map((call) => {
                  const turns = transcriptTurns(call.transcript);
                  return (
                    <Card key={call.call_id} size="sm" className="shadow-none">
                      <CardHeader>
                        <CardTitle>{formatWhen(call.created_at)}</CardTitle>
                        <CardDescription>{call.summary ?? "Intake call"}</CardDescription>
                      </CardHeader>
                      {turns.length > 0 ? (
                        <CardContent className="space-y-2">
                          {turns.slice(0, 8).map((turn, index) => (
                            <ChatLine key={`${call.call_id}-${index}`} role={turn.role} text={turn.text} />
                          ))}
                        </CardContent>
                      ) : call.transcript ? (
                        <CardContent>
                          <p className="text-xs leading-5 text-muted-foreground">{call.transcript.slice(0, 400)}</p>
                        </CardContent>
                      ) : null}
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          Created {formatWhen(patient.created_at)} · Updated {formatWhen(patient.updated_at)}
        </p>
      </div>
    </div>
  );
}

function SectionLabel({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
      {icon}
      {children}
    </h3>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-sm">{children}</dd>
    </div>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-muted/40 px-3 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function ChatLine({ role, text }: { role: "avery" | "you"; text: string }) {
  const fromAvery = role === "avery";
  return (
    <div className={`flex ${fromAvery ? "justify-start" : "justify-end"}`}>
      <p
        className={`max-w-[90%] rounded-2xl px-3 py-2 text-xs leading-5 ${
          fromAvery ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"
        }`}
      >
        {text}
      </p>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
