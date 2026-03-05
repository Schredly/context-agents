import { useState } from "react";
import { MobileAgentView } from "./MobileAgentView";
import type { ReasoningStep } from "./AgentReasoning";
import type { SkillExecution } from "./SkillExecutionTimeline";
import type { ToolCall } from "./ToolsUsed";
import type { SuggestedAction } from "./AIRecommendation";
import type { ActionType } from "./AgentActions";

export default function MobileApp() {
  const [reasoningSteps] = useState<ReasoningStep[]>([
    {
      id: "1",
      label: "Analyzing user request",
      description: "Processing natural language query and extracting intent",
      status: "completed",
      icon: "search",
    },
    {
      id: "2",
      label: "Matching available use cases",
      description: "Evaluating 34 enterprise use cases for best match",
      status: "completed",
      icon: "target",
    },
    {
      id: "3",
      label: 'Selecting "Email Incident Diagnosis"',
      description: "Confidence: 96% - Matched based on keywords and context",
      status: "completed",
      icon: "check",
    },
    {
      id: "4",
      label: "Executing skills",
      description: "Running diagnostic tools and analyzing system state",
      status: "completed",
      icon: "zap",
    },
  ]);

  const [skillExecutions] = useState<SkillExecution[]>([
    {
      id: "1",
      name: "Incident Lookup",
      description: "Searching incident database for similar email issues",
      status: "completed",
      duration: "0.45s",
      icon: "search",
    },
    {
      id: "2",
      name: "Knowledge Base Search",
      description: "Querying KB articles for SMTP and attachment solutions",
      status: "completed",
      duration: "0.82s",
      icon: "book",
    },
    {
      id: "3",
      name: "Documentation Search",
      description: "Scanning technical docs for configuration requirements",
      status: "completed",
      duration: "0.63s",
      icon: "file",
    },
    {
      id: "4",
      name: "Resolution Summary",
      description: "Generating actionable resolution from findings",
      status: "completed",
      duration: "0.28s",
      icon: "check",
    },
  ]);

  const [toolCalls] = useState<ToolCall[]>([
    {
      id: "1",
      toolName: "servicenow.search_incidents",
      targetSystem: "ServiceNow",
      status: "success",
      timestamp: "14:34:12",
      responseTime: "245ms",
      statusCode: 200,
    },
    {
      id: "2",
      toolName: "servicenow.search_kb",
      targetSystem: "ServiceNow",
      status: "success",
      timestamp: "14:34:13",
      responseTime: "182ms",
      statusCode: 200,
    },
    {
      id: "3",
      toolName: "google_drive.search_documents",
      targetSystem: "Google Drive",
      status: "success",
      timestamp: "14:34:14",
      responseTime: "421ms",
      statusCode: 200,
    },
  ]);

  const [recommendationActions] = useState<SuggestedAction[]>([
    {
      id: "1",
      action: "Increase the SMTP server attachment limit from 5MB to 25MB to match application settings",
      priority: "high",
    },
    {
      id: "2",
      action: "Implement file sharing links for attachments larger than the configured limit",
      priority: "medium",
    },
    {
      id: "3",
      action: "Update user documentation to reflect current attachment size policies",
      priority: "low",
    },
  ]);

  const handleAgentAction = (type: ActionType) => {
    console.log("Agent action triggered:", type);
  };

  return (
    <MobileAgentView
      userQuery="Why are email attachments failing?"
      reasoningSteps={reasoningSteps}
      selectedUseCase={{
        name: "Email Incident Diagnosis",
        description: "Detects common email issues such as attachment limits or SMTP failures.",
        confidence: 92,
        category: "Infrastructure & Operations",
      }}
      skillExecutions={skillExecutions}
      toolCalls={toolCalls}
      recommendation={{
        resolution:
          "The issue is caused by attachment size limits on the mail server. The default configuration restricts attachments to 5MB, but the application was recently updated to allow 25MB uploads during last night's deployment.\n\nThis configuration mismatch is causing 247 failed attachment sends in the last 24 hours. The SMTP server rejects files larger than 5MB while users expect to send up to 25MB based on the application interface.",
        confidence: 94,
        suggestedActions: recommendationActions,
        additionalContext:
          "This issue was introduced in deployment v2.4.1 on March 3, 2026. Reverting to 5MB in the app or increasing the server limit will resolve the issue.",
      }}
      onAction={handleAgentAction}
    />
  );
}
