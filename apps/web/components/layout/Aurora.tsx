// Subtle animated brand background: drifting brand-color glows + a faint grid,
// fixed behind all content. Pure CSS animation (see .aurora-blob in globals.css),
// clipped so it can never cause horizontal scroll.
export function Aurora() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* faint blueprint grid, faded out toward the bottom */}
      <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(to_right,rgba(32,32,32,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(32,32,32,0.045)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,#000_30%,transparent_75%)]" />
      {/* drifting brand glows */}
      <div className="aurora-blob absolute -top-40 left-[6%] h-[560px] w-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(255,106,61,0.18),transparent)] blur-3xl" />
      <div className="aurora-blob absolute top-[14%] right-[2%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(244,168,160,0.16),transparent)] blur-3xl [animation-delay:-7s] [animation-duration:26s]" />
      <div className="aurora-blob absolute bottom-[6%] left-[28%] h-[480px] w-[480px] rounded-full bg-[radial-gradient(closest-side,rgba(255,106,61,0.10),transparent)] blur-3xl [animation-delay:-13s] [animation-duration:30s]" />
    </div>
  );
}
