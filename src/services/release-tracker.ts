import { Octokit } from "@octokit/rest";
import log4js from "log4js";
import pool from "../config/db-connection";

const logger = log4js.getLogger();
logger.level = process.env.LOG_LEVEL || "info";

const RATE_LIMIT_BLOCK_MS = 60 * 60 * 1000; // 1 hour

interface Repository {
  id: number;
  owner: string;
  repository: string;
  last_seen_tag: string | null;
}

interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string;
  html_url: string;
}

export class RateLimitError extends Error {
  readonly retryAfter: Date;

  constructor(retryAfter: Date) {
    super(
      `GitHub API rate limit exceeded. Retry after ${retryAfter.toISOString()}`,
    );
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

export class ReleaseTrackerService {
  private octokit: Octokit;
  private rateLimitedUntil: Date | null = null;

  constructor() {
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
      userAgent: "GitHub Release Tracker v1.0.0",
    });
  }

  // ── Rate-limit guard ───────────────────────────────────────────────────────

  isRateLimited(): boolean {
    if (!this.rateLimitedUntil) return false;
    if (new Date() >= this.rateLimitedUntil) {
      this.rateLimitedUntil = null; // block has expired
      logger.info("✅ GitHub rate-limit block expired, resuming requests.");
      return false;
    }
    return true;
  }

  private handleRateLimitError(error: unknown): never {
    // GitHub returns 403 for rate-limit hits (primary) and 429 (secondary).
    // The x-ratelimit-reset header holds the Unix timestamp to resume.
    const retryAfter = this.extractRetryAfter(error);

    this.rateLimitedUntil = retryAfter;
    logger.error(
      `🚫 GitHub rate limit hit (status ${(error as { status?: number }).status}). ` +
        `All requests blocked until ${retryAfter.toLocaleString()}.`,
    );

    throw new RateLimitError(retryAfter);
  }

  private extractRetryAfter(error: unknown): Date {
    if (error && typeof error === "object") {
      const err = error as {
        status?: number;
        response?: {
          headers?: { "x-ratelimit-reset"?: string; "retry-after"?: string };
        };
      };

      // Prefer the x-ratelimit-reset Unix timestamp from the response headers
      const resetHeader = err.response?.headers?.["x-ratelimit-reset"];
      if (resetHeader) {
        const resetMs = parseInt(resetHeader, 10) * 1000;
        if (!isNaN(resetMs)) return new Date(resetMs);
      }

      // Fall back to Retry-After (seconds from now)
      const retryAfterHeader = err.response?.headers?.["retry-after"];
      if (retryAfterHeader) {
        const seconds = parseInt(retryAfterHeader, 10);
        if (!isNaN(seconds)) return new Date(Date.now() + seconds * 1000);
      }
    }

    // No header available — default to 1 hour from now
    return new Date(Date.now() + RATE_LIMIT_BLOCK_MS);
  }

  private isRateLimitStatus(error: unknown): boolean {
    if (error && typeof error === "object" && "status" in error) {
      const status = (error as { status: number }).status;
      return status === 403 || status === 429;
    }
    return false;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async getActiveRepositories(): Promise<Repository[]> {
    const client = await pool.connect();

    try {
      const query = `
        SELECT DISTINCT 
          r.id,
          r.owner,
          r.repository,
          MAX(s.last_seen_tag) as last_seen_tag
        FROM repositories r
        INNER JOIN subscriptions s ON r.id = s.repository_id
        WHERE s.is_active = true AND s.confirmed = true
        GROUP BY r.id, r.owner, r.repository
      `;

      const result = await client.query(query);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getLatestRelease(
    owner: string,
    repo: string,
  ): Promise<GitHubRelease | null> {
    if (this.isRateLimited()) {
      logger.warn(
        `⏸ Skipping getLatestRelease for ${owner}/${repo} — rate limited until ${this.rateLimitedUntil!.toLocaleString()}`,
      );
      throw new RateLimitError(this.rateLimitedUntil!);
    }

    try {
      const response = await this.octokit.rest.repos.getLatestRelease({
        owner,
        repo,
      });

      return response.data as GitHubRelease;
    } catch (error: unknown) {
      if (this.isRateLimitStatus(error)) {
        this.handleRateLimitError(error); // always throws
      }

      if (error && typeof error === "object" && "status" in error) {
        if ((error as { status: number }).status === 404) {
          logger.warn(`No releases found for ${owner}/${repo}`);
          return null;
        }
      }

      logger.error(`Error fetching releases for ${owner}/${repo}:`, error);
      throw error;
    }
  }

  async getAllReleases(
    owner: string,
    repo: string,
    limit = 10,
  ): Promise<GitHubRelease[]> {
    if (this.isRateLimited()) {
      logger.warn(
        `⏸ Skipping getAllReleases for ${owner}/${repo} — rate limited until ${this.rateLimitedUntil!.toLocaleString()}`,
      );
      return [];
    }

    try {
      const response = await this.octokit.rest.repos.listReleases({
        owner,
        repo,
        per_page: limit,
      });

      return response.data as GitHubRelease[];
    } catch (error: unknown) {
      if (this.isRateLimitStatus(error)) {
        this.handleRateLimitError(error); // always throws
      }

      logger.error(`Error fetching releases for ${owner}/${repo}:`, error);
      return [];
    }
  }

  async checkRepositoryForNewReleases(repo: Repository): Promise<boolean> {
    logger.info(`Checking releases for ${repo.owner}/${repo.repository}...`);

    try {
      const latestRelease = await this.getLatestRelease(
        repo.owner,
        repo.repository,
      );

      if (!latestRelease) {
        logger.debug(`No releases found for ${repo.owner}/${repo.repository}`);
        return false;
      }

      if (latestRelease.draft) {
        logger.debug(
          `Latest release is a draft for ${repo.owner}/${repo.repository}`,
        );
        return false;
      }

      if (latestRelease.tag_name !== repo.last_seen_tag) {
        logger.info(`🎉 NEW RELEASE DETECTED!`);
        logger.info(`Repository: ${repo.owner}/${repo.repository}`);
        logger.info(`Tag: ${latestRelease.tag_name}`);
        logger.info(`Name: ${latestRelease.name || "No name"}`);
        logger.info(`Published: ${latestRelease.published_at}`);
        logger.info(`URL: ${latestRelease.html_url}`);

        if (latestRelease.body) {
          logger.debug(
            `Release Notes: ${latestRelease.body.substring(0, 200)}...`,
          );
        }

        logger.info(`---`);

        await this.updateLastSeenTag(repo.id, latestRelease.tag_name);

        return true;
      } else {
        logger.debug(
          `No new releases for ${repo.owner}/${repo.repository}. Latest: ${latestRelease.tag_name}`,
        );
        return false;
      }
    } catch (error) {
      // Propagate RateLimitError so checkAllRepositories can abort the loop
      if (error instanceof RateLimitError) throw error;

      logger.error(
        `Failed to check releases for ${repo.owner}/${repo.repository}:`,
        error,
      );
      return false;
    }
  }

  async updateLastSeenTag(
    repositoryId: number,
    tagName: string,
  ): Promise<void> {
    const client = await pool.connect();

    try {
      const query = `
        UPDATE subscriptions 
        SET last_seen_tag = $1, updated_at = CURRENT_TIMESTAMP
        WHERE repository_id = $2
      `;

      await client.query(query, [tagName, repositoryId]);
      logger.debug(
        `Updated last_seen_tag to ${tagName} for repository ${repositoryId}`,
      );
    } catch (error) {
      logger.error(`Failed to update last_seen_tag:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async checkAllRepositories(): Promise<{
    checked: number;
    newReleases: number;
    details: Array<{ repo: string; tag: string }>;
  }> {
    logger.info("=".repeat(50));
    logger.info("Starting release check for all repositories...");
    logger.info("=".repeat(50));

    if (this.isRateLimited()) {
      logger.warn(
        `⏸ Release check skipped — rate limited until ${this.rateLimitedUntil!.toLocaleString()}`,
      );
      return { checked: 0, newReleases: 0, details: [] };
    }

    const repositories = await this.getActiveRepositories();
    logger.info(`Found ${repositories.length} active repositories to check`);

    let newReleasesCount = 0;
    const newReleasesDetails: Array<{ repo: string; tag: string }> = [];

    for (const repo of repositories) {
      // Re-check inside the loop — we may have been rate-limited mid-run
      if (this.isRateLimited()) {
        logger.warn(
          `⏸ Aborting remaining checks — rate limited until ${this.rateLimitedUntil!.toLocaleString()}`,
        );
        break;
      }

      try {
        const hasNewRelease = await this.checkRepositoryForNewReleases(repo);

        if (hasNewRelease) {
          newReleasesCount++;
          newReleasesDetails.push({
            repo: `${repo.owner}/${repo.repository}`,
            tag: repo.last_seen_tag || "unknown",
          });
        }

        await this.delay(1000);
      } catch (error) {
        if (error instanceof RateLimitError) {
          logger.warn(
            `⏸ Aborting remaining checks — rate limited until ${error.retryAfter.toLocaleString()}`,
          );
          break; // stop the loop, do not crash
        }
        logger.error(`Error checking ${repo.owner}/${repo.repository}:`, error);
      }
    }

    logger.info("=".repeat(50));
    logger.info(`Release check completed!`);
    logger.info(`Total checked: ${repositories.length}`);
    logger.info(`New releases found: ${newReleasesCount}`);

    if (newReleasesCount > 0) {
      logger.info("New releases:");
      newReleasesDetails.forEach((detail) => {
        logger.info(`  - ${detail.repo}: ${detail.tag}`);
      });
    }

    logger.info("=".repeat(50));

    return {
      checked: repositories.length,
      newReleases: newReleasesCount,
      details: newReleasesDetails,
    };
  }

  async checkSpecificRepository(owner: string, repo: string): Promise<void> {
    logger.info(`Checking specific repository: ${owner}/${repo}`);

    const tempRepo: Repository = {
      id: 0,
      owner,
      repository: repo,
      last_seen_tag: null,
    };

    const client = await pool.connect();
    try {
      const query = `
        SELECT MAX(last_seen_tag) as last_seen_tag
        FROM subscriptions s
        INNER JOIN repositories r ON s.repository_id = r.id
        WHERE r.owner = $1 AND r.repository = $2
      `;

      const result = await client.query(query, [owner, repo]);
      if (result.rows[0]?.last_seen_tag) {
        tempRepo.last_seen_tag = result.rows[0].last_seen_tag;
      }
    } finally {
      client.release();
    }

    await this.checkRepositoryForNewReleases(tempRepo);
  }

  async getRateLimitInfo(): Promise<void> {
    if (this.isRateLimited()) {
      logger.warn(
        `⏸ Skipping rate limit info fetch — currently rate limited until ${this.rateLimitedUntil!.toLocaleString()}`,
      );
      return;
    }

    try {
      const response = await this.octokit.rest.rateLimit.get();
      const rateLimit = response.data.rate;

      logger.info("GitHub API Rate Limit:");
      logger.info(`  Limit: ${rateLimit.limit}`);
      logger.info(`  Remaining: ${rateLimit.remaining}`);
      logger.info(
        `  Resets at: ${new Date(rateLimit.reset * 1000).toLocaleString()}`,
      );
    } catch (error) {
      logger.error("Failed to get rate limit info:", error);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const releaseTrackerService = new ReleaseTrackerService();
