// Minimal Redis-backed key rotation helper using Upstash REST API.
// It tries to atomically increment a counter in Upstash and selects
// one of two env keys (suffix 1 or 2) based on the counter value.
// If Upstash is not configured or the request fails, it falls back to
// a time-based alternating selection so the app continues to work.

export async function getRotatedAnamApiKey(
  role: "investor" | "coach"
): Promise<string> {
  const base = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  const envPrefix = `ANAM_${role.toUpperCase()}`; // e.g. ANAM_INVESTOR

  // Helper to pick env key by index (1 or 2)
  const pickFromEnv = (index: number) => {
    const name = `${envPrefix}_API_KEY${index}`;
    return process.env[name];
  };

  if (base && token) {
    try {
      const keyName = `rotor:${role}`;
      const url = `${base.replace(/\/?$/, "")}/incr/${encodeURIComponent(
        keyName
      )}`;

      // Small timeout wrapper to avoid hangs when Upstash is unreachable
      const fetchWithTimeout = async (
        u: string,
        opts: RequestInit = {},
        timeoutMs = 5000
      ) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const r = await fetch(u, { ...opts, signal: controller.signal });
          clearTimeout(id);
          return r;
        } catch (e) {
          clearTimeout(id);
          throw e;
        }
      };

      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        5000
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Upstash responded ${res.status}: ${text}`);
      }

      const body = await res.json();

      // Upstash may return a plain number or an object with `result`.
      let val: number;
      if (typeof body === "number") val = body;
      else if (body && typeof (body as any).result === "number")
        val = (body as any).result;
      else if (
        body &&
        typeof body === "object" &&
        Object.values(body).length === 1
      ) {
        // try to grab the first numeric value
        const v = Object.values(body).find((x) => typeof x === "number");
        val = typeof v === "number" ? v : NaN;
      } else {
        val = NaN;
      }

      if (!Number.isFinite(val))
        throw new Error(
          `Unable to parse Upstash response: ${JSON.stringify(body)}`
        );

      const idx = (val % 2) + 1; // gives 1 or 2
      const envKey = pickFromEnv(idx);
      if (!envKey)
        throw new Error(`Missing environment key ${envPrefix}_API_KEY${idx}`);
      return envKey;
    } catch (err) {
      console.error(
        "getRotatedAnamApiKey: Upstash rotation failed, falling back to local rotation:",
        err
      );
    }
  } else {
    console.warn(
      "getRotatedAnamApiKey: UPSTASH_REDIS_REST_URL or token not configured; using fallback rotation"
    );
  }

  // Fallback: alternate based on time so both keys get used roughly equally.
  const fallbackIdx = (Math.floor(Date.now() / 1000) % 2) + 1;
  const fallbackKey =
    pickFromEnv(fallbackIdx) || process.env[`${envPrefix}_API_KEY`];
  if (!fallbackKey) throw new Error(`No ANAM API key found for role=${role}`);
  return fallbackKey;
}

export default getRotatedAnamApiKey;
