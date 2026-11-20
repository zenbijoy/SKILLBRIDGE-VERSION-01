import React from "react";
import { useLocalSearchParams, router } from "expo-router";
import { FullScreenPdfReader } from "@/components/FullScreenPdfReader";

export default function PdfReaderScreen() {
  const params = useLocalSearchParams<{
    url?: string;
    title?: string;
    uploaderName?: string;
    department?: string;
    courseCode?: string;
    fileSizeBytes?: string;
  }>();

  const url = params.url || "";
  const title = params.title || "Academic Document";
  const uploaderName = params.uploaderName || undefined;
  const department = params.department || undefined;
  const courseCode = params.courseCode || undefined;
  const fileSizeBytes = params.fileSizeBytes ? parseInt(params.fileSizeBytes, 10) : undefined;

  return (
    <FullScreenPdfReader
      visible={Boolean(url)}
      url={url}
      title={title}
      uploaderName={uploaderName}
      department={department}
      courseCode={courseCode}
      fileSizeBytes={fileSizeBytes}
      onClose={() => router.back()}
    />
  );
}
