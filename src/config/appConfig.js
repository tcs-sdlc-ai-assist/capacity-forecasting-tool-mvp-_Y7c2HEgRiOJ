const DEFAULT_APP_NAME = 'Capacity Forecast Tool';
const DEFAULT_SCHEMA_VERSION = '1.0.0';
const DEFAULT_REFERENCE_DATE = '2026-08-20';

const publicEnvironment = import.meta.env ?? {};

const readPublicString = (key, fallback) => {
  const value = publicEnvironment[key];

  if (typeof value !== 'string') {
    return fallback;
  }

  const normalizedValue = value.trim();
  return normalizedValue || fallback;
};

export const APP_NAME = readPublicString('VITE_APP_NAME', DEFAULT_APP_NAME);
export const SUPPORTED_SCHEMA_VERSION = readPublicString(
  'VITE_SUPPORTED_SCHEMA_VERSION',
  DEFAULT_SCHEMA_VERSION,
);
export const REFERENCE_DATE = readPublicString(
  'VITE_REFERENCE_DATE',
  DEFAULT_REFERENCE_DATE,
);
export const LOCAL_ONLY_MODE = true;
export const AUTH_MODE = 'demo-local';

const appConfig = Object.freeze({
  appName: APP_NAME,
  supportedSchemaVersion: SUPPORTED_SCHEMA_VERSION,
  referenceDate: REFERENCE_DATE,
  localOnlyMode: LOCAL_ONLY_MODE,
  authMode: AUTH_MODE,
});

export default appConfig;