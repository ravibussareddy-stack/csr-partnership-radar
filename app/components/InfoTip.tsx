/** Small ⓘ that explains the element next to it on hover / focus / tap (CSS only, no JS). */
export function InfoTip({ text, label = "What is this?" }: { text: React.ReactNode; label?: string }) {
  return (
    <span className="info" tabIndex={0} role="button" aria-label={label}>
      <span aria-hidden="true">i</span>
      <span className="info-pop" role="tooltip">{text}</span>
    </span>
  );
}
