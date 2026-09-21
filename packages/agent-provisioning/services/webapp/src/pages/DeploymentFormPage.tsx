import { useState } from 'react';
import { useToast } from '../components/shared';
import { TierSelector } from '../components/TierSelector';
import { PaymentMethodSelector } from '../components/PaymentMethodSelector';
import { TelegramTokenInput } from '../components/TelegramTokenInput';
import { WalletSelector } from '../components/WalletSelector';
import { DeploymentSummary } from '../components/DeploymentSummary';
import { useDeployment } from '../hooks/useDeployment';
import { DeploymentRequest, DeploymentRequestSchema } from '../types/deployment';
import { Input, Modal } from '../components/shared';

export function DeploymentFormPage() {
  const toast = useToast();
  const deployMutation = useDeployment();

  // Form state
  const [step, setStep] = useState<'info' | 'wallet' | 'payment' | 'telegram' | 'review'>(
    'info'
  );
  const [form, setForm] = useState<Partial<DeploymentRequest>>({
    tier_id: 'tier_explorer',
    agent_name: '',
    owner_wallet: '',
    payment_token: 'SOL',
    payment_tx_hash: '',
    telegram_token: '',
    llm_provider: 'anthropic',
  });

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');

  // Success modal
  const [successData, setSuccessData] = useState<any>(null);

  const validateField = (field: string, value: any): boolean => {
    const newErrors = { ...errors };
    delete newErrors[field];

    try {
      // Validate the specific field
      if (field === 'tier_id') {
        if (!['tier_explorer', 'tier_a', 'tier_b'].includes(value)) {
          throw new Error('Invalid tier');
        }
      } else if (field === 'agent_name') {
        if (!value || value.length < 3 || value.length > 64) {
          throw new Error('Agent name must be 3-64 characters');
        }
      } else if (field === 'owner_wallet') {
        if (!value || value.length < 32 || value.length > 44) {
          throw new Error('Invalid wallet address');
        }
      } else if (field === 'payment_token') {
        if (!['SOL', 'USDT', 'USDC', 'HERD'].includes(value)) {
          throw new Error('Invalid payment token');
        }
      } else if (field === 'payment_tx_hash') {
        if (!value || value.length < 1) {
          throw new Error('Transaction hash required');
        }
      } else if (field === 'telegram_token') {
        const tokenRegex = /^\d+:[a-zA-Z0-9_-]+$/;
        if (!tokenRegex.test(value)) {
          throw new Error('Invalid telegram token format');
        }
      }
    } catch (e: any) {
      newErrors[field] = e.message;
      setErrors(newErrors);
      return false;
    }

    setErrors(newErrors);
    return true;
  };

  const validateStep = (): boolean => {
    let isValid = true;

    if (step === 'info') {
      isValid = validateField('tier_id', form.tier_id) && isValid;
      isValid = validateField('agent_name', form.agent_name) && isValid;
    } else if (step === 'wallet') {
      isValid = validateField('owner_wallet', form.owner_wallet) && isValid;
    } else if (step === 'payment') {
      isValid = validateField('payment_token', form.payment_token) && isValid;
      isValid = validateField('payment_tx_hash', form.payment_tx_hash) && isValid;
    } else if (step === 'telegram') {
      isValid = validateField('telegram_token', form.telegram_token) && isValid;
    }

    return isValid;
  };

  const nextStep = () => {
    if (!validateStep()) return;

    const steps: typeof step[] = ['info', 'wallet', 'payment', 'telegram', 'review'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1]);
    }
  };

  const prevStep = () => {
    const steps: typeof step[] = ['info', 'wallet', 'payment', 'telegram', 'review'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
    }
  };

  const handleSubmit = async () => {
    setSubmitError('');

    try {
      // Final validation
      const validated = DeploymentRequestSchema.parse(form);

      // Submit
      const response = await deployMutation.mutateAsync(validated);
      setSuccessData(response.data);
      toast.success('Deployment created successfully!');
    } catch (error: any) {
      const message =
        error.response?.data?.error ||
        error.message ||
        'Deployment failed. Please check your inputs.';
      setSubmitError(message);
      toast.error(message);
    }
  };

  const updateField = <K extends keyof DeploymentRequest>(key: K, value: DeploymentRequest[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear error for this field when user starts typing
    const newErrors = { ...errors };
    delete newErrors[key];
    setErrors(newErrors);
  };

  const progressSteps = ['Info', 'Wallet', 'Payment', 'Telegram', 'Review'];
  const currentStepIndex = ['info', 'wallet', 'payment', 'telegram', 'review'].indexOf(step);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Deploy ClawDrop Agent
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Configure and deploy your Solana-based agent provisioning service
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {progressSteps.map((s, i) => (
              <div
                key={s}
                className={`h-2 flex-1 mx-1 rounded-full transition ${
                  i <= currentStepIndex ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            ))}
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Step {currentStepIndex + 1} of {progressSteps.length}: {progressSteps[currentStepIndex]}
            </p>
          </div>
        </div>

        {/* Form Content */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 mb-6">
          {step === 'info' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Deployment Information
              </h2>
              <TierSelector
                value={form.tier_id as any}
                onChange={(tier) => updateField('tier_id', tier)}
                error={errors.tier_id}
              />
              <Input
                label="Agent Name"
                value={form.agent_name || ''}
                onChange={(e) => updateField('agent_name', e.target.value)}
                placeholder="e.g., My Trading Bot"
                error={errors.agent_name}
              />
            </div>
          )}

          {step === 'wallet' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Wallet Configuration
              </h2>
              <WalletSelector
                value={form.owner_wallet || ''}
                onChange={(addr) => updateField('owner_wallet', addr)}
                error={errors.owner_wallet}
              />
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
                Your wallet address will receive the deployed agent and handle payments.
              </p>
            </div>
          )}

          {step === 'payment' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Payment Details
              </h2>
              <PaymentMethodSelector
                value={form.payment_token as any}
                onChange={(token) => updateField('payment_token', token)}
                error={errors.payment_token}
              />
              <Input
                label="Payment Transaction Hash"
                value={form.payment_tx_hash || ''}
                onChange={(e) => updateField('payment_tx_hash', e.target.value)}
                placeholder="Enter Solana transaction signature"
                error={errors.payment_tx_hash}
              />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Paste the transaction signature from Solana explorer after completing the payment.
              </p>
            </div>
          )}

          {step === 'telegram' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Telegram Bot Configuration
              </h2>
              <TelegramTokenInput
                value={form.telegram_token || ''}
                onChange={(val) => updateField('telegram_token', val)}
                error={errors.telegram_token}
              />
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm text-blue-900 dark:text-blue-200">
                <p className="font-medium mb-2">How to get your bot token:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Open Telegram and search for @BotFather</li>
                  <li>Create a new bot with /newbot</li>
                  <li>Copy the token provided (format: 123456789:ABCdefGHIjklmnoPQRstuvWXYZ)</li>
                </ol>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Review & Deploy
              </h2>
              <DeploymentSummary data={form} />
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-sm text-yellow-900 dark:text-yellow-200">
                <p>
                  Please review all settings above. Once deployed, your agent will be created and
                  activated on Solana mainnet.
                </p>
              </div>
            </div>
          )}

          {submitError && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-900 dark:text-red-200">{submitError}</p>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex gap-3">
          {step !== 'info' && (
            <button
              onClick={prevStep}
              className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition"
            >
              Back
            </button>
          )}

          {step !== 'review' && (
            <button
              onClick={nextStep}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
            >
              Next
            </button>
          )}

          {step === 'review' && (
            <button
              onClick={handleSubmit}
              disabled={deployMutation.isLoading}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50"
            >
              {deployMutation.isLoading ? 'Deploying...' : 'Deploy Agent'}
            </button>
          )}
        </div>
      </div>

      {/* Success Modal */}
      {successData && (
        <Modal isOpen={true} onClose={() => setSuccessData(null)} title="Deployment Successful" size="md">
          <div className="text-center">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl text-green-600 dark:text-green-400">✓</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Deployment Successful!
            </h2>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 my-4 text-left space-y-2">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Deployment ID</p>
                <p className="font-mono text-sm font-medium text-gray-900 dark:text-white break-all">
                  {successData.deployment_id}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Agent ID</p>
                <p className="font-mono text-sm font-medium text-gray-900 dark:text-white break-all">
                  {successData.data.agent_id}
                </p>
              </div>
            </div>
            <a
              href={successData.data.console_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
            >
              View Console
            </a>
          </div>
        </Modal>
      )}
    </div>
  );
}
