"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { averageColor, BONUS_SUBJECTS, screenTimeColor } from "@/lib/domain/screen-time";
import { applyScreenTime, saveStudyMark, type StudyFormState } from "./study-actions";
import styles from "./page.module.css";

type Mark = { id: string; value: number };
type Subject = { id: string; name: string; average: number | null; legacyAverage: number | null; marks: Mark[] };
type Editor = { subjectId: string; markId: string; original?: number; value: number | null };
type Props = {
  subjects: Subject[];
  quarter: { id: string; title: string } | null;
  current: { minutes: number; explanation: string };
  recommendation: { minutes: number; explanation: string } | null;
  canEdit: boolean;
  adult: boolean;
};

export function StudyJournal({ subjects, quarter, current, recommendation, canEdit, adult }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [undo, setUndo] = useState<Editor | null>(null);
  const [feedback, setFeedback] = useState<StudyFormState>({});
  const [errorSubject, setErrorSubject] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const editorForm = useRef<HTMLFormElement | null>(null);
  const timeSummary = useRef<HTMLDivElement | null>(null);
  const format = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const timeDiffers = recommendation !== null && recommendation.minutes !== current.minutes;

  useEffect(() => {
    if (editorForm.current) {
      const choice = editorForm.current.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
        ?? editorForm.current.querySelector<HTMLButtonElement>("button");
      choice?.focus({ preventScroll: true });
      editorForm.current.scrollIntoView({ block: "nearest" });
    }
  }, [editor?.markId]);

  function open(subjectId: string, button: HTMLButtonElement, mark?: Mark) {
    trigger.current = button;
    setEditor({ subjectId, markId: mark?.id ?? crypto.randomUUID(), original: mark?.value, value: mark?.value ?? null });
    setFeedback({});
    setErrorSubject(null);
  }
  function close() { setEditor(null); trigger.current?.focus(); }

  function change(operation: "add" | "edit" | "delete" | "restore", target = editor) {
    if (!target || !quarter || busy.current) return;
    busy.current = true;
    setFeedback({});
    setErrorSubject(target.subjectId);
    startTransition(async () => {
      try {
        const result = await saveStudyMark({ quarterId: quarter.id, subjectId: target.subjectId,
          markId: target.markId, operation, value: target.value ?? undefined, expectedValue: target.original });
        setFeedback(result.error ? result : { message: operation === "delete" ? "Оценка удалена" : operation === "restore" ? "Оценка восстановлена" : "Оценка сохранена" });
        if (!result.error) {
          if (operation === "delete") setUndo(target);
          else if (operation === "restore") setUndo(null);
          close();
        }
      } catch { setFeedback({ error: "Не удалось сохранить. Проверьте соединение и повторите" }); }
      finally { busy.current = false; }
    });
  }

  function apply() {
    if (!quarter || !recommendation || busy.current) return;
    busy.current = true;
    setFeedback({});
    setErrorSubject(null);
    startTransition(async () => {
      try { setFeedback(await applyScreenTime(quarter.id, recommendation.minutes)); }
      catch { setFeedback({ error: "Не удалось применить время. Повторите попытку" }); }
      finally { busy.current = false; }
    });
  }

  return <section className={`${adult ? styles.reviewSection : styles.childSection} ${styles.studyJournal}`}>
    <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Учёба</p><h1>Оценки и время за компьютером</h1></div>
      <span className={styles.counter}>{quarter?.title ?? "Вне четверти"}</span></div>
    <div className={styles.timeSummary} ref={timeSummary} tabIndex={-1} aria-label="Время за компьютером">
      <div className={styles.timeComparison}>
        <article aria-label="Действующее время"><span>Сейчас</span>
          <h2 className={styles.timeValue} data-tone={screenTimeColor(current.minutes)}>{current.minutes} мин</h2>
        </article>
        <span className={styles.timeArrow} aria-hidden="true">→</span>
        <article aria-label="Рекомендация по оценкам"><span>По оценкам</span>
          <h2 className={styles.timeValue} data-tone={recommendation ? screenTimeColor(recommendation.minutes) : undefined}>{recommendation ? `${recommendation.minutes} мин` : "—"}</h2>
        </article>
      </div>
      <p className={styles.timeCaption}>Время в день{current.minutes === 0 ? " · сейчас без компьютера" : ""}</p>
      <p>{recommendation?.explanation ?? (quarter ? "Добавьте оценки для расчёта. Действующее время сохраняется." : "Сейчас нет учебной четверти. Действующее время сохраняется.")}</p>
      {canEdit && timeDiffers && <button type="button" className={styles.journalPrimary} disabled={pending || !!editor} onClick={apply}>{pending ? "Сохраняю…" : "Применить сейчас"}</button>}
      {recommendation && !timeDiffers && <p className={styles.timeCaption}>Время соответствует оценкам</p>}
      {canEdit && timeDiffers && editor && <p className={styles.timeCaption}>Сначала сохраните или отмените изменение оценки</p>}
      {!canEdit && timeDiffers && <p>Новое время применяет папа</p>}
      <p className={styles.journalFeedback} role="status" aria-live="polite">{!errorSubject ? feedback.message : null}</p>
    </div>
    {feedback.error && !errorSubject && <p className={styles.error} role="alert">{feedback.error}</p>}
    <details className={styles.timeRules}><summary>Как считается время</summary>
      <div className={styles.timeScale} aria-label="Шкала времени в минутах">
        {[0, 15, 30, 45, 60, 70, 80, 90, 100, 110, 120, 130].map((minutes) => <span key={minutes} data-tone={screenTimeColor(minutes)}><i aria-hidden="true" />{minutes}</span>)}
      </div>
      <p>Начинаешь с часа. Сильные предметы добавляют время, жёлтые и красные — убавляют.</p>
      <dl><dt>База каждый день</dt><dd>60 минут</dd><dt>Среднее строго выше 4,50 по бонусному предмету</dt><dd>+10 минут</dd><dt>Каждый жёлтый предмет</dt><dd>−15 минут</dd><dt>Каждый красный предмет</dt><dd>−30 минут</dd><dt>3 и более красных предметов</dt><dd>0 минут независимо от бонусов</dd></dl>
      <p>Бонусные предметы: математика, русский, английский, география, история, биология, литература. Бонусы учитываются и при жёлтых или красных предметах, кроме полного запрета. Вычеты — по всем предметам.</p>
      <p>Если красных меньше трёх, остаётся минимум 15 минут. Потолка в два часа нет: семь бонусных предметов без вычетов дают 130 минут. Возможны промежуточные значения, например 35 минут.</p>
      <p>Красная зона: ниже 3,40. Жёлтая: от 3,40 до 3,70, не включая 3,70. Зелёная: от 3,70. Расчёт использует точное среднее без округления. Предметы без оценок не учитываются.</p>
    </details>
    <h2 className={styles.journalTitle}>Предметы</h2>
    {canEdit && <p className={styles.journalHelp}>Нажмите на оценку, чтобы исправить её.</p>}
    <div className={styles.subjectList}>{subjects.map((subject) => <article className={styles.subjectCard} key={subject.id} aria-label={subject.name}>
      <div className={styles.journalSubjectHeader}><div className={styles.subjectRow}><h3>{subject.name}</h3>
        <strong className={styles.journalAverage} data-tone={subject.average === null ? undefined : averageColor(subject.average)}><small>Среднее </small>{subject.average === null ? "—" : format(subject.average)}</strong></div>
        {canEdit && quarter && <button type="button" className={styles.addMark} disabled={pending} aria-expanded={editor?.subjectId === subject.id} onClick={(e) => open(subject.id, e.currentTarget)}>+ Оценка</button>}
      </div>
      {subject.average !== null && subject.average > 4.5 && BONUS_SUBJECTS.has(subject.name) && <p className={styles.bonusHint} data-active={recommendation !== null && recommendation.minutes > 0}>{recommendation && recommendation.minutes > 0 ? "Бонус +10 мин учтён в рекомендации" : "При трёх красных предметах бонус не действует"}</p>}
      <div className={styles.journalMarks}>
        {subject.marks.map((mark, index) => canEdit && quarter ? <button type="button" key={mark.id} className={styles.journalMark} disabled={pending} aria-pressed={editor?.markId === mark.id} aria-label={`Оценка ${mark.value}, запись ${index + 1}: изменить`} onClick={(e) => open(subject.id, e.currentTarget, mark)}>{mark.value}</button> : <span className={styles.journalMark} key={mark.id}>{mark.value}</span>)}
        {!subject.marks.length && <span className={styles.markNotice}>Оценок пока нет</span>}
      </div>
      {subject.legacyAverage !== null && <p className={styles.markNotice}>Ранее было введено среднее {format(subject.legacyAverage)} без отдельных оценок. Добавьте оценки, чтобы предмет участвовал в новом расчёте.</p>}
      {editor?.subjectId === subject.id && <form ref={editorForm} className={styles.inlineMarkEditor} aria-label={`${editor.original === undefined ? "Новая оценка" : "Изменить оценку"}: ${subject.name}`} onSubmit={(e) => { e.preventDefault(); change(editor.original === undefined ? "add" : "edit"); }} onKeyDown={(e) => { if (e.key === "Escape" && !pending) close(); }}>
        <h4>{editor.original === undefined ? "Новая оценка" : "Изменить оценку"}</h4>
        <div className={styles.gradeChoices} role="group" aria-label="Выберите оценку">{[2, 3, 4, 5].map((value) => <button type="button" key={value} disabled={pending} aria-pressed={editor.value === value} onClick={() => setEditor({ ...editor, value })}>{value}</button>)}</div>
        <div className={styles.gradeActions}><button className={styles.journalPrimary} disabled={pending || editor.value === null} type="submit">{pending ? "Сохраняю…" : "Сохранить"}</button><button type="button" disabled={pending} onClick={close}>Отмена</button>
          {editor.original !== undefined && <button type="button" className={styles.deleteMark} disabled={pending} onClick={() => change("delete")}>Удалить оценку</button>}</div>
      </form>}
      {feedback.error && errorSubject === subject.id && <p className={styles.error} role="alert">{feedback.error}</p>}
      <p className={styles.journalFeedback} role="status" aria-live="polite">{errorSubject === subject.id ? feedback.message : null}</p>
      {feedback.message && errorSubject === subject.id && timeDiffers && <div className={styles.timeChangeNotice}><p>По оценкам — {recommendation.minutes} минут. Пока действует {current.minutes}.</p><button type="button" onClick={() => { timeSummary.current?.focus({ preventScroll: true }); timeSummary.current?.scrollIntoView({ block: "start" }); }}>К применению времени ↑</button></div>}
      {undo?.subjectId === subject.id && <p className={styles.markUndo}>Оценка {undo.original} удалена. <button type="button" disabled={pending} onClick={() => change("restore", undo)}>Отменить удаление</button></p>}
    </article>)}</div>
    <p className={styles.studyNotice}>Среднее считается по оценкам текущей четверти.</p>
  </section>;
}
