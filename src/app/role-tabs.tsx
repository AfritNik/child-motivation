import Link from "next/link";
import styles from "./page.module.css";

export type RoleTab = {
  id: string;
  label: string;
  icon: string;
};

export function RoleTabs({
  tabs,
  activeTab,
}: {
  tabs: readonly RoleTab[];
  activeTab: string;
}) {
  return (
    <nav className={styles.roleTabs} aria-label="Разделы приложения">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={`/?tab=${tab.id}`}
          aria-current={activeTab === tab.id ? "page" : undefined}
        >
          <span aria-hidden="true">{tab.icon}</span>
          <b>{tab.label}</b>
        </Link>
      ))}
    </nav>
  );
}
