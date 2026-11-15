import { Logger } from "@nestjs/common";

const logger = new Logger("MockLiveKit");

/**
 * Kiểm tra xem server có đang chạy ở chế độ LOAD_TEST_MODE hay không.
 */
export function isLoadTestMode(): boolean {
  return process.env.LOAD_TEST_MODE === "true";
}

/**
 * Khởi tạo Proxy Mock cho RoomServiceClient hoặc các LiveKit Client khác.
 * Khi LOAD_TEST_MODE=true, mọi thao tác gọi ra LiveKit Cloud sẽ được giải lập tức thì trong RAM.
 */
export function createMockLiveKitProxy<T extends object>(serviceName: string = "RoomServiceClient"): T {
  logger.log(`[${serviceName}] 🚀 LOAD_TEST_MODE=true: Kích hoạt Mock LiveKit Provider (Zero latency).`);

  return new Proxy({} as T, {
    get: (_target, prop: string) => {
      return async (...args: any[]) => {
        // 1. Mock listRooms
        if (prop === "listRooms") {
          const names = args[0] as string[] | undefined;
          const roomNames = names && names.length > 0 ? names : ["mock-room"];
          return roomNames.map((name) => ({
            sid: `RM_${name}`,
            name,
            emptyTimeout: 300,
            maxParticipants: 100,
            creationTime: BigInt(Math.floor(Date.now() / 1000)),
            turnPassword: "",
            enabledCodecs: [],
            metadata: JSON.stringify({
              settings: {
                isMicrophoneDisabled: false,
                isCameraDisabled: false,
                isScreenShareDisabled: false,
                isChatDisabled: false,
                waitingRoom: false,
              },
            }),
            numParticipants: 2,
            numPublishers: 1,
            activeRecording: false,
          }));
        }

        // 2. Mock listParticipants
        if (prop === "listParticipants") {
          return [
            {
              sid: "PA_mock_host",
              identity: "mock-host-id",
              name: "Mock Host",
              state: 1,
              tracks: [],
              metadata: JSON.stringify({ status: "joined" }),
              joinedAt: BigInt(Math.floor(Date.now() / 1000)),
              permission: {
                canSubscribe: true,
                canPublish: true,
                canPublishData: true,
                canUpdateMetadata: true,
                canPublishSources: [0, 1, 2],
              },
            },
            {
              sid: "PA_mock_participant",
              identity: "mock-participant-id",
              name: "Mock Participant",
              state: 1,
              tracks: [],
              metadata: JSON.stringify({ status: "joined" }),
              joinedAt: BigInt(Math.floor(Date.now() / 1000)),
              permission: {
                canSubscribe: true,
                canPublish: true,
                canPublishData: true,
                canUpdateMetadata: true,
                canPublishSources: [0, 1, 2],
              },
            },
          ];
        }

        // 3. Mock getParticipant
        if (prop === "getParticipant") {
          const identity = args[1] || "mock-user";
          return {
            sid: `PA_${identity}`,
            identity,
            name: `User ${identity}`,
            state: 1,
            tracks: [],
            metadata: JSON.stringify({ status: "joined" }),
            joinedAt: BigInt(Math.floor(Date.now() / 1000)),
            permission: {
              canSubscribe: true,
              canPublish: true,
              canPublishData: true,
              canUpdateMetadata: true,
              canPublishSources: [0, 1, 2],
            },
          };
        }

        // 4. Mock AgentDispatchClient
        if (prop === "listDispatch") return [];
        if (prop === "createDispatch") return { id: "mock-dispatch-id" };
        if (prop === "deleteDispatch") return {};

        // 5. Mock EgressClient
        if (prop === "startRoomCompositeEgress") return { egressId: "EG_mock_egress_id" };
        if (prop === "stopEgress") return { egressId: args[0] || "EG_mock_egress_id" };

        // 6. Mặc định cho createRoom, deleteRoom, updateParticipant, removeParticipant, mutePublishedTrack...
        return {};
      };
    },
  });
}

