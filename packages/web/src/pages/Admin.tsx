import { useState, useEffect } from "react";
import styled from "@emotion/styled";
import { useAuthStore } from "../stores/auth";
import { useNetworkStore } from "../stores/network";
import {
  useLogin,
  useTriggerAnalysis,
  useSaveAnalysisConfig,
  useRevertAnalysisConfig,
  useAnalysisStatus,
  useFeatureStats,
} from "../api/hooks";
import {
  ApiError,
  FEATURE_NAMES,
  FEATURE_LABELS,
  DEFAULT_WEIGHTS,
  type FeatureWeights,
  type NormalizationMode,
  type FeatureStat,
} from "../lib/api";
import {
  PageContainer,
  PageTitle,
  SectionTitle,
  Card,
  Button,
  Input,
  Flex,
  Spinner,
} from "../components/ui";
import { theme } from "../lib/theme";

const Label = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: ${theme.fontSize.sm};
  color: ${theme.colors.textMuted};
`;

const ParamHint = styled.span`
  font-size: 10px;
  color: ${theme.colors.textMuted};
  opacity: 0.7;
  font-weight: 400;
  line-height: 1.3;
`;

const ParamRow = styled.div`
  display: flex;
  align-items: flex-end;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
`;

const SubSection = styled.div`
  padding: ${theme.spacing.md};
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.radius.md};
  background: ${theme.colors.bg};
`;

const SubSectionHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.sm};
`;

const SubSectionTitle = styled.span`
  font-size: ${theme.fontSize.sm};
  font-weight: 600;
  color: ${theme.colors.text};
`;

const SubSectionTag = styled.span`
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 6px;
  border-radius: 3px;
  background: ${theme.colors.bgHover};
  color: ${theme.colors.textMuted};
`;

const WeightsColumns = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${theme.spacing.md};

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const WeightGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const WeightGroupTitle = styled.div`
  font-size: 10px;
  font-weight: 600;
  color: ${theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const WeightRow = styled.div<{ disabled: boolean }>`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  opacity: ${(p) => (p.disabled ? 0.35 : 1)};
`;

const WeightLabel = styled.span`
  font-size: 11px;
  color: ${theme.colors.text};
  width: 110px;
  flex-shrink: 0;
`;

const WeightSlider = styled.input`
  flex: 1;
  accent-color: ${theme.colors.primary};
  min-width: 80px;
`;

const WeightValue = styled.span`
  font-size: 10px;
  font-family: "SF Mono", "Fira Code", monospace;
  color: ${theme.colors.textMuted};
  width: 32px;
  text-align: right;
  flex-shrink: 0;
`;

const StatChip = styled.span`
  font-size: 9px;
  font-family: "SF Mono", "Fira Code", monospace;
  color: ${theme.colors.textMuted};
  opacity: 0.7;
`;

const NormToggle = styled.div`
  display: flex;
  gap: 4px;
`;

const NormOption = styled.button<{ active: boolean }>`
  font-size: ${theme.fontSize.xs};
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid ${(p) => (p.active ? theme.colors.primary : theme.colors.border)};
  background: ${(p) => (p.active ? theme.colors.primary + "22" : "transparent")};
  color: ${(p) => (p.active ? theme.colors.primary : theme.colors.textMuted)};
  cursor: pointer;
`;

const ParamInput = styled(Input)`
  width: 100px;
`;

const OutputPre = styled.pre`
  background: ${theme.colors.bg};
  border: 1px solid ${theme.colors.border};
  border-radius: 6px;
  padding: ${theme.spacing.md};
  font-size: ${theme.fontSize.xs};
  color: ${theme.colors.textMuted};
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  max-height: 300px;
  overflow-y: auto;
`;

const ErrorMsg = styled.p`
  color: ${theme.colors.danger};
  font-size: ${theme.fontSize.sm};
  margin: 0;
`;

const StatusMsg = styled.p`
  color: ${theme.colors.success ?? theme.colors.primary};
  font-size: ${theme.fontSize.sm};
  margin: 0;
`;

const SessionRow = styled(Flex)`
  align-items: center;
  justify-content: space-between;
`;

export function Admin() {
  const { token, setToken, isAdmin } = useAuthStore();
  const { selectedNetwork } = useNetworkStore();

  // Login form state
  const [password, setPassword] = useState("");
  const login = useLogin();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate(password, {
      onSuccess: ({ token }) => {
        setToken(token);
        setPassword("");
      },
    });
  };

  const DEFAULTS = { minClusterSize: 5, nNeighbors: 15, minDist: 0.1 };

  // Analysis params
  const [minClusterSize, setMinClusterSize] = useState(DEFAULTS.minClusterSize);
  const [nNeighbors, setNNeighbors] = useState(DEFAULTS.nNeighbors);
  const [minDist, setMinDist] = useState(DEFAULTS.minDist);
  const [weights, setWeights] = useState<FeatureWeights>({ ...DEFAULT_WEIGHTS });
  const [normalization, setNormalization] = useState<NormalizationMode>("minmax");

  const setWeight = (name: string, value: number) =>
    setWeights((prev) => ({ ...prev, [name]: value }));

  const { data: statusData } = useAnalysisStatus(selectedNetwork);
  const { data: featureStats } = useFeatureStats(selectedNetwork);
  const statsByName = new Map<string, FeatureStat>(
    featureStats?.features.map((f) => [f.name, f]) ?? [],
  );

  useEffect(() => {
    if (statusData?.config) {
      setMinClusterSize(statusData.config.minClusterSize);
      setNNeighbors(statusData.config.nNeighbors);
      setMinDist(statusData.config.minDist);
      if (statusData.config.weights) setWeights(statusData.config.weights);
      if (statusData.config.normalization) setNormalization(statusData.config.normalization);
    }
  }, [statusData]);

  const trigger = useTriggerAnalysis(selectedNetwork);
  const saveConfig = useSaveAnalysisConfig(selectedNetwork);
  const revertConfig = useRevertAnalysisConfig(selectedNetwork);

  const currentParams = { minClusterSize, nNeighbors, minDist, weights, normalization };

  const handleUnauthorized = (err: Error) => {
    if (err.message === "Unauthorized") setToken(null);
  };

  const handleTrigger = (e: React.FormEvent) => {
    e.preventDefault();
    trigger.mutate(currentParams, { onError: handleUnauthorized });
  };

  const handleSaveConfig = () => {
    saveConfig.mutate(currentParams, { onError: handleUnauthorized });
  };

  const handleRevert = () => {
    revertConfig.mutate(undefined, {
      onSuccess: (data) => {
        if (data?.config) {
          setMinClusterSize(data.config.minClusterSize);
          setNNeighbors(data.config.nNeighbors);
          setMinDist(data.config.minDist);
          setWeights(data.config.weights ?? { ...DEFAULT_WEIGHTS });
          setNormalization(data.config.normalization ?? "minmax");
        } else {
          setMinClusterSize(DEFAULTS.minClusterSize);
          setNNeighbors(DEFAULTS.nNeighbors);
          setMinDist(DEFAULTS.minDist);
          setWeights({ ...DEFAULT_WEIGHTS });
          setNormalization("minmax");
        }
      },
      onError: handleUnauthorized,
    });
  };

  if (!isAdmin()) {
    return (
      <PageContainer>
        <PageTitle>Admin</PageTitle>
        <Card style={{ maxWidth: 400 }}>
          <SectionTitle style={{ marginTop: 0 }}>Sign in</SectionTitle>
          <form onSubmit={handleLogin}>
            <Flex gap="12px" style={{ flexDirection: "column" }}>
              <Input
                type="password"
                placeholder="Admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              <Button type="submit" disabled={!password || login.isPending}>
                {login.isPending ? "Signing in…" : "Sign in"}
              </Button>
              {login.isError && (
                <ErrorMsg>
                  {login.error?.message === "Unauthorized"
                    ? "Invalid password"
                    : login.error?.message}
                </ErrorMsg>
              )}
            </Flex>
          </form>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageTitle>Admin</PageTitle>

      {/* Session */}
      <Card style={{ marginBottom: theme.spacing.lg }}>
        <SessionRow>
          <span
            style={{
              fontSize: theme.fontSize.sm,
              color: theme.colors.textMuted,
            }}
          >
            Signed in as admin
          </span>
          <Button variant="danger" onClick={() => setToken(null)}>
            Sign out
          </Button>
        </SessionRow>
      </Card>

      {/* Analysis config */}
      <SectionTitle>Analysis Configuration</SectionTitle>
      <Card
        style={{
          display: "flex",
          flexDirection: "column",
          gap: theme.spacing.md,
        }}
      >
        <SubSection>
          <SubSectionHeader>
            <SubSectionTitle>Clustering</SubSectionTitle>
            <SubSectionTag>HDBSCAN</SubSectionTag>
            <SubSectionTag>affects privacy sets</SubSectionTag>
          </SubSectionHeader>
          <ParamRow>
            <Label>
              Min cluster size
              <ParamInput
                type="number"
                min={2}
                value={minClusterSize}
                onChange={(e) =>
                  setMinClusterSize(parseInt(e.target.value, 10))
                }
              />
              <ParamHint>
                How many txs before a group counts as a privacy set. Raise to
                merge small clusters, lower to detect niche patterns.
              </ParamHint>
            </Label>
          </ParamRow>
        </SubSection>

        <SubSection>
          <SubSectionHeader>
            <SubSectionTitle>3D Visualization</SubSectionTitle>
            <SubSectionTag>UMAP</SubSectionTag>
            <SubSectionTag>visual only</SubSectionTag>
          </SubSectionHeader>
          <ParamRow>
            <Label>
              Neighbors
              <ParamInput
                type="number"
                min={2}
                value={nNeighbors}
                onChange={(e) => setNNeighbors(parseInt(e.target.value, 10))}
              />
              <ParamHint>
                How many nearby txs UMAP considers per point. Low = fine detail,
                high = big-picture layout.
              </ParamHint>
            </Label>
            <Label>
              Min dist
              <ParamInput
                type="number"
                min={0.01}
                max={2}
                step={0.05}
                value={minDist}
                onChange={(e) => setMinDist(parseFloat(e.target.value))}
              />
              <ParamHint>
                How close points can sit in the 3D plot. Low = dense blobs, high
                = airy spread.
              </ParamHint>
            </Label>
          </ParamRow>
        </SubSection>

        <SubSection>
          <SubSectionHeader>
            <SubSectionTitle>Feature Weights</SubSectionTitle>
            <SubSectionTag>0 = disabled</SubSectionTag>
            <NormToggle style={{ marginLeft: "auto" }}>
              <NormOption active={normalization === "minmax"} onClick={() => setNormalization("minmax")}>
                Min-Max
              </NormOption>
              <NormOption active={normalization === "rank"} onClick={() => setNormalization("rank")}>
                Rank
              </NormOption>
            </NormToggle>
          </SubSectionHeader>
          <WeightsColumns>
            {(() => {
              const groups = new Map<string, typeof FEATURE_NAMES[number][]>();
              for (const name of FEATURE_NAMES) {
                const group = FEATURE_LABELS[name].group;
                if (!groups.has(group)) groups.set(group, []);
                groups.get(group)!.push(name);
              }
              const entries = [...groups.entries()];
              const col1 = entries.filter(([g]) => g === "Shape");
              const col2 = entries.filter(([g]) => g !== "Shape");

              const renderGroups = (items: [string, typeof FEATURE_NAMES[number][]][]) =>
                items.map(([group, names]) => (
                  <WeightGroup key={group}>
                    <WeightGroupTitle>{group}</WeightGroupTitle>
                    {names.map((name) => {
                      const w = weights[name] ?? 1;
                      const stat = statsByName.get(name);
                      const statText = stat?.type === "numeric"
                        ? `${stat.unique} uniq · ${stat.dominantPct}% same`
                        : stat?.type === "categorical"
                          ? `${stat.unique} uniq`
                          : "";
                      return (
                        <WeightRow key={name} disabled={w === 0}>
                          <WeightLabel>
                            {FEATURE_LABELS[name].label}
                            {statText && <StatChip> {statText}</StatChip>}
                          </WeightLabel>
                          <WeightSlider
                            type="range"
                            min={0}
                            max={2}
                            step={0.05}
                            value={w}
                            onChange={(e) => setWeight(name, parseFloat(e.target.value))}
                          />
                          <WeightValue>{w.toFixed(2)}</WeightValue>
                        </WeightRow>
                      );
                    })}
                  </WeightGroup>
                ));

              return (
                <>
                  <div>{renderGroups(col1)}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.md }}>{renderGroups(col2)}</div>
                </>
              );
            })()}
          </WeightsColumns>
        </SubSection>

        <Flex gap="12px" align="center" style={{ flexWrap: "wrap" }}>
          <Button
            onClick={handleSaveConfig}
            disabled={saveConfig.isPending || trigger.isPending}
          >
            {saveConfig.isPending ? "Saving…" : "Save config"}
          </Button>
          <form onSubmit={handleTrigger} style={{ display: "contents" }}>
            <Button
              type="submit"
              disabled={trigger.isPending || saveConfig.isPending}
            >
              {trigger.isPending ? (
                <Flex gap="8px" align="center">
                  <Spinner style={{ width: 14, height: 14 }} />
                  Running…
                </Flex>
              ) : (
                `Save & run on ${selectedNetwork}`
              )}
            </Button>
          </form>
          <Button
            variant="danger"
            onClick={handleRevert}
            disabled={revertConfig.isPending}
          >
            {revertConfig.isPending ? "Reverting…" : "Revert to defaults"}
          </Button>
          {saveConfig.isSuccess && <StatusMsg>Config saved</StatusMsg>}
          {revertConfig.isSuccess && <StatusMsg>Reverted</StatusMsg>}
          {trigger.isSuccess && <StatusMsg>Done</StatusMsg>}
          {(saveConfig.isError || revertConfig.isError) && (
            <ErrorMsg>
              {(saveConfig.error ?? revertConfig.error)?.message}
            </ErrorMsg>
          )}
          {trigger.isError && <ErrorMsg>{trigger.error?.message}</ErrorMsg>}
        </Flex>

        {trigger.isSuccess && trigger.data?.output && (
          <div style={{ marginTop: theme.spacing.md }}>
            <OutputPre>{trigger.data.output}</OutputPre>
          </div>
        )}
        {trigger.isError &&
          trigger.error instanceof ApiError &&
          (trigger.error.detail?.stderr || trigger.error.detail?.stdout) && (
            <div style={{ marginTop: theme.spacing.md }}>
              <OutputPre>
                {[trigger.error.detail.stderr, trigger.error.detail.stdout]
                  .filter(Boolean)
                  .join("\n")}
              </OutputPre>
            </div>
          )}
      </Card>
    </PageContainer>
  );
}
