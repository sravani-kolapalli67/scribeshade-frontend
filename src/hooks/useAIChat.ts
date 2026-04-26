import { useState, useCallback } from "react";
import { Message } from "@/pages/Sessions/ActiveSession/Transcript";

export const useAIChat = () => {
  const [aiChat, setAiChat] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);

  const handleAnalyzeScreen = useCallback(
    async (sessionId: string, screenshotBlob: Blob | null, aiModel: string) => {
      if (isAnalyzing || !screenshotBlob) return;

      setIsAnalyzing(true);

      const currentUsage = parseInt(localStorage.getItem(`aiUsage_${sessionId}`) || "0", 10);
      localStorage.setItem(`aiUsage_${sessionId}`, (currentUsage + 1).toString());

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
        if (aiModel) {
          formData.append("aiModel", aiModel);
        }

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
    async (sessionId: string, transcript: string, aiModel: string) => {
      if (isAnswering || !transcript) return;

      setIsAnswering(true);

      const currentUsage = parseInt(localStorage.getItem(`aiUsage_${sessionId}`) || "0", 10);
      localStorage.setItem(`aiUsage_${sessionId}`, (currentUsage + 1).toString());

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
            body: JSON.stringify({ transcript, aiModel }),
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

  const handleCustomQuery = useCallback(
    async (sessionId: string, query: string, aiModel: string) => {
      if (isAnswering || !query.trim()) return;

      setIsAnswering(true);

      const currentUsage = parseInt(
        localStorage.getItem(`aiUsage_${sessionId}`) || "0",
        10,
      );
      localStorage.setItem(
        `aiUsage_${sessionId}`,
        (currentUsage + 1).toString(),
      );

      const messageId = Date.now().toString();
      const userMessage: Message = {
        id: messageId + "-user",
        sender: "User",
        text: query,
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setAiChat((prev) => [...prev, userMessage]);
      setInputMessage("");

      // Save user query to backend history
      fetch(`${import.meta.env.VITE_BACKEND_URL}/api/session/${sessionId}/save-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "USER",
          question: query,
          answer: "",
          time: userMessage.time,
        }),
      }).catch((err) => console.error("Failed to save user query:", err));

      const aiMessageId = Date.now().toString();
      const newAiMessage: Message = {
        id: aiMessageId,
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
            body: JSON.stringify({ transcript: query, isCustomQuery: true, aiModel }),
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
              msg.id === aiMessageId ? { ...msg, text: streamedText } : msg,
            ),
          );
        }
      } catch (error) {
        console.error("AI Custom Query error:", error);
        setAiChat((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId
              ? {
                  ...msg,
                  text: "Sorry, I couldn't process your question.",
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
    handleCustomQuery,
  };
};
