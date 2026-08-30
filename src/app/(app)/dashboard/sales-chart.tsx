"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

interface Point {
  date: string;
  revenue: number;
  cogs: number;
  profit: number;
}

export function SalesChart({ data }: { data: Point[] }) {
  const pretty = data.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    }),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={pretty} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e9ddcf" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8b5e34" }} />
        <YAxis tick={{ fontSize: 11, fill: "#8b5e34" }} />
        <Tooltip
          formatter={(v: number) => `฿${v.toLocaleString()}`}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid #e9ddcf",
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="revenue" name="Revenue" fill="#8b5e34" radius={[4, 4, 0, 0]} />
        <Bar dataKey="profit" name="Gross profit" fill="#c09d74" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
