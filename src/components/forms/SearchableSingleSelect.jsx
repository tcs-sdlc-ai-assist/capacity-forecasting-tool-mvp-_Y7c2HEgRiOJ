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

const normalizeOptions = (options) => (
  options
    .map((option, index) => {
      if (
        typeof option === 'string'
        || typeof option === 'number'
      ) {
        const label = normalizeText(option);

        return label
          ? {
            key: `${typeof option}:${String(option)}:${index}`,
            value: option,
            label,
            disabled: false,
          }
          : null;
      }

      if (
        option === null
        || typeof option !== 'object'
        || Array.isArray(option)
      ) {
        return null;
      }

      const value = option.value ?? option.id;
      const label = normalizeText(
        option.label ?? option.name ?? value,
      );

      if (
        label.length === 0
        || (
          typeof value !== 'string'
          && typeof value !== 'number'
        )
      ) {
        return null;
      }

      return {
        key: `${typeof value}:${String(value)}:${index}`,
        value,
        label,
        disabled: option.disabled === true,
      };
    })
    .filter(Boolean)
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

/**
 * Renders an accessible, searchable, single-value listbox control.
 *
 * @param {{
 *   id?: string,
 *   name?: string,
 *   label: string,
 *   options: Array<string|number|object>,
 *   value?: string|number|null,
 *   onChange: Function,
 *   placeholder?: string,
 *   searchPlaceholder?: string,
 *   emptyMessage?: string,
 *   noResultsMessage?: string,
 *   clearLabel?: string,
 *   helperText?: string,
 *   error?: string,
 *   disabled?: boolean,
 *   required?: boolean,
 *   className?: string
 * }} props Select properties.
 * @returns {import('react').ReactNode} Searchable single-select control.
 */
export const SearchableSingleSelect = ({
  id = '',
  name = '',
  label,
  options,
  value = '',
  onChange,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search options',
  emptyMessage = 'No options available.',
  noResultsMessage = 'No matching options.',
  clearLabel = '',
  helperText = '',
  error = '',
  disabled = false,
  required = false,
  className = '',
}) => {
  const generatedId = useId();
  const inputId = id || `searchable-select-${generatedId.replace(/:/g, '')}`;
  const listboxId = `${inputId}-listbox`;
  const helperTextId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const normalizedOptions = useMemo(
    () => normalizeOptions(options),
    [options],
  );
  const selectedOption = useMemo(
    () => normalizedOptions.find((option) => (
      valuesMatch(option.value, value)
    )) ?? null,
    [normalizedOptions, value],
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

  const describedBy = [
    helperText ? helperTextId : '',
    error ? errorId : '',
  ].filter(Boolean).join(' ') || undefined;
  const activeOption = activeIndex >= 0
    ? filteredOptions[activeIndex]
    : null;
  const activeOptionId = activeOption
    ? `${listboxId}-option-${activeIndex}`
    : undefined;
  const inputValue = isOpen
    ? query
    : selectedOption?.label ?? '';

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
    setQuery('');
    setActiveIndex(() => {
      const selectedIndex = normalizedOptions.findIndex((option) => (
        valuesMatch(option.value, value) && !option.disabled
      ));

      return selectedIndex >= 0
        ? selectedIndex
        : findBoundaryEnabledIndex(normalizedOptions);
    });
  }, [disabled, normalizedOptions, value]);

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

  const selectOption = (option) => {
    if (!option || option.disabled) {
      return;
    }

    onChange(option.value, {
      value: option.value,
      label: option.label,
    });
    closeListbox();
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

  const handleInputFocus = () => {
    openListbox();
  };

  const handleInputClick = () => {
    if (!isOpen) {
      openListbox();
    }
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
      if (!isOpen) {
        event.preventDefault();
        openListbox();
        return;
      }

      if (activeOption && !activeOption.disabled) {
        event.preventDefault();
        selectOption(activeOption);
      }
      return;
    }

    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      closeListbox();
    }
  };

  const handleClear = () => {
    if (disabled || !selectedOption) {
      return;
    }

    onChange('', null);
    setQuery('');
    setIsOpen(true);
    setActiveIndex(findBoundaryEnabledIndex(normalizedOptions));
    inputRef.current?.focus();
  };

  const hasNoOptions = normalizedOptions.length === 0;
  const emptyOptionsMessage = hasNoOptions
    ? emptyMessage
    : noResultsMessage;

  return (
    <div className={`w-full ${className}`} ref={containerRef}>
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

      <div className="relative mt-1.5">
        {name ? (
          <input
            type="hidden"
            name={name}
            value={selectedOption?.value ?? ''}
          />
        ) : null}

        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          className={`min-h-10 w-full rounded-md border bg-neutral-0 py-2 pl-3 text-sm text-neutral-900 shadow-xs transition-colors placeholder:text-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500 ${
            selectedOption
              ? 'pr-20'
              : 'pr-10'
          } ${
            error
              ? 'border-red-400 hover:border-red-500'
              : 'border-neutral-300 hover:border-neutral-400'
          }`}
          value={inputValue}
          placeholder={isOpen ? searchPlaceholder : placeholder}
          disabled={disabled}
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen}
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

        <div className="absolute inset-y-0 right-0 flex items-center pr-2">
          {selectedOption && !disabled ? (
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1"
              aria-label={clearLabel || `Clear ${label}`}
              onClick={handleClear}
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M5.22 5.22a.75.75 0 0 1 1.06 0L10 8.94l3.72-3.72a.75.75 0 1 1 1.06 1.06L11.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06L10 11.06l-3.72 3.72a.75.75 0 0 1-1.06-1.06L8.94 10 5.22 6.28a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </button>
          ) : null}

          <span
            className={`pointer-events-none ml-1 text-neutral-500 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
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
        </div>

        {isOpen ? (
          <ul
            id={listboxId}
            role="listbox"
            aria-label={`${label} options`}
            className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-md border border-neutral-200 bg-neutral-0 py-1 shadow-lg"
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, index) => {
                const isSelected = selectedOption
                  ? valuesMatch(option.value, selectedOption.value)
                  : false;
                const isActive = index === activeIndex;

                return (
                  <li
                    id={`${listboxId}-option-${index}`}
                    key={option.key}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled || undefined}
                    className={`flex min-h-9 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
                      option.disabled
                        ? 'cursor-not-allowed text-neutral-400'
                        : isActive
                          ? 'bg-teal-50 text-teal-950'
                          : 'text-neutral-800 hover:bg-neutral-100'
                    }`}
                    onClick={() => selectOption(option)}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => {
                      if (!option.disabled) {
                        setActiveIndex(index);
                      }
                    }}
                  >
                    <span className="truncate">{option.label}</span>
                    {isSelected ? (
                      <svg
                        className="h-4 w-4 shrink-0 text-teal-700"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.704 5.29a.75.75 0 0 1 .006 1.06l-7.25 7.334a.75.75 0 0 1-1.068 0L3.29 8.525a.75.75 0 1 1 1.067-1.054l4.568 4.62 6.718-6.795a.75.75 0 0 1 1.061-.006Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : null}
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
        ) : null}
      </div>

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

SearchableSingleSelect.propTypes = {
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
  value: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number,
  ]),
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  searchPlaceholder: PropTypes.string,
  emptyMessage: PropTypes.string,
  noResultsMessage: PropTypes.string,
  clearLabel: PropTypes.string,
  helperText: PropTypes.string,
  error: PropTypes.string,
  disabled: PropTypes.bool,
  required: PropTypes.bool,
  className: PropTypes.string,
};

export default SearchableSingleSelect;