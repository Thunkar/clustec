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
} from "../api/hooks";
import { ApiError } from "../lib/api";
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

  const { data: statusData } = useAnalysisStatus(selectedNetwork);
  useEffect(() => {
    if (statusData?.config) {
      setMinClusterSize(statusData.config.minClusterSize);
      setNNeighbors(statusData.config.nNeighbors);
      setMinDist(statusData.config.minDist);
    }
  }, [statusData]);

  const trigger = useTriggerAnalysis(selectedNetwork);
  const saveConfig = useSaveAnalysisConfig(selectedNetwork);
  const revertConfig = useRevertAnalysisConfig(selectedNetwork);

  const currentParams = { minClusterSize, nNeighbors, minDist };

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
        } else {
          setMinClusterSize(DEFAULTS.minClusterSize);
          setNNeighbors(DEFAULTS.nNeighbors);
          setMinDist(DEFAULTS.minDist);
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
