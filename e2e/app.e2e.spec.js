import { expect, test } from '@playwright/test';

const PLANNER_CREDENTIALS = Object.freeze({
  username: 'planner',
  password: 'Planner@123',
});

const IMPORTED_WORK_ITEM = Object.freeze({
  recordId: 'e2e-import-work-item-001',
  planningLevel: 'PI 2028.1',
  program: 'E2E Program',
  epic: 'E2E modernization',
  itemId: 'E2E-101',
  feature: 'End-to-end imported feature',
  featureWorkType: 'Business Feature',
  owner: 'E2E Planner',
  estimatedPoints: 16,
  team: ['E2E Team'],
  art: 'E2E ART',
  status: 'Committed',
  startDate: '2028-01-01',
  endDate: '2028-03-31',
  allocations: {
    'E2E Team': 16,
  },
});

const IMPORTED_CAPACITY_RECORD = Object.freeze({
  planningLevel: 'PI 2028.1',
  team: 'E2E Team',
  capacityPoints: 32,
  reservedSupportPercent: 0,
  ptoImpactPoints: 0,
  holidayImpactPoints: 0,
  confidence: 'High',
});

const createImportFile = (name, payload) => ({
  name,
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(payload)),
});

const signInAsPlanner = async (page) => {
  await page.goto('/login');

  await page.getByLabel('Username').fill(
    PLANNER_CREDENTIALS.username,
  );
  await page.getByLabel('Password').fill(
    PLANNER_CREDENTIALS.password,
  );
  await page.getByRole('button', {
    name: 'Sign in',
  }).click();

  await expect(page).toHaveURL(/\/forecast$/);
  await expect(page.getByRole('heading', {
    name: 'Capacity forecast',
  })).toBeVisible();
};

const getForecastControls = (page) => (
  page.locator('section[aria-label="Forecast controls"]')
);

test.describe('Capacity Forecast Tool critical acceptance', () => {
  test('bootstraps demo data, protects the forecast route, rejects invalid credentials, and persists a valid session across refresh', async ({
    page,
  }) => {
    await page.goto('/forecast');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', {
      name: 'Sign in to the demo',
    })).toBeVisible();

    await page.getByLabel('Username').fill(
      PLANNER_CREDENTIALS.username,
    );
    await page.getByLabel('Password').fill('Incorrect@123');
    await page.getByRole('button', {
      name: 'Sign in',
    }).click();

    await expect(page.getByRole('alert')).toContainText(
      'Sign-in was unsuccessful.',
    );
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel('Password').fill(
      PLANNER_CREDENTIALS.password,
    );
    await page.getByRole('button', {
      name: 'Sign in',
    }).click();

    await expect(page).toHaveURL(/\/forecast$/);
    await expect(page.getByRole('heading', {
      name: 'Capacity forecast',
    })).toBeVisible();
    await expect(page.getByText(
      '136 work items · 12 teams',
    )).toBeVisible();

    const storedBootstrapState = await page.evaluate(() => {
      const storage = globalThis.localStorage;

      return {
        dataset: storage.getItem('cft.dataset.content'),
        metadata: storage.getItem('cft.dataset.meta'),
        session: storage.getItem('cft.session'),
      };
    });

    expect(storedBootstrapState.dataset).not.toBeNull();
    expect(storedBootstrapState.metadata).not.toBeNull();
    expect(storedBootstrapState.session).not.toBeNull();

    await page.reload();

    await expect(page).toHaveURL(/\/forecast$/);
    await expect(page.getByRole('heading', {
      name: 'Capacity forecast',
    })).toBeVisible();
    await expect(page.getByText(
      '136 work items · 12 teams',
    )).toBeVisible();
  });

  test('supports search and filters, presents no-results recovery, and exposes capacity details from keyboard focus', async ({
    page,
  }) => {
    await signInAsPlanner(page);

    const controls = getForecastControls(page);
    const searchInput = controls.getByRole('searchbox', {
      name: 'Global search',
    });

    await searchInput.fill('value that cannot match any work item');

    await expect(page.getByRole('heading', {
      name: 'No matching work items',
    })).toBeVisible();

    await controls.getByRole('button', {
      name: 'Clear global search',
    }).click();

    await expect(page.getByRole('heading', {
      name: 'Forecast matrix',
    })).toBeVisible();

    const allocationButton = page.getByRole('button', {
      name: /^ITIOPS: \d+(?:\.\d+)? allocation points,/,
    }).first();

    await allocationButton.focus();

    const tooltip = page.getByRole('tooltip');

    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Capacity Running Total');
    await expect(tooltip).toContainText('Team Capacity');

    await allocationButton.press('Escape');
    await expect(tooltip).toBeHidden();

    await controls.getByRole('button', {
      name: 'Filters',
    }).click();

    const planningLevelInput = page.getByRole('combobox', {
      name: 'Planning level',
    });

    await planningLevelInput.click();
    await page.getByRole('option', {
      name: '2026 PI 3',
      exact: true,
    }).click();

    const ownerInput = page.getByRole('combobox', {
      name: 'Owner',
    });

    await expect(ownerInput).toBeEnabled();
    await ownerInput.click();
    await page.getByRole('listbox', {
      name: 'Owner options',
    }).getByRole('option', {
      name: /Seth Neo/,
    }).first().click();
    await ownerInput.press('Escape');

    const teamInput = page.getByRole('combobox', {
      name: 'Team',
    });

    await teamInput.click();
    await page.getByRole('listbox', {
      name: 'Team options',
    }).getByRole('option', {
      name: /Product Master/,
    }).first().click();

    const noResultsHeading = page.getByRole('heading', {
      name: 'No matching work items',
    });

    await expect(noResultsHeading).toBeVisible();

    const noResultsState = noResultsHeading.locator('..');

    await noResultsState.getByRole('button', {
      name: 'Clear filters',
    }).click();

    await expect(page.getByRole('heading', {
      name: 'Forecast matrix',
    })).toBeVisible();
    await expect(page.getByText(
      '136 work items · 12 teams',
    )).toBeVisible();
  });

  test('updates capacity thresholds and restores the persisted values after refresh', async ({
    page,
  }) => {
    await signInAsPlanner(page);

    const controls = getForecastControls(page);

    await controls.getByRole('button', {
      name: 'Thresholds',
    }).click();

    const dialog = page.getByRole('dialog', {
      name: 'Capacity thresholds',
    });
    const warningInput = dialog.getByRole('spinbutton', {
      name: 'Warning starts at',
    });
    const exceededInput = dialog.getByRole('spinbutton', {
      name: 'Over capacity starts above',
    });

    await expect(warningInput).toHaveValue('80');
    await expect(exceededInput).toHaveValue('100');

    await warningInput.fill('85');
    await exceededInput.fill('110');
    await dialog.getByRole('button', {
      name: 'Save thresholds',
    }).click();

    await expect(dialog).toBeHidden();

    await page.reload();

    await expect(page).toHaveURL(/\/forecast$/);
    await getForecastControls(page).getByRole('button', {
      name: 'Thresholds',
    }).click();

    const restoredDialog = page.getByRole('dialog', {
      name: 'Capacity thresholds',
    });

    await expect(restoredDialog.getByRole('spinbutton', {
      name: 'Warning starts at',
    })).toHaveValue('85');
    await expect(restoredDialog.getByRole('spinbutton', {
      name: 'Over capacity starts above',
    })).toHaveValue('110');

    await restoredDialog.getByRole('button', {
      name: 'Cancel',
    }).click();

    await expect(restoredDialog).toBeHidden();
  });

  test('keeps scenario allocation changes isolated from the baseline forecast', async ({
    page,
  }) => {
    test.setTimeout(60000);

    await signInAsPlanner(page);

    await getForecastControls(page).getByRole('button', {
      name: 'Scenarios',
    }).click();

    await expect(page.getByRole('heading', {
      name: 'Scenario workspace',
    })).toBeVisible();

    await page.getByLabel('Scenario name').fill(
      'E2E ITIOPS adjustment',
    );
    await page.getByLabel('Description').fill(
      'Verify scenario changes do not modify the baseline.',
    );
    await page.getByRole('button', {
      name: 'Create scenario',
    }).click();

    await expect(page.getByLabel('Active scenario')).toHaveValue(
      /scenario-/,
    );
    await expect(page.getByText(
      'Saved in this browser',
    )).toBeVisible();

    const featureHeading = page.getByRole('heading', {
      name: 'MART PI-3 2026 Windows Server 2016 Remediation',
      exact: true,
    });
    const workItem = featureHeading.locator('xpath=ancestor::li[1]');
    const itiopsAllocation = workItem.getByRole('spinbutton', {
      name: 'ITIOPS',
    });

    await itiopsAllocation.fill('7');
    await itiopsAllocation.locator('xpath=../..').getByRole('button', {
      name: 'Apply',
    }).click();

    await expect(itiopsAllocation).toHaveValue('7');

    await page.getByRole('button', {
      name: 'Back to forecast',
    }).click();

    const controls = getForecastControls(page);

    await controls.getByRole('searchbox', {
      name: 'Global search',
    }).fill('E-26989');

    await expect(page.getByRole('button', {
      name: /^ITIOPS: 7 allocation points,/,
    })).toBeVisible();

    await controls.getByRole('button', {
      name: 'Scenarios',
    }).click();

    await page.getByLabel('Active scenario').selectOption('');
    await expect(page.getByRole('heading', {
      name: 'No scenario selected',
    })).toBeVisible();

    await page.getByRole('button', {
      name: 'Back to forecast',
    }).click();

    await expect(page.getByRole('button', {
      name: /^ITIOPS: 15 allocation points,/,
    })).toBeVisible();
    await expect(page.getByRole('button', {
      name: /^ITIOPS: 7 allocation points,/,
    })).toHaveCount(0);
  });

  test('reports invalid import summary counts and activates a subsequent valid JSON dataset', async ({
    page,
  }) => {
    await signInAsPlanner(page);

    await getForecastControls(page).getByRole('button', {
      name: 'Import',
    }).click();

    await expect(page.getByRole('heading', {
      name: 'Import workspace',
    })).toBeVisible();

    const fileInput = page.locator('input[type="file"]');
    const invalidPayload = {
      schemaVersion: '1.0.0',
      workItems: [
        {
          ...IMPORTED_WORK_ITEM,
          estimatedPoints: 'not-a-number',
        },
      ],
      capacityRecords: [
        IMPORTED_CAPACITY_RECORD,
      ],
    };

    await fileInput.setInputFiles(
      createImportFile('invalid-capacity.json', invalidPayload),
    );
    await page.getByRole('button', {
      name: 'Import dataset',
    }).click();

    await expect(page.getByRole('alert')).toContainText(
      'Dataset could not be imported',
    );
    await expect(page.getByRole('heading', {
      name: 'Validation summary',
    })).toBeVisible();
    await expect(page.getByText('Accepted rows').locator('..')).toContainText(
      '1',
    );
    await expect(page.getByText('Rejected rows').locator('..')).toContainText(
      '1',
    );

    const validPayload = {
      schemaVersion: '1.0.0',
      workItems: [
        IMPORTED_WORK_ITEM,
      ],
      capacityRecords: [
        IMPORTED_CAPACITY_RECORD,
      ],
    };

    await fileInput.setInputFiles(
      createImportFile('valid-capacity.json', validPayload),
    );
    await page.getByRole('button', {
      name: 'Import dataset',
    }).click();

    await expect(page).toHaveURL(/\/forecast$/);
    await expect(page.getByText(
      'The dataset was imported successfully.',
    )).toBeVisible();
    await expect(page.getByText(
      '1 work item · 1 team',
    )).toBeVisible();

    await getForecastControls(page).getByRole('searchbox', {
      name: 'Global search',
    }).fill('E2E-101');

    await expect(page.getByText(
      'End-to-end imported feature',
      {
        exact: true,
      },
    )).toBeVisible();
    await expect(page.getByRole('button', {
      name: /^E2E Team: 16 allocation points,/,
    })).toBeVisible();
  });

  test('exports the active dataset as a re-importable CSV file', async ({
    page,
  }) => {
    await signInAsPlanner(page);

    const downloadPromise = page.waitForEvent('download');

    await getForecastControls(page).getByRole('button', {
      name: 'Export',
    }).click();

    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(
      /^cft-dataset-\d{4}-\d{2}-\d{2}\.csv$/,
    );

    const stream = await download.createReadStream();
    const chunks = [];

    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const text = Buffer.concat(chunks).toString('utf8');

    expect(text).toContain('recordType');
    expect(text).toContain('workItem');
    expect(text).toContain('capacityRecord');
  });

  test('removes CFT-owned browser data and rebootstraps clean demo state on the next load', async ({
    page,
  }) => {
    await signInAsPlanner(page);

    await getForecastControls(page).getByRole('button', {
      name: 'Thresholds',
    }).click();

    const dialog = page.getByRole('dialog', {
      name: 'Capacity thresholds',
    });

    await dialog.getByRole('spinbutton', {
      name: 'Warning starts at',
    }).fill('91');
    await dialog.getByRole('spinbutton', {
      name: 'Over capacity starts above',
    }).fill('121');
    await dialog.getByRole('button', {
      name: 'Save thresholds',
    }).click();

    const removedKeys = await page.evaluate(() => {
      const storage = globalThis.localStorage;
      const keys = [];

      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);

        if (key?.startsWith('cft.')) {
          keys.push(key);
        }
      }

      keys.forEach((key) => storage.removeItem(key));

      return keys.sort();
    });

    expect(removedKeys).toContain('cft.session');
    expect(removedKeys).toContain('cft.dataset.content');
    expect(removedKeys).toContain('cft.dataset.meta');
    expect(removedKeys).toContain('cft.thresholds');

    await page.reload();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', {
      name: 'Sign in to the demo',
    })).toBeVisible();

    const rebootstrapState = await page.evaluate(() => {
      const storage = globalThis.localStorage;
      const metadata = JSON.parse(
        storage.getItem('cft.dataset.meta') ?? 'null',
      );
      const demoUsers = JSON.parse(
        storage.getItem('cft.demoUsers') ?? 'null',
      );
      const thresholds = JSON.parse(
        storage.getItem('cft.thresholds') ?? 'null',
      );

      return {
        metadata,
        demoUsers,
        thresholds,
        session: storage.getItem('cft.session'),
      };
    });

    expect(rebootstrapState.metadata?.sourceType).toBe('mock');
    expect(rebootstrapState.demoUsers?.users).toHaveLength(3);
    expect(rebootstrapState.thresholds).toEqual({
      constrained: 80,
      exceeded: 100,
    });
    expect(rebootstrapState.session).toBeNull();

    await page.getByLabel('Username').fill(
      PLANNER_CREDENTIALS.username,
    );
    await page.getByLabel('Password').fill(
      PLANNER_CREDENTIALS.password,
    );
    await page.getByRole('button', {
      name: 'Sign in',
    }).click();

    await expect(page).toHaveURL(/\/forecast$/);
    await expect(page.getByRole('heading', {
      name: 'Capacity forecast',
    })).toBeVisible();
    await expect(page.getByText(
      '136 work items · 12 teams',
    )).toBeVisible();
  });
});