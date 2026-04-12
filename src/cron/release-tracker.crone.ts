import cron from "node-cron";
import log4js from "log4js";
import { releaseTrackerService } from "../services/release-tracker";

const logger = log4js.getLogger();
logger.level = process.env.LOG_LEVEL || "info";

export function startReleaseTrackerCron() {
  cron.schedule("*/5 * * * *", async () => {
    logger.info("⏰ Running scheduled release check...");

    try {
      const result = await releaseTrackerService.checkAllRepositories();

      if (result.newReleases > 0) {
        logger.info(`✅ Found ${result.newReleases} new release(s)!`);
      }

      await releaseTrackerService.getRateLimitInfo();
    } catch (error) {
      logger.error("❌ Scheduled release check failed:", error);
    }
  });

  logger.info("✅ Release tracker cron job scheduled (every minute)");
}

export async function manualCheck() {
  logger.info("🔍 Manual release check triggered...");
  await releaseTrackerService.checkAllRepositories();
  await releaseTrackerService.getRateLimitInfo();
}
