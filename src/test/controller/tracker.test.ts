import {
  describe,
  expect,
  it,
  jest,
  beforeEach,
  afterEach,
} from "@jest/globals";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

jest.mock("../../config/db-connection", () => ({
  __esModule: true,
  default: { connect: jest.fn() },
}));

const mockRepos = {
  getLatestRelease: jest.fn(),
  listReleases: jest.fn(),
};

const mockRateLimit = {
  get: jest.fn(),
};

jest.mock("@octokit/rest", () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    rest: {
      repos: mockRepos,
      rateLimit: mockRateLimit,
    },
  })),
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import { ReleaseTrackerService } from "../../services/release-tracker";
import pool from "../../config/db-connection";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

function makeRelease(
  overrides: Partial<{
    tag_name: string;
    name: string;
    body: string;
    draft: boolean;
    prerelease: boolean;
    published_at: string;
    html_url: string;
  }> = {},
) {
  return {
    id: 1,
    tag_name: "v1.0.0",
    name: "Version 1.0.0",
    body: "Initial release",
    draft: false,
    prerelease: false,
    created_at: "2024-01-01T00:00:00Z",
    published_at: "2024-01-01T00:00:00Z",
    html_url: "https://github.com/octocat/hello-world/releases/tag/v1.0.0",
    ...overrides,
  };
}

function makeRepo(
  overrides: Partial<{
    id: number;
    owner: string;
    repository: string;
    last_seen_tag: string | null;
  }> = {},
) {
  return {
    id: 1,
    owner: "octocat",
    repository: "hello-world",
    last_seen_tag: "v0.9.0",
    ...overrides,
  };
}

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe("ReleaseTrackerService – unit", () => {
  let service: ReleaseTrackerService;

  beforeEach(() => {
    jest.clearAllMocks();
    (pool.connect as jest.Mock).mockResolvedValue(mockClient as never);
    // Default: delay is a no-op so tests don't wait 1 s per repo
    jest.useFakeTimers();
    service = new ReleaseTrackerService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── getActiveRepositories() ──────────────────────────────────────────────

  describe("getActiveRepositories()", () => {
    it("returns rows from the database", async () => {
      const rows = [
        makeRepo(),
        makeRepo({ id: 2, owner: "torvalds", repository: "linux" }),
      ];
      mockClient.query.mockResolvedValueOnce({ rows } as never);

      const result = await service.getActiveRepositories();

      expect(result).toHaveLength(2);
      expect(result[0].owner).toBe("octocat");
      expect(result[1].owner).toBe("torvalds");
    });

    it("returns an empty array when no active repos exist", async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] } as never);

      const result = await service.getActiveRepositories();

      expect(result).toEqual([]);
    });

    it("releases the client after a successful query", async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] } as never);

      await service.getActiveRepositories();

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it("releases the client even when the query throws", async () => {
      mockClient.query.mockRejectedValueOnce(new Error("DB error") as never);

      await expect(service.getActiveRepositories()).rejects.toThrow("DB error");

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // ── getLatestRelease() ───────────────────────────────────────────────────

  describe("getLatestRelease()", () => {
    it("returns the latest release from the GitHub API", async () => {
      const release = makeRelease();
      mockRepos.getLatestRelease.mockResolvedValueOnce({
        data: release,
      } as never);

      const result = await service.getLatestRelease("octocat", "hello-world");

      expect(result).toMatchObject({ tag_name: "v1.0.0" });
      expect(mockRepos.getLatestRelease).toHaveBeenCalledWith({
        owner: "octocat",
        repo: "hello-world",
      });
    });

    it("returns null when GitHub responds with 404", async () => {
      mockRepos.getLatestRelease.mockRejectedValueOnce({
        status: 404,
      } as never);

      const result = await service.getLatestRelease("octocat", "no-releases");

      expect(result).toBeNull();
    });

    it("re-throws non-404 GitHub errors", async () => {
      mockRepos.getLatestRelease.mockRejectedValueOnce({
        status: 500,
        message: "Server error",
      } as never);

      await expect(
        service.getLatestRelease("octocat", "hello-world"),
      ).rejects.toMatchObject({
        status: 500,
      });
    });
  });

  // ── getAllReleases() ─────────────────────────────────────────────────────

  describe("getAllReleases()", () => {
    it("returns the list of releases from the GitHub API", async () => {
      const releases = [makeRelease(), makeRelease({ tag_name: "v0.9.0" })];
      mockRepos.listReleases.mockResolvedValueOnce({ data: releases } as never);

      const result = await service.getAllReleases("octocat", "hello-world");

      expect(result).toHaveLength(2);
      expect(result[0].tag_name).toBe("v1.0.0");
    });

    it("passes the limit as per_page to the API", async () => {
      mockRepos.listReleases.mockResolvedValueOnce({ data: [] } as never);

      await service.getAllReleases("octocat", "hello-world", 5);

      expect(mockRepos.listReleases).toHaveBeenCalledWith(
        expect.objectContaining({ per_page: 5 }),
      );
    });

    it("defaults to 10 results per page", async () => {
      mockRepos.listReleases.mockResolvedValueOnce({ data: [] } as never);

      await service.getAllReleases("octocat", "hello-world");

      expect(mockRepos.listReleases).toHaveBeenCalledWith(
        expect.objectContaining({ per_page: 10 }),
      );
    });

    it("returns an empty array when the GitHub API throws", async () => {
      mockRepos.listReleases.mockRejectedValueOnce(
        new Error("rate limited") as never,
      );

      const result = await service.getAllReleases("octocat", "hello-world");

      expect(result).toEqual([]);
    });
  });

  // ── checkRepositoryForNewReleases() ─────────────────────────────────────

  describe("checkRepositoryForNewReleases()", () => {
    it("returns true and updates last_seen_tag when a new release is detected", async () => {
      const repo = makeRepo({ last_seen_tag: "v0.9.0" });
      mockRepos.getLatestRelease.mockResolvedValueOnce({
        data: makeRelease({ tag_name: "v1.0.0" }),
      } as never);
      mockClient.query.mockResolvedValueOnce({ rows: [] } as never); // UPDATE

      const result = await service.checkRepositoryForNewReleases(repo);

      expect(result).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE subscriptions"),
        ["v1.0.0", 1],
      );
    });

    it("returns false when the tag has not changed", async () => {
      const repo = makeRepo({ last_seen_tag: "v1.0.0" });
      mockRepos.getLatestRelease.mockResolvedValueOnce({
        data: makeRelease({ tag_name: "v1.0.0" }),
      } as never);

      const result = await service.checkRepositoryForNewReleases(repo);

      expect(result).toBe(false);
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    it("returns false when there are no releases (getLatestRelease returns null)", async () => {
      mockRepos.getLatestRelease.mockRejectedValueOnce({
        status: 404,
      } as never);

      const result = await service.checkRepositoryForNewReleases(makeRepo());

      expect(result).toBe(false);
    });

    it("returns false when the latest release is a draft", async () => {
      mockRepos.getLatestRelease.mockResolvedValueOnce({
        data: makeRelease({ tag_name: "v2.0.0-draft", draft: true }),
      } as never);

      const result = await service.checkRepositoryForNewReleases(makeRepo());

      expect(result).toBe(false);
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    it("returns false and swallows the error when updateLastSeenTag throws", async () => {
      const repo = makeRepo({ last_seen_tag: "v0.9.0" });
      mockRepos.getLatestRelease.mockResolvedValueOnce({
        data: makeRelease({ tag_name: "v1.0.0" }),
      } as never);
      mockClient.query.mockRejectedValueOnce(new Error("DB error") as never);

      const result = await service.checkRepositoryForNewReleases(repo);

      expect(result).toBe(false);
    });
  });

  // ── updateLastSeenTag() ──────────────────────────────────────────────────

  describe("updateLastSeenTag()", () => {
    it("executes an UPDATE query with the correct parameters", async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] } as never);

      await service.updateLastSeenTag(42, "v3.0.0");

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE subscriptions"),
        ["v3.0.0", 42],
      );
    });

    it("releases the client after a successful update", async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] } as never);

      await service.updateLastSeenTag(1, "v1.0.0");

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it("releases the client and re-throws when the query fails", async () => {
      mockClient.query.mockRejectedValueOnce(new Error("DB error") as never);

      await expect(service.updateLastSeenTag(1, "v1.0.0")).rejects.toThrow(
        "DB error",
      );

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // ── checkSpecificRepository() ────────────────────────────────────────────

  describe("checkSpecificRepository()", () => {
    it("uses the last_seen_tag from the database when available", async () => {
      // DB query for last_seen_tag
      mockClient.query.mockResolvedValueOnce({
        rows: [{ last_seen_tag: "v1.5.0" }],
      } as never);
      // getLatestRelease — same tag, no new release
      mockRepos.getLatestRelease.mockResolvedValueOnce({
        data: makeRelease({ tag_name: "v1.5.0" }),
      } as never);

      await service.checkSpecificRepository("octocat", "hello-world");

      expect(mockRepos.getLatestRelease).toHaveBeenCalledWith({
        owner: "octocat",
        repo: "hello-world",
      });
    });

    it("defaults last_seen_tag to null when the DB has no record", async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ last_seen_tag: null }],
      } as never);
      mockRepos.getLatestRelease.mockResolvedValueOnce({
        data: makeRelease({ tag_name: "v1.0.0" }),
      } as never);
      // updateLastSeenTag will also need a client — provide one
      mockClient.query.mockResolvedValueOnce({ rows: [] } as never);

      await service.checkSpecificRepository("octocat", "hello-world");

      // A new release is always detected when last_seen_tag is null
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE subscriptions"),
        expect.anything(),
      );
    });

    it("releases the client after checking", async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] } as never);
      mockRepos.getLatestRelease.mockRejectedValueOnce({
        status: 404,
      } as never);

      await service.checkSpecificRepository("octocat", "hello-world");

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // ── getRateLimitInfo() ───────────────────────────────────────────────────

  describe("getRateLimitInfo()", () => {
    it("does not throw when the rate limit API call succeeds", async () => {
      mockRateLimit.get.mockResolvedValueOnce({
        data: { rate: { limit: 5000, remaining: 4800, reset: 1700000000 } },
      } as never);

      await expect(service.getRateLimitInfo()).resolves.toBeUndefined();
    });

    it("swallows errors from the rate limit API", async () => {
      mockRateLimit.get.mockRejectedValueOnce(
        new Error("network error") as never,
      );

      await expect(service.getRateLimitInfo()).resolves.toBeUndefined();
    });
  });
});

// ─── Integration-style tests ──────────────────────────────────────────────────

describe("ReleaseTrackerService – integration", () => {
  let service: ReleaseTrackerService;

  beforeEach(() => {
    jest.clearAllMocks();
    (pool.connect as jest.Mock).mockResolvedValue(mockClient as never);
    jest.useFakeTimers();
    service = new ReleaseTrackerService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── checkAllRepositories() ───────────────────────────────────────────────

  describe("checkAllRepositories()", () => {
    it("returns zero counts when there are no active repositories", async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] } as never); // getActiveRepositories

      const promise = service.checkAllRepositories();
      jest.runAllTimers();
      const result = await promise;

      expect(result).toEqual({ checked: 0, newReleases: 0, details: [] });
    });
  });
});
