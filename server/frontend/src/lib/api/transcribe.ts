// GLSD — transcribeBlob: POST audio blob to /api/v1/transcribe via raw fetch + FormData.
// Must NOT use apiRequest() — that forces Content-Type: application/json, breaking multipart.

export async function transcribeBlob(blob: Blob): Promise<{ text: string }> {
  const form = new FormData();
  form.append("file", blob, "audio.webm");

  const response = await fetch("/api/v1/transcribe", {
    method: "POST",
    credentials: "include",
    body: form,
  });

  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthenticated");
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json() as { detail?: string };
      if (typeof body?.detail === "string") {
        detail = body.detail;
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(detail);
  }

  return response.json() as Promise<{ text: string }>;
}
