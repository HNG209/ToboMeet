// apps/web/src/lib/mls/meetingMlsClient.ts
import {
  getCiphersuiteFromName,
  getCiphersuiteImpl,
  generateKeyPackage,
  createGroup,
  createCommit,
  joinGroup,
  processMessage,
  mlsExporter,
  emptyPskIndex,
  acceptAll,
  defaultCapabilities,
  defaultLifetime,
} from "ts-mls";

/**
 * Chuyển đổi dữ liệu MLS (chứa BigInt và Uint8Array) thành chuỗi JSON an toàn khi gửi qua Socket
 */
export function serializeMlsData(data: any): string {
  return JSON.stringify(data, (_key, value) => {
    if (typeof value === "bigint") {
      return { __bigint: value.toString() };
    }
    if (
      value instanceof Uint8Array ||
      (value && value.constructor && value.constructor.name === "Uint8Array")
    ) {
      let binary = "";
      const len = value.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(value[i]);
      }
      return { __uint8: btoa(binary) };
    }
    return value;
  });
}

/**
 * Phục hồi dữ liệu MLS (BigInt và Uint8Array) từ chuỗi JSON an toàn hoặc object đã parsed
 */
export function deserializeMlsData<T = any>(input: any): T {
  let parsed = input;
  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input);
    } catch {
      return input as unknown as T;
    }
  }

  function revive(val: any): any {
    if (!val || typeof val !== "object") return val;
    if (val.__bigint !== undefined) {
      return BigInt(val.__bigint);
    }
    if (val.__uint8 !== undefined) {
      const binary = atob(val.__uint8);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }
    if (Array.isArray(val)) {
      return val.map(revive);
    }
    const res: any = {};
    for (const [k, v] of Object.entries(val)) {
      res[k] = revive(v);
    }
    return res;
  }

  return revive(parsed) as T;
}

export class MeetingMlsClient {
  private cs: any = null;
  private keyPackageData: any = null;
  private groupState: any = null;
  private currentEpochKey: Uint8Array | null = null;
  public isCreator = false;

  async init(userId: string) {
    const csObj = getCiphersuiteFromName(
      "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519",
    );
    this.cs = await getCiphersuiteImpl(csObj);

    const credential = {
      credentialType: "basic" as const,
      identity: new TextEncoder().encode(userId),
    };

    this.keyPackageData = await generateKeyPackage(
      credential,
      defaultCapabilities(),
      defaultLifetime,
      [],
      this.cs,
    );

    return this.keyPackageData.publicPackage;
  }

  getPublicPackage() {
    return this.keyPackageData?.publicPackage;
  }

  // Khởi tạo nhóm MLS khi được BE chỉ định làm creator (thành viên đầu tiên)
  async createGroup(meetingCode: string): Promise<Uint8Array> {
    if (!this.cs || !this.keyPackageData) {
      throw new Error("MLS client chưa được khởi tạo");
    }

    this.groupState = await createGroup(
      new TextEncoder().encode(meetingCode),
      this.keyPackageData.publicPackage,
      this.keyPackageData.privatePackage,
      [],
      this.cs,
    );

    this.isCreator = true;
    return await this.deriveAndSaveKey();
  }

  // Committer xử lý thêm thành viên mới
  async addMember(keyPackage: any): Promise<{
    welcome: any;
    commit: any;
    newKey: Uint8Array;
  }> {
    if (!this.groupState) {
      throw new Error("Nhóm MLS chưa sẵn sàng trên Committer");
    }

    const resolvedPackage = deserializeMlsData(keyPackage);

    const commitRes = await createCommit(
      { state: this.groupState, cipherSuite: this.cs },
      {
        extraProposals: [{ proposalType: "add", add: { keyPackage: resolvedPackage } }],
        ratchetTreeExtension: true,
        wireAsPublicMessage: true,
      },
    );

    this.groupState = commitRes.newState;
    const newKey = await this.deriveAndSaveKey();

    return {
      welcome: commitRes.welcome,
      commit: commitRes.commit,
      newKey,
    };
  }

  // Thành viên mới gia nhập nhóm từ tin nhắn Welcome
  async joinFromWelcome(welcomeMessage: any): Promise<Uint8Array> {
    if (!this.cs || !this.keyPackageData) {
      throw new Error("MLS client chưa sẵn sàng để join");
    }

    const resolvedWelcome = deserializeMlsData(welcomeMessage);

    this.groupState = await joinGroup(
      resolvedWelcome,
      this.keyPackageData.publicPackage,
      this.keyPackageData.privatePackage,
      emptyPskIndex,
      this.cs,
    );

    return await this.deriveAndSaveKey();
  }

  // Thành viên hiện tại áp dụng Commit để xoay sang Epoch mới
  async applyCommit(commitMessage: any): Promise<Uint8Array> {
    if (!this.groupState) {
      throw new Error("Không thể xử lý Commit vì chưa có Group State");
    }

    const resolvedCommit = deserializeMlsData(commitMessage);

    const processRes = await processMessage(
      resolvedCommit,
      this.groupState,
      emptyPskIndex,
      acceptAll,
      this.cs,
    );

    this.groupState = processRes.newState;
    return await this.deriveAndSaveKey();
  }

  // Committer xử lý xóa thành viên khi họ rời phòng
  async removeMember(removedLeafIndex: number): Promise<{
    commit: any;
    newKey: Uint8Array;
  }> {
    if (!this.groupState) {
      throw new Error("Group State chưa sẵn sàng để remove member");
    }

    const commitRes = await createCommit(
      { state: this.groupState, cipherSuite: this.cs },
      {
        extraProposals: [
          { proposalType: "remove", remove: { removed: removedLeafIndex } },
        ],
        ratchetTreeExtension: true,
        wireAsPublicMessage: true,
      },
    );

    this.groupState = commitRes.newState;
    const newKey = await this.deriveAndSaveKey();

    return {
      commit: commitRes.commit,
      newKey,
    };
  }

  // Trích xuất khóa đối xứng 128-bit cho LiveKit FrameCryptor từ Epoch Secret
  private async deriveAndSaveKey(): Promise<Uint8Array> {
    if (!this.groupState?.keySchedule?.exporterSecret) {
      throw new Error("Không tìm thấy exporterSecret trong MLS KeySchedule");
    }

    const key = await mlsExporter(
      this.groupState.keySchedule.exporterSecret,
      "livekit-e2ee",
      new Uint8Array(),
      16,
      this.cs,
    );

    this.currentEpochKey = key;
    return key;
  }

  getCurrentKey(): Uint8Array | null {
    return this.currentEpochKey;
  }
}

