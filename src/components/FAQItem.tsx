"use client";

import { useId, useState } from "react";
import { motion } from "framer-motion";

export interface FAQItemData {
  question: string;
  answer: string;
}

interface FAQItemProps extends FAQItemData {
  /** Extra classes for the outer wrapper */
  className?: string;
}

/**
 * Acordeón de FAQ. La respuesta se renderiza SIEMPRE en el HTML (colapsada
 * con altura 0), no sólo al abrir: Googlebot y los crawlers de IA que no
 * ejecutan JavaScript (GPTBot, ClaudeBot, PerplexityBot) sólo veían las
 * preguntas, y el selector speakable `#faq [data-faq-answer]` no encontraba
 * nada. Google acepta contenido colapsado siempre que esté en el DOM.
 */
export default function FAQItem({ question, answer, className = "" }: FAQItemProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className={`border-b border-white/10 last:border-b-0 ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left transition-colors hover:text-indexa-orange"
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="text-base font-semibold text-white sm:text-lg">
          {question}
        </span>
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-indexa-orange/15 text-indexa-orange"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </motion.span>
      </button>

      {/* `initial={false}`: en el servidor se renderiza ya con los valores de
          `animate` (altura 0 si está cerrada), sin parpadeo al hidratar. */}
      <motion.div
        id={panelId}
        role="region"
        aria-hidden={!open}
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="overflow-hidden"
      >
        <p data-faq-answer className="pb-5 text-sm leading-relaxed text-white/65 sm:text-base">
          {answer}
        </p>
      </motion.div>
    </div>
  );
}
