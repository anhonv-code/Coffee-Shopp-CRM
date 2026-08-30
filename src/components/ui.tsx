import clsx from "clsx";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-coffee-900">{title}</h1>
        {subtitle && <p className="text-sm text-coffee-500">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "green" | "amber" | "red" | "coffee";
}) {
  const accentClass = {
    green: "text-emerald-600",
    amber: "text-amber-600",
    red: "text-red-600",
    coffee: "text-coffee-700",
  }[accent ?? "coffee"];
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-coffee-400">
        {label}
      </div>
      <div className={clsx("mt-1 text-2xl font-bold", accentClass)}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-coffee-500">{hint}</div>}
    </div>
  );
}

export function Badge({
  children,
  color = "coffee",
}: {
  children: React.ReactNode;
  color?: "coffee" | "green" | "amber" | "red" | "blue" | "gray";
}) {
  const map = {
    coffee: "bg-coffee-100 text-coffee-700",
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
    gray: "bg-gray-100 text-gray-600",
  };
  return <span className={clsx("badge", map[color])}>{children}</span>;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="card p-8 text-center text-sm text-coffee-400">{children}</div>
  );
}
