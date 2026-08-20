import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import PropTypes from 'prop-types';

const normalizeText = (value) => (
  typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : ''
);

const valuesMatch = (first, second) => (
  Object.is(first, second)
  || (
    first !== null
    && first !== undefined
    && second !== null
    && second !== undefined
    && String(first) === String(second)
  )
);

const normalizeOptions = (options) => {
  const normalizedOptions = [];

  options.forEach((option, index) => {
    let normalizedOption = null;

    if (
      typeof option === 'string'
      || typeof option === 'number'
    ) {
      const label = normalizeText(option);

      if (label) {
        normalizedOption = {
          key: `${typeof option}:${String(option)}:${index}`,
          value: option,
          label,
          disabled: false,
        };
      }
    } else if (
      option !== null
      && typeof option === 'object'
      && !Array.isArray(option)
    ) {
      const value = option.value ?? option.id;
      const label = normalizeText(
        option.label ?? option.name ?? value,
      );

      if (
        label
        && (
          typeof value === 'string'
          || typeof value === 'number'
        )
      ) {
        normalizedOption = {
          key: `${typeof value}:${String(value)}:${index}`,
          value,
          label,
          disabled: option.disabled === true,
        };
      }
    }

    if (
      normalizedOption
      && !normalizedOptions.some((candidate) => (
        valuesMatch(candidate.value, normalizedOption.value)
      ))
    ) {
      normalizedOptions.push(normalizedOption);
    }
  });

  return normalizedOptions;
};

const normalizeValues = (values) => {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .filter((value) => (
      typeof value === 'string'
      || typeof value === 'number'
    ))
    .filter((value, index, collection) => (
      collection.findIndex((candidate) => (
        valuesMatch(candidate, value)
      )) === index
    ));
};

const findBoundaryEnabledIndex = (options, fromEnd = false) => {
  if (fromEnd) {
    for (let index = options.length - 1; index >= 0; index -= 1) {
      if (!options[index].disabled) {
        return index;
      }
    }

    return -1;
  }

  return options.findIndex((option) => !option.disabled);
};

const findNextEnabledIndex = (
  options,
  currentIndex,
  direction,
) => {
  if (options.length === 0) {
    return -1;
  }

  for (
    let offset = 1;
    offset <= options.length;
    offset += 1
  ) {
    const index = (
      currentIndex + (direction * offset) + options.length
    ) % options.length;

    if (!options[index].disabled) {
      return index;
    }
  }

  return -1;
};

/**
 * Renders an accessible, searchable checkbox multi-select control.
 *
 * @param {{
 *   id?: string,
 *   name?: string,
 *   label: string,
 *   options: Array<string|number|object>,
 *   value?: Array<string|number>,
 *   onChange: Function,
 *   placeholder?: string,
 *   searchPlaceholder?: string,
 *   emptyMessage?: string,
 *   noResultsMessage?: string,
 *   selectAllLabel?: string,
 *   clearLabel?: string,
 *   selectedLabel?: string,
 *   helperText?: string,
 *   error?: string,
 *   disabled?: boolean,
 *   required?: boolean,
 *   className?: string
 * }} props Multi-select properties.
 * @returns {import('react').ReactNode} Searchable multi-select control.
 */
export const SearchableMultiSelect = ({
  id = '',
  name = '',
  label,
  options,
  value = [],
  onChange,
  placeholder = 'Select options',
  searchPlaceholder = 'Search options',
  emptyMessage = 'No options available.',
  noResultsMessage = 'No matching options.',
  selectAllLabel = 'Select all',
  clearLabel = 'Clear',
  selectedLabel = 'selected',
  helperText = '',
  error = '',
  disabled = false,
  required = false,
  className = '',
}) => {
  const generatedId = useId();
  const inputId = id || `searchable-multi-select-${generatedId.replace(/:/g, '')}`;
  const listboxId = `${inputId}-listbox`;
  const helperTextId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;
  const countId = `${inputId}-count`;
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const optionRefs = useRef([]);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const normalizedOptions = useMemo(
    () => normalizeOptions(options),
    [options],
  );
  const selectedValues = useMemo(
    () => normalizeValues(value),
    [value],
  );
  const selectedOptions = useMemo(
    () => normalizedOptions.filter((option) => (
      selectedValues.some((selectedValue) => (
        valuesMatch(option.value, selectedValue)
      ))
    )),
    [normalizedOptions, selectedValues],
  );
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    if (!normalizedQuery) {
      return normalizedOptions;
    }

    return normalizedOptions.filter((option) => (
      option.label.toLocaleLowerCase().includes(normalizedQuery)
    ));
  }, [normalizedOptions, query]);

  const enabledFilteredOptions = useMemo(
    () => filteredOptions.filter((option) => !option.disabled),
    [filteredOptions],
  );
  const allFilteredSelected = (
    enabledFilteredOptions.length > 0
    && enabledFilteredOptions.every((option) => (
      selectedValues.some((selectedValue) => (
        valuesMatch(option.value, selectedValue)
      ))
    ))
  );
  const selectedCount = selectedValues.length;
  const selectedCountText = `${selectedCount} ${selectedLabel}`;
  const describedBy = [
    countId,
    helperText ? helperTextId : '',
    error ? errorId : '',
  ].filter(Boolean).join(' ');
  const activeOption = activeIndex >= 0
    ? filteredOptions[activeIndex]
    : null;
  const activeOptionId = activeOption
    ? `${listboxId}-option-${activeIndex}`
    : undefined;

  const closeListbox = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setActiveIndex(-1);
  }, []);

  const openListbox = useCallback(() => {
    if (disabled) {
      return;
    }

    setIsOpen(true);
    setActiveIndex((currentIndex) => (
      currentIndex >= 0
        ? currentIndex
        : findBoundaryEnabledIndex(filteredOptions)
    ));
  }, [disabled, filteredOptions]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleDocumentMouseDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        closeListbox();
      }
    };

    document.addEventListener('mousedown', handleDocumentMouseDown);

    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
    };
  }, [closeListbox, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setActiveIndex((currentIndex) => {
      if (
        currentIndex >= 0
        && currentIndex < filteredOptions.length
        && !filteredOptions[currentIndex].disabled
      ) {
        return currentIndex;
      }

      return findBoundaryEnabledIndex(filteredOptions);
    });
  }, [filteredOptions, isOpen]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0) {
      return;
    }

    optionRefs.current[activeIndex]?.scrollIntoView?.({
      block: 'nearest',
    });
  }, [activeIndex, isOpen]);

  const emitChange = useCallback((nextValues) => {
    const normalizedNextValues = normalizeValues(nextValues);
    const nextOptions = normalizedOptions.filter((option) => (
      normalizedNextValues.some((selectedValue) => (
        valuesMatch(option.value, selectedValue)
      ))
    ));

    onChange(
      normalizedNextValues,
      nextOptions.map((option) => ({
        value: option.value,
        label: option.label,
      })),
    );
  }, [normalizedOptions, onChange]);

  const toggleOption = useCallback((option) => {
    if (!option || option.disabled || disabled) {
      return;
    }

    const isSelected = selectedValues.some((selectedValue) => (
      valuesMatch(option.value, selectedValue)
    ));
    const nextValues = isSelected
      ? selectedValues.filter((selectedValue) => (
        !valuesMatch(option.value, selectedValue)
      ))
      : [...selectedValues, option.value];

    emitChange(nextValues);
  }, [disabled, emitChange, selectedValues]);

  const handleSelectAll = () => {
    if (
      disabled
      || allFilteredSelected
      || enabledFilteredOptions.length === 0
    ) {
      return;
    }

    const nextValues = [...selectedValues];

    enabledFilteredOptions.forEach((option) => {
      if (
        !nextValues.some((selectedValue) => (
          valuesMatch(option.value, selectedValue)
        ))
      ) {
        nextValues.push(option.value);
      }
    });

    emitChange(nextValues);
    inputRef.current?.focus();
  };

  const handleClear = () => {
    if (disabled || selectedValues.length === 0) {
      return;
    }

    emitChange([]);
    setQuery('');
    setActiveIndex(findBoundaryEnabledIndex(normalizedOptions));
    inputRef.current?.focus();
  };

  const handleInputFocus = () => {
    openListbox();
  };

  const handleInputClick = () => {
    if (!isOpen) {
      openListbox();
    }
  };

  const handleToggleListbox = () => {
    if (disabled) {
      return;
    }

    if (isOpen) {
      closeListbox();
      inputRef.current?.focus();
      return;
    }

    openListbox();
    inputRef.current?.focus();
  };

  const handleInputChange = (event) => {
    if (disabled) {
      return;
    }

    setQuery(event.target.value);
    setIsOpen(true);
    setActiveIndex(-1);
  };

  const handleInputBlur = (event) => {
    if (
      event.relatedTarget
      && containerRef.current?.contains(event.relatedTarget)
    ) {
      return;
    }

    closeListbox();
  };

  const handleKeyDown = (event) => {
    if (disabled) {
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();

      if (!isOpen) {
        openListbox();
        return;
      }

      const direction = event.key === 'ArrowDown' ? 1 : -1;

      setActiveIndex((currentIndex) => {
        const startingIndex = currentIndex >= 0
          ? currentIndex
          : direction > 0
            ? -1
            : 0;

        return findNextEnabledIndex(
          filteredOptions,
          startingIndex,
          direction,
        );
      });
      return;
    }

    if (event.key === 'Home' && isOpen) {
      event.preventDefault();
      setActiveIndex(findBoundaryEnabledIndex(filteredOptions));
      return;
    }

    if (event.key === 'End' && isOpen) {
      event.preventDefault();
      setActiveIndex(findBoundaryEnabledIndex(filteredOptions, true));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();

      if (!isOpen) {
        openListbox();
        return;
      }

      toggleOption(activeOption);
      return;
    }

    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      closeListbox();
      return;
    }

    if (event.key === 'Tab') {
      closeListbox();
    }
  };

  const hasNoOptions = normalizedOptions.length === 0;
  const emptyOptionsMessage = hasNoOptions
    ? emptyMessage
    : noResultsMessage;
  const inputPlaceholder = isOpen
    ? searchPlaceholder
    : selectedCount > 0
      ? selectedCountText
      : placeholder;

  return (
    <div
      className={`w-full ${className}`}
      ref={containerRef}
    >
      <div className="flex items-end justify-between gap-3">
        <label
          htmlFor={inputId}
          className="block text-sm font-semibold text-neutral-800"
        >
          {label}
          {required ? (
            <span className="ml-1 text-red-700" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>

        <span
          id={countId}
          className="shrink-0 text-xs font-medium text-neutral-600"
          aria-live="polite"
        >
          {selectedCountText}
        </span>
      </div>

      <div className={`relative mt-1.5 ${isOpen ? 'z-50' : ''}`}>
        {name ? (
          selectedValues.length > 0 ? (
            selectedValues.map((selectedValue, index) => (
              <input
                key={`${typeof selectedValue}:${String(selectedValue)}:${index}`}
                type="hidden"
                name={name}
                value={selectedValue}
              />
            ))
          ) : (
            <input type="hidden" name={name} value="" />
          )
        ) : null}

        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          className={`min-h-10 w-full rounded-md border bg-neutral-0 py-2 pl-3 pr-10 text-sm text-neutral-900 shadow-xs transition-colors placeholder:text-neutral-500 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500 ${
            error
              ? 'border-red-400 hover:border-red-500'
              : 'border-neutral-300 hover:border-neutral-400'
          }`}
          value={isOpen ? query : ''}
          placeholder={inputPlaceholder}
          disabled={disabled}
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-activedescendant={isOpen ? activeOptionId : undefined}
          aria-describedby={describedBy}
          aria-invalid={error ? 'true' : undefined}
          aria-required={required || undefined}
          onBlur={handleInputBlur}
          onChange={handleInputChange}
          onClick={handleInputClick}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
        />

        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1">
          <button
            type="button"
            className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed"
            aria-label={`${isOpen ? 'Close' : 'Open'} ${label} options`}
            aria-expanded={isOpen}
            aria-controls={listboxId}
            tabIndex={-1}
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleToggleListbox}
          >
            <span
              className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.22 7.97a.75.75 0 0 1 1.06 0L10 11.69l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.03a.75.75 0 0 1 0-1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
          </button>
        </div>

        {isOpen ? (
          <div
            className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-neutral-200 bg-neutral-0 shadow-lg"
          >
            <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-3 py-2">
              <button
                type="button"
                className="rounded-sm text-sm font-semibold text-teal-700 transition-colors hover:text-teal-900 disabled:cursor-not-allowed disabled:text-neutral-400"
                disabled={
                  disabled
                  || allFilteredSelected
                  || enabledFilteredOptions.length === 0
                }
                onClick={handleSelectAll}
                onMouseDown={(event) => event.preventDefault()}
              >
                {selectAllLabel}
              </button>

              <button
                type="button"
                className="rounded-sm text-sm font-semibold text-neutral-600 transition-colors hover:text-neutral-900 disabled:cursor-not-allowed disabled:text-neutral-400"
                disabled={disabled || selectedValues.length === 0}
                onClick={handleClear}
                onMouseDown={(event) => event.preventDefault()}
              >
                {clearLabel}
              </button>
            </div>

            <ul
              id={listboxId}
              role="listbox"
              aria-label={`${label} options`}
              aria-multiselectable="true"
              className="max-h-60 overflow-auto py-1"
            >
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option, index) => {
                  const isSelected = selectedValues.some(
                    (selectedValue) => (
                      valuesMatch(option.value, selectedValue)
                    ),
                  );
                  const isActive = index === activeIndex;

                  return (
                    <li
                      ref={(element) => {
                        optionRefs.current[index] = element;
                      }}
                      id={`${listboxId}-option-${index}`}
                      key={option.key}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={option.disabled || undefined}
                      className={`flex min-h-10 items-center gap-3 px-3 py-2 text-sm ${
                        option.disabled
                          ? 'cursor-not-allowed text-neutral-400'
                          : isActive
                            ? 'cursor-pointer bg-teal-50 text-teal-950'
                            : 'cursor-pointer text-neutral-800 hover:bg-neutral-100'
                      }`}
                      onClick={() => toggleOption(option)}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => {
                        if (!option.disabled) {
                          setActiveIndex(index);
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-neutral-300 text-teal-700 accent-teal-700 focus:ring-teal-500 disabled:cursor-not-allowed"
                        checked={isSelected}
                        disabled={option.disabled}
                        readOnly
                        tabIndex={-1}
                        aria-label={option.label}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {option.label}
                      </span>
                    </li>
                  );
                })
              ) : (
                <li
                  className="px-3 py-4 text-center text-sm text-neutral-600"
                  role="option"
                  aria-disabled="true"
                >
                  {emptyOptionsMessage}
                </li>
              )}
            </ul>
          </div>
        ) : null}
      </div>

      {selectedOptions.length > 0 ? (
        <div
          className="mt-2 flex flex-wrap gap-1.5"
          aria-label={`${label} selections`}
        >
          {selectedOptions.map((option) => (
            <span
              key={`selected:${option.key}`}
              className="inline-flex max-w-full items-center rounded-full bg-teal-100 px-2.5 py-1 text-xs font-semibold text-teal-900"
            >
              <span className="truncate">{option.label}</span>
            </span>
          ))}
        </div>
      ) : null}

      {helperText ? (
        <p
          id={helperTextId}
          className="mt-1.5 text-sm text-neutral-600"
        >
          {helperText}
        </p>
      ) : null}

      {error ? (
        <p
          id={errorId}
          className="mt-1.5 text-sm font-medium text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
};

SearchableMultiSelect.propTypes = {
  id: PropTypes.string,
  name: PropTypes.string,
  label: PropTypes.string.isRequired,
  options: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
      PropTypes.shape({
        id: PropTypes.oneOfType([
          PropTypes.string,
          PropTypes.number,
        ]),
        value: PropTypes.oneOfType([
          PropTypes.string,
          PropTypes.number,
        ]),
        label: PropTypes.oneOfType([
          PropTypes.string,
          PropTypes.number,
        ]),
        name: PropTypes.oneOfType([
          PropTypes.string,
          PropTypes.number,
        ]),
        disabled: PropTypes.bool,
      }),
    ]),
  ).isRequired,
  value: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
    ]),
  ),
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  searchPlaceholder: PropTypes.string,
  emptyMessage: PropTypes.string,
  noResultsMessage: PropTypes.string,
  selectAllLabel: PropTypes.string,
  clearLabel: PropTypes.string,
  selectedLabel: PropTypes.string,
  helperText: PropTypes.string,
  error: PropTypes.string,
  disabled: PropTypes.bool,
  required: PropTypes.bool,
  className: PropTypes.string,
};

export default SearchableMultiSelect;