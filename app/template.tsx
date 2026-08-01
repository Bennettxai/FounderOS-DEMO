// Remounts per navigation so every view gets the slide-up entrance
// (transform-only — content stays visible under reduced motion).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="view">{children}</div>;
}
