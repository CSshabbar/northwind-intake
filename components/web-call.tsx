"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MicIcon, MicOffIcon, PhoneOffIcon, StethoscopeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDialable } from "@/lib/phone";
import { looksLikeEcho, mergeTranscript, type TranscriptLine } from "@/lib/transcript";

type Session = {
  publicKey: string;
  assistantId: string;
  assistantName: string;
  phoneNumber: string | null;
};

type Line = TranscriptLine;

type CallStatus = "loading" | "ready" | "connecting" | "live" | "ended" | "error";

type VapiClient = {
  start: (id: string) => Promise<unknown>;
  stop: () => void;
  setMuted: (muted: boolean) => void;
  on: (event: string, handler: (...args: never[]) => void) => void;
};

export function WebCall() {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<CallStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [userMuted, setUserMuted] = useState(false);
  const [speaking, setSpeaking] = useState<"avery" | "you" | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [liveCaption, setLiveCaption] = useState<Line | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);
  const vapiRef = useRef<VapiClient | null>(null);
  const userMutedRef = useRef(false);
  const averyTalkingRef = useRef(false);
  const unmuteTimer = useRef<number | null>(null);
  const lastAveryRef = useRef("");
  const transcriptRef = useRef<HTMLDivElement>(null);

  const applyMic = useCallback(() => {
    const shouldMute = userMutedRef.current || averyTalkingRef.current;
    vapiRef.current?.setMuted(shouldMute);
  }, []);

  const setAveryTalking = useCallback(
    (talking: boolean) => {
      averyTalkingRef.current = talking;
      setSpeaking(talking ? "avery" : userMutedRef.current ? null : "you");
      if (talking) {
        if (unmuteTimer.current) window.clearTimeout(unmuteTimer.current);
        unmuteTimer.current = null;
        applyMic();
        return;
      }
      unmuteTimer.current = window.setTimeout(() => {
        if (!averyTalkingRef.current) applyMic();
      }, 500);
    },
    [applyMic],
  );

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [lines, liveCaption]);

  useEffect(() => {
    if (status !== "live") return;
    startedAt.current = Date.now();
    const timer = setInterval(() => {
      if (startedAt.current) setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 500);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/vapi/web-call")
      .then(async (res) => {
        const json = (await res.json()) as { data: Session | null; error: { message: string } | null };
        if (!res.ok || !json.data) {
          throw new Error(json.error?.message ?? "Could not load the voice session");
        }
        if (!cancelled) {
          setSession(json.data);
          setStatus("ready");
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load the voice session");
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function startCall() {
    if (!session) return;
    setError(null);
    setStatus("connecting");
    setLines([]);
    setLiveCaption(null);
    setElapsed(0);
    lastAveryRef.current = "";
    userMutedRef.current = false;
    setUserMuted(false);
    try {
      const { default: Vapi } = await import("@vapi-ai/web");
      const vapi = new Vapi(session.publicKey);
      vapiRef.current = vapi as unknown as VapiClient;
      vapi.on("call-start", () => {
        setStatus("live");
        setAveryTalking(true);
      });
      vapi.on("call-end", () => {
        setStatus("ended");
        setSpeaking(null);
        setLiveCaption(null);
        averyTalkingRef.current = false;
      });
      vapi.on("speech-start", () => setAveryTalking(true));
      vapi.on("speech-end", () => setAveryTalking(false));
      vapi.on("error", (event: { error?: { message?: string }; message?: string } | string) => {
        const message =
          typeof event === "string"
            ? event
            : event?.error?.message || event?.message || "The call didn’t go through";
        setError(message);
        setStatus("error");
      });
      vapi.on(
        "message",
        (message: {
          type?: string;
          role?: string;
          transcript?: string;
          transcriptType?: string;
        }) => {
          if (message?.type !== "transcript") return;
          const text = (message.transcript ?? "").trim();
          if (!text) return;
          const role = message.role === "user" ? "you" : "avery";
          if (role === "you" && looksLikeEcho(text, lastAveryRef.current)) {
            setLiveCaption(null);
            return;
          }
          if (message.transcriptType === "partial") {
            setLiveCaption({ role, text });
            return;
          }
          setLiveCaption(null);
          if (role === "avery") lastAveryRef.current = text;
          setLines((current) => mergeTranscript(current, role, text));
        },
      );
      await vapi.start(session.assistantId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a call with Avery");
      setStatus("error");
    }
  }

  function hangUp() {
    vapiRef.current?.stop();
    setStatus("ended");
    setSpeaking(null);
    setLiveCaption(null);
    averyTalkingRef.current = false;
  }

  function toggleMute() {
    const next = !userMutedRef.current;
    userMutedRef.current = next;
    setUserMuted(next);
    applyMic();
  }

  useEffect(() => {
    return () => {
      if (unmuteTimer.current) window.clearTimeout(unmuteTimer.current);
      vapiRef.current?.stop();
    };
  }, []);

  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");
  const lastAvery = [...lines].reverse().find((line) => line.role === "avery");
  const lastYou = [...lines].reverse().find((line) => line.role === "you");
  const averyTalking = speaking === "avery";
  const listening = status === "live" && !averyTalking && !userMuted;

  const headline =
    status === "loading"
      ? "Getting the line ready"
      : status === "connecting"
        ? "Connecting…"
        : status === "live"
          ? averyTalking
            ? "Avery is asking"
            : userMuted
              ? "You’re muted"
              : "Your turn"
          : status === "ended"
            ? "Thanks — that call is done"
            : status === "error"
              ? "We couldn’t connect"
              : "Ready when you are";

  const prompt =
    status === "ready"
      ? "Allow the microphone, then answer one question at a time. Headphones help so she doesn’t hear herself."
      : status === "live" && averyTalking
        ? "Wait until she finishes — then answer just that question."
        : status === "live" && userMuted
          ? "Unmute when you’re ready to answer."
          : status === "live"
            ? lastAvery
              ? "Answer the question below. She’ll wait."
              : "She’s picking up. Give her a second."
            : status === "ended"
              ? "If she saved a chart, it is already on the front desk."
              : status === "connecting"
                ? "Hang tight — picking up the line."
                : status === "loading"
                  ? "Checking the intake line…"
                  : "Northwind Family Clinic intake";

  return (
    <div className="flex h-svh w-full flex-col bg-[linear-gradient(180deg,oklch(0.24_0.03_200),oklch(0.18_0.025_210))] text-sidebar-foreground lg:flex-row">
      <section className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-3 text-sm font-medium hover:opacity-90">
            <span className="flex size-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
              <StethoscopeIcon className="size-4" />
            </span>
            Northwind
          </Link>
          <p className="text-xs tabular-nums text-sidebar-foreground/70">
            {status === "live" ? `${minutes}:${seconds}` : formatDialable(session?.phoneNumber ?? null)}
          </p>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-4">
          <p className="mb-5 text-[11px] font-medium tracking-[0.18em] text-sidebar-foreground/55 uppercase">
            Northwind Family Clinic · Intake
          </p>
          <div className="relative">
            {status === "live" && averyTalking ? (
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/20" />
            ) : null}
            <div
              className={`relative flex size-32 items-center justify-center rounded-full text-3xl font-semibold sm:size-36 ${
                status === "live" && averyTalking
                  ? "bg-emerald-400/25 text-emerald-50 ring-4 ring-emerald-300/30"
                  : status === "live" && listening
                    ? "bg-white/15 ring-4 ring-white/20"
                    : "bg-white/10"
              }`}
            >
              AV
            </div>
          </div>
          <h1 className="font-heading mt-6 text-center text-3xl font-semibold tracking-tight">{headline}</h1>
          <p className="mt-2 max-w-md text-center text-sm text-sidebar-foreground/70">{prompt}</p>

          {status === "live" && lastAvery ? (
            <div className="mt-5 w-full max-w-lg rounded-2xl bg-white/10 px-5 py-4">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-emerald-200/80 uppercase">She’s asking</p>
              <p className="mt-1 text-lg leading-7 font-medium">{lastAvery.text}</p>
              {lastYou ? (
                <p className="mt-3 text-sm text-sidebar-foreground/70">
                  You said: {lastYou.text}
                </p>
              ) : null}
              {liveCaption ? (
                <p className="mt-2 text-sm text-sidebar-foreground/55 italic">
                  {liveCaption.role === "avery" ? "Avery" : "You"}: {liveCaption.text}
                </p>
              ) : listening ? (
                <p className="mt-2 text-sm text-emerald-100/80">Listening…</p>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p className="mt-4 max-w-md rounded-xl border border-red-300/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
              {error}
            </p>
          ) : null}

          <div className="mt-8 flex items-center gap-3">
            {status === "ready" || status === "error" || status === "ended" ? (
              <Button
                size="lg"
                onClick={() => void startCall()}
                className="h-14 rounded-full bg-sidebar-primary px-8 text-sidebar-primary-foreground"
              >
                {status === "ended" || status === "error" ? "Call again" : "Start the call"}
              </Button>
            ) : null}
            {status === "connecting" || status === "live" ? (
              <>
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={toggleMute}
                  disabled={status !== "live"}
                  className="size-14 rounded-full"
                  aria-label={userMuted ? "Unmute" : "Mute"}
                >
                  {userMuted ? <MicOffIcon className="size-5" /> : <MicIcon className="size-5" />}
                </Button>
                <Button size="lg" variant="destructive" onClick={hangUp} className="h-14 rounded-full px-6">
                  <PhoneOffIcon className="size-5" />
                  End
                </Button>
              </>
            ) : null}
            {status === "ended" ? (
              <Link
                href="/"
                className="inline-flex h-14 items-center rounded-full bg-white/10 px-6 text-sm font-medium hover:bg-white/15"
              >
                Back to the desk
              </Link>
            ) : status === "ready" || status === "error" || status === "loading" ? (
              <Link href="/" className="text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground">
                Back to the desk
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <aside className="flex max-h-[38vh] min-h-0 w-full flex-col border-t border-white/10 bg-black/20 lg:max-h-none lg:h-full lg:w-[420px] lg:border-t-0 lg:border-l">
        <div className="px-5 py-3 lg:py-4">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-sidebar-foreground/55 uppercase">
            Conversation
          </p>
          <p className="mt-1 text-sm text-sidebar-foreground/70">
            Avery asks. You answer. One at a time.
          </p>
        </div>
        <div ref={transcriptRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-5">
          {lines.length === 0 && !liveCaption ? (
            <p className="rounded-2xl bg-white/5 px-4 py-3 text-sm text-sidebar-foreground/55">
              {status === "live" ? "Waiting for her first question…" : "The chat will fill in as you talk."}
            </p>
          ) : (
            <>
              {lines.map((line, index) => (
                <TranscriptBubble key={`${line.role}-${index}`} line={line} />
              ))}
              {liveCaption ? <TranscriptBubble line={liveCaption} live /> : null}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function TranscriptBubble({ line, live }: { line: Line; live?: boolean }) {
  const fromAvery = line.role === "avery";
  return (
    <div className={`flex ${fromAvery ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
          fromAvery ? "bg-white/10" : "bg-sidebar-primary text-sidebar-primary-foreground"
        } ${live ? "opacity-70" : ""}`}
      >
        <p className="text-[10px] font-semibold tracking-[0.14em] uppercase opacity-70">
          {fromAvery ? "Avery" : "You"}
        </p>
        <p className="mt-0.5 text-sm leading-6">{line.text}</p>
      </div>
    </div>
  );
}
