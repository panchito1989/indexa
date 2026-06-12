// PLAN ÚNICO — un solo precio con TODO incluido (decisión de negocio jun-2026:
// los 3 planes daban las mismas funciones; el plan único a $699 con cupos de
// IA garantiza margen positivo por cliente).
const plan = {
  name: "Plan INDEXA",
  price: "$699",
  description: "Todo el ecosistema: sitio web + campañas con IA, sin sorpresas.",
  features: [
    "Sitio web profesional con IA",
    "Panel de edición completo (CMS)",
    "Campañas de Google, Facebook y TikTok Ads",
    "Asistente IA para optimizar tus anuncios (150 acciones/mes)",
    "Imágenes publicitarias con IA (20/mes)",
    "SEO local avanzado (Schema.org) + Google",
    "Estadísticas de visitas y clics",
    "Botón de WhatsApp directo + SSL incluido",
    "Soporte prioritario por WhatsApp",
  ],
  cta: "Probar 14 días gratis",
};

export default function Pricing() {
  return (
    <section id="precios" className="relative overflow-hidden bg-[#050816] py-24 sm:py-32">
      {/* Background grid */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.05]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,102,0,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,102,0,0.4) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>
      <div className="pointer-events-none absolute top-1/4 left-0 h-[400px] w-[400px] rounded-full bg-indexa-orange/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-indexa-blue/15 blur-[140px]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-indexa-orange/30 bg-indexa-orange/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-indexa-orange backdrop-blur">
            Precio
          </span>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Un solo plan.{" "}
            <span className="bg-gradient-to-r from-indexa-orange to-amber-300 bg-clip-text text-transparent">
              Todo incluido.
            </span>
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/60">
            Sin contratos, sin permanencia, sin niveles confusos. Todo el ecosistema de IA en una sola mensualidad.
          </p>

          {/* Trial banner */}
          <div className="mx-auto mt-8 inline-flex items-center gap-3 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-5 py-2.5 backdrop-blur">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5 text-emerald-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <span className="text-sm font-semibold text-white">
              14 días gratis · Sin tarjeta de crédito
            </span>
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-lg">
          <div className="group relative flex flex-col rounded-2xl border-2 border-indexa-orange bg-gradient-to-br from-[#0a0e27] to-[#050816] p-8 shadow-2xl shadow-indexa-orange/30 backdrop-blur-xl">
            {/* Animated glow */}
            <div className="pointer-events-none absolute inset-0 -z-10 rounded-2xl bg-gradient-to-br from-indexa-orange/20 via-purple-500/10 to-cyan-400/10 blur-xl" />

            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indexa-orange to-orange-500 px-4 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-indexa-orange/40">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                </svg>
                Todo incluido
              </span>
            </div>

            <h3 className="text-xl font-bold text-white">{plan.name}</h3>
            <p className="mt-1 text-sm text-white/55">{plan.description}</p>

            <div className="mt-6 flex items-baseline">
              <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-5xl font-extrabold tracking-tight text-transparent">{plan.price}</span>
              <span className="ml-2 text-sm font-medium text-white/40">/mes MXN</span>
            </div>

            <ul className="mt-8 flex-1 space-y-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm text-white/70">
                  <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indexa-orange/20">
                    <svg className="h-3 w-3 text-indexa-orange" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  </div>
                  {feature}
                </li>
              ))}
            </ul>

            <a
              href="/registro"
              className="mt-8 block rounded-xl bg-gradient-to-r from-indexa-orange to-orange-500 py-3.5 text-center text-sm font-bold text-white shadow-lg shadow-indexa-orange/30 transition-all hover:shadow-xl hover:shadow-indexa-orange/50 hover:-translate-y-0.5"
            >
              {plan.cta}
            </a>
          </div>
        </div>

        {/* Trust note */}
        <p className="mt-12 text-center text-sm text-white/40">
          Incluye SSL, hosting y actualizaciones automáticas. Precio en pesos mexicanos + IVA. Cancela cuando quieras.
        </p>
      </div>
    </section>
  );
}
