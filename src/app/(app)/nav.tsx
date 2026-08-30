"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/pos", label: "POS", icon: "🧾" },
  { href: "/kitchen", label: "Kitchen", icon: "👨‍🍳" },
  { href: "/orders", label: "Orders", icon: "📦" },
  { href: "/inventory", label: "Inventory", icon: "🫘" },
  { href: "/products", label: "Products & Recipes", icon: "☕" },
  { href: "/promotions", label: "Promotions", icon: "🎟️" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="space-y-1">
      {NAV.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-coffee-600 text-white"
                : "text-coffee-100 hover:bg-coffee-700/60",
            )}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
