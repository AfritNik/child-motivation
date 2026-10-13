import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, pin: string) {
  await page.getByLabel("Персональный PIN").fill(pin);
  await page.getByRole("button", { name: "Войти" }).click();
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page.getByRole("heading", { name: "Кто входит?" })).toBeVisible();
}

async function assertResponsive(page: Page, width: number) {
  await page.setViewportSize({ width, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const undersized = await page.locator("button:not([disabled]), a, summary, input:not([type=checkbox]):not([type=hidden])").evaluateAll((elements) =>
    elements.filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
    }).map((element) => ({ text: element.textContent?.trim().slice(0, 60), tag: element.tagName, rect: element.getBoundingClientRect().toJSON() })),
  );
  expect(undersized).toEqual([]);
}

test.describe.serial("release candidate journey", () => {
  test("PIN → child → admin → adult → child, navigation, dialogs and responsive UI", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

    await page.goto("/");
    await page.getByLabel("Персональный PIN").fill("9999");
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page.getByText("Неверный PIN", { exact: true })).toBeVisible();
    await login(page, "5555");
    await expect(page.getByText("Привет, Саша!")).toBeVisible();
    await expect(page.getByRole("link", { name: "Сегодня" })).toHaveAttribute("aria-current", "page");

    for (const width of [320, 390, 430]) {
      await assertResponsive(page, width);
      await page.screenshot({ path: testInfo.outputPath(`child-today-${width}.png`), fullPage: true });
    }
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await expect(page.getByRole("heading", { name: "Сегодня" })).toBeVisible();
    await expect(page.getByText("Привет, Саша!")).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath("child-today-200-percent.png"), fullPage: true });
    await page.reload();

    await page.getByRole("link", { name: "Учёба" }).click();
    await expect(page).toHaveURL(/tab=study/);
    const marks = page.getByRole("article", { name: "Математика", exact: true });
    await expect(marks).toContainText("4,00");
    await expect(page.getByRole("button", { name: "+ Оценка", exact: true })).toHaveCount(0);
    for (const width of [320, 430]) {
      await assertResponsive(page, width);
      await page.screenshot({ path: testInfo.outputPath(`study-marks-${width}.png`), fullPage: true });
    }
    await page.getByRole("link", { name: "Дела" }).click();
    await expect(page).toHaveURL(/tab=chores/);
    await page.goBack();
    await expect(page).toHaveURL(/tab=study/);
    await expect(page.getByRole("heading", { name: "Оценки и время за компьютером" })).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/tab=chores/);
    await expect(page.getByRole("heading", { name: "Домашние дела" })).toBeVisible();
    for (const width of [320, 430]) await assertResponsive(page, width);

    await page.getByRole("checkbox").first().check();
    await expect(page.getByText("Ожидает подтверждения").first()).toBeVisible();
    await page.getByRole("link", { name: "Сегодня" }).click();
    await page.getByRole("checkbox").first().check();
    await expect(page.getByText("Ожидает подтверждения").first()).toBeVisible();
    await page.getByLabel("Что нового попробовал?").fill("Манго");
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(page.getByText("Ожидает подтверждения взрослого")).toBeVisible();

    await page.locator('nav a[href="/?tab=rewards"]').click();
    await expect(page.getByRole("heading", { name: "Сладкое из пекарни", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Чипсы или другая вкусность", exact: true })).toBeVisible();
    for (const width of [320, 430]) await assertResponsive(page, width);
    await page.getByRole("button", { name: "Запросить" }).first().click();
    await expect(page.getByRole("button", { name: "Отменить запрос" })).toBeVisible();
    await page.getByRole("button", { name: "Отменить запрос" }).click();
    await expect(page.getByText("Отменено Сашей")).toBeVisible();
    await page.getByRole("button", { name: "Запросить" }).first().click();
    await expect(page.getByRole("button", { name: "Отменить запрос" })).toBeVisible();
    await logout(page);

    await login(page, "0000");
    await expect(page.getByText("Привет, Папа!")).toBeVisible();
    await expect(page.getByText(/действи/).first()).toBeVisible();
    for (const width of [320, 430]) await assertResponsive(page, width);
    const overdue = page.locator("details").filter({ hasText: "26 августа" });
    await overdue.locator("summary").click();
    await overdue.getByRole("button", { name: "Не подтвердить" }).click();
    const rejectDialog = page.getByRole("dialog", { name: "Не подтверждать?" });
    await rejectDialog.getByLabel("Короткая причина").fill("   ");
    await rejectDialog.getByRole("button", { name: "Не подтверждать" }).click();
    await expect(rejectDialog.getByRole("alert")).toHaveText("Причина должна содержать от 2 до 200 символов");
    await rejectDialog.getByLabel("Короткая причина").fill("Выполнено не полностью");
    await rejectDialog.getByRole("button", { name: "Не подтверждать" }).click();
    await expect(rejectDialog).not.toBeVisible();
    const bulkTrigger = page.getByRole("button", { name: /Подтвердить всё ·/ });
    await bulkTrigger.click();
    const bulkDialog = page.getByRole("dialog", { name: "Подтвердить всё за сегодня?" });
    await expect(bulkDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(bulkDialog).not.toBeVisible();
    await expect(bulkTrigger).toBeFocused();
    await bulkTrigger.click();
    await bulkDialog.getByRole("button", { name: "Подтвердить всё", exact: true }).click();
    await expect(bulkDialog).not.toBeVisible();
    await expect(page.getByText("Все сегодняшние действия уже проверены.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "На сегодня всё" })).toBeVisible();

    await page.getByRole("link", { name: "Учёба" }).click();
    for (const width of [320, 430]) await assertResponsive(page, width);
    const russian = page.getByRole("article", { name: "Русский язык", exact: true });
    await expect(page.locator('[aria-label="Шкала времени в минутах"]')).not.toBeVisible();
    await page.getByText("Как считается время", { exact: true }).click();
    await expect(page.getByText(/Потолка в два часа нет/)).toBeVisible();
    await expect(page.locator('[aria-label="Шкала времени в минутах"]')).toContainText("130");
    await page.getByText("Как считается время", { exact: true }).click();
    await expect(page.getByText("Нажмите на оценку, чтобы исправить её.", { exact: true })).toBeVisible();
    await russian.getByRole("button", { name: "+ Оценка", exact: true }).click();
    const form = russian.getByRole("form");
    await expect(form.getByRole("button", { name: "1", exact: true })).toHaveCount(0);
    await expect(form.locator('input[type="date"]')).toHaveCount(0);
    await form.getByRole("button", { name: "3", exact: true }).click();
    await form.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(russian).toContainText("3,00");
    await expect(russian.getByRole("status")).toHaveText("Оценка сохранена");
    await russian.getByRole("button", { name: "К применению времени ↑" }).click();
    await expect(page.locator('[aria-label="Время за компьютером"]')).toBeFocused();
    await expect(page.getByRole("article", { name: "Действующее время", exact: true })).toContainText("60 мин");
    await page.getByRole("button", { name: "Применить сейчас", exact: true }).click();
    await expect(page.getByRole("article", { name: "Действующее время", exact: true })).toContainText("30 мин");
    await russian.getByRole("button", { name: /Оценка 3, запись 1/ }).click();
    await form.getByRole("button", { name: "5", exact: true }).click();
    await form.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(russian).toContainText("5,00");
    await expect(page.getByRole("article", { name: "Действующее время", exact: true })).toContainText("30 мин");
    await russian.getByRole("button", { name: /Оценка 5, запись 1/ }).click();
    await expect(russian.getByRole("button", { name: /Оценка 5, запись 1/ })).toHaveAttribute("aria-pressed", "true");
    await expect(form.getByRole("button", { name: "5", exact: true })).toBeFocused();
    for (const width of [320, 390, 430, 1280]) {
      await assertResponsive(page, width);
      const inset = await russian.evaluate((card) => {
        const mark = card.querySelector('button[aria-label^="Оценка"]')!;
        return mark.getBoundingClientRect().left - card.getBoundingClientRect().left;
      });
      expect(inset).toBeGreaterThanOrEqual(16);
      await page.screenshot({ path: testInfo.outputPath(`study-reviewed-${width}.png`), fullPage: true });
    }
    await page.screenshot({ path: testInfo.outputPath("study-inline-editor.png"), fullPage: true });
    await form.getByRole("button", { name: "Удалить оценку", exact: true }).click();
    await expect(russian).toContainText("Оценок пока нет");
    await russian.getByRole("button", { name: "Отменить удаление", exact: true }).click();
    await expect(russian).toContainText("5,00");

    await page.locator('nav a[href="/?tab=rewards"]').click();
    for (const width of [320, 430]) await assertResponsive(page, width);
    const correctionAmount = page.getByLabel("Изменение баллов");
    const correctionReason = page.getByLabel("Почему исправляем");
    await correctionAmount.fill("100");
    await correctionReason.fill("Проверка границы");
    await expect(page.getByRole("button", { name: "Проверить исправление" })).toBeDisabled();
    await correctionAmount.fill("1");
    await correctionReason.fill("E2E исправление");
    await page.getByRole("button", { name: "Проверить исправление" }).click();
    const correctionDialog = page.getByRole("dialog", { name: "Записать исправление?" });
    await expect(correctionDialog).toContainText("Баланс:");
    await correctionDialog.getByRole("button", { name: "Записать исправление" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(correctionDialog.getByRole("button", { name: "Записываю…" })).toBeVisible();
    await expect(correctionDialog).not.toBeVisible();
    const pendingReward = page.locator("article").filter({ hasText: "Дополнительные 30 минут" }).filter({ has: page.getByRole("button", { name: "Выдана" }) });
    await pendingReward.getByRole("button", { name: "Выдана" }).click();
    await page.getByRole("dialog", { name: "Выдать награду?" }).getByRole("button", { name: "Выдать и списать" }).click();
    await expect(page.getByRole("dialog", { name: "Выдать награду?" })).not.toBeVisible();

    const directReward = page.locator("article").filter({ hasText: "Дополнительные 30 минут" }).filter({ has: page.getByRole("button", { name: "Выдать", exact: true }) });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await directReward.getByRole("button", { name: "Выдать", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Выдать награду напрямую?" });
      await dialog.getByRole("button", { name: "Выдать и списать" }).click();
      await expect(dialog).not.toBeVisible();
    }
    await page.screenshot({ path: testInfo.outputPath("admin-rewards-390.png"), fullPage: true });
    await logout(page);

    await login(page, "1111");
    await expect(page.getByText("Привет, Дедушка!")).toBeVisible();
    await page.getByRole("link", { name: "Учёба" }).click();
    await expect(page.getByRole("button", { name: "Сохранить средние" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "+ Оценка", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Применить сейчас", exact: true })).toHaveCount(0);
    for (const width of [320, 430]) await assertResponsive(page, width);
    await page.locator('nav a[href="/?tab=rewards"]').click();
    await expect(page.getByLabel("Изменение баллов")).toHaveCount(0);
    await assertResponsive(page, 320);
    await assertResponsive(page, 390);
    await assertResponsive(page, 430);
    await logout(page);

    await login(page, "5555");
    await expect(page.getByText("Привет, Саша!")).toBeVisible();
    await expect(page.getByText(/Подтверждено · \+1/)).toBeVisible();
    await page.locator('nav a[href="/?tab=rewards"]').click();
    await expect(page.getByText("Награда получена").first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
