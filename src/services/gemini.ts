import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// Persistent cache using localStorage to reduce API calls and handle quota limits
const getCache = () => {
  try {
    const stored = localStorage.getItem('foogan_ai_cache');
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

const setCache = (data: any) => {
  try {
    localStorage.setItem('foogan_ai_cache', JSON.stringify(data));
  } catch (e) {
    console.warn("Cache write failed", e);
  }
};

const CACHE_TTL = 1000 * 60 * 60 * 6; // 6 hours

export async function getSafetyInsights(incidents: any[]) {
  const cacheKey = `insights_${incidents.length}_${incidents.map(i => i.id).join('')}`;
  const cache = getCache();
  
  if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL) {
    return cache[cacheKey].data;
  }

  const prompt = `Analyze the following recent safety incidents in Mogadishu and provide 3 concise, actionable safety tips for citizens. 
  Incidents: ${JSON.stringify(incidents.slice(0, 10))}
  
  Format the response as a JSON object with a "tips" array of strings.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tips: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["tips"]
        }
      }
    });

    const data = JSON.parse(response.text || '{"tips": []}');
    cache[cacheKey] = { data, timestamp: Date.now() };
    setCache(cache);
    return data;
  } catch (error: any) {
    const isQuotaError = error?.message?.includes("429") || error?.status === 429;
    if (!isQuotaError) {
      console.error("Gemini Error (Insights):", error);
    }
    
    // Check for 429 Quota Exceeded
    if (isQuotaError) {
      return {
        tips: [
          "Safety Tip: Stay alert in crowded areas and report suspicious activity.",
          "Safety Tip: Keep emergency contacts updated and share your location with family.",
          "Safety Tip: Avoid traveling alone at night in high-risk districts.",
          "Note: AI Safety Insights are currently limited due to high demand."
        ]
      };
    }

    return { tips: ["Stay vigilant in high-traffic areas.", "Report suspicious activity to local authorities.", "Keep emergency contacts updated."] };
  }
}

export async function summarizeDistrictRisk(districtName: string, incidents: any[]) {
  const cacheKey = `summary_${districtName}_${incidents.length}`;
  const cache = getCache();

  if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL) {
    return cache[cacheKey].data;
  }

  const prompt = `Provide a 2-sentence safety summary for the ${districtName} district based on these recent reports: ${JSON.stringify(incidents)}. 
  Focus on current trends and specific advice for this area.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt
    });

    const data = response.text || `Safety status for ${districtName} is being monitored. Please check recent reports for details.`;
    cache[cacheKey] = { data, timestamp: Date.now() };
    setCache(cache);
    return data;
  } catch (error: any) {
    const isQuotaError = error?.message?.includes("429") || error?.status === 429;
    if (!isQuotaError) {
      console.error("Gemini Error (District Summary):", error);
    }

    if (isQuotaError) {
      return `Safety summary for ${districtName} is currently unavailable due to high demand. Please review the live incident reports below for the most current information.`;
    }

    return "No AI summary available at this time.";
  }
}
