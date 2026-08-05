import { expect, test, type Page } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";

const primaryEmail = process.env.E2E_USER_EMAIL;
const secondaryEmail = process.env.E2E_SECOND_USER_EMAIL;
const sourceUrl = process.env.E2E_SOURCE_URL;
const failureSourceUrl = process.env.E2E_FAILURE_SOURCE_URL;
const apiUrl = process.env.E2E_API_URL;

async function signIn(page: Page, emailAddress: string) {
  await setupClerkTestingToken({ page });
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

async function apiFetch(
  page: Page,
  path: string,
  init: { method?: string; body?: unknown } = {},
) {
  return page.evaluate(
    async ({ apiUrl: origin, path: requestPath, init: requestInit }) => {
      const token = await (window as any).Clerk.session.getToken();
      const response = await fetch(`${origin}${requestPath}`, {
        method: requestInit.method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        ...(requestInit.body ? { body: JSON.stringify(requestInit.body) } : {}),
      });
      return {
        status: response.status,
        body: await response.json().catch(() => null),
      };
    },
    { apiUrl, path, init },
  );
}

test.describe.serial("critical learner journey", () => {
  let ownedCourseId = "";

  test.beforeEach(async ({ page }) => {
    test.skip(
      !primaryEmail || !apiUrl,
      "E2E_USER_EMAIL and E2E_API_URL are required",
    );
    await signIn(page, primaryEmail!);
  });

  test("imports a source and completes durable generation", async ({
    page,
  }) => {
    test.skip(!sourceUrl, "E2E_SOURCE_URL is required");
    const created = await apiFetch(page, "/courses", {
      method: "POST",
      body: { sourceUrl },
    });
    expect([202, 409]).toContain(created.status);
    ownedCourseId =
      created.body?.courseId ?? created.body?.existingCourseId ?? "";
    expect(ownedCourseId).not.toBe("");

    await expect
      .poll(
        async () =>
          (await apiFetch(page, `/courses/${ownedCourseId}/status`)).body
            ?.status,
        { timeout: 9 * 60 * 1000 },
      )
      .toBe("READY");
  });

  test("serves study and review work and records completion", async ({
    page,
  }) => {
    test.skip(!ownedCourseId, "import test did not produce a course");
    const course = await apiFetch(page, `/courses/${ownedCourseId}`);
    expect(course.status).toBe(200);
    const chapterId = course.body?.outline?.chapters?.[0]?.id;
    expect(chapterId).toBeTruthy();

    let quiz: any;
    await expect
      .poll(
        async () => {
          const response = await apiFetch(
            page,
            `/courses/${ownedCourseId}/quizzes/${chapterId}`,
          );
          quiz = response.body?.quiz;
          return response.status;
        },
        { timeout: 5 * 60 * 1000 },
      )
      .toBe(200);
    const question = quiz.questions[0];
    const studied = await apiFetch(page, "/study/answer", {
      method: "POST",
      body: {
        courseId: ownedCourseId,
        chapterId,
        questionId: question.id,
        userAnswer: "__intentional_e2e_mistake__",
      },
    });
    expect(studied.status).toBe(200);

    let review: any;
    await expect
      .poll(
        async () => {
          const response = await apiFetch(page, "/reviews/next", {
            method: "POST",
            body: { courseId: ownedCourseId },
          });
          review = response.body;
          return response.body?.status;
        },
        { timeout: 5 * 60 * 1000 },
      )
      .toBe("REVIEW");
    const reviewed = await apiFetch(page, "/reviews/answer", {
      method: "POST",
      body: { reviewId: review.reviewId, answer: "E2E review response" },
    });
    expect(reviewed.status).toBe(200);

    const session = await apiFetch(
      page,
      `/session/today?courseId=${encodeURIComponent(ownedCourseId)}`,
    );
    expect(session.status).toBe(200);
    expect(session.body?.goal?.courseId).toBe(ownedCourseId);
    expect(Array.isArray(session.body?.tasks)).toBe(true);

    await page.goto(`/session?courseId=${encodeURIComponent(ownedCourseId)}`);
    await expect(
      page.getByText(/session|review|question/i).first(),
    ).toBeVisible();
  });

  test("recovers a failed generation through retry", async ({ page }) => {
    test.skip(!failureSourceUrl, "E2E_FAILURE_SOURCE_URL is required");
    const created = await apiFetch(page, "/courses", {
      method: "POST",
      body: { sourceUrl: failureSourceUrl },
    });
    expect(created.status).toBe(202);
    const courseId = created.body.courseId;
    await expect
      .poll(
        async () =>
          (await apiFetch(page, `/courses/${courseId}/status`)).body?.status,
        { timeout: 9 * 60 * 1000 },
      )
      .toBe("FAILED");
    const retry = await apiFetch(page, `/courses/${courseId}/retry`, {
      method: "POST",
    });
    expect(retry.status).toBe(202);
    expect(retry.body.status).toBe("CREATED");
  });

  test("prevents a second user from accessing an owned course", async ({
    page,
  }) => {
    test.skip(!secondaryEmail || !ownedCourseId, "second user/course required");
    await clerk.signOut({ page });
    await signIn(page, secondaryEmail!);
    const response = await apiFetch(page, `/courses/${ownedCourseId}/status`);
    expect(response.status).toBe(404);
  });
});

test("new user can complete Clerk signup", async ({ page }) => {
  test.skip(!process.env.E2E_RUN_SIGNUP, "set E2E_RUN_SIGNUP=1 in dev Clerk");
  await setupClerkTestingToken({ page });
  await page.goto("/sign-up");
  await page.locator(".cl-signUp-root").waitFor();
  const stamp = Date.now();
  const firstName = page.locator('input[name="firstName"]');
  if (await firstName.isVisible()) await firstName.fill("Curriq");
  const lastName = page.locator('input[name="lastName"]');
  if (await lastName.isVisible()) await lastName.fill("E2E");
  const username = page.locator('input[name="username"]');
  if (await username.isVisible()) await username.fill(`curriq_e2e_${stamp}`);
  const legal = page.locator('input[name="legalAccepted"]');
  if (await legal.isVisible()) await legal.check();
  await page
    .locator('input[name="emailAddress"]')
    .fill(`curriq+clerk_test_${stamp}@example.com`);
  await page.locator('input[name="password"]').fill("Curriq-E2E-Password-42!");
  await page.getByRole("button", { name: /continue/i }).click();
  await page
    .getByRole("textbox", { name: /verification code/i })
    .pressSequentially("424242");
  await expect(page).toHaveURL(/\/$/);
  expect((await apiFetch(page, "/account")).status).toBe(200);
  expect(
    (
      await apiFetch(page, "/account", {
        method: "DELETE",
        body: { confirmation: "DELETE" },
      })
    ).status,
  ).toBe(200);
});
