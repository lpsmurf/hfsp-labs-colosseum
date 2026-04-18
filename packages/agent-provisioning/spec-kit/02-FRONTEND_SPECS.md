# HFSP Agent Provisioning - Frontend Component Specifications

**Version:** 1.0  
**Status:** Implementation Ready  
**Date:** April 3, 2026  
**Focus:** Web App + ClawDrop Wizard UI Components  

---

## 1. Web App Architecture

### 1.1 File Structure

```
services/webapp/
├── public/
│   └── index.html                      # Entry point
├── src/
│   ├── App.tsx                         # Root component
│   ├── main.tsx                        # Bootstrap
│   ├── index.css                       # Global styles (Tailwind)
│   ├── env.d.ts                        # Type definitions
│   │
│   ├── pages/                          # Route pages
│   │   ├── HomePage.tsx                # Dashboard (agent list)
│   │   ├── SetupPage.tsx               # Create new agent
│   │   ├── AgentDetail.tsx             # Single agent view
│   │   ├── SettingsPage.tsx            # User settings
│   │   └── NotFound.tsx                # 404 page
│   │
│   ├── components/                     # Reusable UI components
│   │   ├── SetupForm.tsx               # Multi-field agent form
│   │   ├── AgentDashboard.tsx          # Agents list wrapper
│   │   ├── AgentCard.tsx               # Single agent card
│   │   ├── ProvisioningStatus.tsx      # Real-time progress
│   │   ├── ProvisioningBadge.tsx       # Status indicator
│   │   └── shared/
│   │       ├── Button.tsx              # Reusable button
│   │       ├── Input.tsx               # Reusable input
│   │       ├── Modal.tsx               # Modal dialog
│   │       ├── Toast.tsx               # Notifications
│   │       ├── Spinner.tsx             # Loading indicator
│   │       └── ErrorBoundary.tsx       # Error handling
│   │
│   ├── hooks/                          # Custom React hooks
│   │   ├── useTelegramApp.ts           # Telegram SDK integration
│   │   ├── useAuth.ts                  # Authentication
│   │   ├── useAgents.ts                # Agent CRUD
│   │   ├── useProvisioning.ts          # Provisioning status
│   │   ├── useWebSocket.ts             # WebSocket connection
│   │   └── useForm.ts                  # Form state (optional)
│   │
│   ├── services/                       # API & external clients
│   │   ├── api.ts                      # Axios client
│   │   ├── telegram.ts                 # Telegram SDK wrapper
│   │   ├── websocket.ts                # WebSocket client
│   │   └── storage.ts                  # Session storage
│   │
│   ├── types/                          # TypeScript definitions
│   │   ├── telegram.ts                 # Telegram types
│   │   ├── agent.ts                    # Agent/Tenant types
│   │   └── api.ts                      # API response types
│   │
│   └── utils/                          # Utility functions
│       ├── devMock.ts                  # Mock data for testing
│       ├── validation.ts               # Form validation
│       └── formatting.ts               # Date, string formatting
│
├── vite.config.ts                      # Vite configuration
├── tailwind.config.js                  # TailwindCSS config
├── tsconfig.json                       # TypeScript config
└── package.json                        # Dependencies
```

### 1.2 Component Hierarchy

```
App (Root)
  ├─ TelegramProvider
  │   └─ AuthProvider
  │       └─ Router
  │           ├─ HomePage
  │           │   └─ AgentDashboard
  │           │       ├─ SearchBar
  │           │       ├─ FilterBar
  │           │       └─ AgentCard (list)
  │           │           ├─ ProvisioningBadge
  │           │           ├─ ActionMenu
  │           │           └─ DeleteModal
  │           │
  │           ├─ SetupPage
  │           │   └─ SetupForm
  │           │       ├─ AgentNameInput
  │           │       ├─ BotTokenInput
  │           │       ├─ BotUsernameInput
  │           │       ├─ TemplateSelect
  │           │       ├─ ProviderSelect
  │           │       ├─ ApiKeyInput
  │           │       ├─ PresetSelect
  │           │       └─ SubmitButton
  │           │
  │           ├─ AgentDetail
  │           │   ├─ AgentHeader
  │           │   ├─ StatusSection
  │           │   ├─ ConfigSection
  │           │   ├─ ActionButtons
  │           │   └─ LogsSection
  │           │
  │           └─ SettingsPage
  │               ├─ ProfileSection
  │               ├─ BillingSection
  │               └─ DangerZone
  │
  └─ Toast Container
  └─ Modal Portal
```

---

## 2. Page Components

### 2.1 HomePage (Dashboard)

**Purpose:** Main page showing user's agents  
**Route:** `/`  
**Authentication:** Required

**Features:**
- Agent list (cards or table)
- Search by name/bot username
- Filter by status (active/provisioning/failed)
- Sort by created date / last interaction
- Create new agent button
- Real-time status updates

**Component:**
```typescript
export interface HomePageProps {
  // No props - uses context
}

const HomePage: React.FC<HomePageProps> = () => {
  const { agents, loading } = useAgents();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'failed'>('all');
  
  // Filter & sort logic
  const filtered = agents
    .filter(agent => agent.status === filterStatus || filterStatus === 'all')
    .filter(agent => agent.agentName.toLowerCase().includes(searchQuery))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  
  return (
    <div className="space-y-6">
      <Header title="My Agents" />
      
      <div className="flex gap-4">
        <SearchInput value={searchQuery} onChange={setSearchQuery} />
        <FilterDropdown value={filterStatus} onChange={setFilterStatus} />
        <Button href="/setup" variant="primary">
          + New Agent
        </Button>
      </div>
      
      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(agent => (
            <AgentCard key={agent.tenantId} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
};
```

### 2.2 SetupPage (Create Agent)

**Purpose:** Form for creating new agents  
**Route:** `/setup`  
**Authentication:** Required

**Features:**
- Multi-field form (no step-by-step)
- Real-time validation
- Provider-specific guidance
- Model preset selection
- Submit with loading state
- Success/error feedback

**Component:**
```typescript
const SetupPage: React.FC = () => {
  const navigate = useNavigate();
  const { createAgent, loading, error } = useAgents();
  const { addToast } = useToast();
  
  const form = useForm<AgentSetupInput>({
    resolver: zodResolver(agentSetupSchema),
    defaultValues: {
      agentName: '',
      botToken: '',
      botUsername: '',
      template: 'blank',
      provider: 'anthropic',
      apiKey: '',
      preset: 'smart'
    }
  });
  
  const onSubmit = async (data: AgentSetupInput) => {
    try {
      const agent = await createAgent(data);
      addToast('Agent created! Check status below.', 'success');
      navigate(`/agent/${agent.tenantId}`);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };
  
  return (
    <div className="max-w-2xl mx-auto">
      <Header title="Create Agent" />
      <SetupForm onSubmit={onSubmit} loading={loading} error={error} {...form} />
    </div>
  );
};
```

### 2.3 AgentDetail (Single Agent)

**Purpose:** View & manage a single agent  
**Route:** `/agent/:id`  
**Authentication:** Required

**Features:**
- Agent configuration display
- Real-time status
- Pairing instructions
- Logs viewer
- Action buttons (pause, delete, etc.)
- SSH tunnel link (for advanced users)

---

## 3. Component Specifications

### 3.1 SetupForm Component

**Props:**
```typescript
interface SetupFormProps {
  onSubmit: (data: AgentSetupInput) => Promise<void>;
  loading?: boolean;
  error?: string;
  isEditing?: boolean;
  initialValues?: Partial<AgentSetupInput>;
}
```

**Form Fields:**
```typescript
interface AgentSetupInput {
  agentName: string;        // 1-60 chars, required
  botToken: string;         // Format: \d+:AA[A-Za-z0-9_-]+
  botUsername: string;      // 5+ chars, alphanumeric + underscore
  template: 'blank' | 'ops_starter';
  provider: 'openai' | 'anthropic' | 'openrouter';
  apiKey: string;           // Min 20 chars
  preset: 'fast' | 'smart';
}
```

**Validation Schema (Zod):**
```typescript
export const agentSetupSchema = z.object({
  agentName: z.string()
    .min(1, 'Name required')
    .max(60, 'Max 60 characters')
    .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Only alphanumeric, spaces, dash, underscore'),
  
  botToken: z.string()
    .regex(/^\d+:[A-Za-z0-9_-]{25,}$/, 'Invalid BotFather token'),
  
  botUsername: z.string()
    .regex(/^[A-Za-z0-9_]{5,32}$/, '5-32 chars, alphanumeric + underscore'),
  
  template: z.enum(['blank', 'ops_starter']),
  provider: z.enum(['openai', 'anthropic', 'openrouter']),
  
  apiKey: z.string()
    .min(20, 'API key too short')
    .max(500, 'API key too long'),
  
  preset: z.enum(['fast', 'smart'])
});
```

**Rendering:**
```typescript
<form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
  {/* Agent Name */}
  <Input
    label="Agent Name"
    placeholder="My Trading Bot"
    {...register('agentName')}
    error={errors.agentName?.message}
    hint="Used only in your dashboard"
  />
  
  {/* Bot Token */}
  <Input
    label="Bot Token (from BotFather)"
    type="password"
    placeholder="123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcde"
    {...register('botToken')}
    error={errors.botToken?.message}
    hint="Get this from t.me/BotFather /newbot command"
    toggleVisibility
  />
  
  {/* Bot Username */}
  <Input
    label="Bot Username"
    placeholder="my_trading_bot"
    {...register('botUsername')}
    error={errors.botUsername?.message}
    hint="From BotFather - must match exactly"
  />
  
  {/* Template Selection */}
  <RadioGroup label="Template">
    <Radio value="blank" label="Blank (Start from scratch)" />
    <Radio value="ops_starter" label="Ops Starter (Pre-configured)" />
  </RadioGroup>
  
  {/* Provider Selection */}
  <RadioGroup label="AI Provider" onChange={handleProviderChange}>
    <Radio value="anthropic" label="Claude (Anthropic)" />
    <Radio value="openai" label="GPT (OpenAI)" />
    <Radio value="openrouter" label="Multi-Model (OpenRouter)" />
  </RadioGroup>
  
  {/* API Key */}
  <Input
    label={`${selectedProvider} API Key`}
    type="password"
    placeholder="sk-... or claude-key..."
    {...register('apiKey')}
    error={errors.apiKey?.message}
    hint={getProviderHint(selectedProvider)}
    toggleVisibility
  />
  
  {/* Preset Selection */}
  <RadioGroup label="Performance Preset">
    <Radio value="fast" label="Fast (Faster response, lower quality)" />
    <Radio value="smart" label="Smart (Slower response, better quality)" />
  </RadioGroup>
  
  {/* Error Alert */}
  {error && <Alert type="error">{error}</Alert>}
  
  {/* Submit */}
  <Button
    type="submit"
    variant="primary"
    size="lg"
    disabled={!isValid || loading}
    loading={loading}
  >
    {loading ? 'Creating...' : 'Create Agent'}
  </Button>
</form>
```

### 3.2 AgentCard Component

**Props:**
```typescript
interface AgentCardProps {
  agent: Agent;
  onDelete?: (tenantId: string) => void;
  onPause?: (tenantId: string) => void;
}
```

**Agent Type:**
```typescript
interface Agent {
  tenantId: string;
  agentName: string;
  botUsername: string;
  provider: 'openai' | 'anthropic' | 'openrouter';
  template: 'blank' | 'ops_starter';
  status: 'provisioning' | 'active' | 'paused' | 'failed' | 'archived';
  pairingStatus: 'pending' | 'paired' | 'rejected';
  createdAt: Date;
  lastInteraction?: Date;
  containerStatus?: 'running' | 'stopped' | 'error';
  errorMessage?: string;
}
```

**Rendering:**
```typescript
<div className="bg-surface border border-border rounded-lg p-6 hover:bg-surface2 transition">
  <div className="flex justify-between items-start mb-4">
    <div>
      <h3 className="text-lg font-semibold">{agent.agentName}</h3>
      <p className="text-muted text-sm">@{agent.botUsername}</p>
    </div>
    <ProvisioningBadge status={agent.status} />
  </div>
  
  <div className="space-y-2 text-sm mb-4">
    <div className="flex justify-between">
      <span className="text-muted">Provider:</span>
      <span className="font-mono">{agent.provider}</span>
    </div>
    <div className="flex justify-between">
      <span className="text-muted">Template:</span>
      <span className="font-mono">{agent.template}</span>
    </div>
    <div className="flex justify-between">
      <span className="text-muted">Created:</span>
      <span>{formatDate(agent.createdAt)}</span>
    </div>
  </div>
  
  <div className="flex gap-2">
    <Button
      size="sm"
      variant="secondary"
      onClick={() => navigate(`/agent/${agent.tenantId}`)}
    >
      View Details
    </Button>
    <ActionMenu agent={agent} onDelete={onDelete} onPause={onPause} />
  </div>
</div>
```

### 3.3 ProvisioningStatus Component

**Purpose:** Show real-time provisioning progress  
**Features:**
- Step indicators (1/4, 2/4, etc.)
- Progress bar or spinner
- Event messages
- Estimated time remaining
- Error state with retry button

**Component:**
```typescript
interface ProvisioningStatusProps {
  tenantId: string;
  onComplete?: (agent: Agent) => void;
}

const ProvisioningStatus: React.FC<ProvisioningStatusProps> = ({ tenantId, onComplete }) => {
  const { status, currentStep, totalSteps, message, error } = useProvisioning(tenantId);
  
  if (error) {
    return (
      <Alert type="error">
        <p>{error}</p>
        <Button onClick={() => retryProvisioning(tenantId)}>Retry</Button>
      </Alert>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="bg-surface p-4 rounded-lg">
        <div className="flex justify-between mb-2">
          <span className="font-semibold">Provisioning Progress</span>
          <span className="text-muted">{currentStep}/{totalSteps}</span>
        </div>
        <ProgressBar value={currentStep} max={totalSteps} />
      </div>
      
      <div className="space-y-2">
        {[
          { step: 1, title: 'SSH Key', done: currentStep >= 1 },
          { step: 2, title: 'Container', done: currentStep >= 2 },
          { step: 3, title: 'Runtime', done: currentStep >= 3 },
          { step: 4, title: 'Ready', done: currentStep >= 4 }
        ].map(item => (
          <div key={item.step} className="flex items-center gap-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${
              item.done ? 'bg-green text-bg' : 'bg-surface3 text-muted'
            }`}>
              {item.done ? '✓' : item.step}
            </div>
            <span>{item.title}</span>
          </div>
        ))}
      </div>
      
      {message && (
        <div className="text-muted text-sm p-3 bg-surface3 rounded border border-border">
          {message}
        </div>
      )}
    </div>
  );
};
```

---

## 4. Shared Components

### 4.1 Button Component

```typescript
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  href?: string;
}

const Button: React.FC<ButtonProps> = ({ 
  variant = 'primary', 
  size = 'md', 
  loading, 
  disabled, 
  href,
  children,
  ...props 
}) => {
  const baseClass = 'font-medium rounded transition disabled:opacity-50';
  
  const variants = {
    primary: 'bg-grid text-bg hover:bg-grid2',
    secondary: 'bg-surface border border-border hover:bg-surface2',
    danger: 'bg-danger text-white hover:bg-red-700',
    ghost: 'hover:bg-surface'
  };
  
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg'
  };
  
  const className = `${baseClass} ${variants[variant]} ${sizes[size]}`;
  
  if (href) {
    return <Link to={href} className={className} {...props}>{children}</Link>;
  }
  
  return (
    <button disabled={disabled || loading} className={className} {...props}>
      {loading && <Spinner size="sm" className="mr-2" />}
      {children}
    </button>
  );
};
```

### 4.2 Input Component

```typescript
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  toggleVisibility?: boolean;
}

const Input: React.FC<InputProps> = ({
  label,
  error,
  hint,
  toggleVisibility,
  type = 'text',
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const inputType = toggleVisibility && type === 'password'
    ? (showPassword ? 'text' : 'password')
    : type;
  
  return (
    <div className="space-y-1">
      {label && <label className="block text-sm font-medium">{label}</label>}
      <div className="relative">
        <input
          type={inputType}
          className={`w-full px-4 py-2 bg-surface border rounded ${
            error ? 'border-danger' : 'border-border'
          } text-text placeholder-muted focus:outline-none focus:border-grid`}
          {...props}
        />
        {toggleVisibility && type === 'password' && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-2.5 text-muted hover:text-text"
          >
            {showPassword ? '👁️' : '👁️‍🗨️'}
          </button>
        )}
      </div>
      {error && <p className="text-danger text-xs">{error}</p>}
      {hint && <p className="text-muted text-xs">{hint}</p>}
    </div>
  );
};
```

### 4.3 Toast Component

```typescript
interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

const Toast: React.FC<Toast> = ({ message, type, duration = 4000 }) => {
  const [isVisible, setIsVisible] = useState(true);
  
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(false), duration);
    return () => clearTimeout(timer);
  }, [duration]);
  
  const colors = {
    success: 'bg-green text-bg',
    error: 'bg-danger text-white',
    info: 'bg-blue text-white',
    warning: 'bg-orange text-bg'
  };
  
  return isVisible ? (
    <div className={`${colors[type]} px-4 py-3 rounded shadow-lg animate-fade-in`}>
      {message}
    </div>
  ) : null;
};

// Toast container in App
const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();
  
  return (
    <div className="fixed bottom-4 right-4 space-y-2 z-50">
      {toasts.map(toast => (
        <div key={toast.id} onClick={() => removeToast(toast.id)}>
          <Toast {...toast} />
        </div>
      ))}
    </div>
  );
};
```

---

## 5. Styling & Design System

### 5.1 Color Tokens (TailwindCSS)

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface2)',
        surface3: 'var(--surface3)',
        border: 'var(--border)',
        border2: 'var(--border2)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        muted2: 'var(--muted2)',
        grid: 'var(--grid)',
        grid2: 'var(--grid2)',
        'grid-glow': 'var(--grid-glow)',
        'grid-dim': 'var(--grid-dim)',
        btc: 'var(--btc)',
        'btc-glow': 'var(--btc-glow)',
        blue: 'var(--blue)',
        green: 'var(--green)',
        danger: 'var(--danger)'
      }
    }
  }
};
```

### 5.2 CSS Variables (Global)

```css
:root {
  --bg: #04040a;
  --surface: #0a0a12;
  --surface2: #0f0f1a;
  --surface3: #161624;
  --border: rgba(255,255,255,0.06);
  --border2: rgba(255,255,255,0.10);
  --text: #e8e8f0;
  --muted: #5a5a78;
  --muted2: #8888aa;
  --grid: #c8ff00;
  --grid2: #aaee00;
  --grid-glow: rgba(200,255,0,0.20);
  --grid-dim: rgba(200,255,0,0.06);
  --btc: #f7931a;
  --btc-glow: rgba(247,147,26,0.20);
  --blue: #7c9fff;
  --green: #3dffa0;
  --danger: #ff6b6b;
}
```

### 5.3 Responsive Design

**Mobile-First Breakpoints:**
```
sm: 640px   - tablets
md: 768px   - small laptops
lg: 1024px  - desktops
xl: 1280px  - large desktops
```

**Example:**
```typescript
<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
  {/* 1 column on mobile, 2 on tablets, 3 on desktop */}
</div>
```

---

## 6. ClawDrop Wizard Integration

### 6.1 ClawDrop as Standalone HTML

The ClawDrop wizard can be served as a **self-contained HTML file** with:
- Inline React
- Inline Babel transpilation
- Inline styles (CSS-in-JS)
- Direct API calls to hfsp backend

**Deployment Options:**

**Option 1: Serve from Storefront Bot**
```
GET /wizard → serves clawdrop-wizard.html
```

**Option 2: Standalone Server**
```
node clawdrop-server.js
  → serves on port 5000
  → calls backend API at hfsp.cloud/api
```

**Option 3: Static HTML on CDN**
```
Upload to S3 / GitHub Pages
  → Serve from CDN
  → API calls to hfsp.cloud/api
```

### 6.2 ClawDrop API Integration

The wizard calls the same backend as the web app:

```javascript
// In ClawDrop setup form
const setupAgent = async (formData) => {
  const response = await fetch('https://hfsp.cloud/api/agents', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(formData)
  });
  
  return response.json();
};

// Real-time updates via WebSocket
const ws = new WebSocket(`wss://hfsp.cloud/ws/provisioning/${tenantId}?token=${API_TOKEN}`);
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  updateUI(data);
};
```

---

## 7. Accessibility & UX Requirements

### 7.1 Accessibility (WCAG 2.1 AA)

- [ ] All form inputs have associated labels
- [ ] Color contrast ratio ≥ 4.5:1 for text
- [ ] All buttons have keyboard focus indicators
- [ ] Keyboard navigation support (Tab, Enter, Escape)
- [ ] ARIA labels for interactive elements
- [ ] Loading states announced to screen readers
- [ ] Error messages linked to form fields

### 7.2 Mobile UX

- [ ] Touch targets minimum 48x48px
- [ ] Full viewport height (no horizontal scroll)
- [ ] Responsive form layout (single column on mobile)
- [ ] Haptic feedback on button press (Telegram)
- [ ] Dark mode by default (matches Telegram)
- [ ] Works on iOS 12+ and Android 8+

### 7.3 Error Handling

**Form Validation Errors:**
```
❌ Agent name required
  → Show below field with red text
  → Input field has red border

❌ Invalid bot token format
  → Show helpful message: "Get from BotFather /newbot"
  → Show example format

❌ API key authentication failed
  → Show provider-specific error
  → "Check OpenAI account has API access"
```

**Network Errors:**
```
⚠️ Network error - Connection failed
  → Show retry button
  → Auto-retry after 5 seconds

⚠️ Server error - 500 Internal Server Error
  → Show support link
  → Suggest checking status page
```

---

## 8. Performance Targets

| Metric | Target | How to Achieve |
|--------|--------|---|
| Initial Load | <2s | Code splitting, lazy loading |
| Form Submission | <5s | Optimistic UI, streaming responses |
| WebSocket Latency | <100ms | Direct connection, keep-alive |
| List Rendering (100 items) | <300ms | Virtualization, React Query caching |
| Mobile Load (3G) | <4s | Min CSS, compress assets |

### 8.1 Optimization Strategies

**Code Splitting:**
```typescript
const SetupPage = React.lazy(() => import('./pages/SetupPage'));
const AgentDetail = React.lazy(() => import('./pages/AgentDetail'));

<Suspense fallback={<Spinner />}>
  <SetupPage />
</Suspense>
```

**Image Optimization:**
- Use WebP with JPG fallback
- Lazy load images below fold
- Responsive images with srcset

**Bundle Analysis:**
```bash
npm run build -- --analyze
```

---

## 9. Testing Strategy

### Unit Tests
```
✓ Form validation (valid/invalid inputs)
✓ Component rendering (with mock data)
✓ Event handlers (button clicks, form submissions)
```

### Integration Tests
```
✓ Auth flow (Telegram → JWT)
✓ Agent creation (form → API → list update)
✓ Real-time updates (WebSocket → UI update)
```

### E2E Tests
```
✓ Complete user flow (auth → create agent → view status)
✓ Error scenarios (invalid token, network error)
✓ Mobile responsiveness (all pages on multiple devices)
```

---

## Summary

This frontend specification provides:
- ✅ Complete component architecture
- ✅ Detailed component specs with code examples
- ✅ Design system with color tokens
- ✅ Accessibility requirements
- ✅ Performance targets
- ✅ ClawDrop integration guide
- ✅ Testing strategy

**Next Steps:**
1. Review component hierarchy with design team
2. Create design system in Figma
3. Build shared components first
4. Implement pages in parallel
5. Test on real Telegram mobile app
