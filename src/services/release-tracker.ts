import { Octokit } from "@octokit/rest";
import log4js from "log4js";
import pool from "../config/db-connection";

const logger = log4js.getLogger();
logger.level = process.env.LOG_LEVEL || "info";

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

export class ReleaseTrackerService {
  private octokit: Octokit;

  constructor() {
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
      userAgent: "GitHub Release Tracker v1.0.0",
    });
  }

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
    try {
      const response = await this.octokit.rest.repos.getLatestRelease({
        owner,
        repo,
      });

      return response.data as GitHubRelease;
    } catch (error: unknown) {
      if (error && typeof error === "object" && "status" in error) {
        if (error.status === 404) {
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
    try {
      const response = await this.octokit.rest.repos.listReleases({
        owner,
        repo,
        per_page: limit,
      });

      return response.data as GitHubRelease[];
    } catch (error) {
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

    const repositories = await this.getActiveRepositories();
    logger.info(`Found ${repositories.length} active repositories to check`);

    let newReleasesCount = 0;
    const newReleasesDetails: Array<{ repo: string; tag: string }> = [];

    for (const repo of repositories) {
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
