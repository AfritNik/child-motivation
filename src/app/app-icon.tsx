export type AppIconName =
  | "check"
  | "book"
  | "home"
  | "gift"
  | "sparkles"
  | "arrowRight"
  | "logout";

export function AppIcon({
  name,
  size = 20,
}: {
  name: AppIconName;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "check") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="m8.25 12.2 2.45 2.45 5.3-5.3" />
      </svg>
    );
  }

  if (name === "book") {
    return (
      <svg {...common}>
        <path d="M4 5.25c3.2-.8 5.75-.2 8 1.8v12c-2.25-2-4.8-2.6-8-1.8z" />
        <path d="M20 5.25c-3.2-.8-5.75-.2-8 1.8v12c2.25-2 4.8-2.6 8-1.8z" />
      </svg>
    );
  }

  if (name === "home") {
    return (
      <svg {...common}>
        <path d="m3.5 11 8.5-7 8.5 7" />
        <path d="M6 9.5V20h12V9.5M9.5 20v-6h5v6" />
      </svg>
    );
  }

  if (name === "gift") {
    return (
      <svg {...common}>
        <path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13" />
        <path d="M12 7H8.75A2.25 2.25 0 1 1 11 4.75V7Zm0 0h3.25A2.25 2.25 0 1 0 13 4.75V7Z" />
      </svg>
    );
  }

  if (name === "sparkles") {
    return (
      <svg {...common}>
        <path d="m12 3 1.15 3.85L17 8l-3.85 1.15L12 13l-1.15-3.85L7 8l3.85-1.15L12 3Z" />
        <path d="m6 14 .7 2.3L9 17l-2.3.7L6 20l-.7-2.3L3 17l2.3-.7L6 14Zm12-2 .55 1.45L20 14l-1.45.55L18 16l-.55-1.45L16 14l1.45-.55L18 12Z" />
      </svg>
    );
  }

  if (name === "arrowRight") {
    return (
      <svg {...common}>
        <path d="m9 5 7 7-7 7" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" />
    </svg>
  );
}
