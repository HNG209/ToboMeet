import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pinecone, Index } from "@pinecone-database/pinecone";

export interface SemanticSearchResult {
  eventId: string;
  score: number;
  title: string;
  acceptedUserIds: string[];
}

@Injectable()
export class VectorDbService implements OnModuleInit {
  private readonly logger = new Logger(VectorDbService.name);
  private pineconeClient: Pinecone | null = null;
  private pineconeIndex: Index | null = null;
  private googleApiKey: string = "";
  private indexName: string = "calendar-events";

  constructor(private readonly configService: ConfigService) {
    this.googleApiKey =
      this.configService.get<string>("GOOGLE_GENERATIVE_AI_API_KEY") ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      "";
    this.indexName =
      this.configService.get<string>("PINECONE_INDEX_NAME") ||
      process.env.PINECONE_INDEX_NAME ||
      "calendar-events";

    const pineconeApiKey =
      this.configService.get<string>("PINECONE_API_KEY") ||
      process.env.PINECONE_API_KEY ||
      "";

    if (pineconeApiKey) {
      try {
        this.pineconeClient = new Pinecone({ apiKey: pineconeApiKey });
        this.pineconeIndex = this.pineconeClient.index(this.indexName);
        this.logger.log(`Initialized Pinecone client with index "${this.indexName}"`);
      } catch (err: any) {
        this.logger.error(`Failed to initialize Pinecone: ${err?.message}`, err?.stack);
      }
    } else {
      this.logger.warn("PINECONE_API_KEY is not configured!");
    }
  }

  async onModuleInit() {
    if (!this.googleApiKey) {
      this.logger.warn("GOOGLE_GENERATIVE_AI_API_KEY is not configured for VectorDbService!");
    }
  }

  private getIndex(): Index {
    if (!this.pineconeIndex) {
      const pineconeApiKey =
        this.configService.get<string>("PINECONE_API_KEY") ||
        process.env.PINECONE_API_KEY ||
        "";
      if (!pineconeApiKey) {
        throw new Error("PINECONE_API_KEY is not configured.");
      }
      this.pineconeClient = new Pinecone({ apiKey: pineconeApiKey });
      this.pineconeIndex = this.pineconeClient.index(this.indexName);
    }
    return this.pineconeIndex;
  }

  /**
   * Tạo vector embedding 768 chiều từ text sử dụng Google Generative AI API (gemini-embedding-001)
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.googleApiKey) {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is missing. Cannot generate embeddings.");
    }

    const cleanText = (text || "").trim();
    const contentText = cleanText.length > 0 ? cleanText : "Sự kiện lịch họp";

    // Danh sách models embedding ưu tiên (outputDimensionality 768)
    const modelsToTry = [
      "models/gemini-embedding-001",
      "models/gemini-embedding-2",
      "models/gemini-embedding-2-preview",
    ];

    let lastError: any = null;

    for (const model of modelsToTry) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/${model}:embedContent?key=${this.googleApiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: {
              parts: [{ text: contentText }],
            },
            outputDimensionality: 768,
          }),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(
            errorData.error?.message || `HTTP ${res.status}: ${res.statusText}`,
          );
        }

        const data: any = await res.json();
        const values: number[] = data?.embedding?.values;

        if (Array.isArray(values) && values.length === 768) {
          return values;
        }

        if (Array.isArray(values) && values.length > 0) {
          // Truncate hoặc pad về 768 nếu model trả về chiều khác
          if (values.length > 768) {
            return values.slice(0, 768);
          }
          const padded = [...values];
          while (padded.length < 768) padded.push(0);
          return padded;
        }

        throw new Error("Invalid embedding response format from Google API");
      } catch (err: any) {
        lastError = err;
        this.logger.warn(`Failed embedding with ${model}: ${err?.message}. Trying next model...`);
      }
    }

    this.logger.error(`Failed to generate embedding with all models: ${lastError?.message}`, lastError?.stack);
    throw new Error(`Google Embedding failed: ${lastError?.message || "Unknown error"}`);
  }

  /**
   * Upsert vector của sự kiện lên Pinecone
   * ID là eventId (_id)
   * Metadata bao gồm danh sách acceptedUserIds (bao gồm hostId và các user đã đồng ý)
   */
  async upsertEventVector(
    eventId: string,
    title: string,
    description: string | undefined,
    hostId: string,
    acceptedUserIds: string[] = [],
  ): Promise<void> {
    try {
      const cleanDesc = (description || "")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .trim();

      const combinedText = `Tiêu đề: ${title || ""}\nMô tả: ${cleanDesc}`.trim();
      const vector = await this.generateEmbedding(combinedText);

      const allAccepted = Array.from(
        new Set([hostId, ...(acceptedUserIds || [])].filter(Boolean)),
      );

      const index = this.getIndex();
      await index.upsert({
        records: [
          {
            id: eventId,
            values: vector,
            metadata: {
              eventId,
              title: title || "",
              acceptedUserIds: allAccepted,
            },
          },
        ],
      });

      this.logger.log(
        `[VectorDbService] Upserted vector for event "${title}" (${eventId}) with ${allAccepted.length} accepted users`,
      );
    } catch (error: any) {
      this.logger.error(
        `[VectorDbService] Error upserting vector for event ${eventId}: ${error?.message}`,
        error?.stack,
      );
    }
  }

  /**
   * Cập nhật danh sách acceptedUserIds của vector khi người dùng khác bấm đồng ý (RSVP ACCEPTED)
   */
  async updateAcceptedUsers(
    eventId: string,
    hostId: string,
    acceptedUserIds: string[] = [],
  ): Promise<void> {
    try {
      const allAccepted = Array.from(
        new Set([hostId, ...(acceptedUserIds || [])].filter(Boolean)),
      );

      const index = this.getIndex();
      await index.update({
        id: eventId,
        metadata: {
          acceptedUserIds: allAccepted,
        },
      });

      this.logger.log(
        `[VectorDbService] Updated accepted users for event ${eventId} (${allAccepted.length} users)`,
      );
    } catch (error: any) {
      this.logger.error(
        `[VectorDbService] Error updating accepted users for event ${eventId}: ${error?.message}`,
        error?.stack,
      );
    }
  }

  /**
   * Xóa vector sự kiện khỏi Pinecone khi xóa lịch
   */
  async deleteEventVector(eventId: string): Promise<void> {
    try {
      const index = this.getIndex();
      await index.deleteOne({ id: eventId });
      this.logger.log(`[VectorDbService] Deleted vector for event ${eventId}`);
    } catch (error: any) {
      this.logger.error(
        `[VectorDbService] Error deleting vector for event ${eventId}: ${error?.message}`,
        error?.stack,
      );
    }
  }

  /**
   * Tìm kiếm theo ngữ nghĩa (semantic search) top 5 vector tương đồng
   * Chỉ lấy các lịch mà người dùng hiện tại (userId) đã đồng ý (hoặc là host)
   */
  async semanticSearch(
    userId: string,
    query: string,
    topK = 5,
  ): Promise<SemanticSearchResult[]> {
    try {
      this.logger.log(
        `[VectorDbService] Semantic search for user ${userId}, query: "${query}"`,
      );

      const vector = await this.generateEmbedding(query);
      const index = this.getIndex();

      const response = await index.query({
        vector,
        topK,
        includeMetadata: true,
        filter: {
          acceptedUserIds: {
            $in: [userId],
          },
        },
      });

      const matches = response.matches || [];
      return matches.map((m) => ({
        eventId: (m.metadata?.eventId as string) || m.id,
        score: m.score || 0,
        title: (m.metadata?.title as string) || "",
        acceptedUserIds: (m.metadata?.acceptedUserIds as string[]) || [],
      }));
    } catch (error: any) {
      this.logger.error(
        `[VectorDbService] Error in semanticSearch for "${query}": ${error?.message}`,
        error?.stack,
      );
      return [];
    }
  }
}
