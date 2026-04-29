import axios from "axios";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

const getApiKey = (): string => {
const key = process.env.OPENAI_API_KEY;
console.log("key in get key", key)
  // const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  return key;
};

// ─── Chat Completions ─────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AICompletionOptions {
  model?:        string;
  temperature?:  number;
  maxTokens?:    number;
  systemPrompt?: string;
}

export const getAICompletion = async (
  messages: ChatMessage[],
  options: AICompletionOptions = {}
): Promise<string> => {
  const {
    model        = "gpt-4o-mini",
    temperature  = 0.7,
    maxTokens    = 1000,
    systemPrompt,
  } = options;

  const fullMessages: ChatMessage[] = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  const res = await axios.post(
    OPENAI_API_URL,
    {
      model,
      messages:   fullMessages,
      temperature,
      max_tokens: maxTokens,
    },
    {
      headers: {
        Authorization:  `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
      },
    }
  );

  return res.data.choices[0]?.message?.content ?? "";
};

export const askAI = async (
  prompt:  string,
  options: AICompletionOptions = {}
): Promise<string> => {
  return getAICompletion([{ role: "user", content: prompt }], options);
};

export const generateProfileBio = async (
  firstName: string,
  role:      string,
  skills?:   string[]
): Promise<string> => {
  const skillsText = skills?.length
    ? ` with expertise in ${skills.join(", ")}`
    : "";
  const prompt = `Write a short 2-sentence professional bio for a ${role} named ${firstName}${skillsText} on a campus professional network. Keep it warm and approachable.`;
  return askAI(prompt, { maxTokens: 120, temperature: 0.8 });
};

// ─── Embeddings ───────────────────────────────────────────────────────────────

export async function generateEmbedding(text: string): Promise<number[]> {
  const res = await axios.post(
    OPENAI_EMBEDDINGS_URL,
    {
      model: "text-embedding-3-small",
      input: text.trim(),
    },
    {
      headers: {
        Authorization:  `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
      },
    }
  );

  return res.data.data[0].embedding as number[];
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}