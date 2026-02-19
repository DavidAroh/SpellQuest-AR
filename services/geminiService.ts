
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI } from "@google/genai";
import { SpellingFeedback, AiResponse, DebugInfo, BubbleColor } from "../types";

// Correct GoogleGenAI initialization using named parameter and process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const MODEL_NAME = "gemini-3-flash-preview";

// Added TargetCandidate for slingshot game logic analysis
export interface TargetCandidate {
    id: string;
    color: string;
    size: number;
    row: number;
    col: number;
    pointsPerBubble: number;
    description: string;
}

export const getSpellingFeedback = async (
  imageBase64: string,
  currentTrayLetters: string,
  availableLetters: string[]
): Promise<AiResponse> => {
  const startTime = performance.now();
  
  const debug: DebugInfo = {
    latency: 0,
    screenshotBase64: imageBase64,
    promptContext: `Tray: "${currentTrayLetters}", Pool: [${availableLetters.join(", ")}]`,
    rawResponse: "",
    timestamp: new Date().toLocaleTimeString()
  };

  const prompt = `
    You are a friendly, encouraging Spelling Coach for children aged 5-8.
    Look at the screenshot and the letters provided.
    
    LETTERS IN TRAY: "${currentTrayLetters}"
    LETTERS IN THE POOL: ${availableLetters.join(", ")}

    YOUR TASKS:
    1. Check if the "LETTERS IN TRAY" form a valid English word.
    2. If YES:
       - Confirm it's a word.
       - Provide a simple, 1-sentence definition for a kid.
       - Provide a fun sentence using the word.
       - Pick a matching emoji.
    3. If NO:
       - Be encouraging.
       - Suggest a simple 3-5 letter word they can make using some of the letters in the POOL.
    
    OUTPUT FORMAT:
    Return RAW JSON only.
    {
      "word": "the string in tray",
      "isValid": boolean,
      "definition": "simple definition",
      "sentence": "fun sentence",
      "suggestion": "word they could make",
      "emoji": "🌟"
    }
  `;

  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

    // Using ai.models.generateContent directly with Gemini 3 Flash
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
            { text: prompt },
            { 
              inlineData: {
                mimeType: "image/png",
                data: cleanBase64
              } 
            }
        ]
      },
      config: {
        maxOutputTokens: 1024,
        temperature: 0.7,
        responseMimeType: "application/json" 
      }
    });

    const endTime = performance.now();
    debug.latency = Math.round(endTime - startTime);
    
    // Extracting text output from response.text property
    let text = response.text || "{}";
    debug.rawResponse = text;
    
    try {
        const json = JSON.parse(text);
        debug.parsedResponse = json;
        return { feedback: json, debug };
    } catch (e: any) {
        return {
            feedback: { word: currentTrayLetters, isValid: false, suggestion: "Keep trying!" },
            debug: { ...debug, error: `JSON Parse Error: ${e.message}` }
        };
    }
  } catch (error: any) {
    return {
        feedback: { word: currentTrayLetters, isValid: false, suggestion: "Coach is resting." },
        debug: { ...debug, error: error.message || "Unknown API Error" }
    };
  }
};

/**
 * Added getStrategicHint for the Gemini Slingshot game.
 * Uses Gemini 3 Flash to analyze the game board and provide tactical advice.
 */
export const getStrategicHint = async (
    imageBase64: string,
    allClusters: TargetCandidate[],
    maxRow: number
): Promise<{ hint: any; debug: DebugInfo }> => {
    const startTime = performance.now();
    const debug: DebugInfo = {
        latency: 0,
        screenshotBase64: imageBase64,
        promptContext: `Reachable Clusters: ${JSON.stringify(allClusters)}, Max Active Row: ${maxRow}`,
        rawResponse: "",
        timestamp: new Date().toLocaleTimeString()
    };

    const prompt = `
        You are a strategic gaming assistant for a bubble shooter game.
        Look at the screenshot and the list of reachable clusters.
        
        REACHABLE CLUSTERS:
        ${JSON.stringify(allClusters, null, 2)}
        
        MAX ROW OCCUPIED: ${maxRow}
        
        TASKS:
        1. Identify the best strategic move. Prioritize larger clusters, higher value colors, or clearing bubbles that are closer to the bottom (higher row number).
        2. Provide a short, punchy strategy hint message.
        3. Provide a brief rationale.
        4. Return the targetRow and targetCol of the best cluster to hit.
        5. Recommend which color to use from the reachable options.
        
        OUTPUT FORMAT:
        Return RAW JSON only.
        {
          "message": "The hint message",
          "rationale": "Why this move",
          "targetRow": number,
          "targetCol": number,
          "recommendedColor": "red" | "blue" | "green" | "yellow" | "purple" | "orange"
        }
    `;

    try {
        const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: {
                parts: [
                    { text: prompt },
                    {
                        inlineData: {
                            mimeType: "image/png",
                            data: cleanBase64
                        }
                    }
                ]
            },
            config: {
                maxOutputTokens: 512,
                temperature: 0.2,
                responseMimeType: "application/json"
            }
        });

        const endTime = performance.now();
        debug.latency = Math.round(endTime - startTime);
        const text = response.text || "{}";
        debug.rawResponse = text;

        try {
            const json = JSON.parse(text);
            debug.parsedResponse = json;
            return { hint: json, debug };
        } catch (e: any) {
            return {
                hint: { message: "Focus on the big clusters!", rationale: "AI advice encountered a parsing snag." },
                debug: { ...debug, error: `JSON Parse Error: ${e.message}` }
            };
        }
    } catch (error: any) {
        return {
            hint: { message: "Tactical computer offline...", rationale: "API communication issue." },
            debug: { ...debug, error: error.message || "Unknown API Error" }
        };
    }
};
