import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import * as S from "./styles";
import { ColorLog } from "./ColorLog";

type Phase = "connecting" | "live" | "closed" | "failed";

const NOTICE: Record<Exclude<Phase, "live">, string> = {
  connecting: "Connecting to the log stream…",
  closed: "Log stream ended.",
  failed:
    "Couldn't open the log stream. Check that the Beacon server is running a build that supports worker logs.",
};

export function WorkerLogs({ projectId }: { projectId: number }) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("connecting");
  const [attempt, setAttempt] = useState(0);
  const buf = useRef("");
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const url = `${proto}://${window.location.host}/api/projects/${projectId}/logs`;

  useEffect(() => {
    buf.current = "";
    setText("");
    setPhase("connecting");
    let opened = false;
    const ws = new WebSocket(url);
    ws.onopen = () => {
      opened = true;
      setPhase("live");
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      buf.current = (buf.current + ev.data).slice(-80_000);
      setText(buf.current);
    };
    ws.onclose = () => setPhase(opened ? "closed" : "failed");
    return () => ws.close();
  }, [url, attempt]);

  return (
    <>
      <S.SectionHead>
        <S.SectionLabel>Logs</S.SectionLabel>
        <S.Btn
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          disabled={phase === "connecting"}
        >
          <RefreshCw size={14} />
          Reconnect
        </S.Btn>
      </S.SectionHead>
      {phase !== "live" && <S.LogNotice>{NOTICE[phase]}</S.LogNotice>}
      <S.LogPanel>
        <ColorLog text={text || "Waiting for output…"} />
      </S.LogPanel>
    </>
  );
}
