import nodemailer from "nodemailer";
import log4js from "log4js";

const logger = log4js.getLogger();
logger.level = process.env.LOG_LEVEL || "info";

interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

interface ReleaseNotificationData {
  email: string;
  repo: string;
  tagName: string;
  releaseName: string;
  releaseUrl: string;
  releaseNotes?: string;
  publishedAt: string;
  unsubscribeToken: string;
}

interface ConfirmationEmailData {
  email: string;
  repo: string;
  confirmationToken: string;
  confirmationUrl: string;
}

export class NotifierService {
  private transporter: nodemailer.Transporter;
  private fromEmail: string;
  private baseUrl: string;

  constructor() {
    this.fromEmail = process.env.EMAIL_FROM || "notifications@releases-api.app";
    this.baseUrl = process.env.BASE_URL || "http://localhost:7000";

    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    this.verifyConnection();
  }

  private async verifyConnection() {
    try {
      await this.transporter.verify();
      logger.info("SMTP connection established successfully");
    } catch (error) {
      logger.error("SMTP connection failed:", error);
    }
  }

  private async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      const mailOptions = {
        from: this.fromEmail,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent to ${options.to}: ${info.messageId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send email to ${options.to}:`, error);
      return false;
    }
  }

  async sendConfirmationEmail(data: ConfirmationEmailData): Promise<boolean> {
    const confirmationLink = `${this.baseUrl}confirm/${data.confirmationToken}`;

    const subject = `Confirm your subscription to ${data.repo} releases`;

    const text = `
      Hello!
      
      You've requested to subscribe to release notifications for ${data.repo}.
      
      Please confirm your subscription by clicking the link below:
      ${confirmationLink}
      
      If you didn't request this subscription, you can safely ignore this email.
      
      --
      GitHub Release Notification API
    `;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #24292e; color: white; padding: 20px; text-align: center; }
          .content { background: #f6f8fa; padding: 30px; border-radius: 5px; }
          .button { 
            display: inline-block; 
            padding: 12px 24px; 
            background: #2ea44f; 
            color: white; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0;
          }
          .repo { font-weight: bold; color: #0366d6; }
          .footer { margin-top: 30px; font-size: 12px; color: #666; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Confirm Your Subscription</h1>
          </div>
          <div class="content">
            <p>Hello!</p>
            <p>You've requested to subscribe to release notifications for <span class="repo">${data.repo}</span>.</p>
            <p>Click the button below to confirm your subscription:</p>
            <div style="text-align: center;">
              <a href="${confirmationLink}" class="button">Confirm Subscription</a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #0366d6;">${confirmationLink}</p>
            <p>If you didn't request this subscription, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>GitHub Release Notification API</p>
            <p>This is an automated message, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: data.email,
      subject,
      text,
      html,
    });
  }

  async sendReleaseNotification(
    data: ReleaseNotificationData,
  ): Promise<boolean> {
    const unsubscribeLink = `${this.baseUrl}/api/unsubscribe/${data.unsubscribeToken}`;

    const subject = `🚀 New Release: ${data.repo} ${data.tagName}`;

    const text = `
      New Release: ${data.repo} ${data.tagName}
      
      Repository: ${data.repo}
      Release: ${data.releaseName || data.tagName}
      Published: ${new Date(data.publishedAt).toLocaleString()}
      
      View the release: ${data.releaseUrl}
      
      ${data.releaseNotes ? `Release Notes:\n${data.releaseNotes}\n` : ""}
      
      ---
      You're receiving this email because you subscribed to release notifications for ${data.repo}.
      To unsubscribe, visit: ${unsubscribeLink}
    `;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; line-height: 1.6; color: #24292e; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .header h1 { margin: 0; font-size: 28px; }
          .header .tag { font-size: 18px; opacity: 0.9; margin-top: 10px; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e1e4e8; border-top: none; border-radius: 0 0 10px 10px; }
          .repo-info { 
            background: #f6f8fa; 
            padding: 15px; 
            border-radius: 5px; 
            margin-bottom: 20px;
            border-left: 4px solid #2ea44f;
          }
          .repo-name { font-size: 18px; font-weight: bold; color: #0366d6; }
          .release-meta { 
            display: flex; 
            justify-content: space-between; 
            margin: 15px 0;
            color: #586069;
            font-size: 14px;
          }
          .button { 
            display: inline-block; 
            padding: 12px 24px; 
            background: #2ea44f; 
            color: white; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0;
            font-weight: bold;
          }
          .release-notes {
            background: #f6f8fa;
            padding: 20px;
            border-radius: 5px;
            margin: 20px 0;
            border: 1px solid #e1e4e8;
          }
          .release-notes pre {
            white-space: pre-wrap;
            word-wrap: break-word;
            font-family: inherit;
          }
          .footer { 
            margin-top: 30px; 
            padding-top: 20px;
            border-top: 1px solid #e1e4e8;
            font-size: 12px; 
            color: #586069; 
            text-align: center; 
          }
          .unsubscribe { 
            color: #586069; 
            text-decoration: underline; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 New Release!</h1>
            <div class="tag">${data.tagName}</div>
          </div>
          <div class="content">
            <div class="repo-info">
              <div class="repo-name">${data.repo}</div>
              <div style="margin-top: 10px; color: #586069;">
                ${data.releaseName || data.tagName}
              </div>
            </div>
            
            <div class="release-meta">
              <span>📅 Published: ${new Date(data.publishedAt).toLocaleString()}</span>
            </div>
            
            ${
              data.releaseNotes
                ? `
            <div class="release-notes">
              <h3>📝 Release Notes</h3>
              <div>${this.formatReleaseNotes(data.releaseNotes)}</div>
            </div>
            `
                : ""
            }
            
            <div style="text-align: center;">
              <a href="${data.releaseUrl}" class="button">View on GitHub →</a>
            </div>
          </div>
          <div class="footer">
            <p>You're receiving this email because you subscribed to release notifications for ${data.repo}.</p>
            <p>
              <a href="${unsubscribeLink}" class="unsubscribe">Unsubscribe</a> • 
              <a href="${this.baseUrl}/api/subscriptions?email=${encodeURIComponent(data.email)}">Manage Subscriptions</a>
            </p>
            <p>GitHub Release Notification API</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: data.email,
      subject,
      text,
      html,
    });
  }

  async sendUnsubscribeConfirmation(
    email: string,
    repo: string,
  ): Promise<boolean> {
    const subject = `Unsubscribed from ${repo} releases`;

    const text = `
      Hello!
      
      You have been successfully unsubscribed from release notifications for ${repo}.
      
      If this was a mistake, you can subscribe again at any time.
      
      --
      GitHub Release Notification API
    `;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #24292e; color: white; padding: 20px; text-align: center; }
          .content { background: #f6f8fa; padding: 30px; border-radius: 5px; }
          .repo { font-weight: bold; color: #0366d6; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Unsubscribed</h1>
          </div>
          <div class="content">
            <p>Hello!</p>
            <p>You have been successfully unsubscribed from release notifications for <span class="repo">${repo}</span>.</p>
            <p>If this was a mistake, you can subscribe again at any time.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({ to: email, subject, text, html });
  }

  async sendWelcomeEmail(email: string, repo: string): Promise<boolean> {
    const subject = `Welcome to ${repo} release notifications!`;

    const text = `
      Hello!
      
      Your subscription to ${repo} release notifications has been confirmed.
      
      You'll now receive email notifications whenever a new release is published for ${repo}.
      
      You can manage your subscriptions at any time.
      
      --
      GitHub Release Notification API
    `;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #2ea44f 0%, #22863a 100%); color: white; padding: 20px; text-align: center; }
          .content { background: #f6f8fa; padding: 30px; border-radius: 5px; }
          .repo { font-weight: bold; color: #0366d6; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Subscription Confirmed!</h1>
          </div>
          <div class="content">
            <p>Hello!</p>
            <p>Your subscription to <span class="repo">${repo}</span> release notifications has been confirmed.</p>
            <p>You'll now receive email notifications whenever a new release is published.</p>
            <p>Stay tuned! 🚀</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({ to: email, subject, text, html });
  }

  private formatReleaseNotes(notes: string): string {
    return notes
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
      .replace(/\n/g, "<br>");
  }
}

export const notifierService = new NotifierService();
