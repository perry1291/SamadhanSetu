/**
 * OTP delivery abstraction.
 *
 * The production provider will be Meta for Developers (WhatsApp Business
 * authentication templates). That integration is NOT present yet. Rather than
 * scatter provider calls through the registration flow, everything goes through
 * `OtpProvider`, so wiring Meta later means implementing one interface and
 * changing `resolveOtpProvider()` — no route, component or flow changes.
 *
 * Honesty rule enforced here: the delivery status is reported precisely.
 * `provider_not_configured` and `development_server_log` are distinct from
 * `sent`, and the UI renders different text for each, so the citizen is never
 * told a message was sent when none was.
 *
 * The OTP code is passed to the provider but is never returned to the caller in
 * a client-visible field, never written to a database in plaintext, and never
 * logged outside the explicitly development-only provider.
 */
import "@tanstack/react-start/server-only";

export type OtpDeliveryStatus =
  /** A provider accepted the message for delivery to the citizen's phone. */
  | "sent"
  /** No provider is wired up. Nothing was sent. */
  | "provider_not_configured"
  /** Development only: code written to the server console, nothing sent. */
  | "development_server_log"
  /** A configured provider was called and failed. */
  | "provider_error";

export interface OtpSendResult {
  status: OtpDeliveryStatus;
  channel: "whatsapp" | "sms" | "server-console" | "none";
  /** Provider-side correlation id, when the provider issues one. */
  providerReference?: string;
}

export interface OtpVerifyResult {
  /**
   * `false` means this provider does not verify codes and the caller must check
   * against its own stored challenge. Meta's managed flow will return `true`.
   */
  handledByProvider: boolean;
  verified: boolean;
}

export interface OtpProvider {
  readonly id: string;
  readonly isConfigured: boolean;
  sendOtp(input: { mobile: string; code: string }): Promise<OtpSendResult>;
  verifyOtp(input: {
    mobile: string;
    code: string;
    providerReference?: string;
  }): Promise<OtpVerifyResult>;
}

function isProduction(): boolean {
  return process.env["NODE_ENV"] === "production";
}

/**
 * Placeholder for the real integration.
 *
 * When implemented it will read credentials from server-side environment
 * variables (for example `META_WHATSAPP_TOKEN` and `META_PHONE_NUMBER_ID`) and
 * POST to the Graph API. Until those exist it reports, accurately, that nothing
 * was sent.
 */
class MetaOtpProvider implements OtpProvider {
  readonly id = "meta";

  get isConfigured(): boolean {
    const token = process.env["META_WHATSAPP_TOKEN"];
    const phoneNumberId = process.env["META_PHONE_NUMBER_ID"];
    return (
      token !== undefined && token !== "" && phoneNumberId !== undefined && phoneNumberId !== ""
    );
  }

  async sendOtp(input: { mobile: string; code: string }): Promise<OtpSendResult> {
    const token = process.env["META_WHATSAPP_TOKEN"];
    const phoneNumberId = process.env["META_PHONE_NUMBER_ID"];
    
    if (!token || !phoneNumberId) {
      return { status: "provider_not_configured", channel: "none" };
    }

    try {
      // Use the exact template name from the user's Meta account
      const templateName = process.env["META_TEMPLATE_NAME"] || "otx_confirmed";
      
      // WhatsApp requires country code. If mobile is 10 digits, assume India (91).
      // If it already has country code, just strip non-digits.
      let formattedMobile = input.mobile.replace(/\D/g, "");
      if (formattedMobile.length === 10) {
        formattedMobile = `91${formattedMobile}`;
      }

      const payload = {
        messaging_product: "whatsapp",
        to: formattedMobile,
        type: "template",
        template: {
          name: templateName,
          language: {
            code: "en_US", // Explicitly using English (US) as shown in the screenshot
          },
          components: [
            {
              type: "body",
              parameters: [
                {
                  type: "text",
                  text: input.code, // The {{1}} variable in the template
                },
              ],
            },
          ],
        },
      };

      const response = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error("[otp][meta] WhatsApp API error:", response.status, errorData);
        return { status: "provider_error", channel: "whatsapp" };
      }

      const data = await response.json();
      return {
        status: "sent",
        channel: "whatsapp",
        providerReference: data.messages?.[0]?.id,
      };
    } catch (error) {
      console.error("[otp][meta] Network error calling WhatsApp API:", error);
      return { status: "provider_error", channel: "whatsapp" };
    }
  }

  verifyOtp(): Promise<OtpVerifyResult> {
    return Promise.resolve({ handledByProvider: false, verified: false });
  }
}

/**
 * Development-only provider. Writes the code to the SERVER console so the flow
 * can be exercised locally.
 *
 * Never returns the code to the browser, never puts it in a URL, storage or the
 * browser console, and refuses to operate when NODE_ENV is production.
 */
class DevelopmentConsoleOtpProvider implements OtpProvider {
  readonly id = "development-console";
  readonly isConfigured = true;

  sendOtp(input: { mobile: string; code: string }): Promise<OtpSendResult> {
    if (isProduction()) {
      return Promise.resolve({ status: "provider_not_configured", channel: "none" });
    }
    // Server-side terminal only. Last 3 digits of the mobile for correlation.
    console.info(
      `[otp][development] No message was sent. Verification code for ` +
        `mobile ending ${input.mobile.slice(-3)} is ${input.code}. ` +
        `This log is disabled when NODE_ENV=production.`,
    );
    return Promise.resolve({ status: "development_server_log", channel: "server-console" });
  }

  verifyOtp(): Promise<OtpVerifyResult> {
    // Verification is done against our hashed challenge, not here.
    return Promise.resolve({ handledByProvider: false, verified: false });
  }
}

/** Production fallback when no provider is configured. Sends nothing. */
class UnconfiguredOtpProvider implements OtpProvider {
  readonly id = "unconfigured";
  readonly isConfigured = false;

  sendOtp(): Promise<OtpSendResult> {
    return Promise.resolve({ status: "provider_not_configured", channel: "none" });
  }

  verifyOtp(): Promise<OtpVerifyResult> {
    return Promise.resolve({ handledByProvider: false, verified: false });
  }
}

/**
 * Selection order: a configured Meta provider wins; otherwise development gets
 * the console provider; production without a provider gets the honest
 * unconfigured provider.
 */
export function resolveOtpProvider(): OtpProvider {
  const meta = new MetaOtpProvider();
  if (meta.isConfigured) return meta;
  if (!isProduction()) return new DevelopmentConsoleOtpProvider();
  return new UnconfiguredOtpProvider();
}
