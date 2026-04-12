// import "reflect-metadata";
// import { describe, expect, it, jest, beforeEach } from "@jest/globals";

// // ─── Mocks (must come before imports that trigger module resolution) ──────────

// const mockClient = {
//   query: jest.fn(),
//   release: jest.fn(),
// };

// jest.mock("../../config/db-connection", () => ({
//   __esModule: true,
//   default: {
//     connect: jest.fn(),
//   },
// }));

// jest.mock("../../services/notifier", () => ({
//   notifierService: {
//     sendConfirmationEmail: jest.fn(),
//     sendWelcomeEmail: jest.fn(),
//     sendUnsubscribeConfirmation: jest.fn(),
//   },
// }));

// const mockOctokitRepos = {
//   get: jest.fn().mockResolvedValue({ data: {} } as never),
//   getLatestRelease: jest
//     .fn()
//     .mockResolvedValue({ data: { tag_name: "v1.0.0" } } as never),
// };

// jest.mock("@octokit/rest", () => ({
//   Octokit: jest.fn().mockImplementation(() => ({
//     rest: { repos: mockOctokitRepos },
//   })),
// }));

// jest.mock("crypto", () => {
//   const actual = jest.requireActual<typeof import("crypto")>("crypto");
//   return {
//     ...actual,
//     randomBytes: jest.fn((size: number) => ({
//       toString: () => "a".repeat(size * 2),
//     })),
//   };
// });

// // ─── Subject under test ───────────────────────────────────────────────────────

// import { SubscribeController } from "../../controllers/subscribe-controller";
// import { notifierService } from "../../services/notifier";

// // ─── Helpers ──────────────────────────────────────────────────────────────────

// function mockQueries(...rows: Array<{ rows: unknown[] }>) {
//   rows.forEach((result) =>
//     mockClient.query.mockResolvedValueOnce(result as never),
//   );
// }

// // ─── Unit tests ───────────────────────────────────────────────────────────────

// describe("SubscribeController – unit", () => {
//   let controller: SubscribeController;

//   beforeEach(() => {
//     controller = new SubscribeController();
//     jest.clearAllMocks();

//     // Restore default Octokit behaviour after per-test overrides
//     mockOctokitRepos.get.mockResolvedValue({ data: {} } as never);
//     mockOctokitRepos.getLatestRelease.mockResolvedValue({
//       data: { tag_name: "v1.0.0" },
//     } as never);
//   });

//   // ── POST /subscribe ──────────────────────────────────────────────────────

//   describe("createSubscription()", () => {
//     it("creates a new subscription and sends a confirmation email", async () => {
//       mockQueries(
//         { rows: [] }, // BEGIN
//         { rows: [{ id: 1, email: "user@example.com", username: "user_aaaa" }] }, // upsert user
//         { rows: [{ id: 10, owner: "octocat", repository: "hello-world" }] }, // upsert repo
//         { rows: [] }, // no existing sub
//         {
//           rows: [{ id: 100, last_seen_tag: "v1.0.0", created_at: new Date() }],
//         }, // insert sub
//         { rows: [] }, // COMMIT
//       );

//       const result = await controller.createSubscription({
//         email: "user@example.com",
//         repo: "octocat/hello-world",
//       });

//       expect(result.message).toMatch(/created successfully/i);
//       expect(result.subscription.email).toBe("user@example.com");
//       expect(result.subscription.repo).toBe("octocat/hello-world");
//       expect(result.subscription.confirmed).toBe(false);
//       expect(notifierService.sendConfirmationEmail).toHaveBeenCalledTimes(1);
//       expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
//     });

//     it("resends confirmation email when unconfirmed subscription already exists", async () => {
//       mockQueries(
//         { rows: [] }, // BEGIN
//         { rows: [{ id: 1, email: "user@example.com", username: "user_aaaa" }] },
//         { rows: [{ id: 10, owner: "octocat", repository: "hello-world" }] },
//         { rows: [{ id: 99, confirmed: false, is_active: true }] }, // unconfirmed dupe
//         { rows: [{ id: 99, created_at: new Date() }] }, // UPDATE token
//         { rows: [] }, // COMMIT
//       );

//       const result = await controller.createSubscription({
//         email: "user@example.com",
//         repo: "octocat/hello-world",
//       });

//       expect(result.message).toMatch(/resent/i);
//       expect(result.subscription.confirmed).toBe(false);
//       expect(notifierService.sendConfirmationEmail).toHaveBeenCalledTimes(1);
//     });

//     it("throws 409 when email is already confirmed for the repository", async () => {
//       mockQueries(
//         { rows: [] }, // BEGIN
//         { rows: [{ id: 1, email: "user@example.com", username: "user_aaaa" }] },
//         { rows: [{ id: 10, owner: "octocat", repository: "hello-world" }] },
//         { rows: [{ id: 99, confirmed: true, is_active: true }] }, // confirmed dupe
//       );

//       await expect(
//         controller.createSubscription({
//           email: "user@example.com",
//           repo: "octocat/hello-world",
//         }),
//       ).rejects.toMatchObject({ httpCode: 409 });

//       expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
//     });

//     it("throws 404 when the GitHub repository does not exist", async () => {
//       mockOctokitRepos.get.mockRejectedValueOnce({ status: 404 } as never);

//       mockQueries({ rows: [] }); // BEGIN

//       await expect(
//         controller.createSubscription({
//           email: "user@example.com",
//           repo: "ghost/nonexistent",
//         }),
//       ).rejects.toMatchObject({ httpCode: 404 });

//       expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
//     });

//     it("sets last_seen_tag to null when the repository has no releases", async () => {
//       mockOctokitRepos.getLatestRelease.mockRejectedValueOnce({
//         status: 404,
//       } as never);

//       mockQueries(
//         { rows: [] }, // BEGIN
//         { rows: [{ id: 1, email: "user@example.com", username: "user_aaaa" }] },
//         { rows: [{ id: 10, owner: "octocat", repository: "new-repo" }] },
//         { rows: [] }, // no existing sub
//         { rows: [{ id: 101, last_seen_tag: null, created_at: new Date() }] },
//         { rows: [] }, // COMMIT
//       );

//       const result = await controller.createSubscription({
//         email: "user@example.com",
//         repo: "octocat/new-repo",
//       });

//       expect(result.subscription.lastSeenTag).toBeNull();
//     });
//   });

//   // ── GET /confirm/:token ──────────────────────────────────────────────────

//   describe("confirm()", () => {
//     it("confirms a pending subscription and sends a welcome email", async () => {
//       mockQueries(
//         {
//           rows: [
//             {
//               id: 100,
//               user_id: 1,
//               repository_id: 10,
//               confirmed: false,
//               owner: "octocat",
//               repository: "hello-world",
//               email: "user@example.com",
//             },
//           ],
//         },
//         { rows: [{ id: 100, confirmed: true }] }, // UPDATE
//       );

//       const result = await controller.confirm("valid-token");

//       expect(result.message).toMatch(/confirmed successfully/i);
//       expect(result.subscription.confirmed).toBe(true);
//       expect(notifierService.sendWelcomeEmail).toHaveBeenCalledWith(
//         "user@example.com",
//         "octocat/hello-world",
//       );
//     });

//     it("returns without sending an email when already confirmed", async () => {
//       mockQueries({
//         rows: [
//           {
//             id: 100,
//             confirmed: true,
//             owner: "octocat",
//             repository: "hello-world",
//             email: "user@example.com",
//           },
//         ],
//       });

//       const result = await controller.confirm("already-used-token");

//       expect(result.message).toMatch(/already confirmed/i);
//       expect(notifierService.sendWelcomeEmail).not.toHaveBeenCalled();
//     });

//     it("throws 404 for an invalid token", async () => {
//       mockQueries({ rows: [] });

//       await expect(controller.confirm("bad-token")).rejects.toMatchObject({
//         httpCode: 404,
//       });
//     });
//   });

//   // ── GET /unsubscribe/:token ──────────────────────────────────────────────

//   describe("unsubscribe()", () => {
//     it("deactivates the subscription and sends a confirmation email", async () => {
//       mockQueries(
//         {
//           rows: [
//             {
//               id: 100,
//               owner: "octocat",
//               repository: "hello-world",
//               email: "user@example.com",
//             },
//           ],
//         },
//         { rows: [] }, // UPDATE
//       );

//       const result = await controller.unsubscribe("unsubscribe-token");

//       expect(result.message).toMatch(/unsubscribed successfully/i);
//       expect(result.subscription.active).toBe(false);
//       expect(notifierService.sendUnsubscribeConfirmation).toHaveBeenCalledWith(
//         "user@example.com",
//         "octocat/hello-world",
//       );
//     });

//     it("throws 404 for an invalid unsubscribe token", async () => {
//       mockQueries({ rows: [] });

//       await expect(controller.unsubscribe("bad-token")).rejects.toMatchObject({
//         httpCode: 404,
//       });
//     });
//   });

//   // ── GET /subscriptions ───────────────────────────────────────────────────

//   describe("getAll()", () => {
//     it("returns all active subscriptions for an email address", async () => {
//       mockQueries({
//         rows: [
//           {
//             id: 1,
//             email: "user@example.com",
//             owner: "octocat",
//             repository: "hello-world",
//             confirmed: true,
//             confirmed_at: new Date("2024-01-01"),
//             last_seen_tag: "v1.0.0",
//             last_notification_at: null,
//             notification_count: 3,
//             is_active: true,
//             created_at: new Date("2023-12-01"),
//           },
//         ],
//       });

//       const result = await controller.getAll("user@example.com");

//       expect(result.email).toBe("user@example.com");
//       expect(result.count).toBe(1);
//       expect(result.subscriptions[0].repo).toBe("octocat/hello-world");
//       expect(result.subscriptions[0].confirmed).toBe(true);
//       expect(result.subscriptions[0].lastSeenTag).toBe("v1.0.0");
//     });

//     it("returns an empty list when the user has no active subscriptions", async () => {
//       mockQueries({ rows: [] });

//       const result = await controller.getAll("nobody@example.com");

//       expect(result.count).toBe(0);
//       expect(result.subscriptions).toHaveLength(0);
//     });

//     it("throws 400 when no email query parameter is provided", async () => {
//       await expect(
//         controller.getAll(undefined as unknown as string),
//       ).rejects.toMatchObject({ httpCode: 400 });
//     });
//   });
// });

// // ─── Integration-style tests (transaction & connection lifecycle) ──────────────

// describe("SubscribeController – integration", () => {
//   let controller: SubscribeController;

//   beforeEach(() => {
//     controller = new SubscribeController();
//     jest.clearAllMocks();

//     mockOctokitRepos.get.mockResolvedValue({ data: {} } as never);
//     mockOctokitRepos.getLatestRelease.mockResolvedValue({
//       data: { tag_name: "v1.0.0" },
//     } as never);
//   });

//   it("releases the DB client and rolls back when a query throws during createSubscription", async () => {
//     mockClient.query
//       .mockResolvedValueOnce({ rows: [] } as never) // BEGIN
//       .mockRejectedValueOnce(new Error("DB error") as never); // upsert user throws

//     await expect(
//       controller.createSubscription({
//         email: "user@example.com",
//         repo: "octocat/hello-world",
//       }),
//     ).rejects.toThrow("DB error");

//     expect(mockClient.release).toHaveBeenCalledTimes(1);
//     expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
//   });

//   it("releases the DB client when confirm() throws", async () => {
//     mockClient.query.mockRejectedValueOnce(new Error("DB error") as never);

//     await expect(controller.confirm("any-token")).rejects.toThrow("DB error");

//     expect(mockClient.release).toHaveBeenCalledTimes(1);
//   });

//   it("releases the DB client when unsubscribe() throws", async () => {
//     mockClient.query.mockRejectedValueOnce(new Error("DB error") as never);

//     await expect(controller.unsubscribe("any-token")).rejects.toThrow(
//       "DB error",
//     );

//     expect(mockClient.release).toHaveBeenCalledTimes(1);
//   });

//   it("releases the DB client when getAll() throws", async () => {
//     mockClient.query.mockRejectedValueOnce(new Error("DB error") as never);

//     await expect(controller.getAll("user@example.com")).rejects.toThrow(
//       "DB error",
//     );

//     expect(mockClient.release).toHaveBeenCalledTimes(1);
//   });

//   it("rolls back when sending the confirmation email fails", async () => {
//     (notifierService.sendConfirmationEmail as jest.Mock).mockRejectedValueOnce(
//       new Error("SMTP error") as never,
//     );

//     mockQueries(
//       { rows: [] }, // BEGIN
//       { rows: [{ id: 1, email: "user@example.com", username: "user_aaaa" }] },
//       { rows: [{ id: 10, owner: "octocat", repository: "hello-world" }] },
//       { rows: [] }, // no existing sub
//       { rows: [{ id: 100, last_seen_tag: "v1.0.0", created_at: new Date() }] },
//     );

//     await expect(
//       controller.createSubscription({
//         email: "user@example.com",
//         repo: "octocat/hello-world",
//       }),
//     ).rejects.toThrow("SMTP error");

//     expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
//   });

//   it("wraps createSubscription in BEGIN … COMMIT", async () => {
//     mockQueries(
//       { rows: [] }, // BEGIN
//       { rows: [{ id: 1, email: "user@example.com", username: "user_aaaa" }] },
//       { rows: [{ id: 10, owner: "octocat", repository: "hello-world" }] },
//       { rows: [] },
//       { rows: [{ id: 100, last_seen_tag: "v1.0.0", created_at: new Date() }] },
//       { rows: [] }, // COMMIT
//     );

//     await controller.createSubscription({
//       email: "user@example.com",
//       repo: "octocat/hello-world",
//     });

//     const calls: string[] = (mockClient.query.mock.calls as unknown[][]).map(
//       (c) => c[0] as string,
//     );
//     expect(calls[0]).toBe("BEGIN");
//     expect(calls[calls.length - 1]).toBe("COMMIT");
//   });
// });
import "reflect-metadata";
import { describe, expect, it, jest, beforeEach } from "@jest/globals";

// ─── Mocks (must come before imports that trigger module resolution) ──────────

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

// pool.connect is mocked here without a return value — we set it in beforeEach
// so that `mockClient` (defined above in module scope) is always available.
jest.mock("../../config/db-connection", () => ({
  __esModule: true,
  default: { connect: jest.fn() },
}));

jest.mock("../../services/notifier", () => ({
  notifierService: {
    sendConfirmationEmail: jest.fn(),
    sendWelcomeEmail: jest.fn(),
    sendUnsubscribeConfirmation: jest.fn(),
  },
}));

const mockOctokitRepos = {
  get: jest.fn(),
  getLatestRelease: jest.fn(),
};

jest.mock("@octokit/rest", () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    rest: { repos: mockOctokitRepos },
  })),
}));

jest.mock("crypto", () => {
  const actual = jest.requireActual<typeof import("crypto")>("crypto");
  return {
    ...actual,
    randomBytes: jest.fn((size: number) => ({
      toString: () => "a".repeat(size * 2),
    })),
  };
});

// ─── Subject under test ───────────────────────────────────────────────────────

import { SubscribeController } from "../../controllers/subscribe-controller";
import { notifierService } from "../../services/notifier";
import pool from "../../config/db-connection";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockQueries(...results: Array<{ rows: unknown[] }>) {
  results.forEach((r) => mockClient.query.mockResolvedValueOnce(r as never));
}

function resetOctokit() {
  mockOctokitRepos.get.mockResolvedValue({ data: {} } as never);
  mockOctokitRepos.getLatestRelease.mockResolvedValue({
    data: { tag_name: "v1.0.0" },
  } as never);
}

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe("SubscribeController – unit", () => {
  let controller: SubscribeController;

  beforeEach(() => {
    jest.clearAllMocks();
    // Wire pool.connect → mockClient AFTER clearAllMocks so it isn't wiped
    (pool.connect as jest.Mock).mockResolvedValue(mockClient as never);
    resetOctokit();
    controller = new SubscribeController();
  });

  // ── POST /subscribe ──────────────────────────────────────────────────────

  describe("createSubscription()", () => {
    it("creates a new subscription and sends a confirmation email", async () => {
      mockQueries(
        { rows: [] }, // BEGIN
        { rows: [{ id: 1, email: "user@example.com", username: "user_aaaa" }] }, // upsert user
        { rows: [{ id: 10, owner: "octocat", repository: "hello-world" }] }, // upsert repo
        { rows: [] }, // no existing sub
        {
          rows: [{ id: 100, last_seen_tag: "v1.0.0", created_at: new Date() }],
        }, // insert sub
        { rows: [] }, // COMMIT
      );

      const result = await controller.createSubscription({
        email: "user@example.com",
        repo: "octocat/hello-world",
      });

      expect(result.message).toMatch(/created successfully/i);
      expect(result.subscription.email).toBe("user@example.com");
      expect(result.subscription.repo).toBe("octocat/hello-world");
      expect(result.subscription.confirmed).toBe(false);
      expect(notifierService.sendConfirmationEmail).toHaveBeenCalledTimes(1);
      expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
    });

    it("resends confirmation email when unconfirmed subscription already exists", async () => {
      mockQueries(
        { rows: [] }, // BEGIN
        { rows: [{ id: 1, email: "user@example.com", username: "user_aaaa" }] },
        { rows: [{ id: 10, owner: "octocat", repository: "hello-world" }] },
        { rows: [{ id: 99, confirmed: false, is_active: true }] }, // unconfirmed dupe
        { rows: [{ id: 99, created_at: new Date() }] }, // UPDATE token
        { rows: [] }, // COMMIT
      );

      const result = await controller.createSubscription({
        email: "user@example.com",
        repo: "octocat/hello-world",
      });

      expect(result.message).toMatch(/resent/i);
      expect(result.subscription.confirmed).toBe(false);
      expect(notifierService.sendConfirmationEmail).toHaveBeenCalledTimes(1);
    });

    it("throws 409 when email is already confirmed for the repository", async () => {
      mockQueries(
        { rows: [] }, // BEGIN
        { rows: [{ id: 1, email: "user@example.com", username: "user_aaaa" }] },
        { rows: [{ id: 10, owner: "octocat", repository: "hello-world" }] },
        { rows: [{ id: 99, confirmed: true, is_active: true }] }, // confirmed dupe
      );

      await expect(
        controller.createSubscription({
          email: "user@example.com",
          repo: "octocat/hello-world",
        }),
      ).rejects.toMatchObject({ httpCode: 409 });

      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    });

    it("throws 404 when the GitHub repository does not exist", async () => {
      mockOctokitRepos.get.mockRejectedValueOnce({ status: 404 } as never);
      mockQueries({ rows: [] }); // BEGIN

      await expect(
        controller.createSubscription({
          email: "user@example.com",
          repo: "ghost/nonexistent",
        }),
      ).rejects.toMatchObject({ httpCode: 404 });

      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    });

    it("sets last_seen_tag to null when the repository has no releases", async () => {
      mockOctokitRepos.getLatestRelease.mockRejectedValueOnce({
        status: 404,
      } as never);

      mockQueries(
        { rows: [] }, // BEGIN
        { rows: [{ id: 1, email: "user@example.com", username: "user_aaaa" }] },
        { rows: [{ id: 10, owner: "octocat", repository: "new-repo" }] },
        { rows: [] }, // no existing sub
        { rows: [{ id: 101, last_seen_tag: null, created_at: new Date() }] },
        { rows: [] }, // COMMIT
      );

      const result = await controller.createSubscription({
        email: "user@example.com",
        repo: "octocat/new-repo",
      });

      expect(result.subscription.lastSeenTag).toBeNull();
    });
  });

  // ── GET /confirm/:token ──────────────────────────────────────────────────

  describe("confirm()", () => {
    it("confirms a pending subscription and sends a welcome email", async () => {
      mockQueries(
        {
          rows: [
            {
              id: 100,
              user_id: 1,
              repository_id: 10,
              confirmed: false,
              owner: "octocat",
              repository: "hello-world",
              email: "user@example.com",
            },
          ],
        },
        { rows: [{ id: 100, confirmed: true }] }, // UPDATE
      );

      const result = await controller.confirm("valid-token");

      expect(result.message).toMatch(/confirmed successfully/i);
      expect(result.subscription.confirmed).toBe(true);
      expect(notifierService.sendWelcomeEmail).toHaveBeenCalledWith(
        "user@example.com",
        "octocat/hello-world",
      );
    });

    it("returns without sending an email when already confirmed", async () => {
      mockQueries({
        rows: [
          {
            id: 100,
            confirmed: true,
            owner: "octocat",
            repository: "hello-world",
            email: "user@example.com",
          },
        ],
      });

      const result = await controller.confirm("already-used-token");

      expect(result.message).toMatch(/already confirmed/i);
      expect(notifierService.sendWelcomeEmail).not.toHaveBeenCalled();
    });

    it("throws 404 for an invalid token", async () => {
      mockQueries({ rows: [] });

      await expect(controller.confirm("bad-token")).rejects.toMatchObject({
        httpCode: 404,
      });
    });
  });

  // ── GET /unsubscribe/:token ──────────────────────────────────────────────

  describe("unsubscribe()", () => {
    it("deactivates the subscription and sends a confirmation email", async () => {
      mockQueries(
        {
          rows: [
            {
              id: 100,
              owner: "octocat",
              repository: "hello-world",
              email: "user@example.com",
            },
          ],
        },
        { rows: [] }, // UPDATE
      );

      const result = await controller.unsubscribe("unsubscribe-token");

      expect(result.message).toMatch(/unsubscribed successfully/i);
      expect(result.subscription.active).toBe(false);
      expect(notifierService.sendUnsubscribeConfirmation).toHaveBeenCalledWith(
        "user@example.com",
        "octocat/hello-world",
      );
    });

    it("throws 404 for an invalid unsubscribe token", async () => {
      mockQueries({ rows: [] });

      await expect(controller.unsubscribe("bad-token")).rejects.toMatchObject({
        httpCode: 404,
      });
    });
  });

  // ── GET /subscriptions ───────────────────────────────────────────────────

  describe("getAll()", () => {
    it("returns all active subscriptions for an email address", async () => {
      mockQueries({
        rows: [
          {
            id: 1,
            email: "user@example.com",
            owner: "octocat",
            repository: "hello-world",
            confirmed: true,
            confirmed_at: new Date("2024-01-01"),
            last_seen_tag: "v1.0.0",
            last_notification_at: null,
            notification_count: 3,
            is_active: true,
            created_at: new Date("2023-12-01"),
          },
        ],
      });

      const result = await controller.getAll("user@example.com");

      expect(result.email).toBe("user@example.com");
      expect(result.count).toBe(1);
      expect(result.subscriptions[0].repo).toBe("octocat/hello-world");
      expect(result.subscriptions[0].confirmed).toBe(true);
      expect(result.subscriptions[0].lastSeenTag).toBe("v1.0.0");
    });

    it("returns an empty list when the user has no active subscriptions", async () => {
      mockQueries({ rows: [] });

      const result = await controller.getAll("nobody@example.com");

      expect(result.count).toBe(0);
      expect(result.subscriptions).toHaveLength(0);
    });

    it("throws 400 when no email query parameter is provided", async () => {
      await expect(
        controller.getAll(undefined as unknown as string),
      ).rejects.toMatchObject({ httpCode: 400 });
    });
  });
});

// ─── Integration-style tests (transaction & connection lifecycle) ─────────────

describe("SubscribeController – integration", () => {
  let controller: SubscribeController;

  beforeEach(() => {
    jest.clearAllMocks();
    (pool.connect as jest.Mock).mockResolvedValue(mockClient as never);
    resetOctokit();
    controller = new SubscribeController();
  });

  it("releases the DB client and rolls back when a query throws during createSubscription", async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] } as never) // BEGIN
      .mockRejectedValueOnce(new Error("DB error") as never); // upsert user throws

    await expect(
      controller.createSubscription({
        email: "user@example.com",
        repo: "octocat/hello-world",
      }),
    ).rejects.toThrow("DB error");

    expect(mockClient.release).toHaveBeenCalledTimes(1);
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("releases the DB client when confirm() throws", async () => {
    mockClient.query.mockRejectedValueOnce(new Error("DB error") as never);

    await expect(controller.confirm("any-token")).rejects.toThrow("DB error");

    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it("releases the DB client when unsubscribe() throws", async () => {
    mockClient.query.mockRejectedValueOnce(new Error("DB error") as never);

    await expect(controller.unsubscribe("any-token")).rejects.toThrow(
      "DB error",
    );

    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it("releases the DB client when getAll() throws", async () => {
    mockClient.query.mockRejectedValueOnce(new Error("DB error") as never);

    await expect(controller.getAll("user@example.com")).rejects.toThrow(
      "DB error",
    );

    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it("rolls back when sending the confirmation email fails", async () => {
    (notifierService.sendConfirmationEmail as jest.Mock).mockRejectedValueOnce(
      new Error("SMTP error") as never,
    );

    mockQueries(
      { rows: [] }, // BEGIN
      { rows: [{ id: 1, email: "user@example.com", username: "user_aaaa" }] },
      { rows: [{ id: 10, owner: "octocat", repository: "hello-world" }] },
      { rows: [] }, // no existing sub
      { rows: [{ id: 100, last_seen_tag: "v1.0.0", created_at: new Date() }] },
    );

    await expect(
      controller.createSubscription({
        email: "user@example.com",
        repo: "octocat/hello-world",
      }),
    ).rejects.toThrow("SMTP error");

    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("wraps createSubscription in BEGIN … COMMIT", async () => {
    mockQueries(
      { rows: [] }, // BEGIN
      { rows: [{ id: 1, email: "user@example.com", username: "user_aaaa" }] },
      { rows: [{ id: 10, owner: "octocat", repository: "hello-world" }] },
      { rows: [] },
      { rows: [{ id: 100, last_seen_tag: "v1.0.0", created_at: new Date() }] },
      { rows: [] }, // COMMIT
    );

    await controller.createSubscription({
      email: "user@example.com",
      repo: "octocat/hello-world",
    });

    const calls = (mockClient.query.mock.calls as unknown[][]).map(
      (c) => c[0] as string,
    );
    expect(calls[0]).toBe("BEGIN");
    expect(calls[calls.length - 1]).toBe("COMMIT");
  });
});
