import { expect, test, type Page } from "@playwright/test";

async function openHome(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("composer-input").first()).toBeVisible();
}

test.describe("Nexa guest flows", () => {
  test("chat, history, and share work", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await openHome(page);

    await page.getByTestId("composer-input").first().fill("Respond with only E2E_OK.");
    await page.getByTestId("send-button").first().click();

    await expect(page.getByText("E2E_OK").last()).toBeVisible();
    await expect(page.getByTestId("history-item").first()).toBeVisible();

    await page.getByTestId("share-chat-button").click();
    await expect(page.getByTestId("toast").last()).toContainText("Share link copied");
  });

  test("file upload and history reopen work", async ({ page }) => {
    await openHome(page);

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByTestId("composer-file-input").first().setInputFiles({
      name: "upload-note.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("HELLO_UPLOAD_TOKEN")
    });

    await page.getByTestId("send-button").first().click();
    await expect(page.getByTestId("file-message-card").first()).toBeVisible();
    await expect(page.getByTestId("file-message-card").first()).toContainText(
      "HELLO_UPLOAD_TOKEN"
    );

    await page
      .getByTestId("composer-input")
      .first()
      .fill("What exact token appears in the uploaded file? Answer with only HELLO_UPLOAD_TOKEN.");
    await page.getByTestId("send-button").first().click();

    await expect(page.getByText("HELLO_UPLOAD_TOKEN").last()).toBeVisible();

    await page.getByTestId("new-chat-button").click();
    await expect(page.getByTestId("history-item").first()).toBeVisible();

    await page.getByTestId("history-open-button").first().click();
    await expect(page.getByTestId("file-message-card").first()).toBeVisible();
  });
});
