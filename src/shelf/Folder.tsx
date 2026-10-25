/**
 * A folder standing on the shelf: a back with a tab, the first boards inside sticking out of it as
 * sheets with their pictures, and a front with how much is inside.
 */
export function Folder({ color, sheets, count }: { color: string; sheets: (string | null)[]; count: string }) {
  return (
    <span className="fd" style={{ '--folder': color } as React.CSSProperties}>
      <span className="fd-back" />
      <span className="fd-sheets">
        {sheets.slice(0, 3).map((url, i) => (
          <span key={i} className="fd-sheet">{url && <img src={url} alt="" draggable={false} />}</span>
        ))}
      </span>
      <span className="fd-front"><span className="fd-count">{count}</span></span>
    </span>
  );
}
