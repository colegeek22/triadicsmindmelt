
import { Injectable } from '@angular/core';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

export type LensType = 'Logic' | 'Intuition' | 'Emotion';

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    if (!process.env.API_KEY) {
      console.error("API_KEY environment variable not set.");
      throw new Error("API_KEY environment variable not set.");
    }
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  private getLensDescription(lens: LensType): string {
    switch (lens) {
      case 'Logic':
        return "a logical, analytical, and structured perspective. Generate practical ideas, systems, frameworks, and data-driven suggestions.";
      case 'Intuition':
        return "an intuitive perspective, making unexpected connections and generating novel, 'wild card' ideas. Think metaphorically and draw from disparate domains.";
      case 'Emotion':
        return "an emotional and sensory perspective. Explore feelings, atmosphere, and human impact with rich, evocative language.";
    }
  }

  async generateWithLenses(lenses: LensType[], seedIdea: string): Promise<GenerateContentResponse> {
    const model = 'gemini-2.5-flash';
    
    let prompt = `You are a creative partner. The user provides a core concept. Your task is to generate ideas that blend multiple creative perspectives.

The user's core concept is: "${seedIdea}"

Please generate a few distinct, creative suggestions that simultaneously incorporate the following lenses:
`;

    lenses.forEach(lens => {
      prompt += `\n- **${lens}:** ${this.getLensDescription(lens)}`;
    });

    prompt += "\n\nGenerate the blended ideas now. Each idea should be on a new line, starting with a hyphen.";

    return this.ai.models.generateContent({
        model: model,
        contents: prompt
    });
  }
  
  async refineIdea(idea: string, lens: LensType): Promise<GenerateContentResponse> {
    const model = 'gemini-2.5-flash';
    const prompt = `You are an AI assistant that helps refine creative ideas. The user has an idea generated from a specific creative lens.
    
Current Idea: "${idea}"
Creative Lens: ${lens}

Your task is to rephrase or expand upon this idea, making it more compelling, clear, or imaginative, while staying true to the spirit of the '${lens}' lens.

Provide only the single, refined idea as a response.`;
    
    return this.ai.models.generateContent({ model, contents: prompt });
  }

  async synthesizeIdeas(seedIdea: string, logicIdeas: string[], intuitionIdeas: string[], emotionIdeas: string[]): Promise<GenerateContentResponse> {
    const model = 'gemini-2.5-flash';
    
    let prompt = `You are a master synthesizer. Your task is to take a core concept and a collection of ideas from three different perspectives—Logic, Intuition, and Emotion—and weave them into a single, cohesive, and compelling output.

The format of the output should be a well-structured document using markdown for formatting. Start with a short, engaging summary of the synthesized concept. Then, elaborate on the synthesized idea, integrating the provided points from the different lenses into a unified vision. Do not include a title.

Core Concept: "${seedIdea}"

Here are the ideas to synthesize:
`;

    if (logicIdeas.length > 0) {
      prompt += `\n### Logic:\n- ${logicIdeas.join('\n- ')}\n`;
    }
    if (intuitionIdeas.length > 0) {
      prompt += `\n### Intuition:\n- ${intuitionIdeas.join('\n- ')}\n`;
    }
    if (emotionIdeas.length > 0) {
      prompt += `\n### Emotion:\n- ${emotionIdeas.join('\n- ')}\n`;
    }

    prompt += "\nNow, generate the synthesized masterpiece.";

    return this.ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        temperature: 0.7,
      }
    });
  }

  async generateTitle(synthesizedText: string): Promise<GenerateContentResponse> {
    const model = 'gemini-2.5-flash';
    const prompt = `Based on the following synthesized concept, generate a short, creative, and compelling title for it. Provide only the title itself, without any quotation marks or extra text.

Concept:
---
${synthesizedText.substring(0, 1000)}...
---

Title:`;
    return this.ai.models.generateContent({ model, contents: prompt });
  }

  async generateIconForIdea(ideaText: string, lens: LensType): Promise<GenerateContentResponse> {
    const model = 'gemini-2.5-flash';
    const prompt = `You are an AI SVG icon designer. Your task is to create a simple, minimalist, single-color SVG icon that visually represents the following creative idea.

Creative Idea: "${ideaText}"
The idea comes from a '${lens}' perspective.

IMPORTANT RULES:
1.  The SVG must be simple and clear.
2.  Use 'currentColor' for the fill or stroke attribute so it can inherit color.
3.  Do NOT include any XML declaration (e.g., <?xml...?>).
4.  Do NOT use any <style> tags or CSS classes.
5.  Return ONLY the raw <svg>...</svg> tag and its content.

Example output:
<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="..." /></svg>

Now, generate the SVG icon for the idea.`;

    return this.ai.models.generateContent({ model, contents: prompt });
  }

  async generateFromAudio(audioBase64: string, mimeType: string): Promise<GenerateContentResponse> {
    const model = 'gemini-2.5-flash';
    const audioPart = {
        inlineData: {
            mimeType: mimeType,
            data: audioBase64,
        },
    };
    const promptPart = {
        text: "You are a conversational AI partner. The user has provided audio input. Listen to them and respond in a friendly, helpful, and concise manner."
    };

    const contents = { parts: [promptPart, audioPart] };

    return this.ai.models.generateContent({
        model: model,
        contents: contents,
    });
  }

  // --- Vision Studio Methods ---

  async analyzeImage(imageBase64: string, mimeType: string, prompt: string): Promise<GenerateContentResponse> {
    const model = 'gemini-2.5-flash';
    const imagePart = {
        inlineData: {
            mimeType: mimeType,
            data: imageBase64,
        },
    };
    const promptPart = {
        text: prompt
    };
    const contents = { parts: [promptPart, imagePart] };
    return this.ai.models.generateContent({
        model: model,
        contents: contents,
    });
  }

  async generateImage(prompt: string, aspectRatio: string) {
    return this.ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: prompt,
        config: {
            numberOfImages: 1,
            outputMimeType: 'image/png',
            aspectRatio: aspectRatio,
        },
    });
  }

  async generateVideo(imageBase64: string, mimeType: string, prompt: string) {
    return this.ai.models.generateVideos({
        model: 'veo-2.0-generate-001',
        prompt: prompt,
        image: {
            imageBytes: imageBase64,
            mimeType: mimeType,
        },
        config: {
            numberOfVideos: 1,
        },
    });
  }

  async getVideosOperation({ operation }: { operation: any; }) {
      return this.ai.operations.getVideosOperation({ operation: operation });
  }
}
