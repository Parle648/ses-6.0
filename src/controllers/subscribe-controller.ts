import {
  Body,
  Controller,
  Get,
  HttpError,
  NotFoundError,
  Param,
  Post,
  UseAfter,
  UseBefore,
  QueryParam,
} from "routing-controllers";
import "reflect-metadata";
import {
  getSubscriptionsQueryValidation,
  loggingAfter,
  loggingBefore,
} from "../middleware/middleware";
import { Subscription } from "../model/subscribe";
import { Octokit } from "@octokit/rest";
import pool from "../config/db-connection";
import { notifierService } from "../services/notifier";
import crypto from "crypto";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

@Controller()
@UseBefore(loggingBefore)
@UseAfter(loggingAfter)
export class SubscribeController {
  @Get("/confirm/:token")
  async confirm(@Param("token") token: string) {
    const client = await pool.connect();

    try {
      const query = `
        SELECT s.id, s.user_id, s.repository_id, s.confirmed, r.owner, r.repository, u.email
        FROM subscriptions s
        INNER JOIN repositories r ON s.repository_id = r.id
        INNER JOIN users u ON s.user_id = u.id
        WHERE s.confirmation_token = $1
      `;

      const result = await client.query(query, [token]);

      if (result.rows.length === 0) {
        throw new NotFoundError("Invalid confirmation token");
      }

      const subscription = result.rows[0];

      if (subscription.confirmed) {
        return {
          message: "Subscription already confirmed",
          subscription: {
            repo: `${subscription.owner}/${subscription.repository}`,
            confirmed: true,
          },
        };
      }

      const updateQuery = `
        UPDATE subscriptions 
        SET confirmed = true, 
            confirmed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      await client.query(updateQuery, [subscription.id]);

      await notifierService.sendWelcomeEmail(
        subscription.email,
        `${subscription.owner}/${subscription.repository}`,
      );

      return {
        message: "Subscription confirmed successfully",
        subscription: {
          repo: `${subscription.owner}/${subscription.repository}`,
          confirmed: true,
          confirmedAt: new Date(),
        },
      };
    } finally {
      client.release();
    }
  }

  @Get("/unsubscribe/:token")
  async unsubscribe(@Param("token") token: string) {
    const client = await pool.connect();

    try {
      const query = `
        SELECT s.id, r.owner, r.repository, u.email
        FROM subscriptions s
        INNER JOIN repositories r ON s.repository_id = r.id
        INNER JOIN users u ON s.user_id = u.id
        WHERE s.confirmation_token = $1 OR s.id::text = $1
      `;

      const result = await client.query(query, [token]);

      if (result.rows.length === 0) {
        throw new NotFoundError("Invalid unsubscribe token");
      }

      const subscription = result.rows[0];

      const updateQuery = `
        UPDATE subscriptions 
        SET is_active = false, 
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `;

      await client.query(updateQuery, [subscription.id]);

      await notifierService.sendUnsubscribeConfirmation(
        subscription.email,
        `${subscription.owner}/${subscription.repository}`,
      );

      return {
        message: "Unsubscribed successfully",
        subscription: {
          repo: `${subscription.owner}/${subscription.repository}`,
          active: false,
        },
      };
    } finally {
      client.release();
    }
  }

  @Get("/subscriptions")
  @UseBefore(getSubscriptionsQueryValidation)
  async getAll(@QueryParam("email") email: string) {
    if (!email) {
      throw new HttpError(400, "Email parameter is required");
    }

    const client = await pool.connect();

    try {
      const query = `
        SELECT 
          s.id,
          u.email,
          r.owner,
          r.repository,
          s.confirmed,
          s.confirmed_at,
          s.last_seen_tag,
          s.last_notification_at,
          s.notification_count,
          s.is_active,
          s.created_at
        FROM subscriptions s
        INNER JOIN users u ON s.user_id = u.id
        INNER JOIN repositories r ON s.repository_id = r.id
        WHERE u.email = $1 AND s.is_active = true
        ORDER BY s.created_at DESC
      `;

      const result = await client.query(query, [email]);

      return {
        email,
        count: result.rows.length,
        subscriptions: result.rows.map((row) => ({
          id: row.id,
          repo: `${row.owner}/${row.repository}`,
          confirmed: row.confirmed,
          confirmedAt: row.confirmed_at,
          lastSeenTag: row.last_seen_tag,
          lastNotificationAt: row.last_notification_at,
          notificationCount: row.notification_count,
          isActive: row.is_active,
          createdAt: row.created_at,
        })),
      };
    } finally {
      client.release();
    }
  }

  @Post("/subscribe")
  async createSubscription(@Body() subscribe: Subscription) {
    console.log("Creating subscription:", subscribe);

    const [owner, repo] = subscribe.repo.split("/");
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      try {
        await octokit.rest.repos.get({
          owner,
          repo,
        });
      } catch (error: unknown) {
        if (
          error &&
          typeof error === "object" &&
          "status" in error &&
          error.status === 404
        ) {
          throw new NotFoundError(
            `Repository ${owner}/${repo} not found on GitHub`,
          );
        }
        throw error;
      }

      const userQuery = `
        INSERT INTO users (email, username, password_hash, is_active, is_verified)
        VALUES ($1, $2, $3, true, false)
        ON CONFLICT (email) 
        DO UPDATE SET 
          updated_at = CURRENT_TIMESTAMP
        RETURNING id, email, username
      `;

      const username =
        subscribe.email.split("@")[0] +
        "_" +
        crypto.randomBytes(4).toString("hex");
      const tempPassword = crypto.randomBytes(16).toString("hex");

      const userResult = await client.query(userQuery, [
        subscribe.email,
        username,
        tempPassword,
      ]);

      const user = userResult.rows[0];
      console.log(`User created/found: ${user.email} (ID: ${user.id})`);

      const repoQuery = `
        INSERT INTO repositories (owner, repository, is_active)
        VALUES ($1, $2, true)
        ON CONFLICT (owner, repository) 
        DO UPDATE SET 
          last_checked = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id, owner, repository
      `;

      const repoResult = await client.query(repoQuery, [owner, repo]);
      const repository = repoResult.rows[0];
      console.log(
        `Repository created/found: ${repository.owner}/${repository.repository} (ID: ${repository.id})`,
      );

      const checkSubscriptionQuery = `
        SELECT id, confirmed, is_active
        FROM subscriptions
        WHERE user_id = $1 AND repository_id = $2 AND is_active = true
      `;

      const existingSub = await client.query(checkSubscriptionQuery, [
        user.id,
        repository.id,
      ]);

      if (existingSub.rows.length > 0) {
        const sub = existingSub.rows[0];

        if (sub.confirmed) {
          throw new HttpError(
            409,
            "Email already subscribed to this repository",
          );
        } else {
          const confirmationToken = this.generateToken();

          const updateQuery = `
            UPDATE subscriptions 
            SET confirmation_token = $1, 
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
          `;

          const updatedSub = await client.query(updateQuery, [
            confirmationToken,
            sub.id,
          ]);

          const confirmationUrl = `${process.env.BASE_URL || "http://localhost:7000"}/api/confirm/${confirmationToken}`;

          await notifierService.sendConfirmationEmail({
            email: subscribe.email,
            repo: subscribe.repo,
            confirmationToken,
            confirmationUrl,
          });

          await client.query("COMMIT");

          return {
            message: "Pending subscription exists. Confirmation email resent.",
            subscription: {
              id: updatedSub.rows[0].id,
              email: subscribe.email,
              repo: subscribe.repo,
              confirmed: false,
              createdAt: updatedSub.rows[0].created_at,
            },
          };
        }
      }

      const confirmationToken = this.generateToken();

      let lastSeenTag = null;
      try {
        const latestRelease = await octokit.rest.repos.getLatestRelease({
          owner,
          repo,
        });
        lastSeenTag = latestRelease.data.tag_name;
      } catch {
        console.log(`No releases found for ${owner}/${repo}`);
      }

      const subscriptionQuery = `
        INSERT INTO subscriptions (
          user_id, 
          repository_id, 
          confirmation_token, 
          last_seen_tag,
          confirmed,
          is_active
        )
        VALUES ($1, $2, $3, $4, false, true)
        RETURNING *
      `;

      const subscriptionResult = await client.query(subscriptionQuery, [
        user.id,
        repository.id,
        confirmationToken,
        lastSeenTag,
      ]);

      const subscription = subscriptionResult.rows[0];

      const confirmationUrl = `${process.env.BASE_URL || "http://localhost:7000"}/api/confirm/${confirmationToken}`;

      await notifierService.sendConfirmationEmail({
        email: subscribe.email,
        repo: subscribe.repo,
        confirmationToken,
        confirmationUrl,
      });

      await client.query("COMMIT");

      console.log(
        `Subscription created: ${subscribe.email} -> ${subscribe.repo}`,
      );

      return {
        message:
          "Subscription created successfully. Please check your email to confirm.",
        subscription: {
          id: subscription.id,
          email: subscribe.email,
          repo: subscribe.repo,
          confirmed: false,
          lastSeenTag: subscription.last_seen_tag,
          createdAt: subscription.created_at,
        },
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private generateToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }
}
