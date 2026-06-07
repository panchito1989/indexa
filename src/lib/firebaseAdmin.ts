import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Parse a service account JSON string and fix the private_key \n issue.
 * Vercel env vars can mangle the literal \n characters in private_key,
 * turning them into escaped \\n. This causes "Invalid PEM structure" errors.
 */
function parseServiceAccount(jsonString: string): Record<string, unknown> {
  const parsed = JSON.parse(jsonString);

  // Fix: Vercel sometimes double-escapes \n → \\n in private_key
  if (parsed.private_key && typeof parsed.private_key === "string") {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }

  return parsed;
}

function getAdminApp(): App {
  if (getApps().length) {
    return getApps()[0];
  }

  // Option 1: JSON string in env var (recommended for Vercel)
  // Supports both FIREBASE_SERVICE_ACCOUNT and FIREBASE_SERVICE_ACCOUNT_KEY
  const serviceAccountKey =
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (serviceAccountKey) {
    // The env var is explicitly set, so the operator intends to use it. If it
    // can't be parsed/used, that's a misconfiguration — almost always a value
    // corrupted on paste (Vercel's bulk ".env import" mangles the private_key's
    // escaped newlines/quotes). Fail loudly instead of silently falling back to
    // projectId-only mode, which still verifies ID tokens but breaks every
    // Firestore read/write with a cryptic "Could not load the default
    // credentials" error far downstream.
    try {
      const serviceAccount = parseServiceAccount(serviceAccountKey);
      console.log("[Firebase Admin] Initialized from env var (project:", serviceAccount.project_id, ")");
      return initializeApp({ credential: cert(serviceAccount as Parameters<typeof cert>[0]) });
    } catch (err) {
      throw new Error(
        "[Firebase Admin] FIREBASE_SERVICE_ACCOUNT(_KEY) is set but could not be parsed/used — " +
          "re-set it as a single env var with the exact service-account JSON (do NOT bulk-paste a .env file, " +
          "which corrupts the private_key). Underlying error: " +
          (err instanceof Error ? err.message : String(err))
      );
    }
  }

  // Option 2: Local file path (for local development)
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (serviceAccountPath) {
    try {
      const fullPath = resolve(process.cwd(), serviceAccountPath);
      const serviceAccount = parseServiceAccount(readFileSync(fullPath, "utf-8"));
      console.log("[Firebase Admin] Initialized from file:", serviceAccountPath);
      return initializeApp({ credential: cert(serviceAccount as Parameters<typeof cert>[0]) });
    } catch (err) {
      console.error("[Firebase Admin] Failed to read service account file:", err instanceof Error ? err.message : err);
      // fall through to next option
    }
  }

  // Option 3: Project ID only (limited — no admin auth, no writes without IAM)
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (projectId) {
    console.warn("[Firebase Admin] Initialized with projectId only — limited functionality (no auth.createUser, no admin writes).");
    return initializeApp({ projectId });
  }

  throw new Error(
    "Firebase Admin: no credentials found. Set FIREBASE_SERVICE_ACCOUNT (JSON string), FIREBASE_SERVICE_ACCOUNT_PATH (file path), or NEXT_PUBLIC_FIREBASE_PROJECT_ID."
  );
}

let adminDb: Firestore | undefined;
let adminAuthInstance: Auth | undefined;

export function getAdminDb(): Firestore {
  if (!adminDb) {
    const app = getAdminApp();
    adminDb = getFirestore(app);
  }
  return adminDb;
}

export function getAdminAuth(): Auth {
  if (!adminAuthInstance) {
    const app = getAdminApp();
    adminAuthInstance = getAuth(app);
  }
  return adminAuthInstance;
}
