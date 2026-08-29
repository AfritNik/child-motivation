"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { AppIcon, type AppIconName } from "./app-icon";
import styles from "./page.module.css";

export type RoleTab = {
  id: string;
  label: string;
  icon: AppIconName;
  badge?: number;
};

export function RoleTabs({
  tabs,
  activeTab,
  variant = "top",
}: {
  tabs: readonly RoleTab[];
  activeTab: string;
  variant?: "top" | "bottom";
}) {
  const activeRef = useRef<HTMLAnchorElement>(null);
  const initialTab = useRef(activeTab);
  useEffect(() => {
    if (initialTab.current === activeTab) return;
    window.scrollTo({ top: 0, behavior: "instant" });
    activeRef.current?.focus();
    initialTab.current = activeTab;
  }, [activeTab]);
  return (
    <nav
      className={
        variant === "bottom"
          ? `${styles.bottomTabs} ${tabs.length === 3 ? styles.adultBottomTabs : ""}`
          : styles.roleTabs
      }
      aria-label="Разделы приложения"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          ref={activeTab === tab.id ? activeRef : undefined}
          href={`/?tab=${tab.id}`}
          scroll
          onClick={() => window.scrollTo({ top: 0, behavior: "instant" })}
          aria-current={activeTab === tab.id ? "page" : undefined}
        >
          <span className={styles.tabIcon}>
            <AppIcon name={tab.icon} />
            {tab.badge ? <em className={styles.tabBadge}>{tab.badge}</em> : null}
          </span>
          <b>{tab.label}</b>
        </Link>
      ))}
    </nav>
  );
}
