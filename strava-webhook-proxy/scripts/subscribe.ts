import "../src/load-env.js";

const STRAVA_API_BASE = "https://www.strava.com/api/v3";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

async function listSubscriptions(clientId: string, clientSecret: string) {
  const url = new URL(`${STRAVA_API_BASE}/push_subscriptions`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to list subscriptions (${res.status}): ${text}`);
  }

  return res.json() as Promise<unknown>;
}

async function main() {
  const clientId = requireEnv("STRAVA_CLIENT_ID");
  const clientSecret = requireEnv("STRAVA_CLIENT_SECRET");
  const callbackUrl = requireEnv("STRAVA_WEBHOOK_CALLBACK_URL");
  const verifyToken = requireEnv("STRAVA_VERIFY_TOKEN");

  const existing = await listSubscriptions(clientId, clientSecret);
  if (Array.isArray(existing)) {
    const match = existing.find(
      (item) =>
        item &&
        typeof item === "object" &&
        "callback_url" in item &&
        (item as { callback_url?: string }).callback_url === callbackUrl,
    );
    if (match) {
      console.log("Strava push subscription already exists for this callback URL:");
      console.log(JSON.stringify(match, null, 2));
      console.log(
        "To replace it, delete the existing subscription via Strava API first, then re-run subscribe.",
      );
      return;
    }
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    callback_url: callbackUrl,
    verify_token: verifyToken,
  });

  const res = await fetch(`${STRAVA_API_BASE}/push_subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`Subscription failed (${res.status}): ${text}`);
    process.exit(1);
  }

  console.log("Strava push subscription created:");
  console.log(text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
