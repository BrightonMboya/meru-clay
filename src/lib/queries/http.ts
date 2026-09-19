/**
 * The one fetch every client query goes through.
 *
 * It exists for the error path. A Route Handler here always refuses with
 * `{ error }` and a status that means something — 409 is "somebody beat you
 * to it", 400 is "that input is wrong" — and both have to survive the trip
 * to the component that has to say so. A bare `res.json()` would throw away
 * the wording and leave the UI apologising in the abstract.
 */

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error((body as { error?: string }).error ?? `HTTP ${res.status}`), {
      status: res.status,
      body,
    });
  }
  return body as T;
}

export function statusOf(err: unknown): number | undefined {
  return (err as { status?: number } | undefined)?.status;
}
