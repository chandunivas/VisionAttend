/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const PORT = 3000;

async function startServer() {
  const app = express();

  // Support larger base64 file payloads for photos
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Lazy-initialize Gemini API Client to prevent crash if key is missing on startup
  let aiInstance: GoogleGenAI | null = null;
  function getGeminiClient(): GoogleGenAI {
    if (!aiInstance) {
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        throw new Error("GEMINI_API_KEY environment variable is required but missing. Please set it in Settings > Secrets.");
      }
      aiInstance = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          }
        }
      });
    }
    return aiInstance;
  }

  // Clean base64 image prefixes
  function cleanBase64(base64Str: string): { data: string; mimeType: string } {
    const match = base64Str.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return { mimeType: match[1], data: match[2] };
    }
    return { mimeType: "image/jpeg", data: base64Str };
  }

  // Robust model generator helper with retries and fallbacks
  async function generateContentWithFallback(
    ai: GoogleGenAI,
    params: {
      contents: any;
      config: any;
    }
  ): Promise<any> {
    // Try standard high-quota models first to prevent RESOURCE_EXHAUSTED errors
    const modelsToTry = [
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-2.5-flash",
      "gemini-flash-latest",
      "gemini-2.5-pro",
      "gemini-3.1-pro-preview"
    ];
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`Sending face verification to model: ${modelName}...`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: params.contents,
          config: params.config,
        });
        console.log(`Successfully verified using model: ${modelName}`);
        return response;
      } catch (err: any) {
        lastError = err;
        const msg = err?.message || String(err);
        if (msg.includes("quota") || msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
          console.log(`Model ${modelName} status: Busy/Rate-Limited. Trying next fallback...`);
        } else {
          console.log(`Model ${modelName} status: Offline/Unavailable. Trying next fallback...`);
        }
      }
    }

    throw lastError || new Error("All face verification models failed due to persistent service load.");
  }

  // Facial verification route
  app.post("/api/verify-face", async (req, res) => {
    try {
      const { referencePhoto, attendanceSelfie, livenessChallenge } = req.body;

      if (!referencePhoto || !attendanceSelfie) {
        return res.status(400).json({
          error: "Both referencePhoto and attendanceSelfie are required in base64 format."
        });
      }

      const ref = cleanBase64(referencePhoto);
      const selfie = cleanBase64(attendanceSelfie);

      let prompt = "Compare these two photos of a college student. The first is their official reference photo (or a locked webcam capture). The second is a dynamic live selfie taken on a webcam for attendance verification.\n\n" +
        "1. IDENTITY VERIFICATION: Determine if both photos represent the exact same person. While being understanding of light variations, shadows, or camera angles, you MUST prioritize security and accuracy to PREVENT proxy attendance fraud. Do NOT allow a different classmate, friend, or proxy to pass verification under any circumstances.\n" +
        "You MUST evaluate and provide individual matching status and details for each of the following facial structural components:\n" +
        "- NOSE: Compare the nose bridge height, width, shape, and nasal contour.\n" +
        "- FOREHEAD: Compare the forehead size, height, hairline transition, or brow ridges.\n" +
        "- LIPS: Compare lip thickness, mouth width, and spacing from nose to mouth.\n" +
        "- FACE CUT: Compare the general face cut outline, cheek contour, and facial width-to-height ratio.\n\n" +
        "CRITICAL SECURITY RULES & BALANCED VERIFICATION:\n" +
        "- BE REASONABLE AND BALANCED: Do NOT reject a student solely because of minor variations in illumination, shadow patterns, camera angles, camera quality, minor changes in hair length/facial hair, or if they are wearing glasses, as long as the core underlying bone structure and structural landmarks (nose bridge, brow lines, mouth shapes, face cut outline) are consistent. If they are clearly the same person, set verified = true.\n" +
        "- If the two photos show completely different individuals (even if they share similar hair color, age, or gender), you MUST set verified = false and provide a low similarity confidence score (under 50%).\n" +
        "- Mismatched nose bridge shapes, distinct face cuts (slim vs wide/broad), different forehead dimensions, or distinct mouth shapes are clear indicators of distinct individuals and MUST be rejected immediately (verified = false).\n" +
        "- Only set verified = true and confidence >= 75% if you are confident that BOTH images represent the exact same individual.\n\n";

      // Expression checks are disabled as requested by the user. We only perform biometric identity checking.
      prompt += "2. EXPRESSIONS & LIVENESS: Expression checks and liveness expression matching are explicitly disabled. Please set livenessPassed = true automatically, as we only perform static biometric identity comparison based on structural landmarks (nose, forehead, lips, and face cut).\n\n";

      prompt += "Return your response as JSON matching the schema, with comprehensive reasoning details for identity comparison.";

      let result;
      try {
        const ai = getGeminiClient();
        // Create a 15-second timeout to guarantee verification completes without timing out on large image payloads
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Gemini API call exceeded 15s time limit")), 15000);
        });

        const geminiPromise = generateContentWithFallback(ai, {
          contents: {
            parts: [
              {
                text: "--- IMAGE 1: REGISTERED OFFICIAL REFERENCE PHOTO (LOCK KEY) ---"
              },
              {
                inlineData: {
                  mimeType: ref.mimeType,
                  data: ref.data,
                }
              },
              {
                text: "--- IMAGE 2: DYNAMIC LIVE CHECK-IN SELFIE (ATTENDANCE ATTEMPT) ---"
              },
              {
                inlineData: {
                  mimeType: selfie.mimeType,
                  data: selfie.data,
                }
              },
              {
                text: prompt
              }
            ]
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                verified: {
                  type: Type.BOOLEAN,
                  description: "True if both photos are of the same person, false otherwise."
                },
                confidence: {
                  type: Type.INTEGER,
                  description: "Confidence percentage matching score from 0 to 100."
                },
                reasoning: {
                  type: Type.STRING,
                  description: "A short, professional summary of matched/mismatched landmarks, explaining why the identity is verified or rejected under current lighting/pose."
                },
                livenessPassed: {
                  type: Type.BOOLEAN,
                  description: "Should always be set to true as expression verification is disabled."
                },
                livenessDetails: {
                  type: Type.STRING,
                  description: "Should return a message confirming expression/liveness bypass."
                },
                noseMatch: {
                  type: Type.BOOLEAN,
                  description: "True if nose bridge structure and contours align, false otherwise."
                },
                noseDetails: {
                  type: Type.STRING,
                  description: "Comparative details of the nose bridge and width."
                },
                foreheadMatch: {
                  type: Type.BOOLEAN,
                  description: "True if forehead curvature and dimensions are consistent, false otherwise."
                },
                foreheadDetails: {
                  type: Type.STRING,
                  description: "Comparative details of the forehead area."
                },
                lipsMatch: {
                  type: Type.BOOLEAN,
                  description: "True if lip thickness and width are consistent, false otherwise."
                },
                lipsDetails: {
                  type: Type.STRING,
                  description: "Comparative details of the lips."
                },
                faceCutMatch: {
                  type: Type.BOOLEAN,
                  description: "True if face cut, chin contours, and outline align, false otherwise."
                },
                faceCutDetails: {
                  type: Type.STRING,
                  description: "Comparative details of the face cut and outline."
                }
              },
              required: [
                "verified", 
                "confidence", 
                "reasoning", 
                "livenessPassed", 
                "livenessDetails",
                "noseMatch",
                "noseDetails",
                "foreheadMatch",
                "foreheadDetails",
                "lipsMatch",
                "lipsDetails",
                "faceCutMatch",
                "faceCutDetails"
              ]
            }
          }
        });

        const response = await Promise.race([geminiPromise, timeoutPromise]) as any;

        const responseText = response.text;
        if (!responseText) {
          throw new Error("Received empty response from Gemini face verification.");
        }

        result = JSON.parse(responseText.trim());
      } catch (geminiError: any) {
        const errMsg = geminiError?.message || String(geminiError);
        if (errMsg.includes("quota") || errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED")) {
          console.log("Central biometric verification is rate-limited. Activating secure local biometric fallback engine...");
        } else {
          console.log("Central biometric verification is currently busy. Activating secure local biometric fallback engine...");
        }
        return res.json({
          fallback: true,
          reasoning: `College central face verification server is busy or rate-limited (Notice: ${errMsg.includes("quota") ? "Quota Exceeded" : "Service Unavailable"}). Falling back to local high-contrast canvas-based biometric comparison.`
        });
      }

      res.json(result);
    } catch (err: any) {
      console.error("Facial verification API failed:", err);
      res.status(500).json({
        error: err.message || "Failed to process face verification request."
      });
    }
  });

  // Setup Vite development server or production server
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on port ${PORT} in ${process.env.NODE_ENV || "development"} mode`);
  });
}

startServer().catch((error) => {
  console.error("Error launching server:", error);
});
