import axios from "axios";
import { generateOtp } from "./jwt.js";

export interface OtpResult {
  otp: string;
  sent: boolean;
}

export const sendPhoneOtp = async (
  phone: string,
  otp?: string
): Promise<OtpResult> => {
  const code = otp ?? generateOtp(6);

  const apiKey = process.env.TERMII_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV] Phone OTP for ${phone}: ${code}`);
      return { otp: code, sent: true };
    }
    console.error("❌ TERMII_API_KEY is not set");
    return { otp: code, sent: false };
  }

  try {
    await axios.post("https://api.ng.termii.com/api/sms/send", {
      to: phone,
      from: process.env.TERMII_SENDER_ID || "CampusBase",
      sms: `Your CampusBase verification code is ${code}. Valid for 10 minutes. Do not share this code.`,
      type: "plain",
      channel: "generic",
      api_key: apiKey,
    });

    return { otp: code, sent: true };
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      console.error("❌ Termii SMS error:", error.response?.data || error.message);
    } else if (error instanceof Error) {
      console.error("❌ Termii SMS error:", error.message);
    }
    return { otp: code, sent: false };
  }
};
