import Groq from "groq-sdk";
import fs from "fs";
import { withExponentialBackoff } from "../utils/retry.js";

let groq;

const getGroqClient = () => {
  if (!groq) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  return groq;
};

export const transcribeAudioFile = async (audioFilePath) => {
  return await withExponentialBackoff(async () => {
    const fileStream = fs.createReadStream(audioFilePath);
    const transcription = await getGroqClient().audio.transcriptions.create({
      file: fileStream,
      model: "whisper-large-v3",
      response_format: "verbose_json",
      temperature: 0.0,
    });

    if (!Array.isArray(transcription.segments)) {
      throw new Error("Transcription response did not include segments");
    }

    return {
      rawText: transcription.text,
      segments: transcription.segments.map((seg) => ({
        start: Number(seg.start.toFixed(2)),
        end: Number(seg.end.toFixed(2)),
        text: seg.text.trim(),
      })),
    };
  });
};

const formatTimestamp = (seconds) => {
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const remainingSeconds = (totalSeconds % 60).toString().padStart(2, "0");

  return `${minutes}:${remainingSeconds}`;
};

export const answerVideoQuestion = async (question, segments) => {
  const MAX_CONTEXT_CHARS = 10000;
  let transcriptContext = "";

  for (const segment of segments) {
    const line = `[${formatTimestamp(segment.start)}] ${segment.text.trim()}\n`;
    if (transcriptContext.length + line.length > MAX_CONTEXT_CHARS) {
      transcriptContext +=
        "\n[...remaining transcript truncated for length...]";
      break;
    }
    transcriptContext += line;
  }

  transcriptContext = transcriptContext.trim();

  const completion = await withExponentialBackoff(() =>
    getGroqClient().chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are an AI Video Assistant. Ground all answers strictly in the provided transcript segments. Explicitly cite start timestamps in brackets [MM:SS] for every key point or answer reference. If the answer cannot be deduced from the transcript, respond strictly with: 'The video does not cover this topic.'",
        },
        {
          role: "user",
          content: `Transcript segments:\n${transcriptContext}\n\nQuestion: ${question}`,
        },
      ],
    })
  );

  const answer = completion.choices[0]?.message?.content;
  if (typeof answer !== "string") {
    throw new Error("Groq response did not include answer text");
  }

  return answer;
};
