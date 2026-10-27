import type { Metadata } from "next";
import { AuthProvider } from "@/lib/AuthContext";

// Página de autenticación: no aporta nada al índice y Search Console la
// contaba entre las "rastreadas, sin indexar". noindex explícito y fuera del
// sitemap. El layout es de servidor para poder exportar `metadata`; el
// proveedor de sesión sigue siendo un componente cliente.
export const metadata: Metadata = {
  title: "Iniciar sesión",
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
