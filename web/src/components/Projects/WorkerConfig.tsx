import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Dropdown } from "../Dropdown";
import { FolderPicker } from "./FolderPicker";
import type { ProjectDetail, ProjectSummary, ProjectsCapabilities, RestartPolicy, RunKind } from "../../types";
import * as S from "./styles";
import { EnvEditor, envDraftFrom, type EnvDraftRow } from "./EnvEditor";

export type WorkerDraft = {
  runKind: RunKind;
  managed: boolean;
  boot: boolean;
  container: string;
  composeFile: string;
  unit: string;
  startCommand: string;
  image: string;
  dockerfile: string;
  buildContext: string;
  buildCommand: string;
  workDir: string;
  cpuLimit: string;
  memoryLimitMb: string;
  replicas: string;
  restartPolicy: RestartPolicy;
  restartMaxRetries: string;
  restartBackoffMs: string;
  schedule: string;
  autoscaleEnabled: boolean;
  autoscaleMin: string;
  autoscaleMax: string;
  autoscaleCpuTarget: string;
  autoscaleMemTarget: string;
  autodeploy: boolean;
  autodeployIntervalS: string;
  notes: string;
  env: EnvDraftRow[];
};

export function workerDraftFromProject(
  p: ProjectSummary & { env?: ProjectDetail["env"] },
  capabilities: ProjectsCapabilities
): WorkerDraft {
  const base = defaultWorkerDraft(capabilities);
  return {
    ...base,
    runKind: p.runKind === "static" || p.runKind === "none" ? base.runKind : p.runKind,
    managed: p.managed,
    boot: p.boot,
    container: p.container ?? "",
    composeFile: p.composeFile || "compose.yaml",
    unit: p.unit ?? "",
    startCommand: p.startCommand ?? "",
    image: p.image ?? "",
    dockerfile: p.dockerfile ?? "",
    buildContext: p.buildContext || ".",
    buildCommand: p.buildCommand ?? "",
    workDir: p.workDir ?? "",
    cpuLimit: p.cpuLimit != null ? String(p.cpuLimit) : "",
    memoryLimitMb: p.memoryLimitMb != null ? String(p.memoryLimitMb) : "",
    replicas: String(p.replicas ?? 1),
    restartPolicy: p.restartPolicy ?? "always",
    restartMaxRetries: p.restartMaxRetries != null ? String(p.restartMaxRetries) : "",
    restartBackoffMs: String(p.restartBackoffMs ?? 3000),
    schedule: p.schedule ?? "",
    autoscaleEnabled: !!p.autoscaleEnabled,
    autoscaleMin: String(p.autoscaleMin ?? 1),
    autoscaleMax: String(p.autoscaleMax ?? 1),
    autoscaleCpuTarget: p.autoscaleCpuTarget != null ? String(p.autoscaleCpuTarget) : "70",
    autoscaleMemTarget: p.autoscaleMemTarget != null ? String(p.autoscaleMemTarget) : "",
    autodeploy: !!p.autodeploy,
    autodeployIntervalS: String(p.autodeployIntervalS ?? 300),
    notes: p.notes ?? "",
    env: envDraftFrom(p.env),
  };
}

export function defaultWorkerDraft(capabilities: ProjectsCapabilities): WorkerDraft {
  const docker = capabilities.docker;
  return {
    runKind: docker ? "docker" : "process",
    managed: docker,
    boot: true,
    container: "",
    composeFile: "compose.yaml",
    unit: "",
    startCommand: "",
    image: "",
    dockerfile: "",
    buildContext: ".",
    buildCommand: "",
    workDir: "",
    cpuLimit: "",
    memoryLimitMb: "",
    replicas: "1",
    restartPolicy: "always",
    restartMaxRetries: "",
    restartBackoffMs: "3000",
    schedule: "",
    autoscaleEnabled: false,
    autoscaleMin: "1",
    autoscaleMax: "1",
    autoscaleCpuTarget: "70",
    autoscaleMemTarget: "",
    autodeploy: false,
    autodeployIntervalS: "300",
    notes: "",
    env: [],
  };
}

export function workerPayload(d: WorkerDraft) {
  const n = (v: string) => {
    const t = v.trim();
    if (!t) return null;
    const x = Number(t);
    return Number.isFinite(x) ? x : null;
  };
  return {
    runKind: d.runKind,
    managed: d.managed,
    boot: d.boot,
    container: d.container.trim() || null,
    composeFile: d.composeFile.trim() || null,
    unit: d.unit.trim() || null,
    startCommand: d.startCommand.trim() || null,
    image: d.image.trim() || null,
    dockerfile: d.dockerfile.trim() || null,
    buildContext: d.buildContext.trim() || null,
    buildCommand: d.buildCommand.trim() || null,
    workDir: d.workDir.trim() || null,
    cpuLimit: n(d.cpuLimit),
    memoryLimitMb: n(d.memoryLimitMb),
    replicas: n(d.replicas) ?? 1,
    restartPolicy: d.restartPolicy,
    restartMaxRetries: n(d.restartMaxRetries),
    restartBackoffMs: n(d.restartBackoffMs) ?? 3000,
    schedule: d.schedule.trim() || null,
    autoscaleEnabled: d.autoscaleEnabled,
    autoscaleMin: n(d.autoscaleMin) ?? 1,
    autoscaleMax: n(d.autoscaleMax) ?? 1,
    autoscaleCpuTarget: n(d.autoscaleCpuTarget),
    autoscaleMemTarget: n(d.autoscaleMemTarget),
    autodeploy: d.autodeploy,
    autodeployIntervalS: n(d.autodeployIntervalS) ?? 300,
    notes: d.notes.trim() || null,
  };
}

export function envPayload(rows: EnvDraftRow[]) {
  return rows
    .filter((r) => r.key.trim())
    .map((r) => ({
      id: r.id,
      key: r.key.trim(),
      value: r.value,
      secret: r.secret,
    }));
}

function runKindOptions(capabilities: ProjectsCapabilities): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  if (capabilities.docker) {
    opts.push({ value: "docker", label: "Docker (Beacon creates it)" });
  }
  opts.push({ value: "process", label: "Native process" });
  if (capabilities.compose) opts.push({ value: "compose", label: "Docker Compose" });
  if (capabilities.systemd) opts.push({ value: "systemd", label: "systemd service" });
  if (capabilities.docker) {
    opts.push({ value: "docker-attach", label: "Docker, by container name" });
  }
  return opts;
}

export function WorkerConfig({
  draft,
  onChange,
  capabilities,
  disabled,
}: {
  draft: WorkerDraft;
  onChange: (patch: Partial<WorkerDraft>) => void;
  capabilities: ProjectsCapabilities;
  disabled?: boolean;
}) {
  const [advanced, setAdvanced] = useState(false);
  const [browseWorkDir, setBrowseWorkDir] = useState(false);
  const attach = draft.runKind === "docker" && !draft.managed;
  const kindValue: string = attach ? "docker-attach" : draft.runKind;
  const managedDocker = draft.runKind === "docker" && draft.managed;
  const scalable = draft.runKind === "docker" || draft.runKind === "process";
  const restarts = draft.restartPolicy !== "no";
  return (
    <>
      <S.FormSection>
        <S.FormSectionTitle>How it runs</S.FormSectionTitle>
        <S.Field>
          Backend
          <Dropdown
            value={kindValue}
            options={runKindOptions(capabilities)}
            onChange={(v) => {
              if (v === "docker-attach") {
                onChange({ runKind: "docker", managed: false });
                return;
              }
              onChange({
                runKind: v as RunKind,
                managed: v === "docker" || v === "process" || v === "systemd" || v === "compose",
              });
            }}
            variant="underline"
          />
          <S.FieldHint>
            Default is Docker when Docker is available, otherwise a native process Beacon starts
            itself. Every field below is optional — Beacon fills in what you leave blank.
          </S.FieldHint>
        </S.Field>
        {managedDocker && (
          <S.FieldPair>
            <S.Field>
              Image
              <input
                value={draft.image}
                disabled={disabled}
                onChange={(e) => onChange({ image: e.target.value })}
                placeholder="auto — from your project files"
              />
              <S.FieldHint>
                Leave blank and Beacon picks one: a Dockerfile in the folder is built, otherwise the
                image matches what it finds (package.json, requirements.txt, go.mod…).
              </S.FieldHint>
            </S.Field>
            <S.Field>
              Dockerfile
              <input
                value={draft.dockerfile}
                disabled={disabled}
                onChange={(e) => onChange({ dockerfile: e.target.value })}
                placeholder="optional — Dockerfile"
              />
            </S.Field>
          </S.FieldPair>
        )}
        {attach && (
          <>
            <S.Field>
              Container name
              <input
                value={draft.container}
                disabled={disabled}
                onChange={(e) => onChange({ container: e.target.value })}
                placeholder="auto — beacon-w-&lt;id&gt;"
              />
              <S.FieldHint>
                If a container with this name already exists, Beacon starts and watches it. If it
                does not, Beacon creates it and takes ownership.
              </S.FieldHint>
            </S.Field>
            <S.Field>
              Image (only used if Beacon has to create it)
              <input
                value={draft.image}
                disabled={disabled}
                onChange={(e) => onChange({ image: e.target.value })}
                placeholder="auto — from your project files"
              />
            </S.Field>
          </>
        )}
        {draft.runKind === "compose" && (
          <S.Field>
            Compose file
            <input
              value={draft.composeFile}
              disabled={disabled}
              onChange={(e) => onChange({ composeFile: e.target.value })}
              placeholder="compose.yaml"
            />
          </S.Field>
        )}
        {draft.runKind === "systemd" && (
          <S.Field>
            Unit name
            <input
              value={draft.unit}
              disabled={disabled}
              onChange={(e) => onChange({ unit: e.target.value })}
              placeholder="auto: beacon-w-&lt;id&gt;.service"
            />
          </S.Field>
        )}
        {(draft.runKind === "process" || draft.runKind === "systemd" || draft.runKind === "docker") && (
          <S.Field>
            Start command
            <input
              value={draft.startCommand}
              disabled={disabled}
              onChange={(e) => onChange({ startCommand: e.target.value })}
              placeholder={draft.runKind === "docker" ? "optional — image default" : "node worker.js"}
              required={draft.runKind === "process"}
            />
          </S.Field>
        )}
        <S.CheckRow>
          <input
            type="checkbox"
            checked={draft.boot}
            disabled={disabled}
            onChange={(e) => onChange({ boot: e.target.checked })}
          />
          <S.Switch $on={draft.boot}>
            <S.SwitchKnob $on={draft.boot} />
          </S.Switch>
          Start when this machine (and Beacon) boots
        </S.CheckRow>
      </S.FormSection>

      <S.FormSection>
        <S.FormSectionTitle>Environment</S.FormSectionTitle>
        <EnvEditor
          rows={draft.env}
          disabled={disabled}
          onChange={(env) => onChange({ env })}
        />
      </S.FormSection>

      <S.FormSection>
        <S.FormSectionTitle>Notes</S.FormSectionTitle>
        <S.Field as="div">
          <textarea
            value={draft.notes}
            disabled={disabled}
            onChange={(e) => onChange({ notes: e.target.value })}
            rows={3}
            placeholder="What this job does"
          />
        </S.Field>
      </S.FormSection>

      <S.Disclosure type="button" onClick={() => setAdvanced((v) => !v)}>
        {advanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Advanced
      </S.Disclosure>

      {advanced && (
        <>
          <S.FormSection $flush>
            <S.FormSectionTitle>Resources</S.FormSectionTitle>
            {draft.runKind === "compose" ? null : draft.runKind === "docker" ? (
              <S.Field>
                Working directory (inside the container)
                <input
                  value={draft.workDir}
                  disabled={disabled}
                  onChange={(e) => onChange({ workDir: e.target.value })}
                  placeholder="image default, usually /app"
                />
                <S.FieldHint>
                  A path in the container's own filesystem, not a folder on this machine.
                </S.FieldHint>
              </S.Field>
            ) : (
              <S.Field>
                Working directory (on this machine)
                <S.PathRow>
                  <input
                    value={draft.workDir}
                    disabled={disabled}
                    onChange={(e) => onChange({ workDir: e.target.value })}
                    placeholder="project folder by default"
                  />
                  <S.Btn type="button" disabled={disabled} onClick={() => setBrowseWorkDir(true)}>
                    Browse
                  </S.Btn>
                </S.PathRow>
                <S.FieldHint>
                  Where the start command runs. Blank uses the project folder.
                </S.FieldHint>
              </S.Field>
            )}
            {browseWorkDir && (
              <FolderPicker
                initialPath={draft.workDir.trim()}
                onClose={() => setBrowseWorkDir(false)}
                onPick={(next) => {
                  onChange({ workDir: next });
                  setBrowseWorkDir(false);
                }}
              />
            )}
            {managedDocker && draft.dockerfile.trim() && (
              <S.Field>
                Build context
                <input
                  value={draft.buildContext}
                  disabled={disabled}
                  onChange={(e) => onChange({ buildContext: e.target.value })}
                  placeholder="."
                />
              </S.Field>
            )}
            <S.FieldPair>
              <S.Field>
                CPU cores
                <input
                  value={draft.cpuLimit}
                  disabled={disabled}
                  onChange={(e) => onChange({ cpuLimit: e.target.value })}
                  placeholder="unlimited"
                />
              </S.Field>
              <S.Field>
                Memory (MB)
                <input
                  value={draft.memoryLimitMb}
                  disabled={disabled}
                  onChange={(e) => onChange({ memoryLimitMb: e.target.value })}
                  placeholder="unlimited"
                />
              </S.Field>
            </S.FieldPair>
          </S.FormSection>

          {scalable && (
            <S.FormSection>
              <S.FormSectionTitle>Scaling</S.FormSectionTitle>
              <S.Field>
                Replicas
                <input
                  value={draft.replicas}
                  disabled={disabled || draft.autoscaleEnabled}
                  onChange={(e) => onChange({ replicas: e.target.value })}
                  placeholder="1"
                />
                {draft.autoscaleEnabled && (
                  <S.FieldHint>Autoscale controls the replica count while it is on.</S.FieldHint>
                )}
              </S.Field>
              <S.CheckRow>
                <input
                  type="checkbox"
                  checked={draft.autoscaleEnabled}
                  disabled={disabled}
                  onChange={(e) => onChange({ autoscaleEnabled: e.target.checked })}
                />
                <S.Switch $on={draft.autoscaleEnabled}>
                  <S.SwitchKnob $on={draft.autoscaleEnabled} />
                </S.Switch>
                Autoscale replicas from host CPU/memory
              </S.CheckRow>
              {draft.autoscaleEnabled && (
                <>
                  <S.FieldPair>
                    <S.Field>
                      Min replicas
                      <input
                        value={draft.autoscaleMin}
                        disabled={disabled}
                        onChange={(e) => onChange({ autoscaleMin: e.target.value })}
                      />
                    </S.Field>
                    <S.Field>
                      Max replicas
                      <input
                        value={draft.autoscaleMax}
                        disabled={disabled}
                        onChange={(e) => onChange({ autoscaleMax: e.target.value })}
                      />
                    </S.Field>
                  </S.FieldPair>
                  <S.FieldPair>
                    <S.Field>
                      CPU target %
                      <input
                        value={draft.autoscaleCpuTarget}
                        disabled={disabled}
                        onChange={(e) => onChange({ autoscaleCpuTarget: e.target.value })}
                        placeholder="70"
                      />
                    </S.Field>
                    <S.Field>
                      Memory target %
                      <input
                        value={draft.autoscaleMemTarget}
                        disabled={disabled}
                        onChange={(e) => onChange({ autoscaleMemTarget: e.target.value })}
                        placeholder="off"
                      />
                    </S.Field>
                  </S.FieldPair>
                </>
              )}
            </S.FormSection>
          )}

          <S.FormSection>
            <S.FormSectionTitle>Restarts &amp; schedule</S.FormSectionTitle>
            <S.Field>
              Restart policy
              <Dropdown
                value={draft.restartPolicy}
                options={[
                  { value: "always", label: "Always" },
                  { value: "on-failure", label: "On failure" },
                  { value: "no", label: "Don't restart" },
                ]}
                onChange={(v) => onChange({ restartPolicy: v as RestartPolicy })}
                variant="underline"
              />
            </S.Field>
            {restarts && (
              <S.FieldPair>
                <S.Field>
                  Retry delay (ms)
                  <input
                    value={draft.restartBackoffMs}
                    disabled={disabled}
                    onChange={(e) => onChange({ restartBackoffMs: e.target.value })}
                    placeholder="3000"
                  />
                </S.Field>
                {draft.restartPolicy === "on-failure" && (
                  <S.Field>
                    Max retries
                    <input
                      value={draft.restartMaxRetries}
                      disabled={disabled}
                      onChange={(e) => onChange({ restartMaxRetries: e.target.value })}
                      placeholder="unlimited"
                    />
                  </S.Field>
                )}
              </S.FieldPair>
            )}
            <S.Field>
              Schedule (cron, 5 fields)
              <input
                value={draft.schedule}
                disabled={disabled}
                onChange={(e) => onChange({ schedule: e.target.value })}
                placeholder="leave blank to run continuously"
              />
              <S.FieldHint>
                When set, Beacon starts the worker on that schedule instead of keeping it always on.
              </S.FieldHint>
            </S.Field>
          </S.FormSection>

          <S.FormSection>
            <S.FormSectionTitle>Deploys</S.FormSectionTitle>
            <S.CheckRow>
              <input
                type="checkbox"
                checked={draft.autodeploy}
                disabled={disabled}
                onChange={(e) => onChange({ autodeploy: e.target.checked })}
              />
              <S.Switch $on={draft.autodeploy}>
                <S.SwitchKnob $on={draft.autodeploy} />
              </S.Switch>
              Auto-deploy when git is behind origin
            </S.CheckRow>
            {draft.autodeploy && (
              <S.Field>
                Check every (seconds)
                <input
                  value={draft.autodeployIntervalS}
                  disabled={disabled}
                  onChange={(e) => onChange({ autodeployIntervalS: e.target.value })}
                  placeholder="300"
                />
              </S.Field>
            )}
          </S.FormSection>
        </>
      )}
    </>
  );
}
