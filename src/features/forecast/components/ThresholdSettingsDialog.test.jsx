import {
  useState,
} from 'react';
import {
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DEFAULT_THRESHOLDS,
  ERROR_CODES,
} from '../../../constants/domainConstants.js';
import preferenceRepository from '../../../repositories/preferenceRepository.js';
import {
  forecastViewStore,
} from '../store/forecastViewStore.js';
import ThresholdSettingsDialog from './ThresholdSettingsDialog.jsx';

const resetForecastViewStore = () => {
  forecastViewStore.setState({
    thresholds: {
      ...DEFAULT_THRESHOLDS,
    },
    isThresholdDialogOpen: false,
    activeDialog: null,
    persistenceMode: null,
    persistenceError: null,
  });
};

const FocusRestorationHarness = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
      >
        Configure thresholds
      </button>

      <ThresholdSettingsDialog
        isOpen={isOpen}
        onCancel={() => setIsOpen(false)}
      />
    </div>
  );
};

describe('ThresholdSettingsDialog', () => {
  beforeEach(() => {
    resetForecastViewStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetForecastViewStore();
  });

  it('shows default thresholds and restores them after draft values are changed', async () => {
    const user = userEvent.setup();

    render(
      <ThresholdSettingsDialog
        isOpen
        thresholds={{
          constrained: DEFAULT_THRESHOLDS.constrained,
          exceeded: DEFAULT_THRESHOLDS.exceeded,
        }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const constrainedInput = screen.getByRole('spinbutton', {
      name: 'Warning starts at',
    });
    const exceededInput = screen.getByRole('spinbutton', {
      name: 'Over capacity starts above',
    });

    expect(constrainedInput).toHaveValue(
      DEFAULT_THRESHOLDS.constrained,
    );
    expect(exceededInput).toHaveValue(
      DEFAULT_THRESHOLDS.exceeded,
    );
    expect(screen.getByText(
      `Below ${DEFAULT_THRESHOLDS.constrained}%`,
    )).toBeInTheDocument();
    expect(screen.getByText(
      `${DEFAULT_THRESHOLDS.constrained}%–${DEFAULT_THRESHOLDS.exceeded}%`,
    )).toBeInTheDocument();

    await user.clear(constrainedInput);
    await user.type(constrainedInput, '65');
    await user.clear(exceededInput);
    await user.type(exceededInput, '125');

    await user.click(screen.getByRole('button', {
      name: 'Restore defaults',
    }));

    expect(constrainedInput).toHaveValue(
      DEFAULT_THRESHOLDS.constrained,
    );
    expect(exceededInput).toHaveValue(
      DEFAULT_THRESHOLDS.exceeded,
    );
    expect(constrainedInput).toHaveFocus();
  });

  it('rejects thresholds when the warning boundary exceeds the over-capacity boundary', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <ThresholdSettingsDialog
        isOpen
        thresholds={{
          constrained: 80,
          exceeded: 100,
        }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    const constrainedInput = screen.getByRole('spinbutton', {
      name: 'Warning starts at',
    });
    const exceededInput = screen.getByRole('spinbutton', {
      name: 'Over capacity starts above',
    });

    await user.clear(constrainedInput);
    await user.type(constrainedInput, '120');
    await user.clear(exceededInput);
    await user.type(exceededInput, '100');
    await user.click(screen.getByRole('button', {
      name: 'Save thresholds',
    }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The constrained threshold must not exceed the exceeded threshold.',
    );
    expect(exceededInput).toHaveAttribute('aria-invalid', 'true');
    expect(exceededInput).toHaveFocus();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', {
      name: 'Capacity thresholds',
    })).toBeInTheDocument();
  });

  it('persists valid thresholds, updates the store, and closes the store-controlled dialog', async () => {
    const user = userEvent.setup();
    const saveThresholds = vi.spyOn(
      preferenceRepository,
      'saveThresholds',
    ).mockImplementation((thresholds) => ({
      ok: true,
      data: {
        ...thresholds,
      },
      mode: 'localStorage',
    }));

    forecastViewStore.getState().openThresholdDialog();

    render(<ThresholdSettingsDialog />);

    const constrainedInput = screen.getByRole('spinbutton', {
      name: 'Warning starts at',
    });
    const exceededInput = screen.getByRole('spinbutton', {
      name: 'Over capacity starts above',
    });

    await user.clear(constrainedInput);
    await user.type(constrainedInput, '85');
    await user.clear(exceededInput);
    await user.type(exceededInput, '110');
    await user.click(screen.getByRole('button', {
      name: 'Save thresholds',
    }));

    await waitFor(() => {
      expect(saveThresholds).toHaveBeenCalledWith({
        constrained: 85,
        exceeded: 110,
      });
      expect(forecastViewStore.getState().thresholds).toEqual({
        constrained: 85,
        exceeded: 110,
      });
      expect(
        forecastViewStore.getState().isThresholdDialogOpen,
      ).toBe(false);
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', {
        name: 'Capacity thresholds',
      })).not.toBeInTheDocument();
    });
  });

  it('restores focus to the control that opened the dialog after cancellation', async () => {
    const user = userEvent.setup();

    render(<FocusRestorationHarness />);

    const openButton = screen.getByRole('button', {
      name: 'Configure thresholds',
    });

    await user.click(openButton);

    const constrainedInput = await screen.findByRole('spinbutton', {
      name: 'Warning starts at',
    });

    await waitFor(() => {
      expect(constrainedInput).toHaveFocus();
    });

    await user.click(screen.getByRole('button', {
      name: 'Cancel',
    }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', {
        name: 'Capacity thresholds',
      })).not.toBeInTheDocument();
      expect(openButton).toHaveFocus();
    });
  });

  it('keeps immediate store changes and displays a quota warning when durable persistence fails', async () => {
    const user = userEvent.setup();
    const quotaMessage = (
      'Browser storage quota was exceeded. Changes will be kept in memory for this session.'
    );
    const quotaError = {
      code: ERROR_CODES.STORAGE_QUOTA_EXCEEDED,
      message: quotaMessage,
    };

    vi.spyOn(
      preferenceRepository,
      'saveThresholds',
    ).mockImplementation((thresholds) => ({
      ok: true,
      data: {
        ...thresholds,
      },
      mode: 'memory',
      error: quotaError,
    }));

    forecastViewStore.getState().openThresholdDialog();

    render(<ThresholdSettingsDialog />);

    const constrainedInput = screen.getByRole('spinbutton', {
      name: 'Warning starts at',
    });
    const exceededInput = screen.getByRole('spinbutton', {
      name: 'Over capacity starts above',
    });

    await user.clear(constrainedInput);
    await user.type(constrainedInput, '75');
    await user.clear(exceededInput);
    await user.type(exceededInput, '105');
    await user.click(screen.getByRole('button', {
      name: 'Save thresholds',
    }));

    await waitFor(() => {
      expect(forecastViewStore.getState().thresholds).toEqual({
        constrained: 75,
        exceeded: 105,
      });
      expect(forecastViewStore.getState().persistenceMode).toBe(
        'memory',
      );
      expect(
        forecastViewStore.getState().persistenceError,
      ).toEqual(quotaError);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      quotaMessage,
    );
    expect(screen.getByRole('dialog', {
      name: 'Capacity thresholds',
    })).toBeInTheDocument();
    expect(
      forecastViewStore.getState().isThresholdDialogOpen,
    ).toBe(true);
  });
});