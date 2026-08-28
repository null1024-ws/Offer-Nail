export interface StatusCardProps {
  title: string;
  children: string;
}

export function StatusCard({ title, children }: StatusCardProps) {
  return (
    <section aria-labelledby="status-title">
      <h2 id="status-title">{title}</h2>
      <p>{children}</p>
    </section>
  );
}
