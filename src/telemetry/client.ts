/**
 * Telemetry client — anonymous error reporting for WordAPA7.
 *
 * Opt-in only. When enabled, sends structural metadata (never document content)
 * to the Cloudflare Worker relay, which creates GitHub Issues.
 */

import { version as APP_VERSION } from "../../package.json";

const PIPELINE_VERSION = "2025.08.06";
const WORKER_URL = "https://wordapa7-telemetry.workers.dev/report";
const TELEMETRY_STORAGE_KEY = "wordapa7_telemetry_optin";
const INSTALL_ID_KEY = "wordapa7_install_id";
const SEND_TIMEOUT_MS = 3000;

function getInstallId(): string {
  let id = localStorage.getItem(INSTALL_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(INSTALL_ID_KEY, id);
  }
  return id;
}

export function isTelemetryEnabled(): boolean {
  return localStorage.getItem(TELEMETRY_STORAGE_KEY) === "true";
}

export function setTelemetryEnabled(enabled: boolean): void {
  localStorage.setItem(TELEMETRY_STORAGE_KEY, String(enabled));
}

export interface ErrorReport {
  error_type: string;
  error_message: string;
  stack_trace?: string;
  doc_metadata?: {
    element_count?: number;
    has_tables?: boolean;
    has_images?: boolean;
    file_size_kb?: number;
    page_count?: number;
  };
}

interface TelemetryPayload {
  pipeline_version: string;
  error_type: string;
  error_message: string;
  stack_trace?: string;
  doc_metadata?: Record<string, unknown>;
  install_id: string;
  app_version: string;
  os: string;
}

export async function sendErrorReport(report: ErrorReport): Promise<void> {
  if (!isTelemetryEnabled()) return;

  const payload: TelemetryPayload = {
    pipeline_version: PIPELINE_VERSION,
    error_type: report.error_type,
    error_message: report.error_message,
    stack_trace: report.stack_trace?.slice(0, 5000),
    doc_metadata: report.doc_metadata as Record<string, unknown> | undefined,
    install_id: getInstallId(),
    app_version: APP_VERSION,
    os: navigator.platform || "unknown",
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

    await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);
  } catch {
    // Silent failure — telemetry must never break the user experience
  }
}
