import { useEffect, useState } from "react";
import { downloadUrl, formatBytes, previewUrl } from "../../api";
import type { FsEntry } from "../../types";
import { ModalBtn } from "../ui/styles";
import { kindLabel, type PreviewKind } from "./media";
import * as S from "./styles";

export function MediaPreview({
  entry,
  kind,
}: {
  entry: FsEntry;
  kind: Exclude<PreviewKind, "text">;
}) {
  const src = previewUrl(entry.path, entry.modifiedMs);
  const [failed, setFailed] = useState(false);

  if (kind === "binary" || failed) {
    return (
      <UnsupportedFile
        entry={entry}
        kind={failed ? kind : "binary"}
        failed={failed}
      />
    );
  }

  if (kind === "pdf") {
    return <PdfPreview entry={entry} src={src} />;
  }

  if (kind === "image") {
    return (
      <S.MediaStage>
        <img src={src} alt={entry.name} onError={() => setFailed(true)} />
      </S.MediaStage>
    );
  }

  if (kind === "video") {
    return (
      <S.MediaStage>
        <video
          src={src}
          controls
          playsInline
          preload="metadata"
          onError={() => setFailed(true)}
        />
      </S.MediaStage>
    );
  }

  return (
    <S.MediaEmpty>
      <strong>{entry.name}</strong>
      {entry.size != null && <p>{formatBytes(entry.size)}</p>}
      <S.MediaPlayer>
        <audio src={src} controls preload="metadata" onError={() => setFailed(true)} />
      </S.MediaPlayer>
      <DownloadLink path={entry.path} />
    </S.MediaEmpty>
  );
}

function PdfPreview({ entry, src }: { entry: FsEntry; src: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setFailed(false);
    setUrl(null);
    fetch(src, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error("failed");
        const buf = await res.arrayBuffer();
        const head = new Uint8Array(buf.slice(0, 5));
        const looksPdf = String.fromCharCode(...head) === "%PDF-";
        if (!looksPdf) throw new Error("not a pdf");
        const next = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
        if (cancelled) {
          URL.revokeObjectURL(next);
          return;
        }
        objectUrl = next;
        setUrl(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (failed) {
    return <UnsupportedFile entry={entry} kind="pdf" failed />;
  }
  if (!url) {
    return <S.EditorMessage>Loading PDF…</S.EditorMessage>;
  }

  return (
    <S.MediaStage $fill>
      <iframe title={entry.name} src={`${url}#view=FitH`} />
    </S.MediaStage>
  );
}

function UnsupportedFile({
  entry,
  kind,
  failed,
}: {
  entry: FsEntry;
  kind: Exclude<PreviewKind, "text">;
  failed: boolean;
}) {
  const size = entry.size != null ? formatBytes(entry.size) : null;
  return (
    <S.MediaEmpty>
      <strong>{entry.name}</strong>
      {size && <p>{size}</p>}
      <p>
        {failed
          ? `This ${kindLabel(kind).toLowerCase()} can't be displayed in the browser.`
          : "This file type can't be previewed here."}{" "}
        Download it to open it locally.
      </p>
      <DownloadLink path={entry.path} />
    </S.MediaEmpty>
  );
}

function DownloadLink({ path }: { path: string }) {
  return (
    <ModalBtn as="a" href={downloadUrl(path)} download>
      Download
    </ModalBtn>
  );
}
