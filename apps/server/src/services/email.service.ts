import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../lib/env';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private transporter: Transporter | null = null;
  private enabled: boolean = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    // Check if email configuration is available
    const emailHost = process.env.EMAIL_HOST;
    const emailPort = process.env.EMAIL_PORT;
    const emailUser = process.env.EMAIL_USER;
    const emailPassword = process.env.EMAIL_PASSWORD;
    const emailFrom = process.env.EMAIL_FROM;

    if (!emailHost || !emailPort || !emailUser || !emailPassword || !emailFrom) {
      console.warn('[Email Service] Email configuration not found. Email functionality disabled.');
      console.warn('[Email Service] Required env vars: EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASSWORD, EMAIL_FROM');
      this.enabled = false;
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: emailHost,
        port: parseInt(emailPort, 10),
        secure: parseInt(emailPort, 10) === 465, // true for 465, false for other ports
        auth: {
          user: emailUser,
          pass: emailPassword,
        },
      });

      this.enabled = true;
      console.log('[Email Service] Email service initialized successfully');
    } catch (error) {
      console.error('[Email Service] Failed to initialize email service:', error);
      this.enabled = false;
    }
  }

  /**
   * Send an email
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.enabled || !this.transporter) {
      console.warn('[Email Service] Email not sent - service not enabled');
      console.log('[Email Service] Would have sent to:', options.to);
      console.log('[Email Service] Subject:', options.subject);
      console.log('[Email Service] Content:', options.text || options.html);
      return false;
    }

    try {
      const info = await this.transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      console.log('[Email Service] Email sent successfully:', info.messageId);
      return true;
    } catch (error) {
      console.error('[Email Service] Failed to send email:', error);
      return false;
    }
  }

  /**
   * Send welcome & verification code email
   */
  async sendVerificationCode(email: string, code: string, name: string): Promise<boolean> {
    const subject = '🎉 Welcome to Aviator - Verify Your Account!';
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; 
              line-height: 1.6; 
              background: #0f172a; 
              color: #ffffff; 
              padding: 20px;
            }
            .email-container { 
              max-width: 600px; 
              margin: 0 auto; 
              background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
              border-radius: 20px;
              overflow: hidden;
              box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            }
            .header { 
              background: linear-gradient(135deg, #10b981 0%, #059669 50%, #065f46 100%); 
              padding: 40px 30px; 
              text-align: center; 
              position: relative;
              overflow: hidden;
            }
            .header::before {
              content: '';
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 100" fill="rgba(255,255,255,0.1)"><polygon points="0,0 1000,0 1000,80 0,100"/></svg>');
              background-size: cover;
            }
            .logo { 
              width: 80px; 
              height: 80px; 
              background: rgba(255,255,255,0.15);
              border-radius: 20px; 
              margin: 0 auto 20px; 
              display: flex; 
              align-items: center; 
              justify-content: center;
              backdrop-filter: blur(10px);
              border: 1px solid rgba(255,255,255,0.2);
              position: relative;
              z-index: 1;
            }
            .logo-text { 
              font-size: 28px; 
              font-weight: 800; 
              color: white;
              text-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }
            .header h1 { 
              font-size: 32px; 
              font-weight: 700; 
              margin-bottom: 10px;
              position: relative;
              z-index: 1;
            }
            .header p { 
              font-size: 18px; 
              opacity: 0.9;
              position: relative;
              z-index: 1;
            }
            .content { 
              padding: 40px 30px; 
              background: #1e293b;
            }
            .greeting {
              font-size: 24px;
              font-weight: 600;
              margin-bottom: 20px;
              background: linear-gradient(135deg, #10b981, #059669);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
            }
            .code-section {
              background: linear-gradient(135deg, #065f46 0%, #064e3b 100%);
              border-radius: 16px;
              padding: 30px;
              margin: 30px 0;
              text-align: center;
              border: 1px solid rgba(16, 185, 129, 0.3);
              position: relative;
              overflow: hidden;
            }
            .code-section::before {
              content: '';
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.1) 0%, transparent 70%);
            }
            .code-label {
              font-size: 14px;
              text-transform: uppercase;
              letter-spacing: 2px;
              color: #94a3b8;
              margin-bottom: 10px;
              position: relative;
              z-index: 1;
            }
            .verification-code { 
              font-size: 36px; 
              font-weight: 800; 
              letter-spacing: 8px; 
              color: #ffffff;
              font-family: 'Courier New', monospace;
              background: rgba(255,255,255,0.1);
              padding: 15px 25px;
              border-radius: 12px;
              display: inline-block;
              margin: 10px 0;
              border: 2px solid rgba(255,255,255,0.2);
              position: relative;
              z-index: 1;
            }
            .features {
              background: rgba(16, 185, 129, 0.05);
              border-radius: 12px;
              padding: 25px;
              margin: 25px 0;
              border: 1px solid rgba(16, 185, 129, 0.2);
            }
            .features h3 {
              color: #10b981;
              margin-bottom: 15px;
              font-size: 18px;
            }
            .feature-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
              gap: 15px;
            }
            .feature-item {
              display: flex;
              align-items: center;
              padding: 12px 0;
            }
            .feature-icon {
              font-size: 20px;
              margin-right: 12px;
              width: 30px;
            }
            .footer { 
              background: #0f172a;
              padding: 30px; 
              text-align: center; 
              border-top: 1px solid #334155;
            }
            .security-note {
              background: rgba(245, 158, 11, 0.1);
              border: 1px solid rgba(245, 158, 11, 0.3);
              border-radius: 8px;
              padding: 15px;
              margin: 20px 0;
              font-size: 14px;
              color: #fbbf24;
            }
            .social-links {
              margin: 20px 0;
            }
            .social-links a {
              display: inline-block;
              margin: 0 10px;
              color: #94a3b8;
              font-size: 12px;
              text-decoration: none;
            }
            @media (max-width: 600px) {
              .email-container { margin: 10px; border-radius: 16px; }
              .header, .content, .footer { padding: 20px; }
              .verification-code { font-size: 28px; letter-spacing: 4px; }
              .feature-grid { grid-template-columns: 1fr; }
            }
          </style>
        </head>
        <body>
          <div class="email-container">
            <div class="header">
              <div class="logo">
                <span class="logo-text">SR</span>
              </div>
              <h1>Welcome to Aviator!</h1>
              <p>Your journey to the skies begins now ✈️</p>
            </div>
            
            <div class="content">
              <div class="greeting">Hi ${name}! 👋</div>
              
              <p style="margin-bottom: 20px;">Welcome to <strong>Aviator</strong> - the ultimate crash game experience! We're thrilled to have you join our community of thrill-seekers and aviation enthusiasts.</p>
              
              <p style="margin-bottom: 25px;">To secure your account and start your adventure, please verify your email address using the verification code below:</p>
              
              <div class="code-section">
                <div class="code-label">Verification Code</div>
                <div class="verification-code">${code}</div>
                <p style="margin: 10px 0 0 0; font-size: 14px; color: #94a3b8;">Enter this code to activate your account</p>
              </div>
              
              <div class="features">
                <h3>🚀 What awaits you:</h3>
                <div class="feature-grid">
                  <div class="feature-item">
                    <span class="feature-icon">🎮</span>
                    <span>Exciting crash game mechanics</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">💰</span>
                    <span>Secure deposits & fast withdrawals</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">📊</span>
                    <span>Detailed statistics & analytics</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">🏆</span>
                    <span>Leaderboards & achievements</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">💬</span>
                    <span>Live chat with other players</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">🔒</span>
                    <span>Bank-level security</span>
                  </div>
                </div>
              </div>
              
              <div class="security-note">
                <strong>⏱️ Important:</strong> This verification code expires in 10 minutes. Never share your codes with anyone. Aviator will never ask for your password or codes via email.
              </div>
            </div>
            
            <div class="footer">
              <p style="color: #64748b; margin-bottom: 15px;">
                If you didn't create this account, please ignore this email.
              </p>
              
              <div class="social-links">
                <a href="#">Terms of Service</a> | 
                <a href="#">Privacy Policy</a> | 
                <a href="#">Support</a>
              </div>
              
              <p style="color: #475569; font-size: 12px; margin-top: 20px;">
                © ${new Date().getFullYear()} Aviator. All rights reserved.<br>
                This is an automated message, please do not reply to this email.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
🎉 Welcome to Aviator, ${name}!

Your journey to the skies begins now! We're thrilled to have you join our community of thrill-seekers and aviation enthusiasts.

VERIFICATION CODE: ${code}

To secure your account and start your adventure, please verify your email address using the code above. This code expires in 10 minutes.

🚀 What awaits you:
✈️  Exciting crash game mechanics
💰 Secure deposits & fast withdrawals  
📊 Detailed statistics & analytics
🏆 Leaderboards & achievements
💬 Live chat with other players
🔒 Bank-level security

SECURITY NOTICE: Never share your codes with anyone. Aviator will never ask for your password or codes via email.

If you didn't create this account, please ignore this email.

---
© ${new Date().getFullYear()} Aviator. All rights reserved.
This is an automated message, please do not reply to this email.
    `;

    return this.sendEmail({ to: email, subject, html, text });
  }

  /**
   * Send password reset code email
   */
  async sendPasswordResetCode(email: string, code: string, name: string): Promise<boolean> {
    const subject = '🔐 Aviator Password Reset - Secure Your Account';
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; 
              line-height: 1.6; 
              background: #0f172a; 
              color: #ffffff; 
              padding: 20px;
            }
            .email-container { 
              max-width: 600px; 
              margin: 0 auto; 
              background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
              border-radius: 20px;
              overflow: hidden;
              box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            }
            .header { 
              background: linear-gradient(135deg, #ef4444 0%, #dc2626 50%, #b91c1c 100%); 
              padding: 40px 30px; 
              text-align: center; 
              position: relative;
              overflow: hidden;
            }
            .header::before {
              content: '';
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 100" fill="rgba(255,255,255,0.1)"><polygon points="0,0 1000,0 1000,80 0,100"/></svg>');
              background-size: cover;
            }
            .logo { 
              width: 80px; 
              height: 80px; 
              background: rgba(255,255,255,0.15);
              border-radius: 20px; 
              margin: 0 auto 20px; 
              display: flex; 
              align-items: center; 
              justify-content: center;
              backdrop-filter: blur(10px);
              border: 1px solid rgba(255,255,255,0.2);
              position: relative;
              z-index: 1;
            }
            .logo-text { 
              font-size: 28px; 
              font-weight: 800; 
              color: white;
              text-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }
            .header h1 { 
              font-size: 32px; 
              font-weight: 700; 
              margin-bottom: 10px;
              position: relative;
              z-index: 1;
            }
            .header p { 
              font-size: 18px; 
              opacity: 0.9;
              position: relative;
              z-index: 1;
            }
            .content { 
              padding: 40px 30px; 
              background: #1e293b;
            }
            .greeting {
              font-size: 24px;
              font-weight: 600;
              margin-bottom: 20px;
              background: linear-gradient(135deg, #ef4444, #dc2626);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
            }
            .code-section {
              background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%);
              border-radius: 16px;
              padding: 30px;
              margin: 30px 0;
              text-align: center;
              border: 1px solid rgba(239, 68, 68, 0.3);
              position: relative;
              overflow: hidden;
            }
            .code-section::before {
              content: '';
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: radial-gradient(circle at 50% 50%, rgba(239, 68, 68, 0.1) 0%, transparent 70%);
            }
            .code-label {
              font-size: 14px;
              text-transform: uppercase;
              letter-spacing: 2px;
              color: #94a3b8;
              margin-bottom: 10px;
              position: relative;
              z-index: 1;
            }
            .verification-code { 
              font-size: 36px; 
              font-weight: 800; 
              letter-spacing: 8px; 
              color: #ffffff;
              font-family: 'Courier New', monospace;
              background: rgba(255,255,255,0.1);
              padding: 15px 25px;
              border-radius: 12px;
              display: inline-block;
              margin: 10px 0;
              border: 2px solid rgba(255,255,255,0.2);
              position: relative;
              z-index: 1;
            }
            .security-steps {
              background: rgba(239, 68, 68, 0.05);
              border-radius: 12px;
              padding: 25px;
              margin: 25px 0;
              border: 1px solid rgba(239, 68, 68, 0.2);
            }
            .security-steps h3 {
              color: #ef4444;
              margin-bottom: 15px;
              font-size: 18px;
              display: flex;
              align-items: center;
            }
            .security-steps h3::before {
              content: '🔒';
              margin-right: 10px;
              font-size: 20px;
            }
            .step-list {
              list-style: none;
              padding: 0;
            }
            .step-list li {
              padding: 8px 0;
              padding-left: 25px;
              position: relative;
              color: #cbd5e1;
            }
            .step-list li::before {
              content: '✓';
              position: absolute;
              left: 0;
              color: #ef4444;
              font-weight: bold;
            }
            .footer { 
              background: #0f172a;
              padding: 30px; 
              text-align: center; 
              border-top: 1px solid #334155;
            }
            .warning-note {
              background: rgba(245, 158, 11, 0.1);
              border: 1px solid rgba(245, 158, 11, 0.3);
              border-radius: 8px;
              padding: 15px;
              margin: 20px 0;
              font-size: 14px;
              color: #fbbf24;
            }
            .danger-note {
              background: rgba(239, 68, 68, 0.1);
              border: 1px solid rgba(239, 68, 68, 0.3);
              border-radius: 8px;
              padding: 20px;
              margin: 25px 0;
              font-size: 15px;
              color: #fca5a5;
              text-align: center;
            }
            .danger-note strong {
              color: #ef4444;
              font-size: 16px;
            }
            .social-links {
              margin: 20px 0;
            }
            .social-links a {
              display: inline-block;
              margin: 0 10px;
              color: #94a3b8;
              font-size: 12px;
              text-decoration: none;
            }
            @media (max-width: 600px) {
              .email-container { margin: 10px; border-radius: 16px; }
              .header, .content, .footer { padding: 20px; }
              .verification-code { font-size: 28px; letter-spacing: 4px; }
            }
          </style>
        </head>
        <body>
          <div class="email-container">
            <div class="header">
              <div class="logo">
                <span class="logo-text">SR</span>
              </div>
              <h1>Password Reset</h1>
              <p>Secure your Aviator account 🔐</p>
            </div>
            
            <div class="content">
              <div class="greeting">Hi ${name}! 🛡️</div>
              
              <p style="margin-bottom: 20px;">We received a request to reset your <strong>Aviator</strong> account password. If this was you, use the verification code below to proceed with creating a new password.</p>
              
              <div class="code-section">
                <div class="code-label">Password Reset Code</div>
                <div class="verification-code">${code}</div>
                <p style="margin: 10px 0 0 0; font-size: 14px; color: #94a3b8;">Enter this code on the password reset page</p>
              </div>
              
              <div class="security-steps">
                <h3>Next Steps:</h3>
                <ul class="step-list">
                  <li>Enter the code above on the password reset page</li>
                  <li>Create a strong, unique password</li>
                  <li>Consider enabling two-factor authentication</li>
                  <li>Sign out of all devices if you suspect unauthorized access</li>
                </ul>
              </div>
              
              <div class="warning-note">
                <strong>⏱️ Time Sensitive:</strong> This reset code expires in 10 minutes for your security. If you need a new code, you can request another reset.
              </div>
              
              <div class="danger-note">
                <strong>⚠️ Didn't request this reset?</strong><br>
                If you didn't request a password reset, please ignore this email and consider reviewing your account security. Your current password remains unchanged.
              </div>
            </div>
            
            <div class="footer">
              <p style="color: #64748b; margin-bottom: 15px;">
                Never share your reset codes with anyone. Aviator will never ask for your password or codes via email, phone, or social media.
              </p>
              
              <div class="social-links">
                <a href="#">Security Center</a> | 
                <a href="#">Contact Support</a> | 
                <a href="#">Report Suspicious Activity</a>
              </div>
              
              <p style="color: #475569; font-size: 12px; margin-top: 20px;">
                © ${new Date().getFullYear()} Aviator. All rights reserved.<br>
                This is an automated security message, please do not reply to this email.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
🔐 Aviator Password Reset

Hi ${name}!

We received a request to reset your Aviator account password. If this was you, use the verification code below to proceed.

PASSWORD RESET CODE: ${code}

⏱️ This code expires in 10 minutes for your security.

NEXT STEPS:
✓ Enter the code above on the password reset page
✓ Create a strong, unique password  
✓ Consider enabling two-factor authentication
✓ Sign out of all devices if you suspect unauthorized access

⚠️ DIDN'T REQUEST THIS RESET?
If you didn't request a password reset, please ignore this email and consider reviewing your account security. Your current password remains unchanged.

SECURITY REMINDER: Never share your reset codes with anyone. Aviator will never ask for your password or codes via email, phone, or social media.

---
© ${new Date().getFullYear()} Aviator. All rights reserved.
This is an automated security message, please do not reply to this email.
    `;

    return this.sendEmail({ to: email, subject, html, text });
  }

  /**
   * Send deposit approved notification email
   */
  async sendDepositApprovedEmail(email: string, name: string, amount: number, currency: string = 'ETB'): Promise<boolean> {
    const subject = '💰 Deposit Approved - Funds Added to Your Aviator Account!';
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; 
              line-height: 1.6; 
              background: #0f172a; 
              color: #ffffff; 
              padding: 20px;
            }
            .email-container { 
              max-width: 600px; 
              margin: 0 auto; 
              background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
              border-radius: 20px;
              overflow: hidden;
              box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            }
            .header { 
              background: linear-gradient(135deg, #059669 0%, #047857 50%, #065f46 100%); 
              padding: 40px 30px; 
              text-align: center; 
              position: relative;
              overflow: hidden;
            }
            .logo { 
              width: 80px; 
              height: 80px; 
              background: rgba(255,255,255,0.15);
              border-radius: 20px; 
              margin: 0 auto 20px; 
              display: flex; 
              align-items: center; 
              justify-content: center;
              backdrop-filter: blur(10px);
              border: 1px solid rgba(255,255,255,0.2);
            }
            .logo-text { 
              font-size: 28px; 
              font-weight: 800; 
              color: white;
              text-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }
            .header h1 { 
              font-size: 32px; 
              font-weight: 700; 
              margin-bottom: 10px;
            }
            .header p { 
              font-size: 18px; 
              opacity: 0.9;
            }
            .content { 
              padding: 40px 30px; 
              background: #1e293b;
            }
            .amount-section {
              background: linear-gradient(135deg, #065f46 0%, #047857 100%);
              border-radius: 16px;
              padding: 30px;
              margin: 30px 0;
              text-align: center;
              border: 1px solid rgba(5, 150, 105, 0.3);
            }
            .amount { 
              font-size: 48px; 
              font-weight: 800; 
              color: #ffffff;
              margin: 10px 0;
            }
            .currency {
              font-size: 24px;
              color: #a7f3d0;
            }
            .footer { 
              background: #0f172a;
              padding: 30px; 
              text-align: center; 
              border-top: 1px solid #334155;
            }
          </style>
        </head>
        <body>
          <div class="email-container">
            <div class="header">
              <div class="logo">
                <span class="logo-text">SR</span>
              </div>
              <h1>Deposit Approved! 🎉</h1>
              <p>Your funds are ready to play ✈️</p>
            </div>
            
            <div class="content">
              <p style="font-size: 24px; font-weight: 600; margin-bottom: 20px;">Hi ${name}! 👋</p>
              
              <p style="margin-bottom: 25px;">Great news! Your deposit has been successfully approved and added to your Aviator account.</p>
              
              <div class="amount-section">
                <p style="color: #a7f3d0; margin-bottom: 10px; font-size: 16px;">Amount Added</p>
                <div class="amount">${amount.toLocaleString()} <span class="currency">${currency}</span></div>
                <p style="color: #a7f3d0; margin-top: 10px; font-size: 14px;">Available for immediate play</p>
              </div>
              
              <p style="margin-bottom: 20px;">Your funds are now available in your wallet and ready to use. Time to take flight and chase those multipliers!</p>
              
              <p style="color: #94a3b8; font-size: 14px;">Thank you for choosing Aviator for your gaming experience.</p>
            </div>
            
            <div class="footer">
              <p style="color: #475569; font-size: 12px;">
                © ${new Date().getFullYear()} Aviator. All rights reserved.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
💰 Deposit Approved!

Hi ${name}!

Great news! Your deposit has been successfully approved and added to your Aviator account.

Amount Added: ${amount.toLocaleString()} ${currency}

Your funds are now available in your wallet and ready to use. Time to take flight and chase those multipliers!

Thank you for choosing Aviator for your gaming experience.

---
© ${new Date().getFullYear()} Aviator. All rights reserved.
    `;

    return this.sendEmail({ to: email, subject, html, text });
  }

  /**
   * Send withdrawal approved notification email
   */
  async sendWithdrawalApprovedEmail(email: string, name: string, amount: number, currency: string = 'ETB', paymentMethod: string): Promise<boolean> {
    const subject = '✅ Withdrawal Approved - Funds On The Way!';
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; 
              line-height: 1.6; 
              background: #0f172a; 
              color: #ffffff; 
              padding: 20px;
            }
            .email-container { 
              max-width: 600px; 
              margin: 0 auto; 
              background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
              border-radius: 20px;
              overflow: hidden;
              box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            }
            .header { 
              background: linear-gradient(135deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%); 
              padding: 40px 30px; 
              text-align: center; 
            }
            .logo { 
              width: 80px; 
              height: 80px; 
              background: rgba(255,255,255,0.15);
              border-radius: 20px; 
              margin: 0 auto 20px; 
              display: flex; 
              align-items: center; 
              justify-content: center;
            }
            .logo-text { 
              font-size: 28px; 
              font-weight: 800; 
              color: white;
            }
            .content { 
              padding: 40px 30px; 
              background: #1e293b;
            }
            .amount-section {
              background: linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%);
              border-radius: 16px;
              padding: 30px;
              margin: 30px 0;
              text-align: center;
            }
            .amount { 
              font-size: 48px; 
              font-weight: 800; 
              color: #ffffff;
            }
            .footer { 
              background: #0f172a;
              padding: 30px; 
              text-align: center; 
            }
          </style>
        </head>
        <body>
          <div class="email-container">
            <div class="header">
              <div class="logo">
                <span class="logo-text">SR</span>
              </div>
              <h1>Withdrawal Approved! ✅</h1>
              <p>Your funds are on the way 🚀</p>
            </div>
            
            <div class="content">
              <p style="font-size: 24px; font-weight: 600; margin-bottom: 20px;">Hi ${name}! 👋</p>
              
              <p style="margin-bottom: 25px;">Your withdrawal request has been approved! Your funds are being processed and will arrive shortly.</p>
              
              <div class="amount-section">
                <p style="color: #93c5fd; margin-bottom: 10px;">Withdrawal Amount</p>
                <div class="amount">${amount.toLocaleString()} ${currency}</div>
                <p style="color: #93c5fd; margin-top: 15px;">via ${paymentMethod}</p>
              </div>
              
              <p style="margin-bottom: 20px;">Please allow 1-3 business days for the funds to reflect in your account.</p>
            </div>
            
            <div class="footer">
              <p style="color: #475569; font-size: 12px;">
                © ${new Date().getFullYear()} Aviator. All rights reserved.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
✅ Withdrawal Approved!

Hi ${name}!

Your withdrawal request has been approved! Your funds are being processed and will arrive shortly.

Withdrawal Amount: ${amount.toLocaleString()} ${currency}
Payment Method: ${paymentMethod}

Please allow 1-3 business days for the funds to reflect in your account.

---
© ${new Date().getFullYear()} Aviator. All rights reserved.
    `;

    return this.sendEmail({ to: email, subject, html, text });
  }

  /**
   * Check if email service is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

export const emailService = new EmailService();
