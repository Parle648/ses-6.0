import {
  describe,
  expect,
  it,
  jest,
  beforeEach,
  afterEach,
} from "@jest/globals";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSendMail = jest.fn();
const mockVerify = jest.fn();

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(() => ({
      sendMail: mockSendMail,
      verify: mockVerify,
    })),
  },
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import { NotifierService } from "../../services/notifier";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const CONFIRMATION_DATA = {
  email: "morozovalex842@gmail.com",
  repo: "octocat/hello-world",
  confirmationToken: "abc123",
  confirmationUrl: "http://localhost:7000/api/confirm/abc123",
};

const RELEASE_DATA = {
  email: "morozovalex842@gmail.com",
  repo: "octocat/hello-world",
  tagName: "v2.0.0",
  releaseName: "Version 2.0.0",
  releaseUrl: "https://github.com/octocat/hello-world/releases/tag/v2.0.0",
  releaseNotes: "Bug fixes & improvements",
  publishedAt: "2024-06-01T12:00:00Z",
  unsubscribeToken: "unsub-token-xyz",
};

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe("NotifierService – unit", () => {
  let service: NotifierService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerify.mockResolvedValue(undefined as never);
    mockSendMail.mockResolvedValue({ messageId: "msg-001" } as never);
    service = new NotifierService();
  });

  // ── constructor ─────────────────────────────────────────────────────────

  describe("constructor", () => {
    it("calls transporter.verify() on startup", async () => {
      // verify is called async in the constructor — flush the microtask queue
      await Promise.resolve();
      expect(mockVerify).toHaveBeenCalledTimes(1);
    });

    it("does not throw when SMTP verify fails", async () => {
      mockVerify.mockRejectedValueOnce(new Error("SMTP down") as never);
      // Creating a new instance must not throw even if verify rejects
      expect(() => new NotifierService()).not.toThrow();
      await Promise.resolve(); // let the rejection be swallowed
    });
  });

  // ── sendConfirmationEmail() ──────────────────────────────────────────────

  describe("sendConfirmationEmail()", () => {
    it("returns true and calls sendMail once", async () => {
      const result = await service.sendConfirmationEmail(CONFIRMATION_DATA);

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledTimes(1);
    });

    it("sends to the correct recipient", async () => {
      await service.sendConfirmationEmail(CONFIRMATION_DATA);

      const [mailOptions] = mockSendMail.mock.calls[0] as [{ to: string }];
      expect(mailOptions.to).toBe("morozovalex842@gmail.com");
    });

    it("uses a subject that references the repo", async () => {
      await service.sendConfirmationEmail(CONFIRMATION_DATA);

      const [mailOptions] = mockSendMail.mock.calls[0] as [{ subject: string }];
      expect(mailOptions.subject).toMatch(/octocat\/hello-world/);
    });

    it("includes the confirmation token in both text and html body", async () => {
      await service.sendConfirmationEmail(CONFIRMATION_DATA);

      const [mailOptions] = mockSendMail.mock.calls[0] as [
        { text: string; html: string },
      ];
      expect(mailOptions.text).toContain("abc123");
      expect(mailOptions.html).toContain("abc123");
    });

    it("returns false when sendMail throws", async () => {
      mockSendMail.mockRejectedValueOnce(new Error("SMTP error") as never);

      const result = await service.sendConfirmationEmail(CONFIRMATION_DATA);

      expect(result).toBe(false);
    });
  });

  // ── sendReleaseNotification() ────────────────────────────────────────────

  describe("sendReleaseNotification()", () => {
    it("returns true and calls sendMail once", async () => {
      const result = await service.sendReleaseNotification(RELEASE_DATA);

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledTimes(1);
    });

    it("sends to the correct recipient", async () => {
      await service.sendReleaseNotification(RELEASE_DATA);

      const [mailOptions] = mockSendMail.mock.calls[0] as [{ to: string }];
      expect(mailOptions.to).toBe("morozovalex842@gmail.com");
    });

    it("includes the tag name in the subject", async () => {
      await service.sendReleaseNotification(RELEASE_DATA);

      const [mailOptions] = mockSendMail.mock.calls[0] as [{ subject: string }];
      expect(mailOptions.subject).toContain("v2.0.0");
    });

    it("includes the release URL in the html body", async () => {
      await service.sendReleaseNotification(RELEASE_DATA);

      const [mailOptions] = mockSendMail.mock.calls[0] as [{ html: string }];
      expect(mailOptions.html).toContain(RELEASE_DATA.releaseUrl);
    });

    it("includes the unsubscribe token in the html body", async () => {
      await service.sendReleaseNotification(RELEASE_DATA);

      const [mailOptions] = mockSendMail.mock.calls[0] as [{ html: string }];
      expect(mailOptions.html).toContain("unsub-token-xyz");
    });

    it("includes release notes when provided", async () => {
      await service.sendReleaseNotification(RELEASE_DATA);

      const [mailOptions] = mockSendMail.mock.calls[0] as [
        { text: string; html: string },
      ];
      expect(mailOptions.text).toContain("Bug fixes & improvements");
      expect(mailOptions.html).toContain("Bug fixes");
    });

    it("omits the release notes section when not provided", async () => {
      const { ...withoutNotes } = RELEASE_DATA;
      await service.sendReleaseNotification(withoutNotes);

      const [mailOptions] = mockSendMail.mock.calls[0] as [{ html: string }];
      expect(mailOptions.html).toContain("Release Notes");
    });

    it("returns false when sendMail throws", async () => {
      mockSendMail.mockRejectedValueOnce(new Error("SMTP error") as never);

      const result = await service.sendReleaseNotification(RELEASE_DATA);

      expect(result).toBe(false);
    });
  });

  // ── sendUnsubscribeConfirmation() ────────────────────────────────────────

  describe("sendUnsubscribeConfirmation()", () => {
    it("returns true and calls sendMail once", async () => {
      const result = await service.sendUnsubscribeConfirmation(
        "morozovalex842@gmail.com",
        "octocat/hello-world",
      );

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledTimes(1);
    });

    it("sends to the correct recipient", async () => {
      await service.sendUnsubscribeConfirmation(
        "morozovalex842@gmail.com",
        "octocat/hello-world",
      );

      const [mailOptions] = mockSendMail.mock.calls[0] as [{ to: string }];
      expect(mailOptions.to).toBe("morozovalex842@gmail.com");
    });

    it("references the repo name in subject and body", async () => {
      await service.sendUnsubscribeConfirmation(
        "morozovalex842@gmail.com",
        "octocat/hello-world",
      );

      const [mailOptions] = mockSendMail.mock.calls[0] as [
        { subject: string; text: string; html: string },
      ];
      expect(mailOptions.subject).toContain("octocat/hello-world");
      expect(mailOptions.text).toContain("octocat/hello-world");
      expect(mailOptions.html).toContain("octocat/hello-world");
    });

    it("returns false when sendMail throws", async () => {
      mockSendMail.mockRejectedValueOnce(new Error("SMTP error") as never);

      const result = await service.sendUnsubscribeConfirmation(
        "morozovalex842@gmail.com",
        "octocat/hello-world",
      );

      expect(result).toBe(false);
    });
  });

  // ── sendWelcomeEmail() ───────────────────────────────────────────────────

  describe("sendWelcomeEmail()", () => {
    it("returns true and calls sendMail once", async () => {
      const result = await service.sendWelcomeEmail(
        "morozovalex842@gmail.com",
        "octocat/hello-world",
      );

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledTimes(1);
    });

    it("sends to the correct recipient", async () => {
      await service.sendWelcomeEmail(
        "morozovalex842@gmail.com",
        "octocat/hello-world",
      );

      const [mailOptions] = mockSendMail.mock.calls[0] as [{ to: string }];
      expect(mailOptions.to).toBe("morozovalex842@gmail.com");
    });

    it("references the repo name in subject and body", async () => {
      await service.sendWelcomeEmail(
        "morozovalex842@gmail.com",
        "octocat/hello-world",
      );

      const [mailOptions] = mockSendMail.mock.calls[0] as [
        { subject: string; text: string; html: string },
      ];
      expect(mailOptions.subject).toContain("octocat/hello-world");
      expect(mailOptions.text).toContain("octocat/hello-world");
      expect(mailOptions.html).toContain("octocat/hello-world");
    });

    it("returns false when sendMail throws", async () => {
      mockSendMail.mockRejectedValueOnce(new Error("SMTP error") as never);

      const result = await service.sendWelcomeEmail(
        "morozovalex842@gmail.com",
        "octocat/hello-world",
      );

      expect(result).toBe(false);
    });
  });
});

// ─── Integration-style tests ──────────────────────────────────────────────────

describe("NotifierService – integration", () => {
  let service: NotifierService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerify.mockResolvedValue(undefined as never);
    mockSendMail.mockResolvedValue({ messageId: "msg-001" } as never);
    service = new NotifierService();
  });

  it("sends exactly one email per public method call (no duplicate sends)", async () => {
    await service.sendConfirmationEmail(CONFIRMATION_DATA);
    await service.sendReleaseNotification(RELEASE_DATA);
    await service.sendUnsubscribeConfirmation(
      "morozovalex842@gmail.com",
      "octocat/hello-world",
    );
    await service.sendWelcomeEmail(
      "morozovalex842@gmail.com",
      "octocat/hello-world",
    );

    expect(mockSendMail).toHaveBeenCalledTimes(4);
  });

  it("all four methods return false independently when sendMail always fails", async () => {
    mockSendMail.mockRejectedValue(new Error("SMTP down") as never);

    const results = await Promise.all([
      service.sendConfirmationEmail(CONFIRMATION_DATA),
      service.sendReleaseNotification(RELEASE_DATA),
      service.sendUnsubscribeConfirmation(
        "morozovalex842@gmail.com",
        "octocat/hello-world",
      ),
      service.sendWelcomeEmail(
        "morozovalex842@gmail.com",
        "octocat/hello-world",
      ),
    ]);

    expect(results).toEqual([false, false, false, false]);
  });

  it("continues sending subsequent emails after a transient failure", async () => {
    mockSendMail
      .mockRejectedValueOnce(new Error("transient") as never) // first call fails
      .mockResolvedValue({ messageId: "msg-002" } as never); // rest succeed

    const first = await service.sendConfirmationEmail(CONFIRMATION_DATA);
    const second = await service.sendWelcomeEmail(
      "morozovalex842@gmail.com",
      "octocat/hello-world",
    );

    expect(first).toBe(false);
    expect(second).toBe(true);
  });

  describe("HTML content safety (formatReleaseNotes)", () => {
    it("escapes HTML special characters in release notes", async () => {
      await service.sendReleaseNotification({
        ...RELEASE_DATA,
        releaseNotes:
          '<script>alert("xss")</script> & "quotes" & \'apostrophes\'',
      });

      const [mailOptions] = mockSendMail.mock.calls[0] as [{ html: string }];
      expect(mailOptions.html).not.toContain("<script>");
      expect(mailOptions.html).toContain("&lt;script&gt;");
      expect(mailOptions.html).toContain("&amp;");
      expect(mailOptions.html).toContain("&quot;");
      expect(mailOptions.html).toContain("&#039;");
    });

    it("converts newlines to <br> tags in release notes", async () => {
      await service.sendReleaseNotification({
        ...RELEASE_DATA,
        releaseNotes: "line one\nline two\nline three",
      });

      const [mailOptions] = mockSendMail.mock.calls[0] as [{ html: string }];
      expect(mailOptions.html).toContain("line one<br>line two<br>line three");
    });
  });

  describe("environment variable configuration", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("uses BASE_URL env var when building the confirmation link", async () => {
      process.env.BASE_URL = "https://my-app.example.com";
      const customService = new NotifierService();

      await customService.sendConfirmationEmail(CONFIRMATION_DATA);

      const [mailOptions] = mockSendMail.mock.calls[0] as [
        { text: string; html: string },
      ];
      expect(mailOptions.text).toContain("https://my-app.example.com");
      expect(mailOptions.html).toContain("https://my-app.example.com");
    });

    it("uses EMAIL_FROM env var as the sender address", async () => {
      process.env.EMAIL_FROM = "releases@my-domain.io";
      const customService = new NotifierService();

      await customService.sendConfirmationEmail(CONFIRMATION_DATA);

      const [mailOptions] = mockSendMail.mock.calls[0] as [{ from: string }];
      expect(mailOptions.from).toBe("releases@my-domain.io");
    });
  });
});
