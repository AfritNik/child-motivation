import styles from "./page.module.css";

export default function Loading() {
  return (
    <main className={styles.loadingPage} aria-busy="true" aria-label="Загрузка">
      <div className={styles.loadingHeader} />
      <div className={styles.loadingHero} />
      <div className={styles.loadingCard} />
      <div className={styles.loadingCard} />
      <p>Загружаем данные…</p>
    </main>
  );
}
