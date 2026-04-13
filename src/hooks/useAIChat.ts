import { useState, useCallback } from "react";
import { Message } from "@/pages/Sessions/ActiveSession/Transcript";

export const useAIChat = () => {
  const [aiChat, setAiChat] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);

  const handleAnalyzeScreen = useCallback(
    async (sessionId: string, screenshotBlob: Blob | null) => {
      if (isAnalyzing || !screenshotBlob) return;

      setIsAnalyzing(true);

      const messageId = Date.now().toString();
      const newAiMessage: Message = {
        id: messageId,
        sender: "AI",
        text: "",
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setAiChat((prev) => [...prev, newAiMessage]);

      try {
        const formData = new FormData();
        formData.append("screenshot", screenshotBlob, "screenshot.jpg");

        const response = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/session/${sessionId}/analyze-screen`,
          {
            method: "POST",
            body: formData,
          },
        );

        if (!response.ok) throw new Error("Analysis failed");

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        const decoder = new TextDecoder();
        let streamedText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          streamedText += chunk;

          setAiChat((prev) =>
            prev.map((msg) =>
              msg.id === messageId ? { ...msg, text: streamedText } : msg,
            ),
          );
        }
      } catch (error) {
        console.error("AI Streaming error:", error);
        setAiChat((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? { ...msg, text: "Sorry, I encountered an error during analysis." }
              : msg,
          ),
        );
      } finally {
        setIsAnalyzing(false);
      }
    },
    [isAnalyzing],
  );

  const handleAiAnswer = useCallback(
    async (sessionId: string, transcript: string) => {
      if (isAnswering || !transcript) return;

      setIsAnswering(true);

      const messageId = Date.now().toString();
      const newAiMessage: Message = {
        id: messageId,
        sender: "AI",
        text: "",
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setAiChat((prev) => [...prev, newAiMessage]);

      try {
        const response = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/session/${sessionId}/ai-answer`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ transcript }),
          },
        );

        if (!response.ok) throw new Error("AI request failed");

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        const decoder = new TextDecoder();
        let streamedText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          streamedText += chunk;

          setAiChat((prev) =>
            prev.map((msg) =>
              msg.id === messageId ? { ...msg, text: streamedText } : msg,
            ),
          );
        }
      } catch (error) {
        console.error("AI Answering error:", error);
        setAiChat((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? {
                  ...msg,
                  text: "Sorry, I couldn't generate an answer from the transcript.",
                }
              : msg,
          ),
        );
      } finally {
        setIsAnswering(false);
      }
    },
    [isAnswering],
  );

  return {
    aiChat,
    inputMessage,
    setInputMessage,
    isAnalyzing,
    isAnswering,
    handleAnalyzeScreen,
    handleAiAnswer,
  };
};
