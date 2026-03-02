import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ChevronLeft, ChevronRight, Plus, Trash2, CheckCircle, XCircle, Loader2, LogOut, FolderOpen, CornerDownRight } from 'lucide-react';
import { toast } from 'sonner';
import { SetupStepper } from '../components/SetupStepper';
import { type ClassificationNode } from '../data/mockData';
import { useGoogleAuth } from '../auth/GoogleAuthContext';
import { testDriveFolder, scaffoldDrive, uploadSchemaFile, type ScaffoldProgress } from '../services/google-drive';
import * as api from '../services/api';

const steps = [
  { id: 1, title: 'Create Tenant' },
  { id: 2, title: 'Configure ServiceNow' },
  { id: 3, title: 'Configure Classification Schema' },
  { id: 4, title: 'Configure Google Drive' },
  { id: 5, title: 'Scaffold Drive' },
  { id: 6, title: 'Activate Tenant' },
];

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

// --- Classification tree helpers ---

function TreeEditor({
  nodes,
  onChange,
  depth = 0,
  maxDepth = 4,
}: {
  nodes: ClassificationNode[];
  onChange: (nodes: ClassificationNode[]) => void;
  depth?: number;
  maxDepth?: number;
}) {
  const updateName = (index: number, name: string) => {
    const updated = [...nodes];
    updated[index] = { ...updated[index], name };
    onChange(updated);
  };

  const updateChildren = (index: number, children: ClassificationNode[]) => {
    const updated = [...nodes];
    updated[index] = { ...updated[index], children };
    onChange(updated);
  };

  const addNode = () => {
    onChange([...nodes, { name: '', children: [] }]);
  };

  const removeNode = (index: number) => {
    onChange(nodes.filter((_, i) => i !== index));
  };

  const addChild = (index: number) => {
    const updated = [...nodes];
    updated[index] = {
      ...updated[index],
      children: [...updated[index].children, { name: '', children: [] }],
    };
    onChange(updated);
  };

  return (
    <div className={depth > 0 ? 'ml-6 border-l border-border pl-3 mt-1' : ''}>
      {nodes.map((node, index) => (
        <div key={index} className="mb-1.5">
          <div className="flex items-center gap-2">
            {depth > 0 && <CornerDownRight className="w-3 h-3 text-muted-foreground shrink-0" />}
            <input
              type="text"
              value={node.name}
              onChange={(e) => updateName(index, e.target.value)}
              placeholder={depth === 0 ? 'e.g., Software' : 'e.g., Email'}
              className="flex-1 px-2 py-1 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {depth < maxDepth - 1 && (
              <button
                onClick={() => addChild(index)}
                title="Add child"
                className="p-1 hover:bg-blue-50 rounded transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-blue-600" />
              </button>
            )}
            <button
              onClick={() => removeNode(index)}
              title="Remove"
              className="p-1 hover:bg-red-50 rounded transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-600" />
            </button>
          </div>
          {node.children.length > 0 && (
            <TreeEditor
              nodes={node.children}
              onChange={(children) => updateChildren(index, children)}
              depth={depth + 1}
              maxDepth={maxDepth}
            />
          )}
        </div>
      ))}
      <button
        onClick={addNode}
        className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-gray-100 rounded transition-colors mt-1"
      >
        <Plus className="w-3 h-3" />
        Add {depth === 0 ? 'category' : 'item'}
      </button>
    </div>
  );
}

function renderTreePreview(nodes: ClassificationNode[], indent: number): React.ReactElement[] {
  const pad = '\u00A0'.repeat(indent);
  const elements: React.ReactElement[] = [];
  for (const node of nodes) {
    if (!node.name) continue;
    elements.push(<div key={`${indent}-${node.name}`}>{pad}{node.name}/</div>);
    if (node.children.length > 0) {
      elements.push(...renderTreePreview(node.children, indent + 2));
    }
  }
  return elements;
}

function countClassificationNodes(nodes: ClassificationNode[]): number {
  return nodes.reduce((_sum, n) => (n.name ? 1 + countClassificationNodes(n.children) : countClassificationNodes(n.children)), 0);
}

// --- Main component ---

export function SetupWizardPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [currentStep, setCurrentStep] = useState(0);

  // Tenant ID — set from URL param or after create
  const [tenantId, setTenantId] = useState<string | null>(id || null);

  // Form state
  const [tenantName, setTenantName] = useState('');
  const [instanceUrl, setInstanceUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [classificationNodes, setClassificationNodes] = useState<ClassificationNode[]>([
    { name: '', children: [] },
  ]);
  const [folderId, setFolderId] = useState('');
  const [folderName, setFolderName] = useState('');

  // Saving guard
  const [saving, setSaving] = useState(false);

  // Activation result
  const [activationResult, setActivationResult] = useState<api.ActivateResponse | null>(null);

  // Google Auth
  const { isAuthenticated, accessToken, userEmail, signIn, signOut: googleSignOut, isInitialized, initError, configureClientId, needsClientId } = useGoogleAuth();
  const [clientIdInput, setClientIdInput] = useState('');
  const [clientIdLoading, setClientIdLoading] = useState(false);

  // Connection test state
  const [snowStatus, setSnowStatus] = useState<ConnectionStatus>('idle');
  const [snowError, setSnowError] = useState('');
  const [driveStatus, setDriveStatus] = useState<ConnectionStatus>('idle');
  const [driveError, setDriveError] = useState('');

  // Scaffold state
  const [scaffoldStatus, setScaffoldStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [scaffoldProgress, setScaffoldProgress] = useState<ScaffoldProgress | null>(null);
  const [scaffoldError, setScaffoldError] = useState('');

  // Load existing tenant for editing
  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const [tenant, schema, driveConfig] = await Promise.all([
          api.getTenant(id),
          api.getSchema(id).catch(() => null),
          api.getDriveConfig(id).catch(() => null),
        ]);
        setTenantName(tenant.name);
        setTenantId(tenant.id);
        if (schema && schema.schema_tree.length > 0) {
          setClassificationNodes(schema.schema_tree);
        }
        if (driveConfig) {
          setFolderId(driveConfig.root_folder_id);
          if (driveConfig.folder_name) setFolderName(driveConfig.folder_name);
          if (driveConfig.scaffolded) setScaffoldStatus('done');
        }
      } catch {
        toast.error('Failed to load tenant');
        navigate('/tenants');
      }
    };
    load();
  }, [id, navigate]);

  const handleTestServiceNow = () => {
    setSnowStatus('testing');
    setSnowError('');
    setTimeout(() => {
      if (instanceUrl && username && password) {
        setSnowStatus('success');
      } else {
        setSnowStatus('error');
        setSnowError('Please fill in all ServiceNow fields.');
      }
    }, 1500);
  };

  const handleSignIn = async () => {
    try {
      await signIn();
      toast.success('Signed in with Google');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign-in failed');
    }
  };

  const handleSignOut = async () => {
    await googleSignOut();
    setDriveStatus('idle');
    setDriveError('');
    setFolderName('');
    toast.info('Signed out of Google');
  };

  const handleTestGoogleDrive = async () => {
    if (!accessToken) {
      setDriveStatus('error');
      setDriveError('Please sign in with Google first.');
      return;
    }
    if (!folderId.trim()) {
      setDriveStatus('error');
      setDriveError('Please provide a folder ID.');
      return;
    }
    setDriveStatus('testing');
    setDriveError('');
    try {
      const name = await testDriveFolder(accessToken, folderId.trim());
      setFolderName(name);
      setDriveStatus('success');

      // Persist drive config to backend
      if (tenantId) {
        await api.putDriveConfig(tenantId, folderId.trim(), name);
      }
    } catch (err) {
      setDriveStatus('error');
      setDriveError(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  const handleApplyScaffold = async () => {
    if (!accessToken || !folderId.trim()) return;
    setScaffoldStatus('running');
    setScaffoldProgress(null);
    setScaffoldError('');
    try {
      const tenantIdForScaffold = tenantId || tenantName || 'default';
      const { schemaFolderId } = await scaffoldDrive(
        accessToken,
        folderId.trim(),
        tenantIdForScaffold,
        classificationNodes,
        (progress) => setScaffoldProgress(progress),
      );

      // Upload classification schema
      setScaffoldProgress((prev) => prev ? { ...prev, message: 'Uploading classification_schema.json...' } : prev);
      await uploadSchemaFile(accessToken, schemaFolderId, classificationNodes);

      setScaffoldStatus('done');
      toast.success('Drive scaffold applied successfully');

      // Persist scaffold result to backend
      if (tenantId) {
        await api.postScaffoldResult(tenantId, {
          scaffolded: true,
          scaffolded_at: new Date().toISOString(),
          root_folder_id: folderId.trim(),
          folder_name: folderName || undefined,
        });
      }
    } catch (err) {
      setScaffoldStatus('error');
      setScaffoldError(err instanceof Error ? err.message : 'Scaffold failed');
      toast.error('Scaffold failed');
    }
  };

  const handleActivate = async () => {
    if (!tenantId) return;
    setSaving(true);
    try {
      const result = await api.activateTenant(tenantId);
      setActivationResult(result);
      toast.success('Tenant activated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Activation failed');
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    if (saving) return;
    setSaving(true);

    try {
      // Step 0 → 1: create tenant
      if (currentStep === 0 && !tenantId) {
        if (!tenantName.trim()) {
          toast.error('Please enter a tenant name');
          return;
        }
        const tenant = await api.createTenant(tenantName.trim());
        setTenantId(tenant.id);
        navigate(`/tenants/setup/${tenant.id}`, { replace: true });
      }

      // Step 2 → 3: persist classification schema
      if (currentStep === 2 && tenantId) {
        await api.putSchema(tenantId, classificationNodes);
      }

      if (currentStep < steps.length - 1) {
        setCurrentStep(currentStep + 1);
      } else {
        await handleActivate();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-2">Tenant Name</label>
              <input
                type="text"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder="e.g., Acme Corp"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Enter a unique name for this tenant. This will be used to identify the
              tenant throughout the platform.
            </p>
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-2">Instance URL</label>
              <input
                type="text"
                value={instanceUrl}
                onChange={(e) => setInstanceUrl(e.target.value)}
                placeholder="https://instance.service-now.com"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm mb-2">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin@company.com"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={handleTestServiceNow}
                disabled={snowStatus === 'testing'}
                className="px-4 py-2 bg-white border border-border rounded-md hover:bg-gray-50 transition-colors text-sm disabled:opacity-50"
              >
                Test Connection
              </button>
              {snowStatus === 'testing' && (
                <span className="flex items-center gap-2 text-sm text-blue-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Testing connection...
                </span>
              )}
              {snowStatus === 'success' && (
                <span className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  Connection successful
                </span>
              )}
              {snowStatus === 'error' && (
                <span className="flex items-center gap-2 text-sm text-red-600">
                  <XCircle className="w-4 h-4" />
                  {snowError || 'Connection failed'}
                </span>
              )}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground mb-2">
              Define the classification hierarchy for organizing documents. You can nest categories up to 4 levels deep.
            </p>
            <div className="border border-border rounded-lg p-4">
              <TreeEditor
                nodes={classificationNodes}
                onChange={setClassificationNodes}
                maxDepth={4}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Example: Software → Email, Database &nbsp;|&nbsp; Network → Access, VPN
            </p>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            {/* Client ID input when env var is not set */}
            {needsClientId && !isInitialized && (
              <div className="border border-border rounded-lg p-4 bg-gray-50 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Enter your Google Cloud OAuth Client ID to enable Google Drive integration.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={clientIdInput}
                    onChange={(e) => setClientIdInput(e.target.value)}
                    placeholder="123456789-abc.apps.googleusercontent.com"
                    className="flex-1 px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <button
                    onClick={async () => {
                      if (!clientIdInput.trim()) return;
                      setClientIdLoading(true);
                      try {
                        await configureClientId(clientIdInput.trim());
                      } catch {
                        toast.error('Failed to initialize Google Auth');
                      } finally {
                        setClientIdLoading(false);
                      }
                    }}
                    disabled={!clientIdInput.trim() || clientIdLoading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm disabled:opacity-50 whitespace-nowrap"
                  >
                    {clientIdLoading ? 'Connecting...' : 'Connect'}
                  </button>
                </div>
              </div>
            )}

            {/* Init error (e.g. GIS script failed to load) */}
            {initError && (
              <div className="border border-yellow-300 bg-yellow-50 rounded-lg p-4 text-sm text-yellow-800">
                {initError}
              </div>
            )}

            {/* Sign-in section */}
            {!isAuthenticated ? (
              isInitialized ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Sign in with your Google account to connect to Google Drive.
                  </p>
                  <button
                    onClick={handleSignIn}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                  >
                    Sign in with Google
                  </button>
                </div>
              ) : null
            ) : (
              <div className="space-y-4">
                {/* Authenticated user info */}
                <div className="flex items-center justify-between border border-green-200 bg-green-50 rounded-lg p-3">
                  <span className="flex items-center gap-2 text-sm text-green-800">
                    <CheckCircle className="w-4 h-4" />
                    Signed in as <strong>{userEmail}</strong>
                  </span>
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <LogOut className="w-3 h-3" />
                    Sign out
                  </button>
                </div>

                {/* Folder ID input */}
                <div>
                  <label className="block text-sm mb-2">Root Folder ID</label>
                  <input
                    type="text"
                    value={folderId}
                    onChange={(e) => { setFolderId(e.target.value); setDriveStatus('idle'); setFolderName(''); }}
                    placeholder="1abc123def456"
                    className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Enter the Google Drive folder ID where documents will be stored. You can
                  find this in the folder URL after <code>/folders/</code>.
                </p>

                {/* Test Connection */}
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleTestGoogleDrive}
                    disabled={driveStatus === 'testing'}
                    className="px-4 py-2 bg-white border border-border rounded-md hover:bg-gray-50 transition-colors text-sm disabled:opacity-50"
                  >
                    Test Connection
                  </button>
                  {driveStatus === 'testing' && (
                    <span className="flex items-center gap-2 text-sm text-blue-600">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Testing connection...
                    </span>
                  )}
                  {driveStatus === 'success' && (
                    <span className="flex items-center gap-2 text-sm text-green-600">
                      <FolderOpen className="w-4 h-4" />
                      Connected to &ldquo;{folderName}&rdquo;
                    </span>
                  )}
                  {driveStatus === 'error' && (
                    <span className="flex items-center gap-2 text-sm text-red-600">
                      <XCircle className="w-4 h-4" />
                      {driveError}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );

      case 4: {
        const canScaffold = isAuthenticated && driveStatus === 'success' && folderId.trim();
        const tenantIdForPreview = tenantId || tenantName || 'default';
        const nodeCount = countClassificationNodes(classificationNodes);
        return (
          <div className="space-y-4">
            {!canScaffold ? (
              <div className="border border-yellow-300 bg-yellow-50 rounded-lg p-4 text-sm text-yellow-800">
                Please complete Step 4 first: sign in with Google and test your folder connection.
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-2">
                  The following folder structure will be created in &ldquo;{folderName}&rdquo;:
                </p>

                {/* Tree preview */}
                <div className="border border-border rounded-lg p-4 bg-gray-50 font-mono text-xs text-muted-foreground space-y-0.5">
                  <div>{folderName}/</div>
                  <div>&nbsp;&nbsp;AgenticKnowledge/</div>
                  <div>&nbsp;&nbsp;&nbsp;&nbsp;{tenantIdForPreview}/</div>
                  <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;_schema/</div>
                  <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;classification_schema.json</div>
                  <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;dimensions/</div>
                  {nodeCount > 0
                    ? renderTreePreview(classificationNodes, 8)
                    : <div className="italic">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(no classification defined)</div>
                  }
                  <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;documents/</div>
                </div>

                {/* Apply button */}
                <button
                  onClick={handleApplyScaffold}
                  disabled={scaffoldStatus === 'running'}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm disabled:opacity-50"
                >
                  {scaffoldStatus === 'running' && <Loader2 className="w-4 h-4 animate-spin" />}
                  {scaffoldStatus === 'running' ? 'Applying...' : 'Apply Scaffold'}
                </button>

                {/* Progress */}
                {scaffoldStatus === 'running' && scaffoldProgress && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{scaffoldProgress.message}</span>
                      <span>{scaffoldProgress.current}/{scaffoldProgress.total}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${(scaffoldProgress.current / scaffoldProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Success */}
                {scaffoldStatus === 'done' && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    Scaffold applied successfully. Folders are ready in Google Drive.
                  </div>
                )}

                {/* Error */}
                {scaffoldStatus === 'error' && (
                  <div className="flex items-center gap-2 text-sm text-red-600">
                    <XCircle className="w-4 h-4" />
                    {scaffoldError}
                  </div>
                )}
              </>
            )}
          </div>
        );
      }

      case 5:
        return (
          <div className="space-y-4">
            {activationResult ? (
              <div className="border border-border rounded-lg p-6 bg-green-50 space-y-4">
                <div className="flex items-center gap-2 text-green-800">
                  <CheckCircle className="w-5 h-5" />
                  <h3 className="text-sm font-medium">Tenant Activated</h3>
                </div>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Shared Secret:</span>
                    <code className="block mt-1 p-2 bg-white border border-border rounded text-xs break-all">
                      {activationResult.shared_secret}
                    </code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Instructions:</span>
                    <pre className="mt-1 p-2 bg-white border border-border rounded text-xs whitespace-pre-wrap">
                      {activationResult.instructions_stub}
                    </pre>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/tenants')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="border border-border rounded-lg p-6 bg-green-50">
                <h3 className="text-sm mb-2">Ready to Activate</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  All configuration steps are complete. Click &ldquo;Activate&rdquo; to enable this
                  tenant.
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tenant Name:</span>
                    <span>{tenantName || 'Not set'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ServiceNow:</span>
                    <span>{instanceUrl ? 'Configured' : 'Not configured'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Classification:</span>
                    <span>{countClassificationNodes(classificationNodes)} categories</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Google Drive:</span>
                    <span>{folderId ? (folderName ? `"${folderName}" (verified)` : 'Configured') : 'Not configured'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Scaffold:</span>
                    <span>{scaffoldStatus === 'done' ? 'Applied' : 'Not applied'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex h-full bg-white">
      {/* Left Stepper */}
      <div className="w-80 border-r border-border p-6 bg-gray-50">
        <div className="mb-6">
          <button
            onClick={() => navigate('/tenants')}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Tenants
          </button>
        </div>
        <h2 className="text-lg mb-6">{id ? 'Edit Tenant' : 'Setup Wizard'}</h2>
        <SetupStepper
          steps={steps}
          currentStep={currentStep}
          onStepClick={setCurrentStep}
        />
      </div>

      {/* Right Content Panel */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 p-8 overflow-auto">
          <h2 className="text-xl mb-2">{steps[currentStep].title}</h2>
          <div className="max-w-2xl">{renderStepContent()}</div>
        </div>

        {/* Bottom Action Bar */}
        <div className="border-t border-border p-6 flex justify-end gap-3">
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            className="px-4 py-2 border border-border rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            Back
          </button>
          {activationResult ? null : (
            <button
              onClick={handleNext}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {currentStep === steps.length - 1 ? 'Activate' : 'Next'}
              {currentStep < steps.length - 1 && !saving && <ChevronRight className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
