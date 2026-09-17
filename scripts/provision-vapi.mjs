#!/usr/bin/env node
/**
 * Idempotent Vapi provisioner: Groq credential, assistant, free US number.
 * Requires VAPI_API_KEY, GROQ_API_KEY, PUBLIC_API_URL, VAPI_WEBHOOK_SECRET.
 */
import fs from "node:fs";
import path from "node:path";

const API = "https://api.vapi.ai";
const ASSISTANT_NAME = "Northwind Intake Avery";
const AREA_CODES = ["531", "385", "470", "415", "212", "312", "617", "206"];

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
  return value;
}

const VAPI_API_KEY = required("VAPI_API_KEY");
const GROQ_API_KEY = required("GROQ_API_KEY");
const PUBLIC_API_URL = required("PUBLIC_API_URL").replace(/\/$/, "");
const WEBHOOK_SECRET = required("VAPI_WEBHOOK_SECRET");

async function vapi(pathname, { method = "GET", body } = {}) {
  const response = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    const err = new Error(`Vapi ${method} ${pathname} -> ${response.status}`);
    err.status = response.status;
    err.body = json;
    throw err;
  }
  return json;
}

function webhookUrl() {
  return `${PUBLIC_API_URL}/api/vapi/webhook`;
}

function systemPrompt() {
  return fs.readFileSync(path.join(process.cwd(), "prompts", "intake-coordinator.md"), "utf8");
}

function tools() {
  return [
    {
      type: "function",
      function: {
        name: "lookup_patient_by_phone",
        description:
          "Look up an existing patient by US phone number. Call this as soon as you have a 10-digit number, before creating a new chart.",
        parameters: {
          type: "object",
          properties: {
            phone_number: {
              type: "string",
              description: "US phone number; 10 digits preferred",
            },
          },
          required: ["phone_number"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "save_patient",
        description:
          "Create or update a patient chart. Call only after the caller explicitly confirms the read-back. If lookup found an existing chart and they want to update it, set update_existing=true and patient_id.",
        parameters: {
          type: "object",
          properties: {
            confirmed: {
              type: "boolean",
              description: "Must be true; caller confirmed the read-back",
            },
            update_existing: {
              type: "boolean",
              description: "True when updating a chart found by phone",
            },
            patient_id: {
              type: "string",
              description: "Existing patient UUID when updating",
            },
            first_name: { type: "string" },
            last_name: { type: "string" },
            date_of_birth: {
              type: "string",
              description: "MM/DD/YYYY",
            },
            sex: {
              type: "string",
              description: "Male, Female, Other, or Decline to Answer",
            },
            phone_number: { type: "string" },
            email: { type: "string" },
            address_line_1: { type: "string" },
            address_line_2: { type: "string" },
            city: { type: "string" },
            state: {
              type: "string",
              description: "2-letter US state abbreviation",
            },
            zip_code: { type: "string" },
            insurance_provider: { type: "string" },
            insurance_member_id: { type: "string" },
            preferred_language: { type: "string" },
            emergency_contact_name: { type: "string" },
            emergency_contact_phone: { type: "string" },
          },
          required: [
            "confirmed",
            "first_name",
            "last_name",
            "date_of_birth",
            "sex",
            "phone_number",
            "address_line_1",
            "city",
            "state",
            "zip_code",
          ],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "schedule_first_appointment",
        description: "Book a mock first clinic visit after the chart is saved.",
        parameters: {
          type: "object",
          properties: {
            patient_id: { type: "string", description: "Saved patient UUID" },
            preferred_date: { type: "string", description: "YYYY-MM-DD if the caller asked for a day" },
            preferred_time: { type: "string", description: "HH:MM 24h if the caller asked for a time" },
            reason: { type: "string" },
          },
          required: ["patient_id"],
        },
      },
    },
    { type: "endCall" },
  ];
}

function assistantPayload(_credentialId, model) {
  return {
    name: ASSISTANT_NAME,
    firstMessage:
      "Hi, Northwind Family Clinic, this is Avery. What's your first and last name?",
    firstMessageMode: "assistant-speaks-first",
    firstMessageInterruptionsEnabled: false,
    voicemailMessage:
      "Hey, it's Avery at Northwind. Sorry we missed you — call us back whenever and I'll get you registered. Take care.",
    endCallMessage: "Alright, thanks so much for calling. Take care.",
    endCallPhrases: ["goodbye", "that's all", "I'm all set", "thank you bye"],
    silenceTimeoutSeconds: 45,
    maxDurationSeconds: 900,
    backgroundSound: "off",
    transcriber: {
      provider: "deepgram",
      model: "nova-2",
      language: "multi",
      numerals: true,
    },
    voice: {
      provider: "vapi",
      voiceId: "Savannah",
    },
    model: {
      provider: "groq",
      model,
      temperature: 0.4,
      messages: [{ role: "system", content: systemPrompt() }],
      tools: tools(),
    },
    server: {
      url: webhookUrl(),
      timeoutSeconds: 20,
      headers: {
        Authorization: `Bearer ${WEBHOOK_SECRET}`,
      },
    },
    backgroundSpeechDenoisingPlan: {
      smartDenoisingPlan: { enabled: true },
    },
    startSpeakingPlan: {
      waitSeconds: 0.8,
      smartEndpointingPlan: { provider: "vapi" },
      transcriptionEndpointingPlan: {
        onPunctuationSeconds: 0.5,
        onNoPunctuationSeconds: 1.4,
        onNumberSeconds: 2,
      },
      customEndpointingRules: [
        {
          type: "assistant",
          regex: "(phone|number|date of birth|birthday|zip|address|street|name)",
          regexOptions: [{ type: "ignore-case", enabled: true }],
          timeoutSeconds: 2.5,
        },
        {
          type: "customer",
          regex: "[0-9]",
          timeoutSeconds: 2,
        },
      ],
    },
    stopSpeakingPlan: {
      numWords: 3,
      backoffSeconds: 1.2,
    },
    analysisPlan: {
      summaryPrompt:
        "Summarize this Northwind patient registration call in 2-4 sentences: what was collected, whether the chart was saved, corrections, language used, and any appointment booked. No real PHI beyond what was spoken.",
      successEvaluationPrompt:
        "Did the caller successfully register or update a patient chart, or was the call abandoned before save?",
    },
    artifactPlan: {
      transcriptPlan: { enabled: true },
    },
  };
}

async function ensureGroqCredential() {
  const existing = await vapi("/credential");
  const list = Array.isArray(existing) ? existing : existing?.results ?? existing?.data ?? [];
  const found = list.find(
    (item) => item?.provider === "groq" || item?.name === "Northwind Groq",
  );
  if (found?.id) {
    console.log("Reusing Groq credential", found.id);
    return found.id;
  }
  const created = await vapi("/credential", {
    method: "POST",
    body: { provider: "groq", apiKey: GROQ_API_KEY, name: "Northwind Groq" },
  });
  console.log("Created Groq credential", created.id);
  return created.id;
}

async function ensureAssistant(credentialId) {
  const assistants = await vapi("/assistant");
  const list = Array.isArray(assistants) ? assistants : [];
  const existing = list.find((item) => item.name === ASSISTANT_NAME);
  const models = [
    "llama-3.3-70b-versatile",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
  ];

  let lastError;
  for (const model of models) {
    const payload = assistantPayload(credentialId, model);
    try {
      if (existing?.id) {
        const updated = await vapi(`/assistant/${existing.id}`, { method: "PATCH", body: payload });
        console.log("Updated assistant", updated.id, "model", model);
        return updated;
      }
      const created = await vapi("/assistant", { method: "POST", body: payload });
      console.log("Created assistant", created.id, "model", model);
      return created;
    } catch (error) {
      lastError = error;
      console.warn("Assistant upsert failed for", model, error.status, JSON.stringify(error.body));
    }
  }
  throw lastError;
}

async function ensureNumber(assistantId) {
  const numbers = await vapi("/phone-number");
  const list = Array.isArray(numbers) ? numbers : [];
  const existing = list.find((item) => item.assistantId === assistantId) ?? list[0];
  if (existing?.id) {
    if (existing.assistantId !== assistantId) {
      await vapi(`/phone-number/${existing.id}`, {
        method: "PATCH",
        body: { assistantId },
      });
    }
    console.log("Reusing number", existing.number);
    return existing;
  }

  let lastError;
  for (const area of AREA_CODES) {
    try {
      const created = await vapi("/phone-number", {
        method: "POST",
        body: {
          provider: "vapi",
          numberDesiredAreaCode: area,
          assistantId,
          name: "Northwind intake line",
        },
      });
      console.log("Provisioned number", created.number);
      return created;
    } catch (error) {
      lastError = error;
      console.warn("Area code", area, "failed", error.status, JSON.stringify(error.body));
    }
  }
  throw lastError;
}

async function main() {
  console.log("Provisioning Vapi against", PUBLIC_API_URL);
  const credentialId = await ensureGroqCredential();
  const assistant = await ensureAssistant(credentialId);
  const number = await ensureNumber(assistant.id);
  const live = {
    phoneNumber: number.number ?? number.phoneNumber ?? null,
    publicApiUrl: PUBLIC_API_URL,
    assistantId: assistant.id,
    assistantName: ASSISTANT_NAME,
    numberId: number.id,
    groqCredentialId: credentialId,
    provisionedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), "data", "live.json"), JSON.stringify(live, null, 2) + "\n");
  console.log("Wrote data/live.json");
  console.log("Dial", live.phoneNumber);
}

main().catch((error) => {
  console.error(error.message);
  if (error.body) console.error(JSON.stringify(error.body, null, 2));
  process.exit(1);
});
