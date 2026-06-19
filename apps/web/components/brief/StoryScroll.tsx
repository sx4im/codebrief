"use client";

import { useRef, type ReactNode } from "react";
import { LazyMotion, domAnimation, m, MotionConfig, useScroll, useSpring, useTransform } from "framer-motion";

// Premium "storytelling" scroll layer for the brief pages.
// Wraps the existing (untouched) section components in scroll-reveal motion,
// adds a top scroll-progress bar and a parallax hero.
//
// Reduced motion is honored through <MotionConfig reducedMotion="user"> rather
// than by branching markup on useReducedMotion(): the hook resolves differently
// on the server vs the client, which would desync the `initial` props and break
// hydration. MotionConfig keeps the rendered markup identical on both sides and
// lets framer suppress transform animations for users who ask for less m.

const EASE = [0.22, 1, 0.36, 1] as const;

// Zero-pad a chapter index (1 → "01"). Pure, so hoisted out of Chapter to avoid
// reallocating it on every render.
const pad = (n: number) => String(n).padStart(2, "0");

/** Honors prefers-reduced-motion without causing SSR/CSR hydration drift. */
export function MotionProvider({ children }: { children: ReactNode }) {
  // LazyMotion + the lightweight `m` components ship ~30kb less than importing the
  // full `motion`. `domAnimation` covers what the brief pages use (opacity/transform
  // + whileInView); it omits only drag/layout, which nothing here needs.
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation}>{children}</LazyMotion>
    </MotionConfig>
  );
}

/** Thin gradient bar pinned to the top that fills as the page scrolls. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    mass: 0.3,
  });
  return (
    <m.div
      aria-hidden
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-gradient-to-r from-primary via-primary-glow to-primary-pink"
    />
  );
}

/** Fade + slide-up + de-blur as the element scrolls into view. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 32,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y, filter: "blur(10px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.75, ease: EASE, delay }}
    >
      {children}
    </m.div>
  );
}

/**
 * A numbered "chapter": a hairline eyebrow with an index counter that draws in,
 * then the section content revealing beneath it. Reads as a storytelling
 * progression without duplicating each section's own heading.
 */
export function Chapter({
  index,
  total,
  children,
}: {
  index: number;
  total: number;
  children: ReactNode;
}) {
  return (
    <Reveal className="scroll-mt-24">
      <div className="mb-7 flex items-center gap-4">
        <span className="font-mono text-xs font-semibold tabular-nums text-primary">
          {pad(index)}
          <span className="text-stone"> / {pad(total)}</span>
        </span>
        <m.span
          aria-hidden
          className="h-px flex-1 origin-left bg-gradient-to-r from-border to-transparent"
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
        />
      </div>
      {children}
    </Reveal>
  );
}

/** Hero with parallax + fade as it leaves the viewport. */
export function StoryHero({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const opacity = useTransform(scrollYProgress, [0, 0.85], [1, 0]);

  return (
    <div ref={ref} className="relative">
      {/* soft brand wash behind the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-[420px] w-[820px] max-w-full -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,106,61,0.16), rgba(244,168,160,0.08), transparent)",
        }}
      />
      <m.div style={{ y, opacity }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <m.div
              className="text-xs font-semibold uppercase tracking-[0.2em] text-primary"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              {eyebrow}
            </m.div>
            <m.h1
              className="font-display mt-3 text-4xl font-bold tracking-tight text-ink sm:text-5xl"
              initial={{ opacity: 0, y: 22, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.8, ease: EASE, delay: 0.08 }}
            >
              {title}
            </m.h1>
            {subtitle ? (
              <m.p
                className="mt-4 max-w-3xl text-base leading-relaxed text-charcoal sm:text-lg"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: EASE, delay: 0.18 }}
              >
                {subtitle}
              </m.p>
            ) : null}
          </div>
          {action ? (
            <m.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.28 }}
            >
              {action}
            </m.div>
          ) : null}
        </div>
      </m.div>

      {/* scroll cue */}
      <m.div
        aria-hidden
        className="mt-12 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.2em] text-mute"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.5 }}
      >
        <m.span
          className="block h-8 w-px bg-gradient-to-b from-primary to-transparent"
          animate={{ scaleY: [0.4, 1, 0.4], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "top" }}
        />
        Scroll to read the brief
      </m.div>
    </div>
  );
}
