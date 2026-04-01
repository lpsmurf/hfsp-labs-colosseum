/**
 * Agent Setup Page
 * Multi-field form for creating new agents
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateAgent } from '../hooks/useAgents';
import { useToast } from '../components/shared';
import { Button, Input } from '../components/shared';
import useTelegramApp from '../hooks/useTelegramApp';

// Zod validation schema
const agentSetupSchema = z.object({
  name: z.string().min(1, 'Agent name is required').min(3, 'Name must be at least 3 characters'),
  description: z.string().optional().default(''),
  model: z.string().min(1, 'Model selection is required'),
  temperature: z.coerce
    .number()
    .min(0, 'Temperature must be between 0 and 2')
    .max(2, 'Temperature must be between 0 and 2')
    .default(0.7),
  max_tokens: z.coerce
    .number()
    .min(1, 'Max tokens must be at least 1')
    .max(128000, 'Max tokens cannot exceed 128000')
    .default(2000),
  system_prompt: z.string().optional().default('You are a helpful AI assistant.'),
  webhook_url: z.string().url('Invalid webhook URL').optional().or(z.literal('')),
});

type AgentSetupForm = z.infer<typeof agentSetupSchema>;

const AVAILABLE_MODELS = [
  { value: 'gpt-4', label: 'GPT-4 (Most capable, slower)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo (Fast & powerful)' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Fast & cheap)' },
  { value: 'claude-3-opus', label: 'Claude 3 Opus (Thoughtful)' },
  { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet (Balanced)' },
];

export function SetupPage() {
  const tg = useTelegramApp();
  const toast = useToast();
  const createAgentMutation = useCreateAgent();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    reset,
  } = useForm<AgentSetupForm>({
    resolver: zodResolver(agentSetupSchema),
    defaultValues: {
      name: '',
      description: '',
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      max_tokens: 2000,
      system_prompt: 'You are a helpful AI assistant.',
      webhook_url: '',
    },
  });

  const temperature = watch('temperature');
  const model = watch('model');

  const onSubmit = async (data: AgentSetupForm) => {
    try {
      tg.haptic('impactOccurred', 'medium');
      await createAgentMutation.mutateAsync({
        name: data.name,
        description: data.description,
        model: data.model,
        temperature: data.temperature,
        max_tokens: data.max_tokens,
        system_prompt: data.system_prompt,
        webhook_url: data.webhook_url || undefined,
      });

      toast.success('Agent created successfully! 🎉');
      tg.haptic('notificationOccurred', 'success');
      reset();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create agent';
      toast.error(message);
      tg.haptic('notificationOccurred', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-800 dark:to-blue-900 text-white p-6">
        <h1 className="text-2xl font-bold mb-2">Create Agent</h1>
        <p className="text-blue-100">Set up a new AI agent with custom configuration</p>
      </div>

      {/* Form Container */}
      <div className="max-w-2xl mx-auto p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Basic Information Section */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold mb-4">Basic Information</h2>

            <Input
              label="Agent Name"
              placeholder="e.g., Customer Support Bot"
              {...register('name')}
              error={errors.name?.message}
            />

            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                Description (Optional)
              </label>
              <textarea
                placeholder="What does this agent do?"
                rows={3}
                className={`
                  w-full px-4 py-2 rounded-lg border-2 transition-colors
                  bg-white dark:bg-gray-900 text-gray-900 dark:text-white
                  placeholder-gray-400 dark:placeholder-gray-500
                  border-gray-300 dark:border-gray-600
                  focus:outline-none focus:border-blue-500 dark:focus:border-blue-400
                  ${errors.description ? 'border-red-500 dark:border-red-400' : ''}
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
                {...register('description')}
              />
              {errors.description && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.description.message}</p>
              )}
            </div>
          </div>

          {/* Model Configuration Section */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold mb-4">Model Configuration</h2>

            <div>
              <label htmlFor="model" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                AI Model <span className="text-red-600">*</span>
              </label>
              <select
                id="model"
                className={`
                  w-full px-4 py-2 rounded-lg border-2 transition-colors
                  bg-white dark:bg-gray-900 text-gray-900 dark:text-white
                  border-gray-300 dark:border-gray-600
                  focus:outline-none focus:border-blue-500 dark:focus:border-blue-400
                  ${errors.model ? 'border-red-500 dark:border-red-400' : ''}
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
                {...register('model')}
              >
                <option value="">Select a model...</option>
                {AVAILABLE_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              {errors.model && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.model.message}</p>}
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {AVAILABLE_MODELS.find((m) => m.value === model)?.label}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Temperature: <span className="text-blue-600 dark:text-blue-400 font-semibold">{temperature.toFixed(1)}</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  {...register('temperature')}
                  className="w-full"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {temperature < 0.5
                    ? 'Focused & deterministic'
                    : temperature < 1.5
                      ? 'Balanced'
                      : 'Creative & diverse'}
                </p>
              </div>

              <Input
                label="Max Tokens"
                type="number"
                placeholder="2000"
                {...register('max_tokens')}
                error={errors.max_tokens?.message}
                helperText="Max response length"
              />
            </div>
          </div>

          {/* System Prompt Section */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold mb-4">System Instructions</h2>

            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                System Prompt
              </label>
              <textarea
                placeholder="You are a helpful AI assistant..."
                rows={4}
                className={`
                  w-full px-4 py-2 rounded-lg border-2 transition-colors
                  bg-white dark:bg-gray-900 text-gray-900 dark:text-white
                  placeholder-gray-400 dark:placeholder-gray-500
                  border-gray-300 dark:border-gray-600
                  focus:outline-none focus:border-blue-500 dark:focus:border-blue-400
                  ${errors.system_prompt ? 'border-red-500 dark:border-red-400' : ''}
                  disabled:opacity-50 disabled:cursor-not-allowed
                  font-mono text-sm
                `}
                {...register('system_prompt')}
              />
              {errors.system_prompt && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.system_prompt.message}</p>
              )}
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Define the agent's behavior and role
              </p>
            </div>
          </div>

          {/* Advanced Section */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold mb-4">Advanced (Optional)</h2>

            <Input
              label="Webhook URL"
              type="url"
              placeholder="https://example.com/webhook"
              {...register('webhook_url')}
              error={errors.webhook_url?.message}
              helperText="URL to receive provisioning status updates"
            />
          </div>

          {/* Submit Section */}
          <div className="flex gap-3 sticky bottom-0 bg-white dark:bg-gray-900 p-6 -mx-6 border-t border-gray-200 dark:border-gray-700">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isSubmitting || createAgentMutation.isLoading}
              disabled={isSubmitting || createAgentMutation.isLoading}
            >
              {isSubmitting || createAgentMutation.isLoading ? 'Creating Agent...' : 'Create Agent'}
            </Button>
          </div>

          {/* Status Message */}
          {createAgentMutation.error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-800 dark:text-red-200">
              <p className="font-semibold">Error</p>
              <p className="text-sm">
                {createAgentMutation.error instanceof Error 
                  ? createAgentMutation.error.message 
                  : typeof createAgentMutation.error === 'string'
                    ? createAgentMutation.error
                    : 'Failed to create agent'}
              </p>
            </div>
          )}
        </form>

        {/* Info Section */}
        <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-blue-900 dark:text-blue-200">
          <h3 className="font-semibold mb-2">💡 Tips</h3>
          <ul className="text-sm space-y-1 list-disc list-inside">
            <li>Lower temperature (0.0) = more predictable responses</li>
            <li>Higher temperature (2.0) = more creative responses</li>
            <li>System prompt defines the agent's personality and constraints</li>
            <li>Max tokens limits the response length</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default SetupPage;
