/**
 * Multi-Tenant White-Label types for INDEXA.
 *
 * Collections:
 *   usuarios/{uid}   — Firebase Auth users with role + optional agencyId
 *   agencias/{id}    — Agency profiles with branding + plan config
 *   sitios/{id}      — Client sites, linked to an agency via agencyId
 *
 * Roles:
 *   superadmin — Full platform access (/admin/*)
 *   subadmin   — Cold prospecting only (/admin/prospectos, /admin/seguimientos, /admin/mensajeria)
 *   agency     — White-label reseller (/agency/*), manages own clients
 *   client     — End-user with a single site (/dashboard/*)
 *
 * Backward compat: existing "admin" role is treated as "superadmin".
 */

// ── Roles ────────────────────────────────────────────────────────────

export type UserRole = "superadmin" | "subadmin" | "agency" | "client";

/** Maps legacy role strings to the canonical enum */
export function normalizeRole(raw: string | undefined): UserRole {
  if (raw === "admin" || raw === "superadmin") return "superadmin";
  if (raw === "subadmin") return "subadmin";
  if (raw === "agency") return "agency";
  return "client"; // "cliente" | "client" | undefined → client
}

// ── Branding ─────────────────────────────────────────────────────────

export interface AgencyBranding {
  logoUrl: string;
  colorPrincipal: string; // hex, e.g. "#FF6600"
}

// ── Firestore: agencias/{id} ─────────────────────────────────────────

export type AgencyStatus = "activo" | "suspendido";

export interface AgencyPlanConfig {
  maxSitios: number; // e.g. 10, 50
  status: AgencyStatus;
}

export interface AgenciaDoc {
  uid: string; // maps to Firebase Auth user uid
  nombreComercial: string;
  branding: AgencyBranding;
  planConfig: AgencyPlanConfig;
  createdAt?: string;
}

// ── Firestore: usuarios/{uid} ────────────────────────────────────────

export interface UsuarioDoc {
  role: UserRole;
  email: string;
  displayName: string;
  sitioId?: string; // for "client" — their linked site
  agencyId?: string; // for "client" — references agencias/{id}; null for agency/superadmin
  createdAt?: string;
  // Google Ads (agency-managed clients): the agency assigns the client a
  // sub-account under its MCC. When googleAdsManagedByAgency is true, the
  // client uses the agency owner's token (resolved via agencyId) instead of
  // connecting their own. See getValidAccessToken in lib/googleAdsClient.ts.
  googleAdsCustomerId?: string; // assigned sub-account id (digits only)
  googleAdsManagedByAgency?: boolean;
  // The MCC (manager) account id to send as login-customer-id when querying this
  // user's account. "" / absent = direct mode (login-customer-id = the account itself).
  // Resolved per-user by getGoogleAdsContext (falls back to env GOOGLE_ADS_LOGIN_CUSTOMER_ID).
  googleAdsLoginCustomerId?: string;
  // Conversiones configuradas por el asistente (acción "Lead WhatsApp (Indexa)").
  // La etiqueta se denormaliza a sitios/{id}.googleAdsTag para que el render del
  // sitio no pague una lectura extra de usuarios.
  googleAdsConversion?: {
    resourceName: string;
    name: string;
    awId: string; // "AW-1234567890"
    label: string;
    configuredAt: number;
  };
}

// ── Firestore: sitios/{id} (new fields only) ─────────────────────────

export interface SitioAgencyFields {
  agencyId?: string; // references agencias/{id} — mandatory if created by agency
}
