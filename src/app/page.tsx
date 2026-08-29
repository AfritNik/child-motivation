import { AccessRole } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { AdultInterface } from "./adult-interface";
import { ChildInterface } from "./child-interface";
import { LoginForm } from "./login-form";
import styles from "./page.module.css";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; overdueCursor?: string }>;
}) {
  const [user, resolvedSearchParams] = await Promise.all([
    getCurrentUser(),
    searchParams,
  ]);

  if (!user) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <p className={styles.eyebrow}>Семейная система</p>
          <h1>Кто входит?</h1>
          <p className={styles.description}>
            Введите свой четырёхзначный PIN. Имя выбирать не нужно.
          </p>
          <LoginForm />
        </main>
      </div>
    );
  }

  if (user.role === AccessRole.CHILD) {
    return (
      <ChildInterface
        user={user}
        requestedTab={resolvedSearchParams.tab}
      />
    );
  }

  return (
    <AdultInterface
      user={user}
      requestedTab={resolvedSearchParams.tab}
      overdueCursor={resolvedSearchParams.overdueCursor}
    />
  );
}
