import readline from "node:readline";
import dotenv from "dotenv";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

dotenv.config();

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1024;
const CHAT_MODEL = "gpt-4o-mini";
const TOP_K = 5;

const openaiApiKey = process.env.OPENAI_API_KEY;
const pineconeApiKey = process.env.PINECONE_API_KEY;
const pineconeIndexName = process.env.PINECONE_INDEX;

if (!openaiApiKey) {
  console.error("❌ Error: OPENAI_API_KEY is not set in environment variables.");
  process.exit(1);
}

if (!pineconeApiKey) {
  console.error("❌ Error: PINECONE_API_KEY is not set in environment variables.");
  process.exit(1);
}

if (!pineconeIndexName) {
  console.error("❌ Error: PINECONE_INDEX is not set in environment variables.");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: openaiApiKey });
const pinecone = new Pinecone({ apiKey: pineconeApiKey });
const index = pinecone.index(pineconeIndexName);

/**
 * Embed user input query into vector representation
 */
async function embedQuery(text) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    input: text,
  });

  return response.data[0].embedding;
}

/**
 * Retrieve top relevant chunks from Pinecone vector store
 */
async function searchVectorStore(queryVector, topK = TOP_K) {
  const queryResponse = await index.query({
    vector: queryVector,
    topK,
    includeMetadata: true,
  });

  return queryResponse.matches || [];
}

/**
 * Send user query and relevant context chunks to the OpenAI LLM
 */
async function generateAnswer(userQuery, matches) {
  // Construct formatted context string from retrieved matches
  const contextString = matches
    .map((match, i) => {
      const meta = match.metadata || {};
      const lesson = meta.lesson || meta.lessonFile || "Unknown Lesson";
      const moduleName = meta.module || "Unknown Module";
      const startTime = meta.startTimestamp || "00:00:00";
      const endTime = meta.endTimestamp || "00:00:00";
      const text = meta.text || "";
      const score = (match.score * 100).toFixed(1);

      return `[Chunk ${i + 1}] (Relevance: ${score}%)
Module: ${moduleName}
Lesson: ${lesson}
Timestamp: ${startTime} - ${endTime}
Content: "${text}"`;
    })
    .join("\n\n");

  const systemPrompt = `You are an expert AI Course Assistant. Answer the student's question accurately using ONLY the provided course transcript context snippets below.

Strict Output Guidelines:
1. **Answer Length**: Keep the core answer concise, between 3 to 5 lines.
2. **Source Reference**: Always conclude your response with a clear reference section identifying where the answer is present:
   📍 Source Reference:
   - **Module**: <Module Name>
   - **Chapter/Lesson**: <Lesson/Chapter Name>
   - **Timestamp**: <Start Timestamp> - <End Timestamp>

If multiple chunks contribute to the answer, cite each relevant module, chapter/lesson, and timestamp.
If the retrieved context does not contain enough information, state clearly that the answer was not found in the course materials.

Retrieved Context Snippets:
${contextString || "No relevant context found."}`;

  const stream = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userQuery },
    ],
    stream: true,
  });

  process.stdout.write("\n🤖 Assistant: ");
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    process.stdout.write(content);
  }
  process.stdout.write("\n\n");
}

/**
 * CLI Loop using node:readline
 */
function startCLI() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("=========================================");
  console.log(" 🎓 Course AI Assistant (RAG Query CLI) ");
  console.log(" Type your question below or 'exit' to quit.");
  console.log("=========================================\n");

  const promptUser = () => {
    rl.question("\n❓ Ask a question: ", async (query) => {
      const trimmedQuery = query.trim();

      if (!trimmedQuery) {
        promptUser();
        return;
      }

      if (
        trimmedQuery.toLowerCase() === "exit" ||
        trimmedQuery.toLowerCase() === "quit"
      ) {
        console.log("👋 Goodbye!");
        rl.close();
        return;
      }

      try {
        console.log("\n🔍 Embedding query and searching vector store...");
        const queryVector = await embedQuery(trimmedQuery);
        const matches = await searchVectorStore(queryVector);

        console.log(`\n📌 Found ${matches.length} relevant context chunks:`);
        matches.forEach((match, idx) => {
          const meta = match.metadata || {};
          const lesson = meta.lesson || meta.lessonFile || "Unknown";
          const start = meta.startTimestamp || "";
          const score = (match.score * 100).toFixed(1);
          console.log(
            `   [${idx + 1}] ${lesson} (${start}) - Score: ${score}%`
          );
        });

        await generateAnswer(trimmedQuery, matches);
      } catch (err) {
        console.error("\n❌ Error processing query:", err.message || err);
      }

      promptUser();
    });
  };

  promptUser();
}

startCLI();
