import { logger } from "./logger.js";

export type DomainEvent =
  | {
      event: "question_created";
      roomId: string;
      questionId: string;
      isAnonymous: boolean;
    }
  | {
      event: "answer_accepted";
      roomId: string;
      questionId: string;
      answerId: string;
    }
  | {
      event: "recording_added";
      roomId: string;
      recordingId: string;
      durationSeconds?: number;
      provider?: string;
    }
  | {
      event: "material_uploaded";
      roomId: string;
      materialId: string;
      fileType: string;
      fileSizeBytes?: number;
    }
  | {
      event: "feed_post_created";
      postId: string;
      postType: string;
      isAnonymous: boolean;
      hasAttachments: boolean;
    }
  | {
      event: "clash_detected";
      sourceClubId: string;
      conflictingClubId: string;
      severity: "critical" | "warning" | "advisory";
      overlapStart: string;
      overlapEnd: string;
    }
  | {
      event: "negotiation_created";
      negotiationId: string;
      initiatorClubId: string;
      targetClubId: string;
    }
  | {
      event: "negotiation_accepted";
      negotiationId: string;
      initiatorClubId: string;
      targetClubId: string;
      resolutionType?: string;
    }
  | {
      event: "push_dispatched";
      notificationType: string;
      recipientCount: number;
      batchCount: number;
    }
  | {
      event: "push_failed";
      notificationType: string;
      errorCode: string;
      recipientCount: number;
    }
  | {
      event: "storage_fallback_used";
      operation: "upload" | "download" | "delete";
      bucket: string;
      originalProvider: string;
      fallbackProvider: string;
    };

export function logDomainEvent(eventData: DomainEvent): void {
  const { event, ...metadata } = eventData;
  const payload = {
    domain_event: event,
    ...metadata,
    logged_at: new Date().toISOString(),
  };

  switch (event) {
    case "push_failed":
    case "storage_fallback_used":
      logger.warn(payload, `[DomainEvent] ${event}`);
      break;
    default:
      logger.info(payload, `[DomainEvent] ${event}`);
      break;
  }
}
