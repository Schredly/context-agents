export interface Tenant {
  id: string;
  name: string;
  status: 'Draft' | 'Active';
  createdAt: string;
  servicenow?: {
    instanceUrl: string;
    username: string;
  };
  classificationSchema?: ClassificationNode[];
  googleDrive?: {
    folderId: string;
    folderName?: string;
    scaffolded?: boolean;
  };
}

export interface ClassificationNode {
  name: string;
  children: ClassificationNode[];
}

export interface Run {
  id: string;
  tenantId: string;
  createdAt: string;
  status: 'completed' | 'running' | 'failed';
  skills: Skill[];
  result: RunResult;
}

export interface Skill {
  name: string;
  status: 'completed' | 'running' | 'pending' | 'failed';
  summary: string;
  reasoning: string[];
}

export interface RunResult {
  summary: string;
  recommendedSteps: string[];
  sources: { title: string; url: string }[];
  confidence: number;
}

// Mock data
export const mockTenants: Tenant[] = [
  {
    id: '1',
    name: 'Acme Corp',
    status: 'Active',
    createdAt: '2026-02-15T10:30:00Z',
    servicenow: {
      instanceUrl: 'https://acme.service-now.com',
      username: 'admin@acme.com',
    },
    classificationSchema: [
      { name: 'Software', children: [
        { name: 'Email', children: [] },
        { name: 'Database', children: [] },
      ]},
      { name: 'Network', children: [
        { name: 'Access', children: [] },
        { name: 'VPN', children: [] },
      ]},
    ],
    googleDrive: {
      folderId: '1abc123def456',
    },
  },
  {
    id: '2',
    name: 'TechStart Inc',
    status: 'Active',
    createdAt: '2026-02-20T14:15:00Z',
  },
  {
    id: '3',
    name: 'Global Dynamics',
    status: 'Draft',
    createdAt: '2026-02-28T09:00:00Z',
  },
];

export const mockRuns: Run[] = [
  {
    id: 'run_20260302_001',
    tenantId: '1',
    createdAt: '2026-03-02T09:15:32Z',
    status: 'completed',
    skills: [
      {
        name: 'Validate',
        status: 'completed',
        summary: 'Request validated successfully',
        reasoning: [
          'Parsed incoming request parameters',
          'Verified tenant configuration exists',
          'Confirmed all required fields present',
        ],
      },
      {
        name: 'Retrieve Docs',
        status: 'completed',
        summary: 'Retrieved 12 relevant documents from Google Drive',
        reasoning: [
          'Queried classification schema for Department=Engineering',
          'Searched Drive folder with filters',
          'Ranked documents by relevance score',
          'Selected top 12 documents for synthesis',
        ],
      },
      {
        name: 'Synthesize',
        status: 'completed',
        summary: 'Generated response from knowledge base',
        reasoning: [
          'Analyzed document content using LLM',
          'Extracted key information related to query',
          'Synthesized coherent response',
          'Calculated confidence score based on source quality',
        ],
      },
      {
        name: 'Writeback',
        status: 'completed',
        summary: 'Updated ServiceNow incident INC0012345',
        reasoning: [
          'Connected to ServiceNow instance',
          'Located incident record',
          'Appended AI-generated response to work notes',
        ],
      },
      {
        name: 'Record Outcome',
        status: 'completed',
        summary: 'Logged run metrics and outcome',
        reasoning: [
          'Stored run metadata in database',
          'Recorded latency and token usage',
          'Updated tenant analytics',
        ],
      },
    ],
    result: {
      summary:
        'Based on the Engineering knowledge base, the recommended approach for deploying microservices is to use Kubernetes with Helm charts. The platform team maintains templates in the infra repository.',
      recommendedSteps: [
        'Review the deployment guide in /docs/kubernetes-deployment.md',
        'Use the Helm chart template from infra/charts/microservice-template',
        'Submit a PR to the platform team for review',
        'Deploy to staging environment first',
      ],
      sources: [
        {
          title: 'Kubernetes Deployment Guide',
          url: 'https://drive.google.com/file/d/1abc123/view',
        },
        {
          title: 'Microservice Best Practices',
          url: 'https://drive.google.com/file/d/1def456/view',
        },
        {
          title: 'Platform Team Runbook',
          url: 'https://drive.google.com/file/d/1ghi789/view',
        },
      ],
      confidence: 0.92,
    },
  },
  {
    id: 'run_20260302_002',
    tenantId: '1',
    createdAt: '2026-03-02T10:42:18Z',
    status: 'completed',
    skills: [
      {
        name: 'Validate',
        status: 'completed',
        summary: 'Request validated successfully',
        reasoning: ['Validated request structure', 'Confirmed tenant active'],
      },
      {
        name: 'Retrieve Docs',
        status: 'completed',
        summary: 'Retrieved 8 relevant documents',
        reasoning: [
          'Searched with query filters',
          'Ranked by semantic similarity',
        ],
      },
      {
        name: 'Synthesize',
        status: 'completed',
        summary: 'Generated response with medium confidence',
        reasoning: [
          'Limited documentation available for topic',
          'Synthesized from available sources',
        ],
      },
      {
        name: 'Writeback',
        status: 'completed',
        summary: 'Updated ServiceNow incident INC0012346',
        reasoning: ['Appended response to work notes'],
      },
      {
        name: 'Record Outcome',
        status: 'completed',
        summary: 'Logged run outcome',
        reasoning: ['Stored metrics in database'],
      },
    ],
    result: {
      summary:
        'The VPN connection issue is typically resolved by restarting the VPN client and clearing the local DNS cache. If the issue persists, contact the network team.',
      recommendedSteps: [
        'Restart the VPN client application',
        'Clear DNS cache using ipconfig /flushdns',
        'Try connecting to a different VPN server',
        'If unresolved, create a ticket for the network team',
      ],
      sources: [
        {
          title: 'VPN Troubleshooting Guide',
          url: 'https://drive.google.com/file/d/1jkl012/view',
        },
        {
          title: 'Network FAQ',
          url: 'https://drive.google.com/file/d/1mno345/view',
        },
      ],
      confidence: 0.78,
    },
  },
  {
    id: 'run_20260302_003',
    tenantId: '1',
    createdAt: '2026-03-02T11:05:44Z',
    status: 'running',
    skills: [
      {
        name: 'Validate',
        status: 'completed',
        summary: 'Request validated successfully',
        reasoning: ['Validated request structure'],
      },
      {
        name: 'Retrieve Docs',
        status: 'completed',
        summary: 'Retrieved 15 relevant documents',
        reasoning: ['Searched Drive', 'Ranked by relevance'],
      },
      {
        name: 'Synthesize',
        status: 'running',
        summary: 'Generating response...',
        reasoning: ['Processing documents with LLM'],
      },
      {
        name: 'Writeback',
        status: 'pending',
        summary: 'Waiting to write back to ServiceNow',
        reasoning: [],
      },
      {
        name: 'Record Outcome',
        status: 'pending',
        summary: 'Waiting to log outcome',
        reasoning: [],
      },
    ],
    result: {
      summary: '',
      recommendedSteps: [],
      sources: [],
      confidence: 0,
    },
  },
];

let currentTenantId: string | null = mockTenants[0]?.id || null;

export const getCurrentTenant = (): Tenant | null => {
  return mockTenants.find((t) => t.id === currentTenantId) || null;
};

export const setCurrentTenant = (id: string) => {
  currentTenantId = id;
};

